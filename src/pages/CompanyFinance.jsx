import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  CircleHelp,
  Settings2,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { api, money, percent, today, shiftDay, query } from "../api";
import { ErrorBox, Loading, Empty } from "../components/ui";
import Dialog from "../components/Dialog";
import { TrendChart } from "../components/Charts";
import { metricDefinitions } from "../components/MetricDetail";
import {
  aggregateTrend,
  changeRate,
  datePreset,
  rangeError,
} from "../workbench.mjs";
import "../finance.css";

const cardKeys = [
  "sales",
  "netSales",
  "cost",
  "grossProfit",
  "grossMargin",
  "netProfit",
  "refundOnly",
  "returnRefunds",
  "rewards",
  "ads",
  "platform",
  "shipping",
];
const initialRange = () => ({ start: shiftDay(today(), -29), end: today() });
const definition = (key) => metricDefinitions.find((item) => item.key === key);
const displayMetric = (value, ratio = false) =>
  value == null ? "暂无数据" : ratio ? percent(value) : money(value, 2);
function readCards(userId) {
  try {
    const saved = JSON.parse(
      localStorage.getItem("keran.company.cards." + userId),
    );
    return Array.isArray(saved) && saved.every((key) => cardKeys.includes(key))
      ? [...new Set(saved)]
      : cardKeys;
  } catch {
    return cardKeys;
  }
}

export default function CompanyFinance({
  user,
  revision = 0,
  onRecords,
  navigate,
}) {
  const [range, setRange] = useState(initialRange);
  const [draftRange, setDraftRange] = useState(initialRange);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rangeNote, setRangeNote] = useState("");
  const [reload, setReload] = useState(0);
  const [grain, setGrain] = useState("day");
  const [selectedShop, setSelectedShop] = useState("");
  const [detail, setDetail] = useState(null);
  const [settings, setSettings] = useState(false);
  const [visibleCards, setVisibleCards] = useState(() => readCards(user.id));
  const [draftCards, setDraftCards] = useState(cardKeys);
  const [settingsError, setSettingsError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api("/finance/company" + query(range))
      .then((result) => {
        if (active) {
          setData(result);
          setSelectedShop("");
        }
      })
      .catch((err) => {
        if (active) {
          setData(null);
          setError(err.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range, revision, reload]);
  function apply(next) {
    const invalid = rangeError(next.start, next.end);
    if (invalid) {
      setError(invalid);
      return;
    }
    setRange(next);
    setDraftRange(next);
    setRangeNote("");
  }
  function preset(key) {
    const next =
      key === "quarter"
        ? { start: shiftDay(today(), -89), end: today() }
        : datePreset(key, today(), data?.dataBounds);
    apply({ start: next.start, end: next.end });
    if (next.limited)
      setRangeNote(
        "全部数据超过366天，当前显示截至最后一条记录的最近366天。可调整日期查看更早记录。",
      );
  }
  function saveSettings() {
    try {
      localStorage.setItem(
        "keran.company.cards." + user.id,
        JSON.stringify(draftCards),
      );
      setVisibleCards(draftCards);
      setSettings(false);
    } catch {
      setSettingsError("浏览器未允许保存设置，请允许本地存储后重试。");
    }
  }
  const current = data?.current || {};
  const previous = data?.previous || {};
  const shops = data?.shops || [];
  const shopKey = (row) => JSON.stringify([row.channel, row.name]);
  const shopRows = selectedShop
    ? shops.filter((row) => shopKey(row) === selectedShop)
    : shops;
  const hasData = (data?.recordCount || 0) > 0;
  function drill(scope = {}) {
    setDetail(null);
    onRecords(scope, range);
  }
  return (
    <section className="finance-page company-finance-page">
      <header className="fin-page-heading">
        <div>
          <span className="fin-eyebrow">公司经营 / BUSINESS OVERVIEW</span>
          <h1>公司经营数据总览</h1>
          <p>从经营结果到费用结构，查看当前周期的公司表现。</p>
        </div>
        <ChartNoAxesCombined size={30} />
      </header>
      <section className="fin-surface">
        <div className="fin-section-heading">
          <div>
            <h2>核心经营指标</h2>
            <p>按导入的经营日期汇总 · 金额单位：元</p>
          </div>
          <button
            className="secondary"
            onClick={() => {
              setSettingsError("");
              setDraftCards(visibleCards);
              setSettings(true);
            }}
          >
            <Settings2 size={14} />
            配置卡片
          </button>
        </div>
        <div className="fin-company-period">
          <div className="oc-quick">
            {[
              ["week", "近7天"],
              ["month30", "近30天"],
              ["quarter", "近90天"],
              ["month", "本月"],
              ["lastMonth", "上月"],
              ["all", "全部"],
            ].map(([key, title]) => (
              <button key={key} onClick={() => preset(key)}>
                {title}
              </button>
            ))}
          </div>
          <form
            className="fin-inline-dates"
            onSubmit={(event) => {
              event.preventDefault();
              apply(draftRange);
            }}
          >
            <CalendarDays size={14} />
            <label>
              <span className="sr-only">公司总览开始日期</span>
              <input
                type="date"
                aria-label="公司总览开始日期"
                required
                min="2000-01-01"
                max="2100-12-31"
                value={draftRange.start}
                onChange={(e) =>
                  setDraftRange({ ...draftRange, start: e.target.value })
                }
              />
            </label>
            <span>至</span>
            <label>
              <span className="sr-only">公司总览结束日期</span>
              <input
                type="date"
                aria-label="公司总览结束日期"
                required
                min="2000-01-01"
                max="2100-12-31"
                value={draftRange.end}
                onChange={(e) =>
                  setDraftRange({ ...draftRange, end: e.target.value })
                }
              />
            </label>
            <button className="secondary">查询</button>
          </form>
        </div>
        <ErrorBox message={error} />
        {rangeNote && (
          <p className="fin-data-note" role="status">
            {rangeNote}
          </p>
        )}
        {loading ? (
          <Loading />
        ) : (
          data && (
            <div className="fin-company-metrics">
              {cardKeys
                .filter((key) => visibleCards.includes(key))
                .map((key) => {
                  const item = definition(key),
                    value = hasData ? current[key] : null;
                  const rate = changeRate(
                    value,
                    hasData ? previous[key] : null,
                  );
                  return (
                    <button
                      className={key === "netProfit" ? "featured" : ""}
                      key={key}
                      disabled={value == null}
                      onClick={() => setDetail(key)}
                    >
                      <span>
                        {item.label}
                        <ArrowUpRight size={13} />
                      </span>
                      <strong>{displayMetric(value, item.ratio)}</strong>
                      <small
                        className={
                          rate == null
                            ? ""
                            : rate >= 0
                              ? "positive"
                              : "negative"
                        }
                      >
                        {rate == null
                          ? "暂无可比数据"
                          : `${rate >= 0 ? "↑" : "↓"} ${Math.abs(rate).toFixed(2)}%　环比`}
                      </small>
                    </button>
                  );
                })}
            </div>
          )
        )}
        {!loading && !data && (
          <button
            className="secondary"
            onClick={() => setReload((value) => value + 1)}
          >
            重新加载总览
          </button>
        )}
        {!visibleCards.length && (
          <Empty title="当前未选择指标卡片">
            点击配置卡片选择需要显示的指标。
          </Empty>
        )}
      </section>
      {data && !loading && (
        <>
          <div className="fin-profit-strip">
            <div>
              <Wallet size={20} />
              <span>
                公司月度费用<small>所选周期按自然日折算</small>
              </span>
              <strong>{money(current.operatingExpense, 2)}</strong>
            </div>
            <div>
              <span>
                扣除月度费用后管理预估利润
                <small>经营预估净利 − 公司月度费用，仅在公司维度扣除一次</small>
              </span>
              <strong
                className={current.managementProfit < 0 ? "negative" : ""}
              >
                {hasData ? money(current.managementProfit, 2) : "缺少经营数据"}
              </strong>
            </div>
            <button onClick={() => navigate("financeExpenses")}>
              维护月度费用
              <ArrowRight size={14} />
            </button>
          </div>
          {current.expenseCoverage?.missingMonths?.length > 0 && (
            <div className="fin-coverage-note" role="status">
              以下月份尚未维护公司费用：
              {current.expenseCoverage.missingMonths.join("、")}
              。管理预估利润仅扣除已录入部分，请补齐费用后使用。
            </div>
          )}
          <section className="fin-surface">
            <div className="fin-section-heading">
              <div>
                <h2>
                  <Store size={18} />
                  店铺经营看板
                </h2>
                <p>店铺数据按现有导入维度展示，公共费用暂不分摊到店铺。</p>
              </div>
              <div className="fin-heading-actions">
                <select
                  aria-label="选择经营店铺"
                  value={selectedShop}
                  onChange={(e) => setSelectedShop(e.target.value)}
                >
                  <option value="">全部店铺</option>
                  {shops.map((row) => (
                    <option key={shopKey(row)} value={shopKey(row)}>
                      {row.name} · {row.channel}
                    </option>
                  ))}
                </select>
                <button
                  className="fin-text-button"
                  onClick={() => setReload((value) => value + 1)}
                >
                  刷新看板
                </button>
              </div>
            </div>
            <div className="fin-table-scroll">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>店铺</th>
                    <th>净销售额</th>
                    <th>商品毛利</th>
                    <th>毛利率</th>
                    <th>经营预估净利</th>
                    <th>销售目标达成</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {shopRows.map((row) => (
                    <tr key={shopKey(row)}>
                      <td>
                        {row.name}{" "}
                        <span className="fin-unavailable">{row.channel}</span>
                      </td>
                      <td>{money(row.netSales, 2)}</td>
                      <td>{money(row.grossProfit, 2)}</td>
                      <td>{percent(row.grossMargin)}</td>
                      <td className={row.netProfit < 0 ? "negative" : ""}>
                        {money(row.netProfit, 2)}
                      </td>
                      <td>
                        <span className="fin-unavailable">目标未接入</span>
                      </td>
                      <td>
                        <button
                          className="fin-text-button"
                          onClick={() =>
                            drill({ shop: row.name, channel: row.channel })
                          }
                        >
                          经营明细
                          <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!shopRows.length && <Empty title="当前周期暂无店铺经营数据" />}
          </section>
          <div className="fin-analysis-grid">
            <section className="fin-surface">
              <div className="fin-section-heading">
                <h2>
                  <TrendingUp size={18} />
                  销售趋势
                </h2>
                <select
                  aria-label="公司销售趋势粒度"
                  value={grain}
                  onChange={(e) => setGrain(e.target.value)}
                >
                  <option value="day">按日</option>
                  <option value="week">按周</option>
                  <option value="month">按月</option>
                </select>
              </div>
              <TrendChart data={aggregateTrend(data.trend || [], grain)} />
            </section>
            <section className="fin-surface">
              <div className="fin-section-heading">
                <h2>利润分析</h2>
                <button
                  className="fin-text-button"
                  onClick={() => setDetail("netProfit")}
                >
                  <CircleHelp size={13} />
                  核算口径
                </button>
              </div>
              <ol className="fin-profit-flow">
                {[
                  ["净销售额", current.netSales],
                  ["减：产品成本", current.cost],
                  ["等于：商品毛利", current.grossProfit],
                  ["经营预估净利", current.netProfit],
                  ["减：公司月度费用", current.operatingExpense],
                  ["管理预估利润", current.managementProfit],
                ].map(([label, value], i) => (
                  <li key={label} className={i === 5 ? "total" : ""}>
                    <span>{label}</span>
                    <strong>
                      {hasData || i === 4 ? money(value, 2) : "暂无数据"}
                    </strong>
                  </li>
                ))}
              </ol>
              <p className="fin-data-note">
                经营预估净利已扣广告费、平台费和运费，并计入已提供奖励。公司月度费用应单独维护，避免重复录入已导入费用。
              </p>
            </section>
          </div>
          <section className="fin-surface">
            <div className="fin-section-heading">
              <div>
                <h2>公司月度费用构成</h2>
                <p>每月金额 ÷ 当月自然天数 × 周期覆盖天数，跨月分别折算。</p>
              </div>
              <button
                className="fin-text-button"
                onClick={() => navigate("financeExpenses")}
              >
                查看费用记录
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="fin-expense-breakdown">
              {(data.currentExpenses || []).map((row) => (
                <div key={row.key}>
                  <span>{row.label}</span>
                  <strong>{money(row.value, 2)}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="fin-surface">
            <div className="fin-section-heading">
              <h2>净销售额排行 · 渠道</h2>
            </div>
            <div className="fin-table-scroll">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>渠道</th>
                    <th>净销售额</th>
                    <th>毛利率</th>
                    <th>经营预估净利</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.channels || []).map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{money(row.netSales, 2)}</td>
                      <td>{percent(row.grossMargin)}</td>
                      <td>{money(row.netProfit, 2)}</td>
                      <td>
                        <button
                          className="fin-text-button"
                          onClick={() => drill({ channel: row.name })}
                        >
                          查看明细
                          <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="fin-data-note">
            当前周期 {range.start} — {range.end}，共 {data.recordCount}{" "}
            条经营记录{data.hasDemo ? "，含合成演示数据" : ""}
            。订单发货/判定日期、人员/部门排行和店铺目标尚未接入。以上为经营汇总口径，不能替代完整会计报表。
          </p>
        </>
      )}
      {settings && (
        <Dialog
          title="配置公司经营指标"
          subtitle="按当前账号在本浏览器保存"
          onClose={() => setSettings(false)}
          className="settings-dialog"
        >
          <ErrorBox message={settingsError} />
          <div className="settings-tools">
            <span>展示卡片</span>
            <button
              className="fin-text-button"
              onClick={() => setDraftCards(cardKeys)}
            >
              恢复默认
            </button>
          </div>
          <div className="settings-grid">
            {cardKeys.map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={draftCards.includes(key)}
                  onChange={(e) =>
                    setDraftCards((previous) =>
                      e.target.checked
                        ? [...previous, key]
                        : previous.filter((value) => value !== key),
                    )
                  }
                />
                {definition(key).label}
              </label>
            ))}
          </div>
          <footer>
            <button className="secondary" onClick={() => setSettings(false)}>
              取消
            </button>
            <button className="primary" onClick={saveSettings}>
              保存配置
            </button>
          </footer>
        </Dialog>
      )}
      {detail && (
        <Dialog
          title={definition(detail).label + "核算说明"}
          subtitle={range.start + " — " + range.end}
          onClose={() => setDetail(null)}
          className="fin-metric-dialog"
        >
          <strong className="fin-detail-value">
            {displayMetric(
              hasData ? current[detail] : null,
              definition(detail).ratio,
            )}
          </strong>
          <p>
            {definition(detail).description}。本地数据按导入的经营日期统计。
          </p>
          <p>
            公司月度费用另外列示，不混入原经营预估净利。人员分摊与ERP发货/判定日期尚未接入。
          </p>
          <h3>店铺构成</h3>
          <div className="fin-table-scroll">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>店铺</th>
                  <th>{definition(detail).label}</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((row) => (
                  <tr key={shopKey(row)}>
                    <td>
                      {row.name}{" "}
                      <span className="fin-unavailable">{row.channel}</span>
                    </td>
                    <td>
                      {displayMetric(row[detail], definition(detail).ratio)}
                    </td>
                    <td>
                      <button
                        className="fin-text-button"
                        onClick={() =>
                          drill({ shop: row.name, channel: row.channel })
                        }
                      >
                        明细
                        <ArrowRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer>
            <button className="secondary" onClick={() => setDetail(null)}>
              关闭
            </button>
            <button className="primary" onClick={() => drill()}>
              查看全部经营明细
            </button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
