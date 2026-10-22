import React, { useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  ChartNoAxesCombined,
  CircleHelp,
  Coins,
  Flag,
  Lightbulb,
  Megaphone,
  Package,
  ReceiptText,
  RotateCcw,
  Store,
  TrendingUp,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { money, percent, today } from "../api";
import { TrendChart } from "../components/Charts";
import Dialog from "../components/Dialog";
import { metricDefinitions, displayMetric } from "../components/MetricDetail";
import {
  aggregateTrend,
  changeRate,
  datePreset,
  panelKeys,
  rangeError,
} from "../workbench.mjs";

const coreKeys = [
  "sales",
  "netSales",
  "grossProfit",
  "grossMargin",
  "netProfit",
  "netMargin",
];
const costItems = [
  ["cost", Package],
  ["refundOnly", RotateCcw],
  ["returnRefunds", RotateCcw],
  ["rewards", Coins],
  ["ads", Megaphone],
  ["platform", ReceiptText],
  ["shipping", Truck],
];
const presets = [
  ["week", "近7天"],
  ["month30", "近30天"],
  ["month", "本月"],
  ["lastMonth", "上月"],
  ["all", "全部"],
];
const definition = (key) => metricDefinitions.find((item) => item.key === key);
const signedRate = (value) =>
  value == null ? "暂无基数" : (value > 0 ? "+" : "") + value.toFixed(2) + "%";

function Comparison({ current, previous, ratio = false, cost = false }) {
  const value =
    ratio && current != null && previous != null
      ? current - previous
      : changeRate(current, previous);
  const positive = cost ? value <= 0 : value >= 0;
  return (
    <span
      className={
        "oc-comparison " +
        (value == null ? "oc-muted" : positive ? "positive" : "negative")
      }
    >
      {value == null ? (
        "暂无前期基数"
      ) : (
        <>
          {value >= 0 ? (
            <ArrowUpRight size={12} />
          ) : (
            <ArrowDownRight size={12} />
          )}
          {Math.abs(value).toFixed(2)}
          {ratio ? "个百分点" : "%"}
        </>
      )}
      <small>环比</small>
    </span>
  );
}

function CockpitPanel({
  title,
  icon: Icon,
  extra,
  children,
  footer,
  className = "",
}) {
  return (
    <section className={"oc-panel " + className}>
      <header>
        <h2>
          {Icon && <Icon size={18} />} {title}
        </h2>
        {extra}
      </header>
      {children}
      {footer && <footer>{footer}</footer>}
    </section>
  );
}

function Empty({ children, note }) {
  return (
    <div className="oc-empty">
      {children}
      {note && <small>{note}</small>}
    </div>
  );
}

function CostStructure({ current }) {
  const items = [
    {
      key: "cost",
      name: "产品成本",
      color: "#c79b45",
      value: current.cost || 0,
    },
    {
      key: "shipping",
      name: "运费",
      color: "#78ade0",
      value: current.shipping || 0,
    },
  ];
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  return (
    <div className="oc-ring-body">
      <svg
        className="oc-ring"
        viewBox="0 0 200 180"
        role="img"
        aria-label="产品成本与运费构成"
      >
        <circle
          cx="100"
          cy="88"
          r="57"
          fill="none"
          stroke="#f0efe9"
          strokeWidth="20"
        />
        {items.map((item) => {
          const part = total ? (item.value / total) * 100 : 0;
          const start = offset;
          offset += part;
          return (
            <circle
              key={item.key}
              cx="100"
              cy="88"
              r="57"
              fill="none"
              stroke={item.color}
              strokeWidth="20"
              pathLength="100"
              strokeDasharray={part + " " + (100 - part)}
              strokeDashoffset={-start}
              transform="rotate(-90 100 88)"
            />
          );
        })}
        <text x="100" y="84" textAnchor="middle" fill="#7a806f" fontSize="10">
          成本与运费
        </text>
        <text
          x="100"
          y="105"
          textAnchor="middle"
          fill="#293424"
          fontSize="17"
          fontWeight="600"
        >
          {money(total)}
        </text>
      </svg>
      <ul className="oc-ring-legend">
        {items.map((item) => (
          <li key={item.key}>
            <i style={{ background: item.color }} />
            <span>
              {item.name}
              <small>{money(item.value)}</small>
            </span>
            <b>{total ? ((item.value / total) * 100).toFixed(1) + "%" : "—"}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dashboard({
  data,
  user,
  navigate,
  seedDemo,
  busy,
  filters,
  setFilters,
  onMetric = () => {},
  onRecords = () => {},
  visiblePanels = panelKeys,
  onSettings = () => {},
}) {
  const [grain, setGrain] = useState("day");
  const [dialog, setDialog] = useState(null);
  const [shopSearch, setShopSearch] = useState("");
  const [rangeNote, setRangeNote] = useState("");
  const c = data.current;
  const p = data.previous;
  const range = filters || data.range;
  const shown = (key) => visiblePanels.includes(key);
  const alerts = data.alerts || [];
  const hasData = data.recordCount > 0;
  const calendarToday = today();
  const openEvidence = (alert) => setDialog({ type: "evidence", alert });
  const openAll = () => setDialog({ type: "todos" });
  const openRecords = (scope) => {
    setDialog(null);
    onRecords(scope);
  };
  const showOverview = shown("metrics") || shown("costs") || shown("todos");
  const showAnalytics = ["trend", "structure", "channels"].some(shown);
  const showBusiness = ["shops", "products", "health"].some(shown);
  const showBottom = ["highlights", "issues", "followups"].some(shown);
  const highlights = coreKeys
    .filter((key) => {
      if (key === "netMargin") return false;
      if (key === "grossMargin")
        return hasData && p[key] != null && p.netSales > 0 && c[key] > p[key];
      return hasData && p[key] > 0 && c[key] > p[key];
    })
    .slice(0, 3)
    .map((key) => ({ key, ...definition(key) }));
  const shops = (data.shops || []).filter(
    (row) => !shopSearch || row.name.includes(shopSearch),
  );
  const updatePreset = (key) => {
    const preset = datePreset(key, calendarToday, data.dataBounds);
    setRangeNote(
      preset.limited
        ? "全部数据超过366天，当前显示截至最后一条记录的最近366天；可调整日期查看更早记录。"
        : "",
    );
    setFilters?.((previous) => ({
      ...previous,
      start: preset.start,
      end: preset.end,
    }));
  };
  const updateDate = (key, value) => {
    if (!value) return;
    let start = key === "start" ? value : range.start;
    let end = key === "end" ? value : range.end;
    if (start > end) {
      if (key === "start") end = start;
      else start = end;
    }
    const invalid = rangeError(start, end);
    if (invalid) {
      setRangeNote(invalid);
      return;
    }
    setRangeNote("");
    setFilters?.((previous) => ({ ...previous, start, end }));
  };
  const tableChange = (row) => (
    <span
      className={
        row.change == null
          ? "oc-muted"
          : row.change >= 0
            ? "positive"
            : "negative"
      }
    >
      {signedRate(row.change)}
    </span>
  );
  const todoRows = (items) => (
    <ul className="oc-todo-list">
      {items.map((alert) => (
        <li className={"oc-todo " + alert.severity} key={alert.id}>
          <span className="oc-todo-dot" />
          <div>
            <strong>{alert.shop}</strong>
            <p>{alert.reasons.join("、")}</p>
            <small>{alert.channel} · 等长前期比较</small>
          </div>
          <button
            className="oc-action-link"
            onClick={() => openEvidence(alert)}
          >
            查看依据
          </button>
        </li>
      ))}
    </ul>
  );
  const rankingTable = (rows, kind, full = false) => (
    <div className="oc-table-wrap">
      <table className="oc-table">
        <thead>
          <tr>
            <th>{kind === "shop" ? "店铺" : "商品"}</th>
            <th>净销售额</th>
            <th>{kind === "shop" ? "预估净利" : "销售占比"}</th>
            {full && (
              <>
                <th>毛利率</th>
                <th>净利率</th>
                <th>销售环比</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.name}>
              <td>
                <button
                  className="oc-action-link oc-name"
                  title={row.name}
                  onClick={() => openRecords({ [kind]: row.name })}
                >
                  <span className="oc-rank">
                    {String(index + 1).padStart(2, "0")}
                  </span>{" "}
                  {row.name}
                </button>
              </td>
              <td>{money(row.netSales)}</td>
              <td
                className={
                  kind === "shop" && row.netProfit < 0 ? "negative" : ""
                }
              >
                {kind === "shop"
                  ? money(row.netProfit)
                  : c.netSales
                    ? percent((row.netSales / c.netSales) * 100)
                    : "—"}
              </td>
              {full && (
                <>
                  <td>{percent(row.grossMargin)}</td>
                  <td>{percent(row.netMargin)}</td>
                  <td>{tableChange(row)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <Empty>当前范围暂无{kind === "shop" ? "店铺" : "商品"}经营数据</Empty>
      )}
    </div>
  );

  return (
    <div className="owner-cockpit" aria-busy={busy || undefined}>
      <h1 hidden>老板驾驶舱</h1>
      <div className="oc-header">
        <div className="oc-period">
          <div className="oc-quick" aria-label="快捷统计周期">
            {presets.map(([key, label]) => {
              const value = datePreset(key, calendarToday, data.dataBounds);
              const selected =
                range.start === value.start &&
                range.end === value.end &&
                (key !== "all" || !!data.dataBounds?.start);
              return (
                <button
                  key={key}
                  className={selected ? "selected" : ""}
                  aria-pressed={selected}
                  onClick={() => updatePreset(key)}
                  disabled={busy}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="oc-date-inputs">
            <label>
              <span className="sr-only">开始日期</span>
              <input
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                aria-label="开始日期"
                value={range.start}
                onChange={(event) => updateDate("start", event.target.value)}
                disabled={busy}
              />
            </label>
            <span>至</span>
            <label>
              <span className="sr-only">结束日期</span>
              <input
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                aria-label="结束日期"
                value={range.end}
                onChange={(event) => updateDate("end", event.target.value)}
                disabled={busy}
              />
            </label>
          </div>
        </div>
        <span className="oc-period-caption">与等长前期比较 · 金额单位：元</span>
      </div>
      {rangeNote && (
        <p className="oc-range-note" role="status">
          {rangeNote}
        </p>
      )}
      {!hasData && (
        <div className="oc-onboarding">
          <div>
            <strong>当前范围暂无经营数据</strong>
            <p>调整日期或渠道，或导入每日店铺商品数据后查看经营表现。</p>
          </div>
          {user.role === "admin" && (
            <div className="oc-onboarding-actions">
              <button className="primary" onClick={() => navigate("imports")}>
                导入经营数据 <ArrowRight size={14} />
              </button>
              {!data.hasRecords && (
                <button
                  className="secondary"
                  onClick={seedDemo}
                  disabled={busy}
                >
                  {busy ? "正在生成…" : "体验合成演示数据"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showOverview && (
        <div
          className={
            "oc-overview" +
            (!shown("todos")
              ? " oc-without-todos"
              : !shown("metrics") && !shown("costs")
                ? " oc-only-todos"
                : "")
          }
        >
          {(shown("metrics") || shown("costs")) && (
            <div className="oc-overview-main">
              {shown("metrics") && (
                <div className="oc-core">
                  {coreKeys.map((key) => {
                    const item = definition(key);
                    return (
                      <button
                        key={key}
                        className={
                          "oc-kpi" + (key === "netProfit" ? " featured" : "")
                        }
                        disabled={key === "netMargin"}
                        onClick={() => onMetric(key)}
                        title={item.description}
                      >
                        <span className="oc-kpi-label">
                          {item.label}
                          {key !== "netMargin" && <ArrowUpRight size={13} />}
                        </span>
                        <strong>{displayMetric(c[key], item.ratio)}</strong>
                        <Comparison
                          current={c[key]}
                          previous={p[key]}
                          ratio={item.ratio}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
              {shown("costs") && (
                <div className="oc-costs">
                  {costItems.map(([key, Icon]) => (
                    <button
                      key={key}
                      onClick={() => onMetric(key)}
                      disabled={c[key] == null}
                      title={definition(key).description}
                    >
                      <span>
                        <Icon size={16} />
                        {definition(key).label}
                      </span>
                      <strong>{displayMetric(c[key])}</strong>
                      <Comparison
                        current={c[key]}
                        previous={p[key]}
                        cost={key !== "rewards"}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {shown("todos") && (
            <CockpitPanel
              title="待办与提醒"
              icon={Bell}
              className="oc-todos"
              extra={<span className="oc-todo-count">{alerts.length}</span>}
              footer={
                <button className="oc-more" onClick={openAll}>
                  查看全部依据 <ArrowRight size={12} />
                </button>
              }
            >
              {alerts.length ? (
                todoRows(alerts.slice(0, 3))
              ) : (
                <Empty note="由真实经营变化生成，不代表任务已分派或完成。">
                  {hasData
                    ? "当前范围暂无触发规则的提醒"
                    : "等待经营数据，暂不生成待办"}
                </Empty>
              )}
            </CockpitPanel>
          )}
        </div>
      )}

      {showAnalytics && (
        <div className="oc-grid oc-analytics">
          {shown("trend") && (
            <CockpitPanel
              title="销售趋势"
              icon={TrendingUp}
              extra={
                <select
                  aria-label="销售趋势统计粒度"
                  value={grain}
                  onChange={(event) => setGrain(event.target.value)}
                >
                  <option value="day">按日</option>
                  <option value="week">按周</option>
                  <option value="month">按月</option>
                </select>
              }
              footer="按导入的经营日期统计 · 悬停查看金额"
            >
              <div className="oc-chart">
                <TrendChart data={aggregateTrend(data.trend || [], grain)} />
              </div>
            </CockpitPanel>
          )}
          {shown("structure") && (
            <CockpitPanel
              title="产品成本与运费"
              icon={Coins}
              extra={<span className="oc-period-caption">本期</span>}
              footer="仅展示产品成本与运费，不含其他经营费用"
            >
              <CostStructure current={c} />
            </CockpitPanel>
          )}
          {shown("channels") && (
            <CockpitPanel
              title="渠道经营对比"
              icon={ChartNoAxesCombined}
              extra={<span className="oc-period-caption">与前期比较</span>}
              footer="点击渠道查看对应经营明细"
            >
              <div className="oc-table-wrap">
                <table className="oc-table">
                  <thead>
                    <tr>
                      <th>渠道</th>
                      <th>净销售额</th>
                      <th>预估净利</th>
                      <th>销售环比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.channels || []).map((row) => (
                      <tr key={row.name}>
                        <td>
                          <button
                            className="oc-action-link oc-platform"
                            onClick={() => onRecords({ channel: row.name })}
                          >
                            <Store size={14} />
                            {row.name}
                          </button>
                        </td>
                        <td>{money(row.netSales)}</td>
                        <td className={row.netProfit < 0 ? "negative" : ""}>
                          {money(row.netProfit)}
                        </td>
                        <td>{tableChange(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.channels?.length && (
                  <Empty>当前范围暂无渠道经营数据</Empty>
                )}
              </div>
            </CockpitPanel>
          )}
        </div>
      )}

      {showBusiness && (
        <div className="oc-grid oc-business-grid">
          {shown("shops") && (
            <CockpitPanel
              title="店铺经营 TOP 5"
              icon={Store}
              extra={
                <button
                  className="oc-more"
                  onClick={() => {
                    setShopSearch("");
                    setDialog({ type: "shops" });
                  }}
                >
                  全部店铺 <ArrowRight size={12} />
                </button>
              }
              footer="按净销售额排序 · 点击店铺查看经营明细"
            >
              {rankingTable((data.shops || []).slice(0, 5), "shop")}
            </CockpitPanel>
          )}
          {shown("products") && (
            <CockpitPanel
              title="商品经营 TOP 5"
              icon={Package}
              extra={<span className="oc-period-caption">按净销售额排序</span>}
              footer="按现有商品维度展示，不替代产品线核算"
            >
              {rankingTable((data.products || []).slice(0, 5), "product")}
            </CockpitPanel>
          )}
          {shown("health") && (
            <CockpitPanel
              title="关键指标观察"
              icon={CircleHelp}
              extra={<span className="oc-period-caption">与前期比较</span>}
              footer="未配置目标的指标只观察变化，不判定达标。"
            >
              <div className="oc-table-wrap">
                <table className="oc-table oc-health">
                  <thead>
                    <tr>
                      <th>指标</th>
                      <th>当前值</th>
                      <th>目标值</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["grossMargin", "netMargin", "refundRate"].map((key) => {
                      const label =
                        key === "refundRate"
                          ? "退款占比"
                          : definition(key).label;
                      const delta =
                        hasData && p.sales > 0
                          ? Math.round((c[key] - p[key]) * 100) / 100
                          : null;
                      const positive =
                        key === "refundRate" ? delta <= 0 : delta >= 0;
                      return (
                        <tr key={key}>
                          <td>{label}</td>
                          <td>{hasData ? percent(c[key]) : "暂无数据"}</td>
                          <td>未配置</td>
                          <td
                            className={
                              delta == null
                                ? ""
                                : positive
                                  ? "positive"
                                  : "negative"
                            }
                          >
                            <i className="oc-health-dot" />
                            {delta == null
                              ? "待观察"
                              : delta === 0
                                ? "持平"
                                : (delta > 0 ? "上升 " : "下降 ") +
                                  Math.abs(delta).toFixed(2) +
                                  "pp"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CockpitPanel>
          )}
        </div>
      )}

      {showBottom && (
        <div className="oc-bottom">
          {shown("highlights") && (
            <CockpitPanel title="本期经营亮点" icon={Lightbulb}>
              {highlights.length ? (
                <ol className="oc-facts">
                  {highlights.map((item, index) => (
                    <li key={item.key}>
                      <span>{index + 1}</span>
                      <button onClick={() => onMetric(item.key)}>
                        <strong>{item.label}</strong>较前期提升{" "}
                        {item.ratio
                          ? (c[item.key] - p[item.key]).toFixed(2) + " 个百分点"
                          : Math.abs(
                              changeRate(c[item.key], p[item.key]),
                            ).toFixed(2) + "%"}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty>
                  {hasData
                    ? "当前可比指标未发现改善项"
                    : "等待可比较的经营数据"}
                </Empty>
              )}
            </CockpitPanel>
          )}
          {shown("issues") && (
            <CockpitPanel
              title="本期主要问题"
              icon={TriangleAlert}
              className="oc-issues"
            >
              {alerts.length ? (
                <ol className="oc-facts">
                  {alerts.slice(0, 3).map((alert, index) => (
                    <li key={alert.id}>
                      <span>{index + 1}</span>
                      <button onClick={() => openEvidence(alert)}>
                        <strong>{alert.shop}</strong>
                        {alert.reasons.join("、")}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty>
                  {hasData
                    ? "已读取店铺未触发现有异常规则"
                    : "店铺数据待补齐，暂不判断经营问题"}
                </Empty>
              )}
            </CockpitPanel>
          )}
          {shown("followups") && (
            <CockpitPanel
              title="重点跟进方向"
              icon={Flag}
              className="oc-actions"
              extra={
                <button className="oc-more" onClick={openAll}>
                  查看全部依据 <ArrowRight size={12} />
                </button>
              }
              footer="由本期经营异常生成 · 不代表任务已分派或完成"
            >
              {alerts.length ? (
                <div className="oc-table-wrap">
                  <table className="oc-table">
                    <thead>
                      <tr>
                        <th>经营对象</th>
                        <th>建议核查</th>
                        <th>处理</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.slice(0, 3).map((alert) => (
                        <tr key={alert.id}>
                          <td>{alert.shop}</td>
                          <td>{alert.reasons.join("、")}</td>
                          <td>
                            <button
                              className="oc-action-link"
                              onClick={() => openEvidence(alert)}
                            >
                              查看依据
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty note="核查经营问题后，再安排负责人和后续动作。">
                  当前范围暂无触发规则的跟进提醒
                </Empty>
              )}
            </CockpitPanel>
          )}
        </div>
      )}
      {!visiblePanels.length && (
        <Empty note="在工作台配置中选择需要展示的模块。">
          当前工作台未选择展示模块
        </Empty>
      )}
      <div className="oc-data-note">
        <span>
          统计周期 {data.range.start} — {data.range.end} · 共{" "}
          {data.recordCount.toLocaleString()} 条经营记录
          {data.hasDemo ? " · 合成演示数据" : ""}
        </span>
        <div>
          <button onClick={() => navigate("quick")}>快捷工作</button>
          <button onClick={onSettings}>工作台配置</button>
        </div>
      </div>

      {dialog?.type === "shops" && (
        <Dialog
          title="公司店铺经营"
          subtitle={data.range.start + " — " + data.range.end}
          onClose={() => setDialog(null)}
          className="oc-shops-dialog"
        >
          <div className="oc-dialog-search">
            <input
              aria-label="搜索全部店铺"
              placeholder="搜索店铺"
              value={shopSearch}
              onChange={(event) => setShopSearch(event.target.value)}
            />
          </div>
          {rankingTable(shops, "shop", true)}
        </Dialog>
      )}
      {dialog?.type === "todos" && (
        <Dialog
          title="全部经营提醒"
          subtitle="由真实经营变化生成 · 尚未接入协同任务登记"
          onClose={() => setDialog(null)}
          className="oc-todos-dialog"
        >
          {alerts.length ? (
            todoRows(alerts)
          ) : (
            <Empty>当前范围暂无触发规则的经营提醒</Empty>
          )}
        </Dialog>
      )}
      {dialog?.type === "evidence" && (
        <Dialog
          title="店铺经营问题"
          subtitle="经营变化依据 · 等长前期比较"
          onClose={() => setDialog(null)}
          drawer
          className="oc-issue-detail"
        >
          <h2>{dialog.alert.shop}</h2>
          <p>
            {dialog.alert.channel} · {data.range.start} — {data.range.end}
          </p>
          <div className="oc-evidence-summary">
            <table className="oc-table">
              <thead>
                <tr>
                  <th>指标</th>
                  <th>本期</th>
                  <th>前期</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["净销售额", "netSales"],
                  ["预估净利润", "netProfit"],
                  ["退款占比", "refundRate"],
                ].map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>
                      {key === "refundRate"
                        ? percent(dialog.alert.current[key])
                        : money(dialog.alert.current[key])}
                    </td>
                    <td>
                      {key === "refundRate"
                        ? percent(dialog.alert.previous[key])
                        : money(dialog.alert.previous[key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section>
            <h3>触发的经营信号</h3>
            <ul>
              {dialog.alert.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </section>
          <p>
            前期：{data.range.previous.start} — {data.range.previous.end}
            。变化信号用于定位需要核对的店铺，不代表已确认的原因或可相加的损失。
          </p>
          <p>当前未接入协同任务登记；提醒不代表已分派负责人或已完成处理。</p>
          <button
            className="primary"
            onClick={() =>
              openRecords({
                shop: dialog.alert.shop,
                channel: dialog.alert.channel,
              })
            }
          >
            查看真实经营明细 <ArrowRight size={15} />
          </button>
        </Dialog>
      )}
    </div>
  );
}
