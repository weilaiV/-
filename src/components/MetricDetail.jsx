import React, { useState } from "react";
import { ArrowRight, Layers3 } from "lucide-react";
import Dialog from "./Dialog";
import { money, percent } from "../api";
import { changeRate } from "../workbench.mjs";
export const metricDefinitions = [
  {
    key: "sales",
    label: "销售额",
    description: "所选周期内导入的销售金额汇总",
  },
  { key: "netSales", label: "净销售额", description: "销售额 − 退款额" },
  { key: "grossProfit", label: "毛利额", description: "净销售额 − 产品成本" },
  {
    key: "grossMargin",
    label: "毛利率",
    ratio: true,
    description: "毛利额 ÷ 净销售额 × 100%",
  },
  {
    key: "netProfit",
    label: "预估净利润",
    description: "毛利额 + 奖励 − 广告费 − 平台总服务费 − 运费",
  },
  {
    key: "netMargin",
    label: "预估净利率",
    ratio: true,
    description: "预估净利润 ÷ 净销售额 × 100%",
  },
  {
    key: "cost",
    label: "产品成本",
    description: "所选周期内导入的产品成本汇总",
  },
  {
    key: "refunds",
    label: "退款金额",
    description: "所选周期内导入的退款额汇总",
  },
  {
    key: "refundOnly",
    label: "仅退款",
    description: "导入的仅退款金额；历史未拆分数据不填充为零",
  },
  {
    key: "returnRefunds",
    label: "退货退款",
    description: "导入的退货退款金额；历史未拆分数据不填充为零",
  },
  { key: "rewards", label: "奖励", description: "导入的经营奖励金额" },
  { key: "ads", label: "广告费", description: "所选周期内导入的广告费汇总" },
  {
    key: "platform",
    label: "平台总服务费",
    description: "所选周期内导入的平台服务费汇总",
  },
  { key: "shipping", label: "运费", description: "所选周期内导入的运费汇总" },
];
export const displayMetric = (value, ratio = false) =>
  value == null ? "暂无数据" : ratio ? percent(value) : money(value);
export default function MetricDetail({
  metric,
  data,
  onClose,
  onMetric,
  onRecords,
}) {
  const [dimension, setDimension] = useState("shops");
  const definition =
    metricDefinitions.find((item) => item.key === metric) ||
    metricDefinitions[0];
  const value = data.current[definition.key];
  const before = data.previous[definition.key];
  const change = changeRate(value, before);
  const rows = [...(data[dimension] || [])].sort(
    (a, b) =>
      (b[definition.key] ?? -Infinity) - (a[definition.key] ?? -Infinity),
  );
  return (
    <Dialog
      title={definition.label}
      subtitle="经营指标 · 全公司"
      onClose={onClose}
      drawer
      className="metric-detail"
    >
      <div className="detail-period">
        {data.range.start} 至 {data.range.end}
      </div>
      <div className="detail-summary">
        <section>
          <span>本期{definition.label}</span>
          <strong>{displayMetric(value, definition.ratio)}</strong>
          <p>{definition.description}</p>
        </section>
        <section>
          <span>环比</span>
          <strong
            className={
              change == null ? "" : change >= 0 ? "positive" : "negative"
            }
          >
            {change == null
              ? "暂无可比基数"
              : `${change >= 0 ? "上升" : "下降"} ${Math.abs(change).toFixed(2)}%`}
          </strong>
          <p>上期：{displayMetric(before, definition.ratio)}</p>
        </section>
      </div>
      <div className="detail-definition">
        <b>计算口径</b>
        <p>
          {definition.description}
          。当前按导入的经营汇总日期统计；未接入订单发货日期、人员和部门数据。
        </p>
      </div>
      <div className="detail-columns">
        <section>
          <div className="detail-section-title">
            <span>按维度比较</span>
            <h3>
              贡献构成 <small>{rows.length} 条</small>
            </h3>
          </div>
          <div
            className="dimension-tabs"
            role="tablist"
            aria-label="指标贡献维度"
          >
            <button role="tab" disabled title="尚未导入人员维度">
              人员贡献
            </button>
            {[
              ["shops", "店铺贡献"],
              ["channels", "平台贡献"],
              ["products", "商品贡献"],
            ].map(([key, title]) => (
              <button
                key={key}
                role="tab"
                aria-selected={dimension === key}
                onClick={() => setDimension(key)}
              >
                {title}
              </button>
            ))}
          </div>
          <ol className="contribution-list">
            {rows.map((row, index) => (
              <li key={row.name}>
                <span>{index + 1}</span>
                <div>
                  <b>{row.name}</b>
                  <small>
                    {definition.ratio
                      ? "当前维度比率"
                      : value
                        ? `贡献 ${(((row[definition.key] || 0) / value) * 100).toFixed(2)}%`
                        : "暂无贡献占比"}
                  </small>
                </div>
                <strong>
                  {displayMetric(row[definition.key], definition.ratio)}
                </strong>
                <button
                  className="text-button"
                  onClick={() =>
                    onRecords(
                      dimension === "shops"
                        ? { shop: row.name }
                        : dimension === "products"
                          ? { product: row.name }
                          : { channel: row.name },
                    )
                  }
                >
                  明细 <ArrowRight size={12} />
                </button>
              </li>
            ))}
          </ol>
          {!rows.length && (
            <p className="detail-empty">当前统计范围内没有贡献数据</p>
          )}
        </section>
        <section className="composition">
          <div className="detail-section-title">
            <span>核算关系</span>
            <h3>指标组成</h3>
          </div>
          {[
            "sales",
            "refunds",
            "cost",
            "rewards",
            "ads",
            "platform",
            "shipping",
          ].map((key) => {
            const item = metricDefinitions.find((row) => row.key === key);
            return (
              <button
                key={key}
                className={metric === key ? "current" : ""}
                onClick={() => onMetric(key)}
              >
                <Layers3 size={16} />
                <span>
                  {item.label}
                  <small>
                    {key === "rewards"
                      ? "未导入时暂按 0 计入预估"
                      : "点击继续查看维度贡献"}
                  </small>
                </span>
                <b>{displayMetric(data.current[key])}</b>
                <ArrowRight size={13} />
              </button>
            );
          })}
          <p>
            未导入的指标显示“暂无数据”。税费、人工和其他未导入费用不计入预估净利润。
          </p>
        </section>
      </div>
    </Dialog>
  );
}
