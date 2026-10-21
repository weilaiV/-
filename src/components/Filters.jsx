import React from "react";
import { CalendarDays, SlidersHorizontal } from "lucide-react";
import { today, shiftDay } from "../api";
export default function Filters({ filters, setFilters, channels = [] }) {
  const end = today();
  const presets = [
    ["近7天", shiftDay(end, -6), end],
    ["近30天", shiftDay(end, -29), end],
    ["本月", end.slice(0, 7) + "-01", end],
    ["上月", end.slice(0, 4) + "-" + end.slice(5, 7) + "-01", end],
  ];
  const lastEnd = shiftDay(end.slice(0, 7) + "-01", -1);
  presets[3] = ["上月", lastEnd.slice(0, 7) + "-01", lastEnd];
  return (
    <div className="filters">
      <div className="presets">
        {presets.map(([label, start, finish]) => (
          <button
            key={label}
            className={
              filters.start === start && filters.end === finish
                ? "selected"
                : ""
            }
            onClick={() => setFilters({ ...filters, start, end: finish })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="date-range">
        <CalendarDays size={15} />
        <input
          aria-label="开始日期"
          type="date"
          value={filters.start}
          max={filters.end}
          onChange={(e) => setFilters({ ...filters, start: e.target.value })}
        />
        <span>→</span>
        <input
          aria-label="结束日期"
          type="date"
          value={filters.end}
          min={filters.start}
          onChange={(e) => setFilters({ ...filters, end: e.target.value })}
        />
      </div>
      <label className="channel-filter">
        <SlidersHorizontal size={15} />
        <select
          aria-label="渠道筛选"
          value={filters.channel}
          onChange={(e) => setFilters({ ...filters, channel: e.target.value })}
        >
          <option value="">全部渠道</option>
          {channels.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
