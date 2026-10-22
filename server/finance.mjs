import {
  AppError,
  businessDate,
  previousPeriod,
  summarize,
} from "./domain.mjs";
import {
  expenseColumns,
  expenseKeys,
  baseFinanceFields,
} from "../src/finance-schema.mjs";
import {
  validMonth,
  parseExpenseAmounts,
  prorateExpenses,
  parseExpression,
  validateRuleGraph,
  evaluateRules,
  safeSum,
} from "./finance-domain.mjs";

const expenseSelect =
  "SELECT e.*,u.name AS owner_name FROM finance_expenses e JOIN users u ON u.id=e.owner_id";
const positiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new AppError(`${label}无效`);
  return value;
};
function text(value, label, max) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new AppError(`${label}不能为空、过长或包含控制字符`);
  return value.trim();
}
function archivedFilter(url) {
  const value = url.searchParams.get("archived") ?? "0";
  if (!["0", "1"].includes(value)) throw new AppError("归档筛选无效");
  return value === "1";
}
function dateRange(input) {
  const today = businessDate();
  const start =
    input.start ??
    new Date(Date.parse(today) - 29 * 86400000).toISOString().slice(0, 10);
  const end = input.end ?? today;
  return { start, end, previous: previousPeriod(start, end) };
}
function urlRange(url) {
  return dateRange({
    start: url.searchParams.get("start") ?? undefined,
    end: url.searchParams.get("end") ?? undefined,
  });
}
function expenseItem(row) {
  return {
    id: row.id,
    month: row.month,
    department: row.department,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    amounts: JSON.parse(row.amounts_json),
    total: row.total,
    version: row.version,
    archived: !!row.archived,
    createdAt: row.created_at,
  };
}
function getExpense(db, id) {
  const row = db.prepare(expenseSelect + " WHERE e.id=?").get(id);
  if (!row) throw new AppError("费用记录不存在", 404);
  return expenseItem(row);
}
function settings(db) {
  const row = db.prepare("SELECT * FROM finance_settings WHERE id=1").get();
  return {
    columns: JSON.parse(row.columns_json).sort((a, b) => a.order - b.order),
    columnsVersion: row.version,
  };
}
function rules(db) {
  return db
    .prepare("SELECT * FROM finance_rules ORDER BY id")
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      expression: row.expression,
      tags: JSON.parse(row.tags_json),
      enabled: !!row.enabled,
      archived: !!row.archived,
      version: row.version,
    }));
}
function businessRows(db, start, end) {
  return db
    .prepare(
      "SELECT r.*,r.refund_only AS refundOnly,r.return_refunds AS returnRefunds,i.is_demo FROM records r JOIN imports i ON i.id=r.import_id WHERE r.date BETWEEN ? AND ? ORDER BY r.date,r.id",
    )
    .all(start, end);
}
function expenseRange(db, start, end) {
  const rows = db
    .prepare(expenseSelect + " WHERE e.archived=0 AND e.month BETWEEN ? AND ?")
    .all(start.slice(0, 7), end.slice(0, 7))
    .map(expenseItem);
  const months = [];
  const month = new Date(start.slice(0, 7) + "-01");
  while (month.toISOString().slice(0, 7) <= end.slice(0, 7)) {
    months.push(month.toISOString().slice(0, 7));
    month.setUTCMonth(month.getUTCMonth() + 1);
  }
  const provided = new Set(rows.map((row) => row.month));
  return {
    ...prorateExpenses(rows, start, end),
    coverage: {
      providedMonths: months.filter((month) => provided.has(month)),
      missingMonths: months.filter((month) => !provided.has(month)),
    },
  };
}
function fieldPool(db, start, end) {
  const rows = businessRows(db, start, end);
  const summary = summarize(rows);
  const expenses = expenseRange(db, start, end);
  const config = settings(db);
  const labels = new Map(
    config.columns.map((column) => [column.key, column.label]),
  );
  const fields = baseFinanceFields.map(({ key, label }) => {
    const expenseField =
      key === "operatingExpense" || expenseKeys.includes(key);
    const reason =
      expenseField && expenses.coverage.missingMonths.length
        ? `缺少月度费用：${expenses.coverage.missingMonths.join("、")}`
        : "";
    return {
      key,
      label: labels.get(key) || label,
      value: reason
        ? null
        : key === "operatingExpense"
          ? expenses.total
          : expenseKeys.includes(key)
            ? expenses.amounts[key]
            : rows.length
              ? summary[key]
              : null,
      source: expenseField
        ? `公司月度费用按自然日分摊${reason ? "；" + reason : ""}`
        : key === "netProfit"
          ? "导入经营数据预估口径；奖励缺失部分暂按0估算"
          : "导入经营数据",
      reason,
    };
  });
  return { fields, expenseTotal: expenses.total };
}
function ruleResults(db, range, all = rules(db)) {
  const pool = fieldPool(db, range.start, range.end);
  return { ...pool, items: evaluateRules(all, pool.fields) };
}
function ensureVersion(item, version) {
  positiveInteger(version, "版本号");
  if (item.version !== version)
    throw new AppError("记录已被其他人修改，请刷新后重试", 409);
}
function assertChanged(result) {
  if (!result.changes)
    throw new AppError("记录已被其他人修改，请刷新后重试", 409);
}
function ruleInput(body) {
  const name = text(body.name, "规则名称", 60);
  const expression =
    typeof body.expression === "string"
      ? body.expression.trim()
      : body.expression;
  parseExpression(expression);
  if (typeof body.enabled !== "boolean") throw new AppError("规则启用状态无效");
  if (!Array.isArray(body.tags) || body.tags.length > 10)
    throw new AppError("标签最多10个");
  const tags = body.tags.map((tag) => text(tag, "标签", 20));
  if (new Set(tags).size !== tags.length) throw new AppError("标签不能重复");
  return { name, expression, tags, enabled: body.enabled };
}
function referencedBy(all, id) {
  return all.filter(
    (rule) =>
      !rule.archived &&
      rule.enabled &&
      rule.id !== id &&
      parseExpression(rule.expression).refs.includes(`rule_${id}`),
  );
}
function rejectDependencyChange(all, id) {
  const dependents = referencedBy(all, id);
  if (dependents.length)
    throw new AppError(
      `规则正被有效规则引用：${dependents.map((rule) => rule.name).join("、")}`,
      409,
    );
}
function company(db, range) {
  const rows = businessRows(db, range.start, range.end);
  const before = businessRows(db, range.previous.start, range.previous.end);
  const expenses = expenseRange(db, range.start, range.end);
  const previousExpenses = expenseRange(
    db,
    range.previous.start,
    range.previous.end,
  );
  function summary(data, expense) {
    const totals = summarize(data);
    return {
      ...totals,
      operatingExpense: expense.total,
      managementProfit: safeSum([totals.netProfit, -expense.total]),
      expenseCoverage: expense.coverage,
    };
  }
  function groups(key) {
    const group = typeof key === "function" ? key : (row) => row[key];
    const current = Object.groupBy(rows, group),
      previous = Object.groupBy(before, group);
    return [...new Set([...Object.keys(current), ...Object.keys(previous)])]
      .map((name) => {
        const totals = summarize(current[name] || []),
          prior = summarize(previous[name] || []);
        const identity =
          key === "channel"
            ? { name }
            : {
                name: JSON.parse(name)[1],
                channel: JSON.parse(name)[0],
                shop: JSON.parse(name)[1],
              };
        return {
          ...identity,
          ...totals,
          previous: prior,
          change:
            prior.netSales > 0
              ? ((totals.netSales - prior.netSales) / prior.netSales) * 100
              : null,
        };
      })
      .sort((a, b) => b.netSales - a.netSales);
  }
  const dates = Object.groupBy(rows, (row) => row.date),
    trend = [];
  for (
    let day = Date.parse(range.start);
    day <= Date.parse(range.end);
    day += 86400000
  ) {
    const date = new Date(day).toISOString().slice(0, 10),
      total = summarize(dates[date] || []);
    trend.push({ date, sales: total.sales, netSales: total.netSales });
  }
  const labels = new Map(
    settings(db).columns.map((column) => [column.key, column.label]),
  );
  return {
    current: summary(rows, expenses),
    previous: summary(before, previousExpenses),
    currentExpenses: expenseColumns.map(({ key, label }) => ({
      key,
      label: labels.get(key) || label,
      value: expenses.amounts[key],
    })),
    range,
    trend,
    channels: groups("channel"),
    shops: groups((row) => JSON.stringify([row.channel, row.shop])),
    dataBounds: db
      .prepare("SELECT MIN(date) start,MAX(date) end FROM records")
      .get(),
    recordCount: rows.length,
    hasDemo: !!db
      .prepare("SELECT 1 FROM imports WHERE is_demo=1 LIMIT 1")
      .get(),
  };
}

// Called only after the app's Host, Origin, JSON type and session guards.
export async function handleFinance({
  db,
  req,
  res,
  url,
  path,
  method,
  user,
  bodyJson,
  send,
}) {
  if (!path.startsWith("/api/finance/")) return false;
  const preview = path === "/api/finance/rules/preview" && method === "POST";
  if (method === "POST" && !preview && user.role !== "admin")
    throw new AppError("此操作需要管理员权限", 403);
  const respond = (status, value) => {
    send(res, status, value);
    return true;
  };

  if (path === "/api/finance/company" && method === "GET")
    return respond(200, company(db, urlRange(url)));
  if (path === "/api/finance/expenses" && method === "GET") {
    const from = url.searchParams.get("fromMonth") || "",
      to = url.searchParams.get("toMonth") || "";
    if (
      (from && !validMonth(from)) ||
      (to && !validMonth(to)) ||
      (from && to && from > to)
    )
      throw new AppError("请选择有效的起止月份");
    const department = url.searchParams.get("department") || "";
    if (department.length > 60 || /[\u0000-\u001f]/.test(department))
      throw new AppError("部门筛选无效");
    const owner = url.searchParams.get("ownerId") || "";
    if (owner && !/^[1-9]\d{0,9}$/.test(owner))
      throw new AppError("负责人筛选无效");
    const pageText = url.searchParams.get("page") || "1";
    if (!/^[1-9]\d{0,5}$/.test(pageText)) throw new AppError("页码无效");
    const page = Number(pageText),
      archived = archivedFilter(url);
    const where =
      "e.archived=? AND (?='' OR e.month>=?) AND (?='' OR e.month<=?) AND (?='' OR e.department=?) AND (?='' OR e.owner_id=?)";
    const args = [
      Number(archived),
      from,
      from,
      to,
      to,
      department,
      department,
      owner,
      owner,
    ];
    const stats = db
      .prepare(
        "SELECT COUNT(*) count,COALESCE(SUM(total),0) total FROM finance_expenses e WHERE " +
          where,
      )
      .get(...args);
    const items = db
      .prepare(
        expenseSelect +
          " WHERE " +
          where +
          " ORDER BY e.month DESC,e.id DESC LIMIT 20 OFFSET ?",
      )
      .all(...args, (page - 1) * 20)
      .map(expenseItem);
    return respond(200, {
      items,
      total: stats.count,
      page,
      pageSize: 20,
      pageTotal: safeSum(items.map((item) => item.total)),
      filteredTotal: safeSum([stats.total]),
      owners: db.prepare("SELECT id,name FROM users ORDER BY id").all(),
      departments: db
        .prepare(
          "SELECT DISTINCT department FROM finance_expenses ORDER BY department",
        )
        .all()
        .map((row) => row.department),
      ...settings(db),
    });
  }
  if (path === "/api/finance/expenses" && method === "POST") {
    const body = await bodyJson(req);
    if (!validMonth(body.month)) throw new AppError("月份无效，请使用 YYYY-MM");
    const department = text(body.department, "部门", 60),
      ownerId = positiveInteger(body.ownerId, "负责人");
    if (!db.prepare("SELECT 1 FROM users WHERE id=?").get(ownerId))
      throw new AppError("负责人不存在");
    const amounts = parseExpenseAmounts(body.amounts),
      total = safeSum(Object.values(amounts));
    let id = body.id;
    if (id !== undefined) {
      positiveInteger(id, "费用编号");
      const old = getExpense(db, id);
      ensureVersion(old, body.version);
      if (old.archived) throw new AppError("请先恢复已归档费用再编辑", 409);
      assertChanged(
        db
          .prepare(
            "UPDATE finance_expenses SET month=?,department=?,owner_id=?,amounts_json=?,total=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?",
          )
          .run(
            body.month,
            department,
            ownerId,
            JSON.stringify(amounts),
            total,
            id,
            body.version,
          ),
      );
    } else
      id = Number(
        db
          .prepare(
            "INSERT INTO finance_expenses(month,department,owner_id,amounts_json,total) VALUES(?,?,?,?,?)",
          )
          .run(body.month, department, ownerId, JSON.stringify(amounts), total)
          .lastInsertRowid,
      );
    return respond(body.id === undefined ? 201 : 200, {
      item: getExpense(db, id),
    });
  }
  const expenseAction =
    /^\/api\/finance\/expenses\/([1-9]\d{0,9})\/(archive|restore)$/.exec(path);
  if (expenseAction && method === "POST") {
    const id = Number(expenseAction[1]),
      archive = expenseAction[2] === "archive";
    const body = await bodyJson(req),
      old = getExpense(db, id);
    ensureVersion(old, body.version);
    if (old.archived === archive)
      throw new AppError(archive ? "费用已归档" : "费用已恢复", 409);
    assertChanged(
      db
        .prepare(
          "UPDATE finance_expenses SET archived=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?",
        )
        .run(Number(archive), id, body.version),
    );
    return respond(200, { item: getExpense(db, id) });
  }
  if (path === "/api/finance/expense-columns" && method === "POST") {
    const body = await bodyJson(req),
      columns = body.columns;
    if (
      !Array.isArray(columns) ||
      columns.length !== 12 ||
      new Set(columns.map((column) => column?.key)).size !== 12 ||
      new Set(columns.map((column) => column?.order)).size !== 12
    )
      throw new AppError("列设置必须包含12个唯一字段和顺序");
    const checked = columns.map((column) => {
      if (
        !expenseKeys.includes(column?.key) ||
        typeof column.visible !== "boolean" ||
        !Number.isInteger(column.order) ||
        column.order < 0 ||
        column.order > 11
      )
        throw new AppError("列设置字段、显示状态或顺序无效");
      return {
        key: column.key,
        label: text(column.label, "列标题", 30),
        visible: column.visible,
        order: column.order,
      };
    });
    ensureVersion({ version: settings(db).columnsVersion }, body.version);
    assertChanged(
      db
        .prepare(
          "UPDATE finance_settings SET columns_json=?,version=version+1 WHERE id=1 AND version=?",
        )
        .run(JSON.stringify(checked), body.version),
    );
    return respond(200, settings(db));
  }
  if (path === "/api/finance/rules" && method === "GET") {
    const range = urlRange(url),
      archived = archivedFilter(url),
      result = ruleResults(db, range);
    return respond(200, {
      ...result,
      items: result.items.filter((item) => item.archived === archived),
      range: { start: range.start, end: range.end },
    });
  }
  if (preview) {
    const body = await bodyJson(req),
      range = dateRange(body),
      all = rules(db);
    parseExpression(body.expression);
    const ruleId =
      body.ruleId === undefined
        ? Math.max(0, ...all.map((rule) => rule.id)) + 1
        : positiveInteger(body.ruleId, "规则编号");
    if (body.ruleId !== undefined && !all.some((rule) => rule.id === ruleId))
      throw new AppError("规则不存在", 404);
    const candidate = {
      id: ruleId,
      name: "当前预览",
      expression: body.expression,
      tags: [],
      enabled: true,
      archived: false,
      version: 1,
    };
    const proposed = [...all.filter((rule) => rule.id !== ruleId), candidate];
    validateRuleGraph(proposed);
    const { value, status, reason } = ruleResults(
      db,
      range,
      proposed,
    ).items.find((rule) => rule.id === ruleId);
    return respond(200, { value, status, reason });
  }
  if (path === "/api/finance/rules" && method === "POST") {
    const body = await bodyJson(req),
      input = ruleInput(body),
      all = rules(db);
    let id = body.id,
      old;
    if (id !== undefined) {
      positiveInteger(id, "规则编号");
      old = all.find((rule) => rule.id === id);
      if (!old) throw new AppError("规则不存在", 404);
      ensureVersion(old, body.version);
      if (old.archived) throw new AppError("请先恢复已归档规则再编辑", 409);
      if (!input.enabled) rejectDependencyChange(all, id);
    } else {
      if (all.length >= 100) throw new AppError("最多保存100条规则");
      id = Math.max(0, ...all.map((rule) => rule.id)) + 1;
    }
    validateRuleGraph([
      ...all.filter((rule) => rule.id !== id),
      { ...input, id, archived: false },
    ]);
    if (old)
      assertChanged(
        db
          .prepare(
            "UPDATE finance_rules SET name=?,expression=?,tags_json=?,enabled=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?",
          )
          .run(
            input.name,
            input.expression,
            JSON.stringify(input.tags),
            Number(input.enabled),
            id,
            body.version,
          ),
      );
    else
      id = Number(
        db
          .prepare(
            "INSERT INTO finance_rules(name,expression,tags_json,enabled) VALUES(?,?,?,?)",
          )
          .run(
            input.name,
            input.expression,
            JSON.stringify(input.tags),
            Number(input.enabled),
          ).lastInsertRowid,
      );
    return respond(old ? 200 : 201, {
      item: ruleResults(db, dateRange({})).items.find((rule) => rule.id === id),
    });
  }
  const ruleAction =
    /^\/api\/finance\/rules\/([1-9]\d{0,9})\/(archive|restore)$/.exec(path);
  if (ruleAction && method === "POST") {
    const id = Number(ruleAction[1]),
      archive = ruleAction[2] === "archive";
    const body = await bodyJson(req),
      all = rules(db),
      old = all.find((rule) => rule.id === id);
    if (!old) throw new AppError("规则不存在", 404);
    ensureVersion(old, body.version);
    if (old.archived === archive)
      throw new AppError(archive ? "规则已归档" : "规则已恢复", 409);
    if (archive) rejectDependencyChange(all, id);
    try {
      validateRuleGraph(
        all.map((rule) =>
          rule.id === id ? { ...rule, archived: archive } : rule,
        ),
      );
    } catch (error) {
      throw new AppError(error.message, 409);
    }
    assertChanged(
      db
        .prepare(
          "UPDATE finance_rules SET archived=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?",
        )
        .run(Number(archive), id, body.version),
    );
    return respond(200, {
      item: ruleResults(db, dateRange({})).items.find((rule) => rule.id === id),
    });
  }
  throw new AppError("接口不存在", 404);
}
