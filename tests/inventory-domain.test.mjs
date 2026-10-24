import test from "node:test";
import assert from "node:assert/strict";
import { inventoryFields, inventoryHeaders } from "../src/inventory-schema.mjs";
import {
  normalizeInventoryRows,
  inventoryFlags,
  summarizeInventory,
} from "../server/inventory-domain.mjs";

const row = (fields) =>
  inventoryFields.map((field) => fields[field.key] ?? null);
const base = {
  sku: "000123",
  styleCode: "STYLE-A",
  name: "测试商品",
  stock: 12,
};
test("inventory keeps identifiers, blanks, zeros and source labels distinct", () => {
  const result = normalizeInventoryRows([
    inventoryHeaders,
    row({
      ...base,
      sales7: 0,
      daysCover: -0.3,
      suggestedPurchase: 0,
      tagText: "清货,滞销",
      updatedAt: "2026/10/4 9:01:02",
    }),
    row({ ...base, sku: "000124", stock: 8 }),
  ]);
  assert.equal(result.items[0].sku, "000123");
  assert.equal(result.items[0].sales7, 0);
  assert.equal(result.items[1].sales7, null);
  assert.equal(result.items[0].daysCover, -0.3);
  assert.deepEqual(result.items[0].tags, ["清货", "滞销"]);
  assert.equal(result.items[0].updatedAt, "2026/10/4 9:01:02");
  assert.equal(result.items[0].updatedAtKey, "2026-10-04 09:01:02");
  const summary = summarizeInventory(result.items);
  assert.equal(summary.stockTotal, 20);
  assert.equal(summary.skuCount, 2);
  assert.equal(summary.styleCount, 1);
  assert.deepEqual(summary.sales7, { value: 0, provided: 1, total: 2 });
  assert.deepEqual(summary.pendingShip, { value: null, provided: 0, total: 2 });
  assert.equal(summary.missingSalesCount, 1);
  assert.equal(summary.anomalyCount, 1);
});
test("inventory flags use configured positive thresholds and keep anomalies explicit", () => {
  assert.deepEqual(
    inventoryFlags({ stock: 10, minStock: null, maxStock: 0, tags: [] }),
    [],
  );
  assert.ok(
    inventoryFlags({
      stock: 10,
      minStock: 11,
      maxStock: 20,
      tags: [],
    }).includes("below-min"),
  );
  assert.ok(
    inventoryFlags({
      stock: 21,
      minStock: 11,
      maxStock: 20,
      tags: [],
    }).includes("above-max"),
  );
  const invalid = inventoryFlags({
    stock: 15,
    minStock: 20,
    maxStock: 10,
    daysCover: -1,
    tags: ["非滞销", "下架"],
  });
  assert.ok(invalid.includes("invalid-limits"));
  assert.ok(invalid.includes("negative-days"));
  assert.ok(invalid.includes("source-delisted"));
  assert.ok(!invalid.includes("source-slow"));
  assert.ok(!invalid.includes("below-min"));
  assert.ok(!invalid.includes("above-max"));
});
test("inventory rejects duplicate codes, unsupported numeric IDs and misleading quantities", () => {
  for (const rows of [
    [inventoryHeaders, row(base), row(base)],
    [inventoryHeaders, row({ ...base, sku: 123 })],
    [inventoryHeaders, row({ ...base, stock: null })],
    [inventoryHeaders, row({ ...base, stock: 1.5 })],
    [inventoryHeaders, row({ ...base, sales7: "NaN" })],
    [inventoryHeaders, row({ ...base, stock: Infinity })],
    [
      inventoryHeaders.map((value) =>
        value === "商品编码" ? "其他列" : value,
      ),
      row(base),
    ],
    [
      [...inventoryHeaders, "实际库存数"],
      [...row(base), 12],
    ],
  ])
    assert.throws(() => normalizeInventoryRows(rows));
  assert.equal(
    normalizeInventoryRows([inventoryHeaders, Array(38).fill(null), row(base)])
      .items.length,
    1,
  );
});
test("unsafe image URLs are omitted without fetching or discarding stock rows", () => {
  const result = normalizeInventoryRows([
    inventoryHeaders,
    row({ ...base, imageUrl: "javascript:alert(1)" }),
  ]);
  assert.equal(result.items[0].imageUrl, null);
  assert.equal(result.items[0].stock, 12);
  assert.ok(result.warnings.length > 0);
  assert.equal(
    normalizeInventoryRows([
      inventoryHeaders,
      row({ ...base, imageUrl: "https://example.com/image.png" }),
    ]).items[0].imageUrl,
    "https://example.com/image.png",
  );
});
