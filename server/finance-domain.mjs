import { AppError, validDate } from "./domain.mjs";
import {
  expenseColumns,
  expenseKeys,
  baseFinanceFields,
} from "../src/finance-schema.mjs";

const knownFields = new Set(baseFinanceFields.map((field) => field.key));
const MAX_BITS = 512;
const abs = (n) => (n < 0n ? -n : n);
function gcd(a, b) {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
// Keep every intermediate exact and bounded, including before reduction.
function rational(n, d = 1n) {
  if (!d) throw new AppError("除数不能为零");
  if (
    abs(n).toString(2).length > MAX_BITS ||
    abs(d).toString(2).length > MAX_BITS
  )
    throw new AppError("算式数值超出安全计算范围");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const common = gcd(n, d);
  return { n: n / common, d: d / common };
}
function operation(op, a, b) {
  if (op === "+") return rational(a.n * b.d + b.n * a.d, a.d * b.d);
  if (op === "-") return rational(a.n * b.d - b.n * a.d, a.d * b.d);
  if (op === "*") return rational(a.n * b.n, a.d * b.d);
  return rational(a.n * b.d, a.d * b.n);
}
function round(r) {
  const result = ((abs(r.n) * 2n + r.d) / (2n * r.d)) * (r.n < 0n ? -1n : 1n);
  if (abs(result) > BigInt(Number.MAX_SAFE_INTEGER))
    throw new AppError("金额超出安全整数范围");
  return Number(result);
}
export function validMonth(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}$/.test(value) &&
    validDate(value + "-01")
  );
}
export function parseExpenseAmounts(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length !== 12 ||
    expenseKeys.some((key) => !Object.hasOwn(input, key))
  )
    throw new AppError("请完整提供全部12项费用");
  return Object.fromEntries(
    expenseColumns.map(({ key, label }, index) => {
      const text = input[key];
      if (
        typeof text !== "string" ||
        !(
          index < 6 ? /^\d{1,10}(\.\d{1,2})?$/ : /^-?\d{1,10}(\.\d{1,2})?$/
        ).test(text)
      )
        throw new AppError(
          `${label}须为元金额字符串，最多两位小数${index < 6 ? "且不得为负" : ""}`,
        );
      const negative = text.startsWith("-");
      const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
      const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
      if (cents > 1_000_000_000n)
        throw new AppError(`${label}不能超过一千万元`);
      return [key, Number(cents) * (negative ? -1 : 1)];
    }),
  );
}
export function safeSum(values) {
  return values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(sum + value))
      throw new AppError("金额超出安全整数范围");
    return sum + value;
  }, 0);
}
export function prorateExpenses(expenses, start, end) {
  const totals = Object.fromEntries(
    expenseKeys.map((key) => [key, rational(0n)]),
  );
  for (const expense of expenses) {
    if (expense.archived) continue;
    const monthStart = expense.month + "-01";
    const next = new Date(Date.parse(monthStart));
    next.setUTCMonth(next.getUTCMonth() + 1);
    const days = (next.getTime() - Date.parse(monthStart)) / 86400000;
    const monthEnd = new Date(next.getTime() - 86400000)
      .toISOString()
      .slice(0, 10);
    const overlapStart = start > monthStart ? start : monthStart;
    const overlapEnd = end < monthEnd ? end : monthEnd;
    if (overlapStart > overlapEnd) continue;
    const overlap = BigInt(
      (Date.parse(overlapEnd) - Date.parse(overlapStart)) / 86400000 + 1,
    );
    for (const key of expenseKeys)
      totals[key] = operation(
        "+",
        totals[key],
        rational(BigInt(expense.amounts[key]) * overlap, BigInt(days)),
      );
  }
  const exact = expenseKeys.reduce(
    (sum, key) => operation("+", sum, totals[key]),
    rational(0n),
  );
  const total = round(exact);
  const amounts = Object.fromEntries(
    expenseKeys.map((key) => [key, round(totals[key])]),
  );
  // Reconcile independently displayed columns to the once-rounded company total.
  // Assign residual cents to the fields with the greatest rounding remainder.
  let difference = total - safeSum(Object.values(amounts));
  while (difference) {
    const direction = difference > 0 ? 1 : -1;
    const sorted = [...expenseKeys].sort((a, b) => {
      const ra = operation("-", totals[a], rational(BigInt(amounts[a])));
      const rb = operation("-", totals[b], rational(BigInt(amounts[b])));
      const delta = ra.n * rb.d - rb.n * ra.d;
      return delta === 0n ? 0 : delta > 0n ? -direction : direction;
    });
    amounts[sorted[0]] += direction;
    difference -= direction;
  }
  return { amounts, total };
}

export function parseExpression(expression) {
  if (
    typeof expression !== "string" ||
    !expression.trim() ||
    expression.length > 500
  )
    throw new AppError("算式不能为空且最多500个字符");
  const tokens = [];
  const matcher = /\s+|\d+(?:\.\d+)?|[A-Za-z_][A-Za-z_0-9]*|[+\-*/()]/gy;
  let position = 0;
  while (position < expression.length) {
    matcher.lastIndex = position;
    const match = matcher.exec(expression);
    if (!match) throw new AppError("算式包含非法字符");
    position = matcher.lastIndex;
    if (!/^\s+$/.test(match[0])) tokens.push(match[0]);
    if (tokens.length > 250) throw new AppError("算式过于复杂");
  }
  let cursor = 0;
  const refs = new Set();
  function term(depth) {
    if (depth > 64) throw new AppError("算式嵌套过深");
    const token = tokens[cursor++];
    if (token === "+" || token === "-")
      return { type: "unary", op: token, child: term(depth + 1) };
    if (token === "(") {
      const node = binary(0, depth + 1);
      if (tokens[cursor++] !== ")") throw new AppError("算式括号不匹配");
      return node;
    }
    if (/^\d+(?:\.\d+)?$/.test(token || "")) {
      if (token.length > 24) throw new AppError("数字过长");
      const [whole, fraction = ""] = token.split(".");
      return {
        type: "number",
        value: rational(
          BigInt(whole + fraction),
          10n ** BigInt(fraction.length),
        ),
      };
    }
    if (knownFields.has(token) || /^rule_[1-9]\d{0,9}$/.test(token || "")) {
      refs.add(token);
      return { type: "ref", key: token };
    }
    throw new AppError(token ? `未知字段或无效算式：${token}` : "算式不完整");
  }
  const precedence = (op) =>
    op === "+" || op === "-" ? 1 : op === "*" || op === "/" ? 2 : 0;
  function binary(min, depth) {
    let node = term(depth);
    while (precedence(tokens[cursor]) > min) {
      const op = tokens[cursor++];
      node = {
        type: "binary",
        op,
        left: node,
        right: binary(precedence(op), depth + 1),
      };
    }
    return node;
  }
  const ast = binary(0, 0);
  if (cursor !== tokens.length) throw new AppError("算式运算符或括号无效");
  return { ast, refs: [...refs] };
}

export function validateRuleGraph(rules) {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const parsed = new Map(
    rules.map((rule) => [rule.id, parseExpression(rule.expression)]),
  );
  for (const rule of rules)
    for (const ref of parsed.get(rule.id).refs) {
      if (!ref.startsWith("rule_")) continue;
      const target = byId.get(Number(ref.slice(5)));
      if (!target) throw new AppError(`引用规则不存在：${ref}`);
      if (
        !rule.archived &&
        rule.enabled &&
        (target.archived || !target.enabled)
      )
        throw new AppError(`引用规则已归档或停用：${target.name}`);
    }
  const visited = new Set(),
    visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new AppError("规则存在循环引用");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const ref of parsed.get(id).refs)
      if (ref.startsWith("rule_")) visit(Number(ref.slice(5)));
    visiting.delete(id);
    visited.add(id);
  }
  for (const rule of rules) visit(rule.id);
  return parsed;
}

export function evaluateRules(rules, fields) {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const fieldMap = new Map(fields.map((field) => [field.key, field]));
  const cache = new Map(),
    visiting = new Set();
  const fail = (status, reason) => ({ value: null, status, reason });
  function calculate(id) {
    if (cache.has(id)) return cache.get(id);
    const rule = byId.get(id);
    if (!rule || rule.archived) return fail("error", "引用规则不存在或已归档");
    if (!rule.enabled) return fail("disabled", "规则已停用");
    if (visiting.has(id)) return fail("error", "规则存在循环引用");
    visiting.add(id);
    let result;
    try {
      const { ast } = parseExpression(rule.expression);
      function execute(node) {
        if (node.type === "number") return node.value;
        if (node.type === "ref") {
          if (node.key.startsWith("rule_")) {
            const dependent = calculate(Number(node.key.slice(5)));
            if (dependent.status !== "ok")
              throw {
                ...dependent,
                reason: `${byId.get(Number(node.key.slice(5)))?.name || node.key}：${dependent.reason}`,
              };
            return dependent.exact;
          }
          const field = fieldMap.get(node.key);
          if (field?.value == null)
            throw fail(
              "missing",
              `${field?.label || node.key}：${field?.reason || "缺少来源数据"}`,
            );
          return rational(BigInt(field.value), 100n);
        }
        if (node.type === "unary") {
          const child = execute(node.child);
          return node.op === "-" ? rational(-child.n, child.d) : child;
        }
        return operation(node.op, execute(node.left), execute(node.right));
      }
      const exact = execute(ast);
      result = {
        value: round(operation("*", exact, rational(100n))),
        status: "ok",
        reason: "",
        exact,
      };
    } catch (error) {
      result =
        error.status === "missing"
          ? fail("missing", error.reason)
          : fail("error", error.reason || error.message || "算式计算失败");
    }
    visiting.delete(id);
    cache.set(id, result);
    return result;
  }
  return rules.map((rule) => {
    const { exact, ...result } = calculate(rule.id);
    const usedBy = rules
      .filter(
        (candidate) =>
          !candidate.archived &&
          candidate.enabled &&
          parseExpression(candidate.expression).refs.includes(
            `rule_${rule.id}`,
          ),
      )
      .map((candidate) => candidate.name);
    return { ...rule, ...result, usedBy };
  });
}
