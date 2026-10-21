import React, { useEffect, useState } from "react";
import { Search, ArrowUpRight, FileText } from "lucide-react";
import { api, money, query } from "../api";
import {
  ErrorBox,
  Loading,
  Empty,
  DataTable,
  Pagination,
  Panel,
} from "../components/ui";
export default function Records({ filters, revision }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setPage(1);
  }, [filters, committed]);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api("/records" + query({ ...filters, page, search: committed }))
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [filters, page, committed, revision]);
  return (
    <Panel
      title="经营明细"
      icon={FileText}
      extra={<span className="tag neutral">按日 · 店铺 · 商品</span>}
    >
      <form
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault();
          setCommitted(search);
        }}
      >
        <div className="search-field">
          <Search size={16} />
          <input
            placeholder="搜索店铺或商品名称"
            aria-label="搜索店铺或商品"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="secondary">搜索</button>
        {committed && (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setSearch("");
              setCommitted("");
            }}
          >
            清空
          </button>
        )}
        <span className="muted small">所有金额精确到分</span>
      </form>
      <ErrorBox message={error} />
      {!data && !error ? (
        <Loading />
      ) : data?.total ? (
        <>
          <DataTable
            headers={[
              "日期",
              "渠道",
              "店铺 / 商品",
              "销售额",
              "退款额",
              "产品成本",
              "经营费用",
              "预估净利",
            ]}
          >
            {data.records.map((row) => {
              const expenses = row.ads + row.platform + row.shipping;
              const net = row.sales - row.refunds - row.cost - expenses;
              return (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>
                    <span className="channel-tag">{row.channel}</span>
                  </td>
                  <td className="two-line">
                    <b>{row.shop}</b>
                    <small>{row.product}</small>
                  </td>
                  <td>{money(row.sales, 2)}</td>
                  <td>{money(row.refunds, 2)}</td>
                  <td>{money(row.cost, 2)}</td>
                  <td
                    title={`广告费 ${money(row.ads, 2)} / 平台费 ${money(row.platform, 2)} / 运费 ${money(row.shipping, 2)}`}
                  >
                    {money(expenses, 2)}
                  </td>
                  <td className={net >= 0 ? "positive" : "negative"}>
                    {money(net, 2)}
                  </td>
                </tr>
              );
            })}
          </DataTable>
          <Pagination page={page} total={data.total} onChange={setPage} />
        </>
      ) : (
        !error && <Empty />
      )}
    </Panel>
  );
}
