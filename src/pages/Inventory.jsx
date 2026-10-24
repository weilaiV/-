import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  Check,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  Package,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { api, today } from "../api";
import Dialog from "../components/Dialog";
import InventoryThumbnail from "../components/InventoryThumbnail";
import { Empty, ErrorBox, Loading, Pagination } from "../components/ui";
import {
  arrayBufferToBase64,
  formatQuantity as number,
  formatImportedAt,
  inventoryQuery,
  safeImageUrl,
  validInventoryDate,
} from "../inventory-ui.mjs";
import { inventoryFields } from "../inventory-schema.mjs";
import "../inventory.css";

const STATUSES = [
  ["all", "全部状态"],
  ["below-min", "安全下限不足"],
  ["above-max", "安全上限超额"],
  ["suggested", "原表建议采购"],
  ["anomaly", "数据异常"],
  ["missing-sales", "7天销量缺失"],
  ["source-slow", "原表标记：滞销"],
  ["source-clearance", "原表标记：清货"],
  ["source-delisted", "原表标记：下架"],
];
const SORTS = [
  ["stock", "实际库存"],
  ["daysCover", "可售天数"],
  ["sales7", "7天销量"],
  ["suggestedPurchase", "建议采购"],
  ["sku", "商品编码"],
  ["name", "商品名称"],
  ["updatedAt", "原表更新时间"],
];
const DEFAULT_FILTERS = {
  search: "",
  style: "",
  tag: "",
  status: "all",
  sort: "stock",
  direction: "desc",
  page: 1,
};
const FIELDS = inventoryFields.map(({ key, label }) => [key, label]);

const text = (value) =>
  value === null || value === undefined || value === ""
    ? "未提供"
    : String(value);
function flagsFor(item) {
  const flags = new Set(item.flags || []);
  if (
    ["negative-stock", "negative-days", "invalid-limits"].some((flag) =>
      flags.has(flag),
    )
  )
    flags.add("anomaly");
  return [...flags];
}
function Tags({ item }) {
  const tags = item.tags || (item.tagText ? [item.tagText] : []);
  return (
    <div className="inv-tags">
      {tags.length ? (
        tags.map((tag) => <span key={tag}>{tag}</span>)
      ) : (
        <span className="inv-muted">未提供</span>
      )}
    </div>
  );
}
function Safety({ item }) {
  const low = item.minStock > 0,
    high = item.maxStock > 0;
  return (
    <>
      <span>
        {low || high
          ? `${low ? number(item.minStock) : "未配置"} ～ ${high ? number(item.maxStock) : "未配置"}`
          : "未配置有效阈值"}
      </span>
      <small>
        原表下限 {number(item.minStock)} / 上限 {number(item.maxStock)}
      </small>
    </>
  );
}
function Warnings({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <div className="inv-warnings">
      <AlertTriangle size={16} />
      <div>
        <strong>数据提示</strong>
        <ul>
          {warnings.map((warning, index) => (
            <li key={index}>
              {typeof warning === "string"
                ? warning
                : warning.message || JSON.stringify(warning)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ItemDetail({ item, snapshot, onClose }) {
  const url = safeImageUrl(item.imageUrl);
  return (
    <Dialog
      title="库存商品详情"
      subtitle={item.sku}
      drawer
      className="inv-detail"
      onClose={onClose}
    >
      <div className="inv-detail-body">
        <h3>{text(item.name)}</h3>
        <p className="inv-muted">
          批次日期 {snapshot?.asOfDate || "未提供"} · 来源行{" "}
          {number(item.rowNumber)}
        </p>
        <Tags item={item} />
        <p className="inv-detail-note">
          以下为该快照的完整原表字段。原表更新时间与本次导入时间分别保留；空白字段显示“未提供”。
        </p>
        <dl className="inv-field-grid">
          {FIELDS.map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>
                {key === "imageUrl" ? (
                  url ? (
                    <a
                      className="inv-link"
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      打开原图 ↗
                    </a>
                  ) : (
                    "未提供有效图片链接"
                  )
                ) : (
                  number(item[key])
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Dialog>
  );
}

function ImportInventory({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [asOfDate, setAsOfDate] = useState(today);
  const [payload, setPayload] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  function invalidate() {
    setPreview(null);
    setPayload(null);
    setError("");
  }
  function close() {
    if (!busyRef.current) onClose();
  }
  async function inspect(event) {
    event.preventDefault();
    if (busyRef.current) return;
    setError("");
    if (!file || !/\.xlsx$/i.test(file.name)) {
      setError("请选择 .xlsx 格式的库存文件。");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("文件超过 4MB，请使用不大于 4MB 的 .xlsx 文件。");
      return;
    }
    if (!validInventoryDate(asOfDate)) {
      setError("请输入 2000 至 2100 年之间有效的批次日期。");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setPreview(null);
    try {
      const request = {
        filename: file.name,
        base64: arrayBufferToBase64(await file.arrayBuffer()),
        asOfDate,
      };
      setPayload(request);
      setPreview(await api("/inventory/import/preview", request));
    } catch (error) {
      setError(error.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview || !payload || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api("/inventory/import", {
        ...payload,
        expectedHash: preview.sourceHash,
      });
      onImported(result.snapshot);
    } catch (error) {
      setError(error.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="导入库存快照"
      subtitle="管理员 · Excel 导入"
      onClose={close}
      className="inv-import"
    >
      <form className="inv-import-body" onSubmit={inspect}>
        <p className="inv-import-note">
          每次导入保存为一份完整快照，历史批次可继续查询。选择同格式 ERP
          库存表，先预检，再确认保存。
        </p>
        <label className="inv-file-label">
          <FileSpreadsheet size={24} />
          <span>
            选择 .xlsx 库存文件
            <small>最大 4MB · 使用原表字段 · 不执行公式</small>
          </span>
          <input
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              invalidate();
            }}
          />
        </label>
        <label className="inv-date-label">
          批次日期
          <input
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={asOfDate}
            disabled={busy}
            onChange={(event) => {
              setAsOfDate(event.target.value);
              invalidate();
            }}
          />
          <small>表示本次库存快照的业务日期，可与导入日期不同。</small>
        </label>
        <ErrorBox message={error} />
        {preview && (
          <section className="inv-preview" aria-label="导入预检结果">
            <div className="inv-preview-heading">
              <Check size={18} />
              <strong>预检完成，尚未保存</strong>
            </div>
            <p>
              {preview.filename} · {preview.sheetName} · 批次 {preview.asOfDate}
            </p>
            <div className="inv-preview-summary">
              <span>
                商品行数 <b>{number(preview.rowCount)}</b>
              </span>
              <span>
                款式数 <b>{number(preview.summary?.styleCount)}</b>
              </span>
              <span>
                实际库存 <b>{number(preview.summary?.stockTotal)}</b>
              </span>
              <span>
                异常商品 <b>{number(preview.summary?.anomalyCount)}</b>
              </span>
            </div>
            <p className="inv-coverage">
              7天销量已提供 {number(preview.summary?.sales7?.provided)} /{" "}
              {number(preview.rowCount)} · 待发数已提供{" "}
              {number(preview.summary?.pendingShip?.provided)} /{" "}
              {number(preview.rowCount)} · 建议采购已提供{" "}
              {number(preview.summary?.suggestedPurchase?.provided)} /{" "}
              {number(preview.rowCount)}
            </p>
            <Warnings warnings={preview.warnings} />
            <h4>前 {Math.min(preview.sample?.length || 0, 5)} 行样例</h4>
            <div className="inv-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>商品编码</th>
                    <th>商品名称 / 规格</th>
                    <th>实际库存</th>
                    <th>7天销量</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample?.slice(0, 5).map((item, index) => (
                    <tr key={index}>
                      <td>{text(item.sku)}</td>
                      <td>
                        {text(item.name)}
                        <small>{text(item.spec)}</small>
                      </td>
                      <td>{number(item.stock)}</td>
                      <td>{number(item.sales7)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <div className="inv-dialog-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={close}
          >
            取消
          </button>
          {preview ? (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={confirm}
            >
              <Check size={16} />
              {busy ? "正在保存…" : "确认导入快照"}
            </button>
          ) : (
            <button className="primary" disabled={busy || !file}>
              <Search size={16} />
              {busy ? "正在预检…" : "预检文件"}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

export default function Inventory({
  user,
  revision = 0,
  onChanged = () => {},
}) {
  const admin = user?.role === "admin";
  const [snapshotId, setSnapshotId] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [detail, setDetail] = useState(null);
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    setDetail(null);
    api("/inventory" + inventoryQuery({ snapshotId, ...filters }))
      .then((result) => {
        if (active) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (active) {
          setError(error.message);
          setLoading(false);
          setData(null);
        }
      });
    return () => {
      active = false;
    };
  }, [snapshotId, filters, refresh, revision]);
  function field(key, value) {
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  }
  const filtered = Boolean(
    filters.search.trim() ||
      filters.style ||
      filters.tag ||
      filters.status !== "all",
  );
  const summary = data?.summary;
  const snapshot = data?.snapshot;
  const cards = [
    {
      label: "实际库存总量",
      value: summary?.stockTotal,
      hint: "所选快照 · 实物数量",
      icon: Boxes,
    },
    {
      label: "SKU 数 / 款式数",
      value: summary
        ? `${number(summary.skuCount)} / ${number(summary.styleCount)}`
        : null,
      hint: "商品编码 / 款式编码",
      icon: Package,
    },
    {
      label: "安全下限不足",
      value: summary?.belowMinCount,
      hint: "实际库存低于正数下限",
      status: "below-min",
      tone: "amber",
    },
    {
      label: "安全上限超额",
      value: summary?.aboveMaxCount,
      hint: "实际库存高于正数上限",
      status: "above-max",
      tone: "blue",
    },
    {
      label: "原表建议采购量",
      value: summary?.suggestedPurchase?.value,
      hint: summary
        ? `已提供 ${number(summary.suggestedPurchase?.provided)} / ${number(summary.skuCount)} 个 SKU`
        : "按原表建议汇总",
      status: "suggested",
    },
    {
      label: "数据异常",
      value: summary?.anomalyCount,
      hint: summary
        ? `7天销量缺失 ${number(summary.missingSalesCount)} 个 SKU`
        : "负库存、负天数或矛盾阈值",
      status: "anomaly",
      tone: "red",
    },
  ];
  return (
    <div className="inv-page">
      <div className="inv-page-header">
        <div>
          <p className="inv-eyebrow">SUPPLY CHAIN / INVENTORY</p>
          <h1>库存经营</h1>
          <p>实际库存与补货观察</p>
        </div>
        <div className="inv-header-actions">
          <button
            className="secondary"
            onClick={() => setRefresh((value) => value + 1)}
            disabled={loading}
            aria-label="刷新库存"
          >
            <RefreshCw size={16} />
            刷新
          </button>
          {admin && (
            <button className="primary" onClick={() => setImporting(true)}>
              <Upload size={16} />
              导入库存快照
            </button>
          )}
        </div>
      </div>
      <section className="inv-snapshot-bar" aria-label="库存快照">
        <div className="inv-snapshot-select">
          <FileSpreadsheet size={20} />
          <label>
            库存快照
            <select
              aria-label="选择库存快照"
              value={snapshotId || String(snapshot?.id || "")}
              disabled={loading || !data?.snapshots?.length}
              onChange={(event) => {
                setSnapshotId(event.target.value);
                setFilters(DEFAULT_FILTERS);
              }}
            >
              {!data?.snapshots?.length && (
                <option value="">
                  {loading ? "正在读取快照…" : "暂无快照"}
                </option>
              )}
              {data?.snapshots?.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.filename} · {entry.asOfDate}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="inv-snapshot-meta">
          <span>
            批次日期 <strong>{snapshot?.asOfDate || "—"}</strong>
          </span>
          <span>
            导入时间{" "}
            <strong>
              {snapshot ? formatImportedAt(snapshot.importedAt) : "—"}
            </strong>
          </span>
        </div>
      </section>
      <p className="inv-history-note">
        建议每天固定时间导入最新表格，批次日期选择导出当天。每次导入保留独立快照，不覆盖前一天；可在上方切换历史批次，默认显示最近导入的一份。
      </p>
      <div className="inv-scope">
        <span>{filtered ? "当前筛选范围" : "当前完整快照"}</span>
        {data && snapshot && (
          <span>
            {filtered
              ? `已筛选 ${number(data.total)} / 全批 ${number(data.overallSummary?.skuCount)} 个 SKU`
              : `${number(data.total)} 个 SKU · 仅统计当前批次`}
          </span>
        )}
      </div>
      <div className="inv-stat-grid">
        {cards.map(({ label, value, hint, icon: Icon, status, tone }) => {
          const content = (
            <>
              <div className="inv-stat-label">
                {label}
                {Icon && <Icon size={18} />}
                {status && <ChevronRight size={15} />}
              </div>
              <strong className="inv-stat-value">
                {loading || error ? "—" : number(value)}
              </strong>
              <small>{hint}</small>
            </>
          );
          return status ? (
            <button
              key={label}
              disabled={!snapshot || loading}
              aria-pressed={filters.status === status}
              className={`inv-stat inv-stat-${tone || "gold"} ${filters.status === status ? "is-active" : ""}`}
              onClick={() =>
                field("status", filters.status === status ? "all" : status)
              }
            >
              {content}
            </button>
          ) : (
            <div className="inv-stat" key={label}>
              {content}
            </div>
          );
        })}
      </div>
      <p className="inv-method-note">
        库存按单份快照统计，不跨批次累加。安全预警仅使用正数阈值；空白销量不等于零。源表未提供成本单价，因此不计算库存金额。
      </p>
      <section className="inv-list-panel">
        <div className="inv-list-heading">
          <div>
            <h2>
              <Package size={18} />
              库存商品明细
            </h2>
            <p>逐行更新时间来自原表，与上方快照导入时间不同。</p>
          </div>
          <span className="inv-readonly">{admin ? "管理员" : "只读查看"}</span>
        </div>
        <div className="inv-filters">
          <label className="inv-search">
            <Search size={17} />
            <input
              aria-label="搜索库存商品"
              placeholder="搜索商品编码、名称、规格、款式"
              value={filters.search}
              onChange={(event) => field("search", event.target.value)}
            />
          </label>
          <label>
            <span>款式</span>
            <select
              aria-label="筛选款式"
              value={filters.style}
              onChange={(event) => field("style", event.target.value)}
            >
              <option value="">全部款式</option>
              {data?.options?.styles?.map((style) => (
                <option value={style} key={style}>
                  {style}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>标签</span>
            <select
              aria-label="筛选标签"
              value={filters.tag}
              onChange={(event) => field("tag", event.target.value)}
            >
              <option value="">全部标签</option>
              {data?.options?.tags?.map((tag) => (
                <option value={tag} key={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>状态</span>
            <select
              aria-label="筛选库存状态"
              value={filters.status}
              onChange={(event) => field("status", event.target.value)}
            >
              {STATUSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="inv-sort-bar">
          <span>
            <Filter size={14} />
            {filtered ? "已应用筛选 · 统计卡随筛选变化" : "全部商品"}
          </span>
          <div>
            <label>
              <ArrowDownUp size={14} />
              <select
                aria-label="库存排序字段"
                value={filters.sort}
                onChange={(event) => field("sort", event.target.value)}
              >
                {SORTS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <select
              aria-label="库存排序方向"
              value={filters.direction}
              onChange={(event) => field("direction", event.target.value)}
            >
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
            {filtered && (
              <button
                className="inv-clear"
                onClick={() => setFilters(DEFAULT_FILTERS)}
              >
                <X size={14} />
                清除筛选
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <div className="inv-error">
            <ErrorBox message={error} />
            <button
              className="secondary"
              onClick={() => setRefresh((value) => value + 1)}
            >
              重试读取
            </button>
          </div>
        ) : !snapshot ? (
          <Empty title="还没有库存快照">
            {admin
              ? "导入 ERP 库存 .xlsx 文件，即可查看实际库存与补货提示。"
              : "请联系管理员导入库存快照，导入后即可查看。"}
            {admin && (
              <button
                className="primary inv-empty-import"
                onClick={() => setImporting(true)}
              >
                <Upload size={16} />
                导入库存快照
              </button>
            )}
          </Empty>
        ) : (
          <>
            <Warnings warnings={data.warnings} />
            {!data.items?.length ? (
              <Empty title="没有符合条件的库存商品">
                请调整搜索词或清除筛选，查看该批次的其他商品。
              </Empty>
            ) : (
              <div className="inv-table-scroll">
                <table className="inv-table">
                  <thead>
                    <tr>
                      {[
                        "图片",
                        "商品编码",
                        "商品名称 / 规格",
                        "款式",
                        "标签",
                        "实际库存",
                        "可售天数",
                        "待发数",
                        "7天销量",
                        "建议采购",
                        "安全库存范围",
                        "原表更新时间",
                        "",
                      ].map((label, index) => (
                        <th
                          key={index}
                          className={
                            label === "图片"
                              ? "inv-image-cell"
                              : label === "标签"
                                ? "inv-tags-cell"
                                : undefined
                          }
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => {
                      const flags = flagsFor(item);
                      return (
                        <tr key={item.id || item.sku}>
                          <td className="inv-image-cell">
                            <InventoryThumbnail item={item} />
                          </td>
                          <td className="inv-sku">{text(item.sku)}</td>
                          <td className="inv-product">
                            <strong>{text(item.name)}</strong>
                            <small>
                              {[item.variant, item.color, item.spec]
                                .filter(
                                  (part) =>
                                    part !== null &&
                                    part !== undefined &&
                                    part !== "",
                                )
                                .join(" · ") || "规格未提供"}
                            </small>
                          </td>
                          <td>{text(item.styleCode)}</td>
                          <td className="inv-tags-cell">
                            <Tags item={item} />
                          </td>
                          <td
                            className={`inv-number ${flags.includes("below-min") ? "inv-low" : flags.includes("above-max") ? "inv-high" : ""}`}
                          >
                            <b>{number(item.stock)}</b>
                            <small>
                              {flags.includes("below-min") && "下限不足"}
                              {flags.includes("above-max") && "上限超额"}
                              {flags.includes("anomaly") && (
                                <span className="inv-anomaly">数据异常</span>
                              )}
                            </small>
                          </td>
                          <td
                            className={
                              item.daysCover < 0 ? "inv-anomaly" : "inv-number"
                            }
                          >
                            {number(item.daysCover)}
                          </td>
                          <td className="inv-number">
                            {number(item.pendingShip)}
                          </td>
                          <td className="inv-number">{number(item.sales7)}</td>
                          <td className="inv-number">
                            {number(item.suggestedPurchase)}
                          </td>
                          <td className="inv-safety">
                            <Safety item={item} />
                          </td>
                          <td>{text(item.updatedAt)}</td>
                          <td>
                            <button
                              className="inv-detail-button"
                              onClick={() => setDetail(item)}
                              aria-label={`查看 ${item.sku} 详情`}
                            >
                              详情
                              <ChevronRight size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={data.page || filters.page}
              total={data.total}
              pageSize={30}
              onChange={(page) =>
                setFilters((current) => ({ ...current, page }))
              }
            />
          </>
        )}
      </section>
      {detail && (
        <ItemDetail
          item={detail}
          snapshot={snapshot}
          onClose={() => setDetail(null)}
        />
      )}
      {importing && admin && (
        <ImportInventory
          onClose={() => setImporting(false)}
          onImported={(entry) => {
            setImporting(false);
            setSnapshotId(String(entry.id));
            setFilters(DEFAULT_FILTERS);
            setRefresh((value) => value + 1);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
