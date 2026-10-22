import React, { useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  History,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { api, money, today } from "../api";
import { ErrorBox, Empty, DataTable, Panel, Loading } from "../components/ui";
export default function Imports({ onImported, hasDemo, clearDemo }) {
  const input = useRef();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const loadHistory = () =>
    api("/imports")
      .then((r) => setHistory(r.imports))
      .catch((e) => setError(e.message));
  useEffect(() => {
    loadHistory();
  }, []);
  function template() {
    const csv =
      "\uFEFF日期,渠道,店铺,商品,销售额,退款额,产品成本,广告费,平台费,运费,仅退款,退货退款,奖励\r\n" +
      today() +
      ",天猫,示例店铺,示例商品,1000.00,50.00,500.00,30.00,10.00,15.00,30.00,20.00,5.00\r\n";
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "经营数据导入模板.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function choose(selected) {
    setError("");
    setSuccess("");
    setPreview(null);
    setFile(null);
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setError("请选择 CSV 文件。Excel 中请另存为 CSV UTF-8 格式。");
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError("文件不能超过 5MB");
      return;
    }
    setBusy(true);
    try {
      const csv = await selected.text();
      const result = await api("/imports/preview", { csv });
      setFile({ name: selected.name, csv });
      setPreview(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function commit() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/imports", {
        csv: file.csv,
        filename: file.name,
      });
      setSuccess(`已成功导入 ${result.count} 条记录，驾驶舱已更新。`);
      setFile(null);
      setPreview(null);
      loadHistory();
      onImported();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="import-grid">
        <Panel
          title="导入经营数据"
          icon={FileSpreadsheet}
          extra={
            <button className="text-button" onClick={template}>
              <Download size={15} /> 下载模板
            </button>
          }
        >
          <div className="import-steps">
            <span className="active">
              <i>1</i>下载并填写模板
            </span>
            <ArrowRight size={14} />
            <span>
              <i>2</i>上传并预检
            </span>
            <ArrowRight size={14} />
            <span>
              <i>3</i>确认导入
            </span>
          </div>
          <ErrorBox message={error} />
          {success && (
            <div className="success-box" role="status">
              <CheckCircle2 size={17} />
              {success}
            </div>
          )}
          {hasDemo && (
            <div className="demo-import-note">
              <AlertTriangle size={18} />
              <div>
                当前为演示数据。导入真实经营数据前，请先清除演示数据。
                <button className="text-button" onClick={clearDemo}>
                  清除演示数据
                </button>
              </div>
            </div>
          )}
          <div
            className={"dropzone " + (busy ? "disabled" : "")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) choose(e.dataTransfer.files[0]);
            }}
          >
            <div className="upload-icon">
              <UploadCloud size={30} />
            </div>
            <h3>{busy ? "正在校验文件…" : "将 CSV 文件拖到这里"}</h3>
            <p>支持 UTF-8 CSV · 单次最多 10,000 行 · 不超过 5MB</p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => input.current.click()}
            >
              选择文件
            </button>
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv"
              aria-label="上传 CSV 文件"
              className="visually-hidden"
              onChange={(e) => choose(e.target.files[0])}
            />
          </div>
          {preview && (
            <div className="import-preview">
              <div className="preview-summary">
                <FileSpreadsheet size={20} />
                <div>
                  <b>{file.name}</b>
                  <span>
                    已校验 {preview.count} 行 · 销售额{" "}
                    {money(preview.totals.sales, 2)}
                  </span>
                </div>
                <span
                  className={
                    "tag " + (preview.duplicates ? "warning" : "success")
                  }
                >
                  {preview.duplicates
                    ? `${preview.duplicates} 行与已有数据重复`
                    : "校验通过"}
                </span>
              </div>
              <DataTable headers={["日期", "渠道", "店铺", "商品", "销售额"]}>
                {preview.preview.map((r, i) => (
                  <tr key={i}>
                    <td>{r.date}</td>
                    <td>{r.channel}</td>
                    <td>{r.shop}</td>
                    <td>{r.product}</td>
                    <td>{money(r.sales, 2)}</td>
                  </tr>
                ))}
              </DataTable>
              <div className="preview-footer">
                <span>
                  预览前 {preview.preview.length} 行。确认后整批保存。
                </span>
                <button
                  className="primary"
                  disabled={busy || preview.duplicates > 0 || hasDemo}
                  onClick={commit}
                >
                  {busy ? "正在导入…" : "确认导入"}
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}
        </Panel>
        <Panel
          title="导入前，请核对"
          icon={CheckCircle2}
          className="import-guide"
        >
          <ol>
            <li>
              <b>一行一条经营记录</b>
              <p>每行对应一个日期、渠道、店铺和商品的经营汇总。</p>
            </li>
            <li>
              <b>金额单位为元</b>
              <p>填写非负数字，最多两位小数；退款额不能超过销售额。</p>
            </li>
            <li>
              <b>避免重复导入</b>
              <p>
                日期、渠道、店铺、商品相同视为重复，整批拒绝，不覆盖原数据。
              </p>
            </li>
            <li>
              <b>保留完整模板表头</b>
              <p>
                请使用 CSV UTF-8
                格式。原有10列表头仍可使用。仅退款、退货退款、奖励为可选列；两类退款须同时填写，且合计等于退款额。缺失字段会显示为未提供。任何一行校验失败，整批均不会保存。
              </p>
            </li>
          </ol>
        </Panel>
      </div>
      <Panel
        title="最近导入记录"
        icon={History}
        extra={<span className="muted small">最近 100 批</span>}
      >
        {history === null ? (
          <Loading />
        ) : history.length ? (
          <DataTable
            headers={["文件名", "记录数", "操作人", "导入时间", "数据类型"]}
          >
            {history.map((r) => (
              <tr key={r.id}>
                <td className="file-cell">
                  <FileSpreadsheet size={17} />
                  {r.filename}
                </td>
                <td>{r.count.toLocaleString()} 行</td>
                <td>{r.user_name}</td>
                <td>
                  {new Date(
                    r.created_at.replace(" ", "T") + "Z",
                  ).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                    hour12: false,
                  })}
                </td>
                <td>
                  <span
                    className={"tag " + (r.is_demo ? "warning" : "success")}
                  >
                    {r.is_demo ? "合成演示" : "业务数据"}
                  </span>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Empty title="还没有导入记录">
            完成第一次导入后，可在这里追溯文件、行数与操作人。
          </Empty>
        )}
      </Panel>
    </>
  );
}
