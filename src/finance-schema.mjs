// Shared display contract. Amounts returned by finance APIs are integer cents.
export const expenseColumns = [
  { key: "salary", label: "工资福利" },
  { key: "fixed", label: "固定费用" },
  { key: "officeShipping", label: "办公室运费" },
  { key: "warehouse", label: "仓库费用" },
  { key: "jdShipping", label: "京东运费补差" },
  { key: "jdWarehouse", label: "京东仓储费用" },
  ...Array.from({ length: 6 }, (_, i) => ({
    key: `other${i + 1}`,
    label: `其他费用${i + 1}`,
  })),
];
export const expenseKeys = expenseColumns.map((column) => column.key);
export const baseFinanceFields = [
  { key: "sales", label: "销售额" },
  { key: "refunds", label: "退款额" },
  { key: "netSales", label: "净销售额" },
  { key: "cost", label: "产品成本" },
  { key: "grossProfit", label: "毛利" },
  { key: "ads", label: "广告费" },
  { key: "platform", label: "平台费" },
  { key: "shipping", label: "运费" },
  { key: "rewards", label: "奖励" },
  { key: "refundOnly", label: "仅退款" },
  { key: "returnRefunds", label: "退货退款" },
  { key: "netProfit", label: "经营预估净利" },
  ...expenseColumns,
  { key: "operatingExpense", label: "公司月度费用" },
];
