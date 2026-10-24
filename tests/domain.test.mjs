import test from "node:test";
import assert from "node:assert/strict";
import {
  validateRows,
  parseCsv,
  summarize,
  previousPeriod,
} from "../server/domain.mjs";

const row = (changes = {}) => ({
  date: "2026-10-01",
  channel: "天猫",
  shop: "测试店",
  product: "产品A",
  sales: "100.10",
  refunds: "10.00",
  cost: "40.00",
  ads: "5.00",
  platform: "3.00",
  shipping: "2.00",
  ...changes,
});
test("amounts are stored in integer cents with exact financial calculations", () => {
  const records = validateRows([
    row(),
    row({
      date: "2026-10-02",
      sales: "0.20",
      refunds: "0",
      cost: "0",
      ads: "0",
      platform: "0",
      shipping: "0",
    }),
  ]);
  assert.equal(records[0].sales, 10010);
  const summary = summarize(records);
  assert.equal(summary.sales, 10030);
  assert.equal(summary.netSales, 9030);
  assert.equal(summary.grossProfit, 5030);
  assert.equal(summary.netProfit, 4030);
});
test("invalid dates, negative amounts, excessive precision and refunds are rejected", () => {
  for (const changes of [
    { date: "2026-02-30" },
    { sales: "-1" },
    { ads: "NaN" },
    { cost: "1.001" },
    { refunds: "101" },
    { sales: "1e3" },
    { shop: '=HYPERLINK("bad")' },
    { shop: "  =FORMULA()" },
  ]) {
    assert.throws(() => validateRows([row(changes)]));
  }
});
test("CSV accepts BOM, quoted commas, CRLF and maps explicit Chinese headers", () => {
  const csv =
    '\uFEFF日期,渠道,店铺,商品,销售额,退款额,产品成本,广告费,平台费,运费\r\n2026-10-01,天猫,测试店,"产品,A",100.10,10,40,5,3,2\r\n';
  const parsed = parseCsv(csv);
  assert.equal(parsed[0].product, "产品,A");
  assert.equal(parsed[0].sales, 10010);
  assert.throws(() => parseCsv("日期,销售额\n2026-10-01,1"));
});
test("duplicate natural keys within a batch fail with row context", () => {
  assert.throws(() => validateRows([row(), row()]), /重复/);
});
test("previous period has equal inclusive duration across year boundary", () => {
  assert.deepEqual(previousPeriod("2026-01-01", "2026-01-07"), {
    start: "2025-12-25",
    end: "2025-12-31",
  });
  assert.throws(() => previousPeriod("2026-10-02", "2026-10-01"));
});
test("empty financial data returns finite zero ratios", () => {
  const result = summarize([]);
  assert.equal(result.grossMargin, 0);
  assert.equal(result.netMargin, 0);
});
