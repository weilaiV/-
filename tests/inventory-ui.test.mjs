import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  inventoryQuery,
  formatQuantity,
  validInventoryDate,
  safeImageUrl,
  arrayBufferToBase64,
  formatImportedAt,
} from "../src/inventory-ui.mjs";

test("inventory thumbnails render approved images without leaking page referrers and label missing images", async () => {
  const result = await build({
    entryPoints: [
      new URL(
        "../src/components/InventoryThumbnail.jsx",
        import.meta.url,
      ).pathname.replace(/^\/(?=[A-Za-z]:)/, ""),
    ],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    external: ["react", "react-dom"],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  const Thumbnail = module.exports.default;
  const render = (imageUrl) =>
    renderToStaticMarkup(
      React.createElement(Thumbnail, {
        item: { sku: "DEMO-01", name: "合成商品", imageUrl },
      }),
    );
  const valid = render("https://img.alicdn.com/synthetic-product.jpg");
  assert.match(valid, /<img\b/);
  assert.match(valid, /alt="合成商品"/);
  assert.match(valid, /loading="lazy"/);
  assert.match(valid, /referrerPolicy="no-referrer"/i);
  assert.match(valid, /width="52"/);
  assert.match(valid, /height="52"/);
  for (const url of [
    null,
    "javascript:alert(1)",
    "https://unknown.test/photo.png",
    "https://user:password@img.alicdn.com/photo.png",
  ]) {
    const empty = render(url);
    assert.doesNotMatch(empty, /<img\b/);
    assert.match(empty, /暂无图片/);
  }
});

test("missing quantities stay distinct from genuine zero and negative days", () => {
  assert.equal(formatQuantity(null), "未提供");
  assert.equal(formatQuantity(undefined), "未提供");
  assert.equal(formatQuantity(0), "0");
  assert.equal(formatQuantity(-1.5), "-1.5");
  assert.equal(formatQuantity("001230"), "001230");
  assert.equal(formatQuantity("合成商品"), "合成商品");
});

test("SQLite UTC import timestamps display in Shanghai time", () => {
  assert.match(formatImportedAt("2025-01-01 00:00:00"), /2025.*1.*1.*08:00:00/);
  assert.equal(
    formatImportedAt("2025-01-01 00:00:00"),
    formatImportedAt("2025-01-01T00:00:00Z"),
  );
  assert.equal(formatImportedAt(null), "未提供");
});

test("an unselected snapshot is omitted from the query", () => {
  const params = new URLSearchParams(
    inventoryQuery({
      snapshotId: "",
      search: " 合成 ",
      status: "all",
      page: 1,
    }).slice(1),
  );
  assert.equal(params.has("snapshotId"), false);
  assert.equal(params.get("search"), "合成");
  assert.equal(params.get("page"), "1");
  assert.equal(
    new URLSearchParams(inventoryQuery({ snapshotId: "batch" }).slice(1)).get(
      "snapshotId",
    ),
    "batch",
  );
});

test("snapshot dates reject rollover and honor supported calendar range", () => {
  assert.equal(validInventoryDate("2024-02-29"), true);
  for (const value of [
    "2025-02-29",
    "2024-13-01",
    "2024-1-01",
    "",
    "1999-12-31",
    "2101-01-01",
  ]) {
    assert.equal(validInventoryDate(value), false, value);
  }
});

test("image links accept only explicit web URLs", () => {
  assert.equal(
    safeImageUrl("https://example.test/product.png"),
    "https://example.test/product.png",
  );
  for (const value of [
    "javascript:alert(1)",
    "data:image/png;base64,AA",
    "/local.png",
    "",
    null,
    "ftp://example.test/file",
    "https://user:secret@example.test/file",
  ]) {
    assert.equal(safeImageUrl(value), null);
  }
});

test("base64 conversion handles workbook-sized arrays without argument overflow", () => {
  const bytes = Uint8Array.from(
    { length: 1024 * 256 + 3 },
    (_, index) => index % 256,
  );
  assert.equal(
    arrayBufferToBase64(bytes.buffer),
    Buffer.from(bytes).toString("base64"),
  );
});

test("inventory entry renders read access for everyone and import action only for admins", async () => {
  const result = await build({
    entryPoints: [
      new URL("../src/pages/Inventory.jsx", import.meta.url).pathname.replace(
        /^\/(?=[A-Za-z]:)/,
        "",
      ),
    ],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    external: ["react", "react-dom"],
    loader: { ".css": "empty" },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  const Inventory = module.exports.default;
  const viewer = renderToStaticMarkup(
    React.createElement(Inventory, { user: { role: "viewer" } }),
  );
  const admin = renderToStaticMarkup(
    React.createElement(Inventory, { user: { role: "admin" } }),
  );
  assert.match(viewer, /库存经营/);
  assert.match(viewer, /只读查看/);
  assert.doesNotMatch(viewer, /导入库存快照/);
  assert.match(admin, /导入库存快照/);
  assert.doesNotMatch(admin, /<img\b/);
});
