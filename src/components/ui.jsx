import React from "react";
import {
  AlertCircle,
  Inbox,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
export function ErrorBox({ message }) {
  return message ? (
    <div role="alert" className="error-box">
      <AlertCircle size={17} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      正在读取经营数据…
    </div>
  );
}
export function Empty({ title = "暂无数据", children }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={28} />
      </div>
      <h3>{title}</h3>
      <p>{children || "调整筛选范围，或联系管理员导入经营数据。"}</p>
    </div>
  );
}
export function Panel({ title, icon: Icon, extra, children, className = "" }) {
  return (
    <section className={"panel " + className}>
      <div className="panel-heading">
        <h2>
          {Icon && <Icon size={17} />} {title}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  );
}
export function Pagination({ page, total, pageSize = 20, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pagination">
      <span>共 {total.toLocaleString()} 条记录</span>
      <div>
        <button
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          aria-label="下一页"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
export function DataTable({ headers, children }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
