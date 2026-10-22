export const panelKeys = [
  "metrics",
  "costs",
  "todos",
  "trend",
  "structure",
  "channels",
  "shops",
  "products",
  "health",
  "highlights",
  "issues",
  "followups",
];
export const panelLabels = {
  metrics: "核心经营指标",
  costs: "成本费用与售后",
  todos: "待办与提醒",
  trend: "销售趋势",
  structure: "产品成本与运费",
  channels: "渠道经营对比",
  shops: "店铺经营 TOP5",
  products: "商品经营 TOP5",
  health: "关键指标观察",
  highlights: "本期经营亮点",
  issues: "本期主要问题",
  followups: "重点跟进方向",
};
export const visitTab = (tabs, page) =>
  tabs.includes(page) ? tabs : [...tabs, page];
export function closeTab(tabs, page, active) {
  if (page === "home") return { tabs, active };
  const position = tabs.indexOf(page);
  const next = tabs.filter((item) => item !== page);
  return {
    tabs: next,
    active:
      active === page ? next[Math.max(0, position - 1)] || "home" : active,
  };
}
export function aggregateTrend(rows, grain = "day") {
  if (grain === "day") return rows;
  const groups = new Map();
  for (const row of rows) {
    let date = row.date;
    if (grain === "month") date = date.slice(0, 7) + "-01";
    else {
      const day = new Date(date);
      const weekday = (day.getUTCDay() + 6) % 7;
      date = new Date(day.getTime() - weekday * 86400000)
        .toISOString()
        .slice(0, 10);
    }
    const item = groups.get(date) || { date, sales: 0, netSales: 0 };
    item.sales += row.sales;
    item.netSales += row.netSales;
    groups.set(date, item);
  }
  return [...groups.values()];
}
export const changeRate = (value, before) =>
  value == null || before == null || before === 0
    ? null
    : ((value - before) / Math.abs(before)) * 100;
export function rangeError(start, end) {
  const valid = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "2000-01-01" &&
    value <= "2100-12-31" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end))
    return "请选择2000年至2100年之间的有效日期。";
  if (start > end) return "开始日期不能晚于结束日期。";
  if ((Date.parse(end) - Date.parse(start)) / 86400000 > 365)
    return "单次最多查看366天，请缩小起止日期范围。";
  return "";
}
export function datePreset(key, today, bounds) {
  const shift = (value, days) =>
    new Date(Date.parse(value) + days * 86400000).toISOString().slice(0, 10);
  if (key === "lastMonth") {
    const end = shift(today.slice(0, 7) + "-01", -1);
    return { start: end.slice(0, 7) + "-01", end, limited: false };
  }
  if (key === "month")
    return { start: today.slice(0, 7) + "-01", end: today, limited: false };
  if (key === "all" && bounds?.start) {
    const end = bounds.end;
    const earliest = shift(end, -365);
    return {
      start: bounds.start < earliest ? earliest : bounds.start,
      end,
      limited: bounds.start < earliest,
    };
  }
  return {
    start: shift(today, key === "week" ? -6 : -29),
    end: today,
    limited: false,
  };
}
