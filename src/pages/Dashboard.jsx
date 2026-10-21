import React from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Wallet,
  Store,
  Package,
  ArrowRight,
  CircleHelp,
  Bell,
  CircleCheck,
  Coins,
  Truck,
  Megaphone,
  ReceiptText,
  RotateCcw,
  ChartNoAxesCombined,
} from "lucide-react";
import { money, percent } from "../api";
import { Panel, Empty, DataTable } from "../components/ui";
import { TrendChart, CostChart } from "../components/Charts";
function Change({ current, previous, ratio = false }) {
  if (!previous) return <span className="change muted">暂无前期基数</span>;
  const value = ratio
    ? current - previous
    : ((current - previous) / Math.abs(previous)) * 100;
  return (
    <span className={"change " + (value >= 0 ? "positive" : "negative")}>
      {value >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{" "}
      {Math.abs(value).toFixed(2)}
      {ratio ? " 个百分点" : "%"} <small>环比</small>
    </span>
  );
}
export default function Dashboard({ data, user, navigate, seedDemo, busy }) {
  const { current: c, previous: p } = data;
  const metrics = [
    ["销售额", "sales", false],
    ["净销售额", "netSales", false],
    ["毛利额", "grossProfit", false],
    ["毛利率", "grossMargin", true],
    ["预估净利润", "netProfit", false],
    ["预估净利率", "netMargin", true],
  ];
  const costs = [
    ["产品成本", "cost", Package],
    ["退款金额", "refunds", RotateCcw],
    ["广告费", "ads", Megaphone],
    ["平台服务费", "platform", ReceiptText],
    ["运费", "shipping", Truck],
  ];
  if (!data.recordCount)
    return (
      <div className="panel onboarding">
        <Empty title="从第一份经营数据开始">
          当前日期和渠道范围内没有记录。你可以调整筛选，或导入每日店铺商品数据。
        </Empty>
        <div className="onboarding-actions">
          {user.role === "admin" && (
            <>
              <button className="primary" onClick={() => navigate("imports")}>
                导入经营数据 <ArrowRight size={16} />
              </button>
              {!data.hasRecords && (
                <button
                  className="secondary"
                  onClick={seedDemo}
                  disabled={busy}
                >
                  {busy ? "正在生成…" : "先体验演示数据"}
                </button>
              )}
            </>
          )}
        </div>
        <div className="onboarding-features">
          <span>
            <ChartNoAxesCombined size={20} />
            销售与利润趋势
          </span>
          <span>
            <Store size={20} />
            渠道与店铺对比
          </span>
          <span>
            <Wallet size={20} />
            成本费用分析
          </span>
        </div>
      </div>
    );
  return (
    <>
      <div className="dashboard-top">
        <div className="metrics-grid">
          {metrics.map(([label, key, isRatio]) => (
            <section
              className={
                "metric-card " + (key === "netProfit" ? "featured" : "")
              }
              key={key}
            >
              <div className="metric-label">
                {label}
                <ArrowUpRight size={15} />
              </div>
              <strong>{isRatio ? percent(c[key]) : money(c[key])}</strong>
              <Change current={c[key]} previous={p[key]} ratio={isRatio} />
            </section>
          ))}
        </div>
        <Panel
          title="经营观察"
          icon={Bell}
          extra={<span className="tag neutral">本期</span>}
          className="insights"
        >
          <div className="insight-intro">
            <strong>{data.shops.length}</strong>
            <span>家店铺纳入统计</span>
            <i className="live-dot" />
          </div>
          <div className="insight-item">
            <span className="insight-dot" />
            <div>
              <b>盈利表现</b>
              <p>
                {c.netProfit >= 0
                  ? `本期预估净利润 ${money(c.netProfit)}，净利率 ${percent(c.netMargin)}。`
                  : "本期预估净利润为负，建议核查商品成本和费用。"}
              </p>
            </div>
          </div>
          <div className="insight-item">
            <span className="insight-dot teal" />
            <div>
              <b>售后观察</b>
              <p>退款占销售额 {percent(c.refundRate)}，可结合明细核查原因。</p>
            </div>
          </div>
          <button className="text-button" onClick={() => navigate("records")}>
            查看经营明细 <ArrowRight size={14} />
          </button>
        </Panel>
      </div>
      <div className="costs-grid">
        {costs.map(([label, key, Icon]) => (
          <section className="cost-card" key={key}>
            <span>
              <Icon size={16} />
              {label}
            </span>
            <strong>{money(c[key])}</strong>
            <Change current={c[key]} previous={p[key]} />
          </section>
        ))}
      </div>
      <div className="chart-grid">
        <Panel
          title="销售趋势"
          icon={TrendingUp}
          extra={<span className="muted small">按日统计</span>}
        >
          <TrendChart data={data.trend} />
        </Panel>
        <Panel
          title="成本费用构成"
          icon={Coins}
          extra={<span className="muted small">本期</span>}
        >
          <CostChart totals={c} />
          <p className="panel-note">按实际导入的产品成本与经营费用汇总</p>
        </Panel>
      </div>
      <div className="tables-grid">
        <Panel
          title="渠道经营对比"
          icon={ChartNoAxesCombined}
          extra={<span className="muted small">单位：元</span>}
        >
          <DataTable headers={["渠道", "净销售额", "毛利率", "预估净利"]}>
            {data.channels.map((row) => (
              <tr key={row.name}>
                <td>
                  <span className="channel-dot" />
                  {row.name}
                </td>
                <td>{money(row.netSales)}</td>
                <td>{percent(row.grossMargin)}</td>
                <td className={row.netProfit >= 0 ? "positive" : "negative"}>
                  {money(row.netProfit)}
                </td>
              </tr>
            ))}
          </DataTable>
          <p className="panel-note">按渠道汇总，线上与线下分别核算</p>
        </Panel>
        <Panel
          title="店铺经营 TOP 5"
          icon={Store}
          extra={
            <button className="text-button" onClick={() => navigate("records")}>
              全部明细 <ArrowRight size={14} />
            </button>
          }
        >
          <DataTable headers={["店铺", "净销售额", "预估净利"]}>
            {data.shops.slice(0, 5).map((row, i) => (
              <tr key={row.name}>
                <td>
                  <span className={"rank rank-" + i}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {row.name}
                </td>
                <td>{money(row.netSales)}</td>
                <td>{money(row.netProfit)}</td>
              </tr>
            ))}
          </DataTable>
          <p className="panel-note">按净销售额排序 · 净利润采用预估口径</p>
        </Panel>
      </div>
      <div className="bottom-grid">
        <Panel title="商品经营 TOP 5" icon={Package}>
          <DataTable headers={["商品", "净销售额", "销售占比"]}>
            {data.products.slice(0, 5).map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{money(row.netSales)}</td>
                <td>
                  <div className="share-bar">
                    <div>
                      <i
                        style={{
                          width: `${c.netSales ? (row.netSales / c.netSales) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span>
                      {percent(
                        c.netSales ? (row.netSales / c.netSales) * 100 : 0,
                      )}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="核算说明" icon={CircleHelp} className="formula-panel">
          <div>
            <CircleCheck size={17} />
            <span>净销售额 = 销售额 − 退款额</span>
          </div>
          <div>
            <CircleCheck size={17} />
            <span>毛利额 = 净销售额 − 产品成本</span>
          </div>
          <div>
            <CircleCheck size={17} />
            <span>预估净利 = 毛利 − 广告费 − 平台费 − 运费</span>
          </div>
          <p>
            毛利率与净利率均以净销售额为分母。本期与等长上一周期比较。当前口径未包含税费、人工及其他未导入费用。
          </p>
        </Panel>
      </div>
      <div className="data-footnote">
        统计周期 {data.range.start} — {data.range.end} <span>·</span> 共{" "}
        {data.recordCount.toLocaleString()} 条经营记录 <span>·</span>{" "}
        金额以人民币计
      </div>
    </>
  );
}
