import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  CalendarDays,
  Plus,
  Search,
  Tag,
  Pencil,
  Archive,
  RotateCcw,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Play,
  X,
} from "lucide-react";
import { api, money, today, shiftDay, query } from "../api";
import { ErrorBox, Loading, Empty } from "../components/ui";
import Dialog from "../components/Dialog";
import { rangeError } from "../workbench.mjs";
import "../finance.css";

const initialRange = () => ({ start: shiftDay(today(), -29), end: today() });
const displayValue = (value) => (value == null ? "暂无数据" : money(value, 2));
function formulaLabel(expression, fields, rules) {
  const labels = new Map(fields.map((field) => [field.key, field.label]));
  for (const rule of rules) labels.set("rule_" + rule.id, rule.name);
  return expression
    .replace(/[A-Za-z_]\w*/g, (token) => labels.get(token) || token)
    .replaceAll("*", " × ")
    .replaceAll("/", " ÷ ");
}

export default function Accounting({
  user,
  revision = 0,
  onChanged = () => {},
}) {
  const [range, setRange] = useState(initialRange);
  const [draftRange, setDraftRange] = useState(initialRange);
  const [archived, setArchived] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [localRevision, setLocalRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [editor, setEditor] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api("/finance/rules" + query({ ...range, archived: archived ? "1" : "0" }))
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          setData(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range, archived, revision, localRevision]);
  const rules = data?.items || [];
  const fields = data?.fields || [];
  const tags = [...new Set(rules.flatMap((rule) => rule.tags))];
  const filtered = rules.filter(
    (rule) =>
      (!tag || rule.tags.includes(tag)) &&
      (!search ||
        (rule.name + " " + rule.tags.join(" "))
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  function refresh() {
    setLocalRevision((value) => value + 1);
    onChanged();
  }
  function openEditor(rule) {
    setActionError("");
    setEditor(rule || { name: "", expression: "", tags: [], enabled: true });
  }
  async function changeArchived() {
    setSaving(true);
    setActionError("");
    try {
      await api(
        `/finance/rules/${archiveTarget.id}/${archived ? "restore" : "archive"}`,
        { version: archiveTarget.version },
      );
      setArchiveTarget(null);
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  }
  function applyRange(event) {
    event.preventDefault();
    const invalid = rangeError(draftRange.start, draftRange.end);
    if (invalid) {
      setError(invalid);
      return;
    }
    setRange({ ...draftRange });
  }
  return (
    <section className="finance-page accounting-page">
      <header className="fin-page-heading">
        <div>
          <span className="fin-eyebrow">利润与费用 / ACCOUNTING</span>
          <h1>核算中心</h1>
          <p>统一维护核算规则，用同一统计周期预览字段与计算结果。</p>
        </div>
        <Calculator size={30} />
      </header>
      <form className="fin-period-bar" onSubmit={applyRange}>
        <div>
          <CalendarDays size={17} />
          <strong>预览周期</strong>
        </div>
        <label>
          开始日期
          <input
            type="date"
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
          结束日期
          <input
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={draftRange.end}
            onChange={(e) =>
              setDraftRange({ ...draftRange, end: e.target.value })
            }
          />
        </label>
        <button className="primary" disabled={loading}>
          预览核算
        </button>
        <small>按日汇总经营数据，月度费用按自然日折算。</small>
      </form>
      <ErrorBox message={error} />
      <div className="fin-section-heading">
        <div>
          <h2>全局核算规则</h2>
          <p>
            公式引用已接入字段；新增规则单独预览，保存后不会改写导入记录或老板工作台口径。
          </p>
        </div>
        {user.role === "admin" && (
          <button className="primary" onClick={() => openEditor()}>
            <Plus size={15} />
            新增核算规则
          </button>
        )}
      </div>
      <div className="fin-rule-toolbar">
        <label className="fin-search">
          <Search size={16} />
          <input
            aria-label="搜索核算卡片"
            placeholder="搜索核算卡片"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="按标签筛选"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        >
          <option value="">全部标签</option>
          {tags.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <button
          className="fin-text-button"
          disabled={!search && !tag}
          onClick={() => {
            setSearch("");
            setTag("");
          }}
        >
          清空筛选
        </button>
        <label className="fin-archive-switch">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => {
              setArchived(e.target.checked);
              setTag("");
            }}
          />
          已归档规则
        </label>
      </div>
      {loading ? (
        <Loading />
      ) : !data ? (
        <button
          className="secondary"
          onClick={() => setLocalRevision((value) => value + 1)}
        >
          重新加载
        </button>
      ) : (
        <>
          {filtered.length ? (
            <div className="fin-rule-grid">
              {filtered.map((rule) => (
                <article
                  className={
                    "fin-rule-card " + (rule.status === "ok" ? "" : "has-note")
                  }
                  key={rule.id}
                >
                  <header>
                    <div>
                      <span className="fin-card-kicker">
                        {rule.enabled ? "自定义公式" : "规则已停用"}
                      </span>
                      <h3>{rule.name}</h3>
                    </div>
                    {user.role === "admin" && (
                      <div className="fin-icon-actions">
                        {!archived && (
                          <button
                            title={"编辑" + rule.name}
                            aria-label={"编辑" + rule.name}
                            onClick={() => openEditor(rule)}
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        <button
                          title={(archived ? "恢复" : "归档") + rule.name}
                          aria-label={(archived ? "恢复" : "归档") + rule.name}
                          onClick={() => {
                            setActionError("");
                            setArchiveTarget(rule);
                          }}
                        >
                          {archived ? (
                            <RotateCcw size={15} />
                          ) : (
                            <Archive size={15} />
                          )}
                        </button>
                      </div>
                    )}
                  </header>
                  <div className="fin-tags">
                    {rule.tags.map((value) => (
                      <button key={value} onClick={() => setTag(value)}>
                        <Tag size={10} />
                        {value}
                      </button>
                    ))}
                  </div>
                  <strong
                    className={
                      rule.value != null && rule.value < 0 ? "negative" : ""
                    }
                  >
                    {displayValue(rule.value)}
                  </strong>
                  <p className="fin-rule-expression" title={rule.expression}>
                    {formulaLabel(rule.expression, fields, rules)}
                  </p>
                  <footer>
                    <span
                      className={
                        rule.status === "ok"
                          ? "fin-status-ok"
                          : "fin-status-note"
                      }
                    >
                      {rule.status === "ok" ? (
                        <>
                          <CheckCircle2 size={12} />
                          核算完成
                        </>
                      ) : (
                        <>
                          <CircleHelp size={12} />
                          {rule.reason || "暂无结果"}
                        </>
                      )}
                    </span>
                    {rule.usedBy?.length > 0 && (
                      <small>被 {rule.usedBy.length} 项规则引用</small>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title={
                archived
                  ? "暂无归档规则"
                  : search || tag
                    ? "没有匹配的核算规则"
                    : "尚未创建核算规则"
              }
            >
              {archived
                ? "归档规则可以恢复。"
                : "管理员可从下方已接入字段创建公式，预览真实核算结果。"}
            </Empty>
          )}
          <div className="fin-section-heading">
            <div>
              <h2>可选核算字段</h2>
              <p>
                经营金额来自本地导入数据；月度费用来自费用管理。缺失的退款拆分、奖励不会被假设为零。
              </p>
            </div>
            <small>
              {range.start} — {range.end}
            </small>
          </div>
          {[...new Set(fields.map((field) => field.source))].map((source) => (
            <section className="fin-field-group" key={source}>
              <h3>{source}</h3>
              <div>
                {fields
                  .filter((field) => field.source === source)
                  .map((field) => (
                    <button
                      key={field.key}
                      onClick={() =>
                        openEditor({
                          name: field.label + "核算",
                          expression: field.key,
                          tags: [],
                          enabled: true,
                        })
                      }
                      disabled={user.role !== "admin" || archived}
                    >
                      <span>
                        {field.label}
                        <small>
                          {field.value == null ? "所选周期未提供" : "周期汇总"}
                        </small>
                      </span>
                      <b>{displayValue(field.value)}</b>
                      {user.role === "admin" && <ArrowRight size={13} />}
                    </button>
                  ))}
              </div>
            </section>
          ))}
          <p className="fin-data-note">
            ERP订单、平台账单、库存及人员部门来源尚未接入。本页只使用已导入的经营记录和实际维护的月度费用，不填充原站金额。
          </p>
        </>
      )}
      {editor && (
        <RuleEditor
          key={editor.id || "new"}
          rule={editor}
          rules={rules}
          fields={fields}
          range={range}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            refresh();
          }}
        />
      )}
      {archiveTarget && (
        <Dialog
          title={archived ? "恢复核算规则" : "归档核算规则"}
          onClose={() => !saving && setArchiveTarget(null)}
          className="fin-small-dialog"
        >
          <p>
            {archived
              ? "恢复后，可重新使用和编辑这项规则。"
              : "归档后保留规则内容，可在已归档列表恢复；仍被其他规则引用的规则不能归档。"}
          </p>
          <strong>{archiveTarget.name}</strong>
          <ErrorBox message={actionError} />
          <footer>
            <button
              className="secondary"
              disabled={saving}
              onClick={() => setArchiveTarget(null)}
            >
              取消
            </button>
            <button
              className="primary"
              disabled={saving}
              onClick={changeArchived}
            >
              {saving ? "正在保存…" : archived ? "确认恢复" : "确认归档"}
            </button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}

function RuleEditor({ rule, rules, fields, range, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: rule.name,
    expression: rule.expression,
    tags: rule.tags.join("，"),
    enabled: rule.enabled,
  });
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const input = useRef(null);
  const generation = useRef(0);
  const options = useMemo(
    () => [
      ...fields,
      ...rules
        .filter((item) => item.id !== rule.id && item.enabled && !item.archived)
        .map((item) => ({
          key: "rule_" + item.id,
          label: item.name + " · 核算结果",
          value: item.value,
          source: "可复用核算结果",
        })),
    ],
    [fields, rules, rule.id],
  );
  function change(key, value) {
    generation.current++;
    setForm((previous) => ({ ...previous, [key]: value }));
    setPreview(null);
    setError("");
  }
  function insert(token) {
    const start = input.current?.selectionStart ?? form.expression.length;
    const end = input.current?.selectionEnd ?? start;
    const before = form.expression.slice(0, start),
      after = form.expression.slice(end);
    change(
      "expression",
      before +
        (before && !before.endsWith(" ") ? " " : "") +
        token +
        " " +
        after,
    );
    input.current?.focus();
  }
  async function runPreview() {
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await api("/finance/rules/preview", {
        expression: form.expression,
        ...range,
        ...(rule.id ? { ruleId: rule.id } : {}),
      });
      if (generation.current === current) setPreview(result);
    } catch (err) {
      if (generation.current === current) setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/finance/rules", {
        ...(rule.id ? { id: rule.id, version: rule.version } : {}),
        name: form.name.trim(),
        expression: form.expression.trim(),
        tags: [
          ...new Set(
            form.tags
              .split(/[,，]/)
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ],
        enabled: form.enabled,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={rule.id ? "编辑核算规则" : "新增核算规则"}
      subtitle="公式与字段来源 · 按当前周期预览"
      onClose={() => !busy && onClose()}
      className="fin-rule-editor"
    >
      <form onSubmit={save}>
        <ErrorBox message={error} />
        <div className="fin-form-row">
          <label>
            规则名称
            <input
              autoFocus
              required
              maxLength={60}
              value={form.name}
              disabled={busy}
              onChange={(e) => change("name", e.target.value)}
            />
          </label>
          <label>
            标签
            <input
              placeholder="多个标签用逗号分隔"
              maxLength={180}
              value={form.tags}
              disabled={busy}
              onChange={(e) => change("tags", e.target.value)}
            />
          </label>
        </div>
        <label className="fin-form-label">
          核算公式
          <textarea
            ref={input}
            aria-label="核算公式"
            required
            maxLength={500}
            rows={3}
            value={form.expression}
            disabled={busy}
            placeholder="点击下方字段和运算符组成公式"
            onChange={(e) => change("expression", e.target.value)}
          />
        </label>
        <p className="fin-expression-translation">
          {form.expression
            ? formulaLabel(form.expression, fields, rules)
            : "选择字段后，公式的中文说明会显示在这里。"}
        </p>
        <div className="fin-operators">
          {["+", "-", "*", "/", "(", ")"].map((token) => (
            <button
              type="button"
              key={token}
              disabled={busy}
              aria-label={"插入运算符" + token}
              onClick={() => insert(token)}
            >
              {token === "*" ? "×" : token === "/" ? "÷" : token}
            </button>
          ))}
          <small>支持数值、四则运算和括号；金额常数单位为元。</small>
        </div>
        <label className="fin-form-label">
          插入核算字段
          <input
            aria-label="查找公式字段"
            placeholder="搜索字段或已有核算结果"
            value={fieldSearch}
            onChange={(e) => setFieldSearch(e.target.value)}
          />
        </label>
        <div className="fin-insert-fields">
          {options
            .filter((item) => !fieldSearch || item.label.includes(fieldSearch))
            .map((item) => (
              <button
                type="button"
                disabled={busy}
                key={item.key}
                onClick={() => insert(item.key)}
                title={item.source + " · " + displayValue(item.value)}
              >
                <Plus size={11} />
                {item.label}
              </button>
            ))}
        </div>
        <div className="fin-preview-box">
          <div>
            <strong>周期预览</strong>
            <small>
              {range.start} — {range.end}
            </small>
          </div>
          <button
            type="button"
            className="secondary"
            disabled={busy || !form.expression.trim()}
            onClick={runPreview}
          >
            <Play size={13} />
            预览公式
          </button>
          {preview && (
            <p
              className={
                preview.status === "ok" ? "fin-status-ok" : "fin-status-note"
              }
            >
              {displayValue(preview.value)}
              <span>
                {preview.reason ||
                  (preview.status === "ok"
                    ? "公式校验通过"
                    : "当前来源无法提供完整结果")}
              </span>
            </p>
          )}
        </div>
        <label className="fin-checkbox">
          <input
            type="checkbox"
            checked={form.enabled}
            disabled={busy}
            onChange={(e) => change("enabled", e.target.checked)}
          />
          启用此规则
        </label>
        <footer className="fin-dialog-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "处理中…" : "保存核算规则"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
