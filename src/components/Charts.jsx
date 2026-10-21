import React, { useId, useState } from "react";
import { money } from "../api";
export function TrendChart({ data }) {
  const id = useId().replaceAll(":", "");
  const [hover, setHover] = useState(null);
  const w = 700,
    h = 235,
    pad = { left: 52, right: 16, top: 20, bottom: 30 };
  const max = Math.max(100, ...data.map((d) => d.sales)) * 1.15;
  const x = (i) =>
    pad.left + (i / Math.max(data.length - 1, 1)) * (w - pad.left - pad.right);
  const y = (n) => h - pad.bottom - (n / max) * (h - pad.bottom - pad.top);
  const points = (key) => data.map((d, i) => `${x(i)},${y(d[key])}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="trend-chart">
      <div className="chart-legend">
        <span>
          <i style={{ background: "#b58a3c" }} />
          销售额
        </span>
        <span>
          <i style={{ background: "#67938c" }} />
          净销售额
        </span>
        <small>单位：万元</small>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="每日销售额与净销售额趋势"
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b58a3c" stopOpacity=".18" />
            <stop offset="100%" stopColor="#b58a3c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.left}
              y1={y(t * max)}
              x2={w - pad.right}
              y2={y(t * max)}
              stroke="#eeefeb"
              strokeDasharray="3 4"
            />
            <text x={pad.left - 12} y={y(t * max) + 4} textAnchor="end">
              {((t * max) / 1000000).toFixed(1)}
            </text>
          </g>
        ))}
        <polygon
          points={`${x(0)},${y(0)} ${points("sales")} ${x(data.length - 1)},${y(0)}`}
          fill={`url(#${id})`}
        />
        <polyline
          points={points("sales")}
          fill="none"
          stroke="#b58a3c"
          strokeWidth="2.7"
          strokeLinejoin="round"
        />
        <polyline
          points={points("netSales")}
          fill="none"
          stroke="#67938c"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        {data.map((d, i) => {
          const show =
            i === 0 ||
            i === data.length - 1 ||
            i % Math.max(1, Math.ceil(data.length / 6)) === 0;
          return (
            <g key={d.date}>
              {show && (
                <text x={x(i)} y={h - 7} textAnchor="middle">
                  {d.date.slice(5).replace("-", "/")}
                </text>
              )}
              <rect
                x={x(i) - 8}
                y="10"
                width="16"
                height={h - 30}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
        {hover !== null && data[hover] && (
          <g pointerEvents="none">
            <line
              x1={x(hover)}
              y1="12"
              x2={x(hover)}
              y2={y(0)}
              stroke="#b58a3c"
              strokeDasharray="3 3"
            />
            <circle
              cx={x(hover)}
              cy={y(data[hover].sales)}
              r="4"
              fill="#b58a3c"
            />
          </g>
        )}
      </svg>
      <div className="chart-tooltip" aria-live="polite">
        {hover !== null && data[hover]
          ? `${data[hover].date}　销售额 ${money(data[hover].sales)}　净销售额 ${money(data[hover].netSales)}`
          : "将鼠标移至曲线查看每日数据"}
      </div>
    </div>
  );
}
export function CostChart({ totals }) {
  const items = [
    ["产品成本", totals.cost, "#b68c43"],
    ["广告费", totals.ads, "#6f9891"],
    ["平台费", totals.platform, "#c9c3b4"],
    ["运费", totals.shipping, "#e1c78f"],
  ];
  const sum = items.reduce((n, r) => n + r[1], 0);
  let previous = 0;
  return (
    <div className="cost-chart">
      <div className="donut">
        <svg viewBox="0 0 180 180" role="img" aria-label="成本费用构成环形图">
          <circle
            cx="90"
            cy="90"
            r="67"
            fill="none"
            stroke="#f1f1ed"
            strokeWidth="17"
          />
          {items.map(([name, value, color]) => {
            const length = sum ? (value / sum) * 421 : 0;
            const offset = -previous;
            previous += length;
            return (
              <circle
                key={name}
                cx="90"
                cy="90"
                r="67"
                fill="none"
                stroke={color}
                strokeWidth="17"
                strokeDasharray={`${length} ${421 - length}`}
                strokeDashoffset={offset}
                transform="rotate(-90 90 90)"
              />
            );
          })}
        </svg>
        <div>
          <span>成本费用</span>
          <strong>
            {(sum / 1000000).toFixed(2)}
            <small>万</small>
          </strong>
        </div>
      </div>
      <div className="cost-legend">
        {items.map(([name, value, color]) => (
          <div key={name}>
            <span>
              <i style={{ background: color }} />
              {name}
            </span>
            <b>{sum ? ((value / sum) * 100).toFixed(1) : "0.0"}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}
