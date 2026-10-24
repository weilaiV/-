import React, { useEffect, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Wallet,
} from "lucide-react";
import { api, money, query, today } from "../api";
import Dialog from "../components/Dialog";
import { Empty, ErrorBox, Loading, Pagination } from "../components/ui";
import {
  amountToCents,
  centsToInput,
  expenseTotal,
  validMonth,
} from "../expense-ui.mjs";
import "../expenses.css";

const FIELDS = [
  ["salary", "工资福利"],
  ["fixed", "固定费用"],
  ["officeShipping", "办公室运费"],
  ["warehouse", "仓库费用"],
  ["jdShipping", "京东运费补差"],
  ["jdWarehouse", "京东仓储费用"],
  ...Array.from({ length: 6 }, (_, index) => [
    `other${index + 1}`,
    `其他费用${index + 1}`,
  ]),
];
const DEFAULT_COLUMNS = FIELDS.map(([key, label], order) => ({
  key,
  label,
  visible: true,
  order,
}));
const EMPTY_FILTERS = {
  fromMonth: "",
  toMonth: "",
  department: "",
  ownerId: "",
};
const GROUPS = [
  ["02", "日常费用", FIELDS.slice(0, 4)],
  ["03", "京东费用", FIELDS.slice(4, 6)],
  ["04", "其他费用", FIELDS.slice(6)],
];

function getColumns(columns) {
  return DEFAULT_COLUMNS.map((column) => ({
    ...column,
    ...columns?.find((entry) => entry.key === column.key),
  })).sort((a, b) => a.order - b.order);
}

function conflictMessage(error) {
  return error.status === 409
    ? `${error.message}。此记录已被其他人更新，您的输入已保留；请先复制需要保留的内容，关闭后刷新列表再编辑。`
    : error.message;
}

function ExpenseEditor({
  item,
  owners,
  departments,
  columns,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(() => ({
    ...(item ? { id: item.id, version: item.version } : {}),
    month: item?.month || today().slice(0, 7),
    department: item?.department || "",
    ownerId: String(item?.ownerId ?? owners[0]?.id ?? ""),
    amounts: Object.fromEntries(
      FIELDS.map(([key]) => [key, centsToInput(item?.amounts?.[key] || 0)]),
    ),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = expenseTotal(form.amounts);
  const ownerOptions =
    item && !owners.some((owner) => String(owner.id) === String(item.ownerId))
      ? [...owners, { id: item.ownerId, name: item.ownerName || "原负责人" }]
      : owners;
  const labelFor = (key) =>
    columns.find((column) => column.key === key)?.label || key;
  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!validMonth(form.month))
      return setError("费用月份须为 2000-01 至 2100-12 之间的有效月份。");
    if (!form.department.trim() || !form.ownerId)
      return setError("请填写部门并选择负责人。");
    for (const [key] of FIELDS) {
      const cents = amountToCents(form.amounts[key]);
      if (cents === null)
        return setError(`${labelFor(key)}须填写有效金额，最多保留两位小数。`);
      if (!key.startsWith("other") && cents < 0)
        return setError(`${labelFor(key)}不能为负数。`);
    }
    if (total === null) return setError("金额合计超出可支持范围。");
    setBusy(true);
    try {
      await api("/finance/expenses", {
        ...form,
        ownerId: Number(form.ownerId),
        department: form.department.trim(),
        amounts: Object.fromEntries(
          FIELDS.map(([key]) => [
            key,
            centsToInput(amountToCents(form.amounts[key])),
          ]),
        ),
      });
      onSaved(item ? "费用记录已修改" : "费用记录已新增");
    } catch (err) {
      setError(conflictMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={item ? "修改费用记录" : "新增费用记录"}
      subtitle="按月核算 · 金额单位：元"
      className="exp-dialog exp-editor"
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={save}>
        <ErrorBox message={error} />
        <fieldset disabled={busy} className="exp-fieldset">
          <section className="exp-form-section">
            <h3>
              <span>01</span>核算信息
            </h3>
            <div className="exp-fields exp-meta-fields">
              <label>
                费用月份 <i>*</i>
                <input
                  type="month"
                  required
                  min="2000-01"
                  max="2100-12"
                  value={form.month}
                  onChange={(e) => field("month", e.target.value)}
                />
              </label>
              <label>
                所属部门 <i>*</i>
                <input
                  required
                  maxLength={80}
                  list="exp-departments"
                  placeholder="填写或选择部门"
                  value={form.department}
                  onChange={(e) => field("department", e.target.value)}
                />
                <datalist id="exp-departments">
                  {departments.map((department) => (
                    <option key={department} value={department} />
                  ))}
                </datalist>
              </label>
              <label>
                负责人 <i>*</i>
                <select
                  required
                  value={form.ownerId}
                  onChange={(e) => field("ownerId", e.target.value)}
                >
                  <option value="">请选择负责人</option>
                  {ownerOptions.map((owner) => (
                    <option key={owner.id} value={String(owner.id)}>
                      {owner.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!ownerOptions.length && (
              <p className="exp-note">
                暂无可用负责人，请先由管理员维护团队账号。
              </p>
            )}
          </section>
          {GROUPS.map(([number, title, fields]) => (
            <section key={number} className="exp-form-section">
              <h3>
                <span>{number}</span>
                {title}
                {number === "04" && <small>支持负数，用于冲减或调整</small>}
              </h3>
              <div className="exp-fields">
                {fields.map(([key]) => (
                  <label key={key}>
                    {labelFor(key)}
                    <div className="exp-money-input">
                      <span>¥</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={labelFor(key)}
                        maxLength={22}
                        value={form.amounts[key]}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            amounts: {
                              ...current.amounts,
                              [key]: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </fieldset>
        <div className="exp-editor-total">
          <span>本条费用合计</span>
          <strong aria-live="polite">
            {total === null ? "请检查金额" : money(total, 2)}
          </strong>
        </div>
        <footer className="exp-dialog-footer">
          <button
            type="button"
            className="exp-button"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="exp-button exp-primary"
            disabled={busy || !ownerOptions.length}
          >
            {busy ? "正在保存…" : "保存费用"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

function ColumnEditor({ columns, version, onClose, onSaved }) {
  const [draft, setDraft] = useState(() =>
    columns.map((column) => ({ ...column })),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function change(key, values) {
    setDraft((current) =>
      current.map((column) =>
        column.key === key ? { ...column, ...values } : column,
      ),
    );
  }
  function move(index, direction) {
    setDraft((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [
        next[index + direction],
        next[index],
      ];
      return next;
    });
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    if (draft.some((column) => !column.label.trim()))
      return setError("每一列都需要填写名称。");
    setBusy(true);
    setError("");
    try {
      await api("/finance/expense-columns", {
        version,
        columns: draft.map((column, order) => ({
          key: column.key,
          label: column.label.trim(),
          visible: column.visible,
          order,
        })),
      });
      onSaved("公司费用列设置已保存");
    } catch (err) {
      setError(conflictMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="费用列设置"
      subtitle="公司级设置 · 保存后对所有成员生效"
      className="exp-dialog exp-columns-dialog"
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={save}>
        <ErrorBox message={error} />
        <p className="exp-note">
          修改列名、显示状态与排列顺序，不影响已保存的费用金额。
        </p>
        <fieldset disabled={busy} className="exp-fieldset">
          <div className="exp-column-list">
            {draft.map((column, index) => (
              <div key={column.key} className="exp-column-row">
                <span className="exp-column-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <label className="exp-check-label">
                  <input
                    type="checkbox"
                    checked={column.visible}
                    onChange={(event) =>
                      change(column.key, { visible: event.target.checked })
                    }
                  />
                  <span>显示</span>
                </label>
                <input
                  aria-label={`${FIELDS.find(([key]) => key === column.key)?.[1]}列名`}
                  required
                  maxLength={30}
                  value={column.label}
                  onChange={(event) =>
                    change(column.key, { label: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="exp-icon-button"
                  disabled={index === 0}
                  aria-label={`上移${column.label}`}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  className="exp-icon-button"
                  disabled={index === draft.length - 1}
                  aria-label={`下移${column.label}`}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={15} />
                </button>
              </div>
            ))}
          </div>
        </fieldset>
        <footer className="exp-dialog-footer">
          <button
            type="button"
            className="exp-button"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button className="exp-button exp-primary" disabled={busy}>
            {busy ? "正在保存…" : "保存列设置"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

export default function Expenses({ user, revision = 0, onChanged = () => {} }) {
  const canWrite = user?.role === "admin";
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [collapsed, setCollapsed] = useState(false);
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [notice, setNotice] = useState("");
  const [selection, setSelection] = useState([]);
  const [editor, setEditor] = useState(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSelection([]);
    api(
      "/finance/expenses" +
        query({ ...filters, page, archived: archived ? "1" : "0" }),
    )
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters, page, archived, revision, reload]);
  const columns = getColumns(data?.columns);
  const visibleColumns = columns.filter((column) => column.visible);
  const selected = data?.items?.find(
    (item) => selection.length === 1 && item.id === selection[0],
  );
  const items = data?.items || [];
  function changed(message) {
    setNotice(message);
    setEditor(null);
    setColumnsOpen(false);
    setArchiveTarget(null);
    setReload((value) => value + 1);
    onChanged();
  }
  function applyFilters(event) {
    event.preventDefault();
    if (
      (draft.fromMonth && !validMonth(draft.fromMonth)) ||
      (draft.toMonth && !validMonth(draft.toMonth))
    )
      return setFilterError("请选择 2000-01 至 2100-12 之间的月份。");
    if (draft.fromMonth && draft.toMonth && draft.fromMonth > draft.toMonth)
      return setFilterError("开始月份不能晚于结束月份。");
    setFilterError("");
    setPage(1);
    setFilters({ ...draft });
  }
  async function archive() {
    if (actionBusy || !archiveTarget) return;
    setActionBusy(true);
    setActionError("");
    try {
      await api(
        `/finance/expenses/${encodeURIComponent(archiveTarget.id)}/${archived ? "restore" : "archive"}`,
        { version: archiveTarget.version },
      );
      changed(archived ? "费用记录已恢复" : "费用记录已归档");
    } catch (err) {
      setActionError(conflictMessage(err));
    } finally {
      setActionBusy(false);
    }
  }
  function openArchive(item) {
    setActionError("");
    setArchiveTarget(item);
  }
  return (
    <div className="expense-page">
      <header className="exp-page-header">
        <div>
          <p className="exp-eyebrow">FINANCE · EXPENSES</p>
          <h1>费用数据管理</h1>
          <p>按月维护日常、京东及其他费用，列名可自定义。</p>
        </div>
        <span className="exp-page-badge">
          <CalendarDays size={15} />
          月度费用台账
        </span>
      </header>
      <div className="exp-stats">
        <section>
          <span>当前记录</span>
          <strong>
            {loading || error ? "—" : (data?.total || 0).toLocaleString()}
            <small>条</small>
          </strong>
          <p>{archived ? "已归档记录" : "按当前筛选范围统计"}</p>
        </section>
        <section>
          <span>当前页合计</span>
          <strong>
            {loading || error ? "—" : money(data?.pageTotal || 0, 2)}
          </strong>
          <p>金额精确到分 · 人民币</p>
          <Wallet size={31} />
        </section>
      </div>
      <section className="exp-card exp-filter-card">
        <button
          type="button"
          className="exp-filter-toggle"
          aria-expanded={!collapsed}
          aria-controls="exp-filters"
          onClick={() => setCollapsed((value) => !value)}
        >
          <span>
            <Filter size={16} />
            筛选条件
          </span>
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        {!collapsed && (
          <form
            id="exp-filters"
            className="exp-filters"
            onSubmit={applyFilters}
          >
            <label>
              费用月份起
              <input
                type="month"
                min="2000-01"
                max="2100-12"
                value={draft.fromMonth}
                onChange={(event) =>
                  setDraft({ ...draft, fromMonth: event.target.value })
                }
              />
            </label>
            <label>
              费用月份止
              <input
                type="month"
                min="2000-01"
                max="2100-12"
                value={draft.toMonth}
                onChange={(event) =>
                  setDraft({ ...draft, toMonth: event.target.value })
                }
              />
            </label>
            <label>
              所属部门
              <select
                value={draft.department}
                onChange={(event) =>
                  setDraft({ ...draft, department: event.target.value })
                }
              >
                <option value="">全部部门</option>
                {(data?.departments || []).map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>
            <label>
              负责人
              <select
                value={draft.ownerId}
                onChange={(event) =>
                  setDraft({ ...draft, ownerId: event.target.value })
                }
              >
                <option value="">全部负责人</option>
                {(data?.owners || []).map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="exp-filter-actions">
              <button className="exp-button exp-primary">
                <Filter size={14} />
                查询
              </button>
              <button
                type="button"
                className="exp-button"
                onClick={() => {
                  setDraft(EMPTY_FILTERS);
                  setFilters({ ...EMPTY_FILTERS });
                  setFilterError("");
                  setPage(1);
                }}
              >
                <RotateCcw size={14} />
                重置
              </button>
            </div>
            {filterError && (
              <div className="exp-filter-error">
                <ErrorBox message={filterError} />
              </div>
            )}
          </form>
        )}
      </section>
      {notice && (
        <div className="exp-notice" role="status">
          {notice}
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      <section className="exp-card exp-list">
        <header className="exp-list-header">
          <div>
            <h2>
              费用列表 <span>{archived ? "已归档" : "月度台账"}</span>
            </h2>
            <p>集中管理公司费用，支持精细核对与归档追溯</p>
          </div>
          <div className="exp-list-actions">
            {canWrite && (
              <>
                <button
                  type="button"
                  className="exp-button exp-primary"
                  disabled={loading || !!error || archived}
                  onClick={() => setEditor({})}
                >
                  <Plus size={15} />
                  新增
                </button>
                <button
                  type="button"
                  className="exp-button"
                  disabled={!selected || loading || !!error || archived}
                  onClick={() => setEditor(selected)}
                >
                  <Pencil size={14} />
                  修改
                </button>
                <button
                  type="button"
                  className="exp-button"
                  disabled={!selected || loading || !!error}
                  onClick={() => openArchive(selected)}
                >
                  {archived ? <RotateCcw size={14} /> : <Archive size={14} />}
                  {archived ? "恢复" : "归档"}
                </button>
                <button
                  type="button"
                  className="exp-button"
                  disabled={!data || loading || !!error}
                  onClick={() => setColumnsOpen(true)}
                >
                  <Settings2 size={14} />
                  列设置
                </button>
              </>
            )}
          </div>
        </header>
        <div className="exp-list-meta">
          <div className="exp-status-tabs">
            <button
              type="button"
              className={!archived ? "is-active" : ""}
              onClick={() => {
                setArchived(false);
                setPage(1);
              }}
            >
              使用中
            </button>
            <button
              type="button"
              className={archived ? "is-active" : ""}
              onClick={() => {
                setArchived(true);
                setPage(1);
              }}
            >
              已归档
            </button>
          </div>
          <span>
            {canWrite
              ? selection.length
                ? `已选 ${selection.length} 条 · 选中一条可修改或${archived ? "恢复" : "归档"}`
                : "勾选记录进行操作"
              : "只读成员 · 可查看费用记录"}
          </span>
          <button
            type="button"
            className="exp-refresh"
            disabled={loading}
            onClick={() => setReload((value) => value + 1)}
          >
            <RefreshCw size={13} />
            刷新
          </button>
        </div>
        {error && (
          <div className="exp-load-error">
            <ErrorBox message={error} />
            <button
              type="button"
              className="exp-button"
              onClick={() => setReload((value) => value + 1)}
            >
              重新加载
            </button>
          </div>
        )}
        {loading ? (
          <Loading />
        ) : (
          !error && (
            <>
              {items.length ? (
                <div className="exp-table-scroll">
                  <table className="exp-table">
                    <thead>
                      <tr>
                        {canWrite && (
                          <th className="exp-select-cell">
                            <input
                              type="checkbox"
                              aria-label="全选当前页"
                              checked={
                                items.length > 0 &&
                                selection.length === items.length
                              }
                              onChange={(event) =>
                                setSelection(
                                  event.target.checked
                                    ? items.map((item) => item.id)
                                    : [],
                                )
                              }
                            />
                          </th>
                        )}
                        <th>费用月份</th>
                        <th>部门</th>
                        <th>负责人</th>
                        {visibleColumns.map((column) => (
                          <th className="exp-number" key={column.key}>
                            {column.label}
                          </th>
                        ))}
                        <th className="exp-number exp-total-cell">合计</th>
                        <th>创建时间</th>
                        {canWrite && <th>操作</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr
                          key={item.id}
                          className={
                            selection.includes(item.id) ? "is-selected" : ""
                          }
                        >
                          {canWrite && (
                            <td className="exp-select-cell">
                              <input
                                type="checkbox"
                                aria-label={`选择${item.month}${item.ownerName}费用`}
                                checked={selection.includes(item.id)}
                                onChange={(event) =>
                                  setSelection((current) =>
                                    event.target.checked
                                      ? [...current, item.id]
                                      : current.filter((id) => id !== item.id),
                                  )
                                }
                              />
                            </td>
                          )}
                          <td className="exp-month">{item.month}</td>
                          <td>{item.department || "—"}</td>
                          <td>{item.ownerName || "—"}</td>
                          {visibleColumns.map((column) => (
                            <td className="exp-number" key={column.key}>
                              {money(item.amounts?.[column.key], 2)}
                            </td>
                          ))}
                          <td className="exp-number exp-total-cell">
                            {money(item.total, 2)}
                          </td>
                          <td className="exp-created">
                            {item.createdAt
                              ? new Date(
                                  item.createdAt.replace(" ", "T") + "Z",
                                ).toLocaleString("zh-CN", {
                                  timeZone: "Asia/Shanghai",
                                  hour12: false,
                                })
                              : "—"}
                          </td>
                          {canWrite && (
                            <td>
                              <div className="exp-row-actions">
                                {!archived && (
                                  <button
                                    type="button"
                                    onClick={() => setEditor(item)}
                                  >
                                    修改
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openArchive(item)}
                                >
                                  {archived ? "恢复" : "归档"}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title={archived ? "暂无已归档费用" : "暂无费用记录"}>
                  {archived
                    ? "归档后的费用可在这里查看和恢复。"
                    : "调整筛选范围，或由管理员新增月度费用记录。"}
                </Empty>
              )}
              <div className="exp-pagination">
                <span>
                  筛选合计 <b>{money(data?.filteredTotal || 0, 2)}</b>
                </span>
                <Pagination
                  page={page}
                  total={data?.total || 0}
                  pageSize={data?.pageSize || 20}
                  onChange={setPage}
                />
              </div>
            </>
          )
        )}
      </section>
      {canWrite && editor && (
        <ExpenseEditor
          item={editor.id != null ? editor : null}
          owners={data?.owners || []}
          departments={data?.departments || []}
          columns={columns}
          onClose={() => setEditor(null)}
          onSaved={changed}
        />
      )}
      {canWrite && columnsOpen && (
        <ColumnEditor
          columns={columns}
          version={data?.columnsVersion}
          onClose={() => setColumnsOpen(false)}
          onSaved={changed}
        />
      )}
      {canWrite && archiveTarget && (
        <Dialog
          title={archived ? "恢复费用记录" : "归档费用记录"}
          className="exp-dialog exp-confirm-dialog"
          onClose={() => !actionBusy && setArchiveTarget(null)}
        >
          <ErrorBox message={actionError} />
          <p className="exp-confirm-copy">
            {archiveTarget.month} · {archiveTarget.department} ·{" "}
            {archiveTarget.ownerName}
            <br />
            费用合计 <b>{money(archiveTarget.total, 2)}</b>
          </p>
          <p className="exp-note">
            {archived
              ? "恢复后，该记录将重新计入费用统计。"
              : "归档后，该记录不再计入费用统计，可在“已归档”中恢复。"}
          </p>
          <footer className="exp-dialog-footer">
            <button
              type="button"
              className="exp-button"
              disabled={actionBusy}
              onClick={() => setArchiveTarget(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="exp-button exp-primary"
              disabled={actionBusy}
              onClick={archive}
            >
              {actionBusy ? "正在处理…" : archived ? "确认恢复" : "确认归档"}
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
