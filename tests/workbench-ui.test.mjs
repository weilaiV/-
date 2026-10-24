import test from "node:test";
import assert from "node:assert/strict";
import {
  visitTab,
  closeTab,
  aggregateTrend,
  changeRate,
  datePreset,
  rangeError,
} from "../src/workbench.mjs";
test("date range rejects unsupported years and invalid days before requests", () => {
  assert.equal(rangeError("2024-02-29", "2024-02-29"), "");
  assert.ok(rangeError("1999-01-01", "1999-01-01"));
  assert.ok(rangeError("2101-01-01", "2101-01-01"));
  assert.ok(rangeError("2026-02-30", "2026-03-01"));
  assert.ok(rangeError("2026-02-01", "2026-01-01"));
  assert.equal(rangeError("2024-01-01", "2024-12-31"), "");
  assert.ok(rangeError("2024-01-01", "2025-01-01"));
});
test("workspace tabs deduplicate and preserve the pinned home", () => {
  const tabs = visitTab(visitTab(["home"], "overview"), "records");
  assert.deepEqual(visitTab(tabs, "overview"), ["home", "overview", "records"]);
  assert.deepEqual(closeTab(tabs, "records", "records"), {
    tabs: ["home", "overview"],
    active: "overview",
  });
  assert.deepEqual(closeTab(["home"], "home", "home"), {
    tabs: ["home"],
    active: "home",
  });
  assert.deepEqual(closeTab(tabs, "overview", "records"), {
    tabs: ["home", "records"],
    active: "records",
  });
});
test("weekly and monthly trends preserve exact integer totals", () => {
  const rows = [
    { date: "2026-10-04", sales: 100, netSales: 90 },
    { date: "2026-10-05", sales: 200, netSales: 180 },
    { date: "2026-10-06", sales: 300, netSales: 270 },
    { date: "2026-11-01", sales: 400, netSales: 360 },
  ];
  const weekly = aggregateTrend(rows, "week");
  assert.equal(weekly[0].date, "2026-09-28");
  assert.equal(weekly[1].sales, 500);
  assert.deepEqual(
    aggregateTrend(rows, "month").map((r) => r.sales),
    [600, 400],
  );
  assert.equal(
    weekly.reduce((sum, row) => sum + row.sales, 0),
    1000,
  );
});
test("missing or zero prior values do not fabricate growth", () => {
  assert.equal(changeRate(100, 0), null);
  assert.equal(changeRate(null, 50), null);
  assert.equal(changeRate(110, 100), 10);
});
test("month and full-history presets respect inclusive bounded periods", () => {
  assert.deepEqual(datePreset("lastMonth", "2026-01-09"), {
    start: "2025-12-01",
    end: "2025-12-31",
    limited: false,
  });
  assert.deepEqual(
    datePreset("all", "2026-10-22", { start: "2020-01-01", end: "2026-10-21" }),
    { start: "2025-10-21", end: "2026-10-21", limited: true },
  );
});
