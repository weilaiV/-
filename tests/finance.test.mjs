import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.mjs";
import { openDatabase, insertBatch } from "../server/db.mjs";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";

const keys = [
  "salary",
  "fixed",
  "officeShipping",
  "warehouse",
  "jdShipping",
  "jdWarehouse",
  "other1",
  "other2",
  "other3",
  "other4",
  "other5",
  "other6",
];
const amounts = (changes = {}) =>
  Object.fromEntries(
    keys.map((key) => [key, Object.hasOwn(changes, key) ? changes[key] : "0"]),
  );
async function fixture(t) {
  const app = createApp({ databasePath: ":memory:" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
  });
  let cookie = "";
  async function call(path, body, headers = {}) {
    const response = await fetch(origin + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        cookie,
        "content-type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const setup = await call("/auth/setup", {
    username: "owner",
    password: "Test-password-123",
    name: "管理员",
  });
  cookie = setup.cookie;
  return {
    ...app,
    call,
    setCookie(value) {
      cookie = value;
    },
    adminCookie: cookie,
  };
}

test("finance migration is additive and repeatable for an existing database", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "finance-migration-"));
  const path = join(directory, "old.sqlite");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE records(id INTEGER PRIMARY KEY,date TEXT,channel TEXT,shop TEXT,product TEXT,sales INTEGER,refunds INTEGER,cost INTEGER,ads INTEGER,platform INTEGER,shipping INTEGER,import_id INTEGER); INSERT INTO records VALUES(1,'2024-02-01','天猫','测试店','商品',123,0,0,0,0,0,1)",
  );
  db.close();
  for (let i = 0; i < 2; i++) {
    db = openDatabase(path);
    try {
      assert.equal(
        db.prepare("SELECT sales FROM records WHERE id=1").get().sales,
        123,
      );
      for (const name of [
        "finance_expenses",
        "finance_rules",
        "finance_settings",
      ])
        assert.ok(
          db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            )
            .get(name),
        );
    } finally {
      db.close();
    }
  }
});

test("expenses preserve cents, validate signed fields, filter, paginate and conflict safely", async (t) => {
  const { call } = await fixture(t);
  const input = {
    month: "2024-02",
    department: "财务",
    ownerId: 1,
    amounts: amounts({ salary: "100.10", other1: "-0.11" }),
  };
  const created = await call("/finance/expenses", input);
  assert.equal(created.status, 201);
  assert.equal(created.body.item.total, 9999);
  assert.equal(created.body.item.amounts.salary, 10010);
  let item = created.body.item;
  assert.equal(item.ownerName, "管理员");
  for (const bad of ["-0.01", "1.001", "1e2", 2, null, "10000000.01"]) {
    assert.equal(
      (
        await call("/finance/expenses", {
          ...input,
          amounts: amounts({ salary: bad }),
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (await call("/finance/expenses", { ...input, amounts: { salary: "1" } }))
      .status,
    400,
  );
  assert.equal(
    (await call("/finance/expenses", { ...input, month: "2024-13" })).status,
    400,
  );
  assert.equal(
    (await call("/finance/expenses", { ...input, ownerId: 9000 })).status,
    400,
  );
  const edit = await call("/finance/expenses", {
    ...input,
    id: item.id,
    version: 1,
    amounts: amounts({ salary: "10.01" }),
  });
  assert.equal(edit.status, 200);
  item = edit.body.item;
  assert.equal(item.version, 2);
  assert.equal(
    (await call("/finance/expenses", { ...input, id: item.id, version: 1 }))
      .status,
    409,
  );
  for (let i = 0; i < 21; i++)
    assert.equal(
      (
        await call("/finance/expenses", {
          ...input,
          amounts: amounts({ salary: "1.00" }),
        })
      ).status,
      201,
    );
  const page = await call(
    "/finance/expenses?fromMonth=2024-02&toMonth=2024-02&department=财务&ownerId=1&page=2",
  );
  assert.equal(page.body.total, 22);
  assert.equal(page.body.items.length, 2);
  assert.equal(page.body.pageSize, 20);
  assert.equal(page.body.filteredTotal, 3101);
  assert.equal(page.body.pageTotal, 1101);
  assert.equal((await call("/finance/expenses?department=其他")).body.total, 0);
  assert.equal(
    (await call("/finance/expenses?fromMonth=2024-03&toMonth=2024-02")).status,
    400,
  );
  assert.equal(
    (await call(`/finance/expenses/${item.id}/archive`, { version: 1 })).status,
    409,
  );
  const archived = await call(`/finance/expenses/${item.id}/archive`, {
    version: 2,
  });
  assert.equal(archived.body.item.archived, true);
  assert.equal((await call("/finance/expenses")).body.total, 21);
  assert.equal((await call("/finance/expenses?archived=1")).body.total, 1);
  const restore = await call(`/finance/expenses/${item.id}/restore`, {
    version: 3,
  });
  assert.equal(restore.body.item.archived, false);
  assert.equal(restore.body.item.version, 4);
});

test("expense columns are company-wide, complete and versioned; all finance writes are admin only", async (t) => {
  const { call, setCookie, adminCookie, server } = await fixture(t);
  const initial = await call("/finance/expenses");
  assert.equal(initial.status, 200);
  const columns = initial.body.columns;
  assert.equal(columns.length, 12);
  assert.equal(initial.body.columnsVersion, 1);
  const changed = columns.map((c, i) => ({
    ...c,
    label: i === 0 ? "员工薪酬" : c.label,
    visible: i !== 1,
    order: 11 - i,
  }));
  assert.equal(
    (await call("/finance/expense-columns", { version: 1, columns: changed }))
      .body.columnsVersion,
    2,
  );
  assert.equal(
    (await call("/finance/expense-columns", { version: 1, columns: changed }))
      .status,
    409,
  );
  for (const invalid of [
    changed.slice(1),
    changed.map((c) => ({ ...c, order: 0 })),
    changed.map((c) => ({ ...c, key: "salary" })),
    changed.map((c) => ({ ...c, label: "x".repeat(31) })),
  ])
    assert.equal(
      (await call("/finance/expense-columns", { version: 2, columns: invalid }))
        .status,
      400,
    );
  await call("/users", {
    username: "reader",
    password: "Reader-password-123",
    role: "viewer",
    name: "只读",
  });
  setCookie(
    (
      await call("/auth/login", {
        username: "reader",
        password: "Reader-password-123",
      })
    ).cookie,
  );
  for (const path of [
    "/finance/expenses",
    "/finance/rules",
    "/finance/company",
  ])
    assert.equal((await call(path)).status, 200);
  const preview = await call("/finance/rules/preview", {
    expression: "0.1+0.2",
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.value, 30);
  assert.equal(
    (
      await call("/finance/rules/preview", {
        expression: "globalThis.process.exit()",
      })
    ).status,
    400,
  );
  for (const path of [
    "/finance/expenses",
    "/finance/expense-columns",
    "/finance/rules",
    "/finance/expenses/1/archive",
    "/finance/rules/1/restore",
  ])
    assert.equal((await call(path, {})).status, 403);
  assert.equal(
    (await call("/finance/expenses")).body.columns.find(
      (c) => c.key === "salary",
    ).label,
    "员工薪酬",
  );
  assert.equal(
    (await call("/finance/rules")).body.fields.find((c) => c.key === "salary")
      .label,
    "员工薪酬",
  );
  setCookie("");
  assert.equal((await call("/finance/expenses")).status, 401);
  setCookie(adminCookie);
  assert.equal(
    (await call("/finance/rules", {}, { origin: "https://evil.example" }))
      .status,
    403,
  );
  const hostStatus = await new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: server.address().port,
        path: "/api/finance/rules",
        headers: { host: "evil.example", cookie: adminCookie },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(hostStatus, 403);
});

test("company prorates leap and cross-month expenses once independently of shop count", async (t) => {
  const { call, db } = await fixture(t);
  const row = {
    date: "2024-02-29",
    channel: "天猫",
    shop: "A",
    product: "P",
    sales: 10000,
    refunds: 100,
    cost: 2000,
    ads: 100,
    platform: 100,
    shipping: 100,
    rewards: 5,
    refundOnly: 50,
    returnRefunds: 50,
  };
  insertBatch(db, [row, { ...row, shop: "B" }], "fixture", 1);
  await call("/finance/expenses", {
    month: "2024-02",
    department: "公司",
    ownerId: 1,
    amounts: amounts({ salary: "29.01" }),
  });
  const march = await call("/finance/expenses", {
    month: "2024-03",
    department: "公司",
    ownerId: 1,
    amounts: amounts({ salary: "31.00", other1: "-0.01" }),
  });
  const result = await call("/finance/company?start=2024-02-29&end=2024-03-01");
  assert.equal(result.status, 200);
  assert.equal(result.body.current.operatingExpense, 200);
  assert.equal(
    result.body.current.managementProfit,
    result.body.current.netProfit - 200,
  );
  assert.equal(
    result.body.currentExpenses.find((c) => c.key === "salary").value,
    200,
  );
  assert.equal(result.body.recordCount, 2);
  assert.equal(result.body.shops.length, 2);
  assert.equal(result.body.trend.length, 2);
  assert.equal(result.body.current.sales, 20000);
  assert.deepEqual(result.body.dataBounds, {
    start: "2024-02-29",
    end: "2024-02-29",
  });
  assert.deepEqual(result.body.current.expenseCoverage, {
    providedMonths: ["2024-02", "2024-03"],
    missingMonths: [],
  });
  assert.deepEqual(result.body.range.previous, {
    start: "2024-02-27",
    end: "2024-02-28",
  });
  assert.equal(
    (await call("/finance/company?start=2024-02-01&end=2024-02-29")).body
      .current.operatingExpense,
    2901,
  );
  const full = await call("/finance/company?start=2024-02-01&end=2024-03-31");
  assert.equal(full.body.current.operatingExpense, 6000);
  await call(`/finance/expenses/${march.body.item.id}/archive`, { version: 1 });
  const missingMonth = (
    await call("/finance/company?start=2024-03-01&end=2024-03-31")
  ).body;
  assert.equal(missingMonth.current.operatingExpense, 0);
  assert.deepEqual(missingMonth.current.expenseCoverage, {
    providedMonths: [],
    missingMonths: ["2024-03"],
  });
  assert.equal(
    (await call("/finance/company?start=2024-02-30&end=2024-03-01")).status,
    400,
  );
  const pool = (await call("/finance/rules?start=2001-01-01&end=2001-01-02"))
    .body.fields;
  for (const key of [
    "sales",
    "refunds",
    "netSales",
    "cost",
    "grossProfit",
    "ads",
    "platform",
    "shipping",
    "rewards",
    "refundOnly",
    "returnRefunds",
    "netProfit",
  ])
    assert.equal(pool.find((f) => f.key === key).value, null);
  for (const key of [...keys, "operatingExpense"]) {
    assert.equal(pool.find((f) => f.key === key).value, null);
    assert.match(pool.find((f) => f.key === key).source, /2001-01/);
  }
  const complete = (
    await call("/finance/rules?start=2024-02-01&end=2024-02-29")
  ).body.fields;
  assert.equal(complete.find((f) => f.key === "operatingExpense").value, 2901);
  assert.equal(complete.find((f) => f.key === "fixed").value, 0);
  const incomplete = await call("/finance/rules/preview", {
    expression: "operatingExpense+1",
    start: "2024-02-01",
    end: "2024-03-31",
  });
  assert.equal(incomplete.body.status, "missing");
  assert.match(incomplete.body.reason, /2024-03/);
});

test("rules use safe exact decimal arithmetic, dependency validation and explicit missing results", async (t) => {
  const { call, db } = await fixture(t);
  const add = (body) =>
    call("/finance/rules", {
      name: "测试规则",
      expression: "0.1+0.2",
      tags: ["月报"],
      enabled: true,
      ...body,
    });
  const first = await add({});
  assert.equal(first.status, 201);
  assert.equal(first.body.item.value, 30);
  assert.equal((await add({ expression: "(1/3)*3" })).body.item.value, 100);
  assert.equal((await add({ expression: "1.005" })).body.item.value, 101);
  assert.equal((await add({ expression: "-1.005" })).body.item.value, -101);
  assert.equal(
    (await add({ expression: `rule_${first.body.item.id}*2` })).body.item.value,
    60,
  );
  const dependency = first.body.item;
  assert.equal(
    (await call(`/finance/rules/${dependency.id}/archive`, { version: 1 }))
      .status,
    409,
  );
  assert.equal(
    (await add({ id: dependency.id, version: 1, enabled: false })).status,
    409,
  );
  assert.equal(
    (
      await add({
        id: dependency.id,
        version: 1,
        expression: `rule_${dependency.id}`,
      })
    ).status,
    400,
  );
  const rules = (await call("/finance/rules")).body.items;
  const user = rules.find((r) => r.expression === `rule_${dependency.id}*2`);
  assert.equal(
    (
      await add({
        id: dependency.id,
        version: 1,
        expression: `rule_${user.id}`,
      })
    ).status,
    400,
  );
  for (const expression of [
    "process.exit()",
    "sales.constructor",
    "1;2",
    "2**3",
    "Math.max(1,2)",
    "rule_99999",
    "unknown+1",
    "1 2",
    "1//2",
    "",
    "(".repeat(250) + "1" + ")".repeat(250),
  ])
    assert.equal((await add({ expression })).status, 400, expression);
  const divide = await add({ expression: "1/(0.1+0.2-0.3)" });
  assert.equal(divide.body.item.status, "error");
  assert.equal(divide.body.item.value, null);
  assert.match(divide.body.item.reason, /零|0/);
  const missing = await add({ expression: "rewards+sales" });
  assert.equal(missing.body.item.status, "missing");
  insertBatch(
    db,
    [
      {
        date: "2024-02-01",
        channel: "京东",
        shop: "A",
        product: "A",
        sales: 10000,
        refunds: 100,
        cost: 100,
        ads: 100,
        platform: 100,
        shipping: 100,
      },
    ],
    "fixture",
    1,
  );
  const withFields = await call(
    "/finance/rules?start=2024-02-01&end=2024-02-29",
  );
  assert.equal(
    withFields.body.fields.find((f) => f.key === "sales").value,
    10000,
  );
  assert.equal(
    withFields.body.fields.find((f) => f.key === "rewards").value,
    null,
  );
  assert.equal(
    withFields.body.items.find((i) => i.id === missing.body.item.id).status,
    "missing",
  );
  const disabled = await add({ enabled: false, expression: "sales" });
  assert.equal(disabled.body.item.status, "disabled");
  assert.equal(
    (await add({ expression: `rule_${disabled.body.item.id}` })).status,
    400,
  );
  assert.equal(
    (
      await add({
        id: user.id,
        version: 1,
        enabled: false,
        expression: user.expression,
      })
    ).status,
    200,
  );
  assert.equal(
    (await call(`/finance/rules/${dependency.id}/archive`, { version: 1 }))
      .status,
    200,
  );
  assert.equal(
    (await call(`/finance/rules/${user.id}/restore`, { version: 2 })).status,
    409,
  );
  assert.equal(
    (await call(`/finance/rules/${dependency.id}/restore`, { version: 2 }))
      .status,
    200,
  );
  assert.equal((await add({ id: dependency.id, version: 1 })).status, 409);
  assert.equal((await call("/finance/rules?archived=1")).body.items.length, 0);
});

test("fractional expense cents are aggregated before rounding and rule limits fail safely", async (t) => {
  const { call } = await fixture(t);
  for (let i = 0; i < 3; i++)
    await call("/finance/expenses", {
      month: "2024-02",
      department: "公司",
      ownerId: 1,
      amounts: amounts({ salary: "0.10" }),
    });
  const prorated = await call("/finance/rules?start=2024-02-01&end=2024-02-01");
  assert.equal(prorated.body.expenseTotal, 1);
  const huge = await call("/finance/rules", {
    name: "有界计算",
    expression: Array(30).fill("9999999999").join("*"),
    tags: [],
    enabled: true,
  });
  assert.equal(huge.status, 201);
  assert.equal(huge.body.item.value, null);
  assert.equal(huge.body.item.status, "error");
  for (let i = 1; i < 100; i++)
    assert.equal(
      (
        await call("/finance/rules", {
          name: `规则${i}`,
          expression: "1",
          tags: [],
          enabled: true,
        })
      ).status,
      201,
    );
  assert.equal(
    (
      await call("/finance/rules", {
        name: "超限",
        expression: "1",
        tags: [],
        enabled: true,
      })
    ).status,
    400,
  );
});

test("preview stays read-only, checks edited rule cycles and restores dependencies in order", async (t) => {
  const { call, db } = await fixture(t);
  const add = (name, expression) =>
    call("/finance/rules", { name, expression, tags: [], enabled: true });
  const base = (await add("基础", "(2+3)*4-6/2+-0.1")).body.item;
  assert.equal(base.value, 1690);
  const dependent = (await add("依赖", `rule_${base.id}+1`)).body.item;
  const before = db.prepare("SELECT COUNT(*) n FROM finance_rules").get().n;
  const preview = await call("/finance/rules/preview", {
    expression: `rule_${base.id}*3`,
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.deepEqual(preview.body, { value: 5070, status: "ok", reason: "" });
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM finance_rules").get().n,
    before,
  );
  assert.equal(
    (
      await call("/finance/rules/preview", {
        ruleId: base.id,
        expression: `rule_${dependent.id}`,
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("/finance/rules/preview", { expression: "rule_99999" })).status,
    400,
  );
  assert.equal(
    (
      await call("/finance/rules/preview", {
        expression: "1",
        start: "2024-02-30",
        end: "2024-03-01",
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(`/finance/rules/${dependent.id}/archive`, { version: 1 }))
      .status,
    200,
  );
  assert.equal(
    (await call(`/finance/rules/${base.id}/archive`, { version: 1 })).status,
    200,
  );
  assert.equal((await call("/finance/rules?archived=1")).body.items.length, 2);
  assert.equal(
    (await call(`/finance/rules/${dependent.id}/restore`, { version: 2 }))
      .status,
    409,
  );
  assert.equal(
    (await call(`/finance/rules/${base.id}/restore`, { version: 2 })).status,
    200,
  );
  assert.equal(
    (await call(`/finance/rules/${dependent.id}/restore`, { version: 2 })).body
      .item.value,
    1790,
  );
});

test("company column allocations reconcile cents, groups shops by channel and keeps the old overview intact", async (t) => {
  const { call, db } = await fixture(t);
  const row = {
    date: "2024-03-01",
    channel: "天猫",
    shop: "同名店",
    product: "P",
    sales: 10000,
    refunds: 100,
    cost: 1000,
    ads: 100,
    platform: 100,
    shipping: 100,
  };
  insertBatch(db, [row, { ...row, channel: "京东" }], "fixture", 1);
  await call("/finance/expenses", {
    month: "2024-03",
    department: "公司",
    ownerId: 1,
    amounts: amounts({ salary: "0.16", fixed: "0.16", other1: "-0.01" }),
  });
  const result = (
    await call("/finance/company?start=2024-03-01&end=2024-03-01")
  ).body;
  assert.equal(result.current.operatingExpense, 1);
  assert.equal(
    result.currentExpenses.reduce((sum, column) => sum + column.value, 0),
    1,
  );
  assert.equal(result.shops.length, 2);
  assert.deepEqual(
    new Set(result.shops.map((shop) => shop.channel)),
    new Set(["天猫", "京东"]),
  );
  for (const shop of result.shops)
    assert.equal(Object.hasOwn(shop, "operatingExpense"), false);
  const old = (await call("/overview?start=2024-03-01&end=2024-03-01")).body;
  assert.equal(result.current.netProfit, old.current.netProfit);
  assert.equal(Object.hasOwn(old.current, "operatingExpense"), false);
});
