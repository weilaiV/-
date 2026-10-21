import { parse } from "csv-parse/sync";

export const columns = {
  日期: "date",
  渠道: "channel",
  店铺: "shop",
  商品: "product",
  销售额: "sales",
  退款额: "refunds",
  产品成本: "cost",
  广告费: "ads",
  平台费: "platform",
  运费: "shipping",
};
export const moneyFields = [
  "sales",
  "refunds",
  "cost",
  "ads",
  "platform",
  "shipping",
];
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value &&
    value >= "2000-01-01" &&
    value <= "2100-12-31"
  );
}
function cents(value, label) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text))
    throw new AppError(`${label}必须是非负金额，最多两位小数`);
  const [whole, fraction = ""] = text.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (amount > 1_000_000_000) throw new AppError(`${label}不能超过一千万元`);
  return amount;
}
export function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0)
    throw new AppError("请至少提供一行数据");
  if (rows.length > 10000) throw new AppError("单次最多导入 10000 行");
  const keys = new Set();
  return rows.map((input, index) => {
    const prefix = `第 ${index + 2} 行：`;
    if (!validDate(input.date))
      throw new AppError(prefix + "日期无效，请使用 YYYY-MM-DD");
    const row = { date: input.date };
    for (const key of ["channel", "shop", "product"]) {
      if (
        typeof input[key] !== "string" ||
        !input[key].trim() ||
        input[key].length > 200 ||
        /^[=+@\-\t\r]/.test(input[key].trim()) ||
        /[\u0000-\u001f]/.test(input[key])
      )
        throw new AppError(prefix + `${key}不能为空、过长或包含公式/控制字符`);
      row[key] = input[key].trim();
    }
    for (const key of moneyFields)
      row[key] = cents(
        input[key],
        prefix + Object.keys(columns).find((label) => columns[label] === key),
      );
    if (row.refunds > row.sales)
      throw new AppError(prefix + "退款额不能超过销售额");
    const naturalKey = JSON.stringify([
      row.date,
      row.channel,
      row.shop,
      row.product,
    ]);
    if (keys.has(naturalKey))
      throw new AppError(prefix + "存在重复的日期、渠道、店铺和商品");
    keys.add(naturalKey);
    return row;
  });
}
export function parseCsv(csv) {
  if (
    typeof csv !== "string" ||
    Buffer.byteLength(csv, "utf8") > 5 * 1024 * 1024
  )
    throw new AppError("CSV 文件不能超过 5MB");
  let rows;
  try {
    rows = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      columns(headers) {
        const required = Object.keys(columns);
        if (
          headers.length !== required.length ||
          new Set(headers).size !== headers.length ||
          required.some((h) => !headers.includes(h))
        )
          throw new Error("表头需完整匹配模板");
        return headers.map((h) => columns[h]);
      },
      max_record_size: 10000,
    });
  } catch (error) {
    throw new AppError("CSV 格式错误：" + error.message);
  }
  return validateRows(rows);
}
export function summarize(rows) {
  const totals = Object.fromEntries(moneyFields.map((key) => [key, 0]));
  for (const row of rows)
    for (const key of moneyFields) totals[key] += row[key];
  totals.netSales = totals.sales - totals.refunds;
  totals.grossProfit = totals.netSales - totals.cost;
  totals.netProfit =
    totals.grossProfit - totals.ads - totals.platform - totals.shipping;
  totals.grossMargin = totals.netSales
    ? (totals.grossProfit / totals.netSales) * 100
    : 0;
  totals.netMargin = totals.netSales
    ? (totals.netProfit / totals.netSales) * 100
    : 0;
  totals.refundRate = totals.sales ? (totals.refunds / totals.sales) * 100 : 0;
  return totals;
}
export function previousPeriod(start, end) {
  if (!validDate(start) || !validDate(end) || start > end)
    throw new AppError("请选择有效的起止日期");
  const day = 86400000;
  const duration = (Date.parse(end) - Date.parse(start)) / day + 1;
  if (duration > 366) throw new AppError("一次最多查询 366 天，请缩小日期范围");
  const date = (n) => new Date(n).toISOString().slice(0, 10);
  return {
    start: date(Date.parse(start) - duration * day),
    end: date(Date.parse(start) - day),
  };
}
export const businessDate = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
export function demoRows() {
  const today = businessDate();
  const shops = [
    ["天猫", "科然办公旗舰店"],
    ["天猫", "羽麦打印专卖店"],
    ["京东", "科然办公专营店"],
    ["拼多多", "科然耗材工厂店"],
    ["线下", "企业客户直销"],
  ];
  const products = [
    "热敏标签打印机",
    "不干胶标签纸",
    "便携条码扫描器",
    "树脂碳带",
  ];
  const rows = [];
  for (let d = 89; d >= 0; d--)
    for (let s = 0; s < shops.length; s++)
      for (let p = 0; p < products.length; p++) {
        const date = new Date(Date.parse(today) - d * 86400000)
          .toISOString()
          .slice(0, 10);
        const sales = Math.round(
          (500 + s * 180 + p * 120) *
            (1 + Math.sin(d * 0.27 + s) * 0.24) *
            (1 + (90 - d) * 0.003) *
            100,
        );
        rows.push({
          date,
          channel: shops[s][0],
          shop: shops[s][1],
          product: products[p],
          sales,
          refunds: Math.round(sales * 0.046),
          cost: Math.round(sales * (0.51 + s * 0.022)),
          ads: Math.round(sales * 0.045),
          platform: Math.round(sales * 0.018),
          shipping: Math.round(sales * 0.023),
        });
      }
  return rows;
}
