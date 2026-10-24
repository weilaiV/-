import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { openDatabase } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { inventoryFields } from "../src/inventory-schema.mjs";
import { zipSync, strToU8 } from "fflate";

import {
  ensureInventorySchema,
  importInventorySnapshot,
  inventorySnapshots,
  queryInventory,
} from "../server/inventory-db.mjs";

function item(sku, values = {}) {
  return {
    rowNumber: 2,
    imageUrl: null,
    styleCode: "款A",
    sku,
    name: "合成商品",
    variant: "规格蓝",
    color: "蓝",
    spec: "小号",
    tagText: "",
    tags: [],
    stock: 10,
    daysCover: null,
    procurementFlag: null,
    suggestedPurchase: null,
    minStock: null,
    maxStock: null,
    minDays: null,
    maxDays: null,
    pendingShip: null,
    returnStock: null,
    transferInTransit: null,
    returnInTransit: null,
    virtualStock: null,
    syncStatus: null,
    sales1: null,
    sales7: null,
    sales15: null,
    returns1: null,
    returns7: null,
    returns15: null,
    updatedAt: null,
    preorder3: null,
    preorder5: null,
    preorder7: null,
    preorder10: null,
    preorder15: null,
    preorder20: null,
    preorder25: null,
    preorder30: null,
    preorder45: null,
    ...values,
  };
}
function parsed(items, source = "synthetic-1", values = {}) {
  return {
    items,
    warnings: ["合成提示"],
    filename: "合成库存.xlsx",
    sheetName: "库存",
    asOfDate: "2026-10-24",
    rowCount: items.length,
    sourceHash: createHash("sha256").update(source).digest("hex"),
    ...values,
  };
}
function database(t) {
  assert.equal(
    typeof ensureInventorySchema,
    "function",
    "inventory schema export must be implemented",
  );
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  db.prepare(
    "INSERT INTO users(id,username,name,password_hash,role) VALUES(1,'synthetic','合成管理员','unused','admin')",
  ).run();
  ensureInventorySchema(db);
  return db;
}
const status = (code) => (error) => error.status === code;

test("image policy allows inventory CDN images and keeps scripts and connections same-origin", async (t) => {
  const app = createApp({ databasePath: ":memory:" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
  });
  const response = await fetch(
    `http://127.0.0.1:${app.server.address().port}/api/auth/status`,
  );
  const policy = response.headers.get("content-security-policy");
  const imagePolicy = policy
    .split(";")
    .find((part) => part.trim().startsWith("img-src "));
  for (const origin of [
    "https://img.alicdn.com",
    "https://cbu01.alicdn.com",
    "https://img.pddpic.com",
    "https://images.sursung.com",
    "https://images-erp.sursung.com",
  ])
    assert.ok(imagePolicy.split(/\s+/).includes(origin));
  assert.match(policy, /script-src 'self';/);
  assert.match(policy, /connect-src 'self';/);
  assert.doesNotMatch(imagePolicy, /https:;|\*/);
});

test("inventory migration adds tables without changing existing business or user data", (t) => {
  const db = database(t);
  db.prepare(
    "INSERT INTO imports(filename,count,user_id) VALUES('synthetic.csv',1,1)",
  ).run();
  ensureInventorySchema(db);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM imports").get().n, 1);
  const empty = queryInventory(db, {});
  assert.equal(empty.snapshot, null);
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.snapshots, []);
  assert.equal(empty.summary.skuCount, 0);
  assert.equal(empty.summary.stockTotal, 0);
});

test("imports preserve complete nullable source rows and each snapshot is isolated", (t) => {
  const db = database(t);
  const original = item("00001", { preorder45: 3, sales7: 0, daysCover: 1.25 });
  const first = importInventorySnapshot(
    db,
    parsed([original], "one", { filename: "C:\\private\\合成.xlsx" }),
    1,
  );
  assert.equal(first.rowCount, 1);
  assert.equal(first.filename, "合成.xlsx");
  assert.match(first.sourceHash, /^[a-f0-9]{64}$/);
  const second = importInventorySnapshot(
    db,
    parsed([item("00001", { stock: 40 })], "two"),
    1,
  );
  const latest = queryInventory(db, {});
  assert.equal(latest.snapshot.id, second.id);
  assert.equal(latest.summary.stockTotal, 40);
  const old = queryInventory(
    db,
    new URLSearchParams({ snapshotId: String(first.id) }),
  );
  assert.equal(old.summary.stockTotal, 10);
  assert.ok(Number.isSafeInteger(old.items[0].id));
  const { id, flags, ...stored } = old.items[0];
  assert.deepEqual(stored, original);
  assert.deepEqual(
    inventorySnapshots(db).map((row) => row.id),
    [second.id, first.id],
  );
  assert.equal(JSON.stringify(old).includes("private"), false);
});

test("duplicate files, duplicate SKU and database insertion failures roll back the entire batch", (t) => {
  const db = database(t);
  const first = parsed([item("A")]);
  importInventorySnapshot(db, first, 1);
  assert.throws(
    () =>
      importInventorySnapshot(db, { ...first, filename: "renamed.xlsx" }, 1),
    status(409),
  );
  assert.throws(
    () =>
      importInventorySnapshot(
        db,
        parsed([item("B"), item("B")], "duplicated-sku"),
        1,
      ),
    status(409),
  );
  db.exec(
    "CREATE TRIGGER inventory_test_abort BEFORE INSERT ON inventory_items WHEN NEW.sku='FAIL' BEGIN SELECT RAISE(ABORT,'synthetic insertion failure'); END",
  );
  assert.throws(
    () =>
      importInventorySnapshot(
        db,
        parsed([item("B"), item("FAIL")], "atomic"),
        1,
      ),
    /synthetic insertion failure/,
  );
  assert.equal(inventorySnapshots(db).length, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM inventory_items").get().n, 1);
});

test("filter summaries and top styles follow all matches while options and overall summary use the full snapshot", (t) => {
  const db = database(t);
  importInventorySnapshot(
    db,
    parsed([
      item("00001", {
        stock: 2,
        minStock: 4,
        styleCode: "款A",
        name: "针织 & 蓝",
        tags: ["清货"],
        tagText: "清货",
        sales7: 1,
      }),
      item("00002", { stock: 8, styleCode: "款B", sales7: null }),
      item("00003", { stock: 5, minStock: 6, styleCode: "款A", sales7: 2 }),
    ]),
    1,
  );
  const result = queryInventory(
    db,
    new URLSearchParams(
      "style=" + encodeURIComponent("款A") + "&status=below-min",
    ),
  );
  assert.equal(result.total, 2);
  assert.equal(result.summary.stockTotal, 7);
  assert.equal(result.summary.sales7.value, 3);
  assert.equal(result.overallSummary.stockTotal, 15);
  assert.deepEqual(result.options.styles, ["款A", "款B"]);
  assert.deepEqual(result.options.tags, ["清货"]);
  assert.deepEqual(result.topStyles, [
    { name: "款A", skuCount: 2, stockTotal: 7 },
  ]);
  assert.equal(queryInventory(db, { search: "针织 & 蓝" }).total, 1);
  assert.equal(queryInventory(db, { search: "规格蓝" }).total, 3);
  assert.equal(queryInventory(db, { search: "00001" }).items[0].sku, "00001");
  assert.equal(queryInventory(db, { tag: "清货" }).total, 1);
  assert.equal(queryInventory(db, { status: "missing-sales" }).total, 1);
  assert.equal(queryInventory(db, { search: "%' OR 1=1 --" }).total, 0);
});

test("pagination and sort use the full filtered set and keep null last in both directions", (t) => {
  const db = database(t);
  const rows = Array.from({ length: 34 }, (_, i) =>
    item(String(i).padStart(5, "0"), { stock: i, sales7: i === 0 ? null : i }),
  );
  importInventorySnapshot(db, parsed(rows), 1);
  const page = queryInventory(db, {
    page: "2",
    sort: "stock",
    direction: "asc",
  });
  assert.equal(page.total, 34);
  assert.equal(page.pageSize, 30);
  assert.equal(page.items.length, 4);
  assert.equal(page.items[0].stock, 30);
  assert.equal(page.summary.stockTotal, 561);
  for (const direction of ["asc", "desc"]) {
    const last = queryInventory(db, {
      sort: "sales7",
      direction,
      page: "2",
    }).items.at(-1);
    assert.equal(last.sales7, null);
  }
  assert.equal(queryInventory(db, { page: "3" }).items.length, 0);
});

test("query validation rejects malformed IDs, duplicate params and unrecognized filters or sort expressions", (t) => {
  const db = database(t);
  importInventorySnapshot(db, parsed([item("A")]), 1);
  for (const params of [
    { snapshotId: "0" },
    { snapshotId: "1x" },
    { snapshotId: "1.0" },
    { snapshotId: "-1" },
    { snapshotId: "9007199254740993" },
    { page: "1foo" },
    { page: "0" },
    { page: "1e2" },
    { pageSize: "100" },
    { sort: "stock DESC; DROP TABLE users" },
    { direction: "sideways" },
    { status: "available" },
    { search: "\u0000" },
    { style: "a".repeat(201) },
    new URLSearchParams("page=1&page=2"),
  ])
    assert.throws(() => queryInventory(db, params), status(400));
  assert.throws(() => queryInventory(db, { snapshotId: "99" }), status(404));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get().n, 1);
});

test("source statuses and multi-flag anomalies share the domain rules", (t) => {
  const db = database(t);
  importInventorySnapshot(
    db,
    parsed([
      item("A", {
        stock: -1,
        daysCover: -2,
        minStock: 9,
        maxStock: 3,
        tags: ["滞销", "下架"],
        suggestedPurchase: 5,
      }),
      item("B", { stock: 20, maxStock: 10, tags: ["清货"] }),
      item("C", { stock: 0, minStock: null, maxStock: 0, sales7: 0 }),
    ]),
    1,
  );
  assert.equal(queryInventory(db, { status: "anomaly" }).total, 1);
  assert.equal(queryInventory(db, { status: "suggested" }).total, 1);
  assert.equal(queryInventory(db, { status: "above-max" }).total, 1);
  assert.equal(queryInventory(db, { status: "below-min" }).total, 0);
  for (const status of ["source-slow", "source-clearance", "source-delisted"])
    assert.equal(queryInventory(db, { status }).total, 1);
  const summary = queryInventory(db, {}).summary;
  assert.equal(summary.anomalyCount, 1);
  assert.equal(summary.suggestedPurchase.value, 5);
  assert.equal(summary.missingSalesCount, 2);
});

test("updatedAt sorting uses normalized times and keeps unrecognized source text last", (t) => {
  const db = database(t);
  importInventorySnapshot(
    db,
    parsed([
      item("A", {
        updatedAt: "2026/2/1 9:00",
        updatedAtKey: "2026-02-01 09:00:00",
      }),
      item("B", {
        updatedAt: "2026/10/1 9:00",
        updatedAtKey: "2026-10-01 09:00:00",
      }),
      item("C", { updatedAt: "未知", updatedAtKey: null }),
    ]),
    1,
  );
  assert.deepEqual(
    queryInventory(db, { sort: "updatedAt", direction: "desc" }).items.map(
      (row) => row.sku,
    ),
    ["B", "A", "C"],
  );
  assert.deepEqual(
    queryInventory(db, { sort: "updatedAt", direction: "asc" }).items.map(
      (row) => row.sku,
    ),
    ["A", "B", "C"],
  );
});

test("imports enforce the 50000 item cap before writing a batch", (t) => {
  const db = database(t);
  assert.throws(
    () =>
      importInventorySnapshot(
        db,
        parsed(Array.from({ length: 50001 }, (_, i) => item(String(i)))),
        1,
      ),
    status(400),
  );
  assert.equal(inventorySnapshots(db).length, 0);
});

function workbook(rows) {
  const escape = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const column = (index) =>
    index < 26
      ? String.fromCharCode(65 + index)
      : "A" + String.fromCharCode(65 + index - 26);
  const matrix = [
    inventoryFields.map((field) => field.label),
    ...rows.map((row) => inventoryFields.map(({ key }) => row[key] ?? null)),
  ];
  const data = matrix
    .map(
      (row, index) =>
        `<row r="${index + 1}">${row.map((value, c) => (value === null ? "" : typeof value === "number" ? `<c r="${column(c)}${index + 1}"><v>${value}</v></c>` : `<c r="${column(c)}${index + 1}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`)).join("")}</row>`,
    )
    .join("");
  const files = {
    "[Content_Types].xml":
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="合成库存" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1"/><sheetData>${data}</sheetData></worksheet>`,
  };
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([key, value]) => [key, strToU8(value)]),
      ),
    ),
  ).toString("base64");
}

test("inventory HTTP requires login/admin and trusted Origin and verifies the preview file hash", async (t) => {
  const app = createApp({ databasePath: ":memory:" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
  });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  let cookie = "";
  const call = async (path, body, headers = {}) => {
    const response = await fetch(origin + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  };
  assert.equal((await call("/inventory")).status, 401);
  cookie = (
    await call("/auth/setup", {
      username: "owner",
      password: "Synthetic-password-123",
    })
  ).cookie;
  const empty = await call("/inventory");
  assert.equal(empty.status, 200);
  assert.equal(empty.body.snapshot, null);
  const upload = {
    filename: "合成测试.xlsx",
    asOfDate: "2026-10-24",
    base64: workbook([item("00001", { stock: 10, sales7: 0 })]),
  };
  const preview = await call("/inventory/import/preview", upload);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.rowCount, 1);
  assert.equal(preview.body.sample[0].sku, "00001");
  assert.equal(preview.body.sample[0].daysCover, null);
  assert.match(preview.body.sourceHash, /^[a-f0-9]{64}$/);
  assert.equal((await call("/inventory/import", upload)).status, 400);
  assert.equal(
    (
      await call("/inventory/import", {
        ...upload,
        expectedHash: "0".repeat(64),
      })
    ).status,
    400,
  );
  const confirmation = { ...upload, expectedHash: preview.body.sourceHash };
  assert.equal(
    (
      await call("/inventory/import", confirmation, {
        origin: "https://untrusted.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("/inventory/import/preview", upload, { origin: "" })).status,
    403,
  );
  const imported = await call("/inventory/import", confirmation);
  assert.equal(imported.status, 201);
  assert.equal(imported.body.snapshot.sourceHash, preview.body.sourceHash);
  assert.equal((await call("/inventory/import", confirmation)).status, 409);
  assert.equal((await call("/inventory?snapshotId=1x")).status, 400);
  assert.equal((await call("/inventory?snapshotId=999")).status, 404);
  assert.equal(
    (
      await call("/inventory/import/preview", {
        ...upload,
        base64: "not base64",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/inventory/import/preview", {
        ...upload,
        filename: "合成.xls",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/inventory/import/preview", {
        ...upload,
        base64: Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64"),
      })
    ).status,
    413,
  );
  await call("/users", {
    username: "reader",
    password: "Synthetic-reader-123",
    role: "viewer",
  });
  cookie = (
    await call("/auth/login", {
      username: "reader",
      password: "Synthetic-reader-123",
    })
  ).cookie;
  assert.equal((await call("/inventory")).status, 200);
  assert.equal((await call("/inventory/import/preview", upload)).status, 403);
  assert.equal((await call("/inventory/import", confirmation)).status, 403);
});
