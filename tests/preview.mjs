// Disposable browser-QA fixture. No disk database or real credentials.
import { createApp } from "../server/app.mjs";
import { hashPassword } from "../server/security.mjs";
import { insertBatch } from "../server/db.mjs";
import { demoRows } from "../server/domain.mjs";
import { parseInventoryWorkbook } from "../server/inventory-xlsx.mjs";
import { importInventorySnapshot } from "../server/inventory-db.mjs";
import {
  normalizeInventoryRows,
  summarizeInventory,
} from "../server/inventory-domain.mjs";
import { inventoryFields, inventoryHeaders } from "../src/inventory-schema.mjs";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { businessDate } from "../server/domain.mjs";
const app = createApp({ databasePath: ":memory:" });
const hash = await hashPassword("Preview-only-2026");
const result = app.db
  .prepare(
    "INSERT INTO users(username,name,password_hash,role) VALUES (?,?,?,?)",
  )
  .run("preview", "预览管理员", hash, "admin");
insertBatch(
  app.db,
  demoRows(),
  "系统合成演示数据",
  Number(result.lastInsertRowid),
  true,
);
if (process.env.INVENTORY_PREVIEW_FILE) {
  const parsed = await parseInventoryWorkbook(
    readFileSync(process.env.INVENTORY_PREVIEW_FILE),
    {
      filename: basename(process.env.INVENTORY_PREVIEW_FILE),
      asOfDate: businessDate(),
    },
  );
  importInventorySnapshot(app.db, parsed, Number(result.lastInsertRowid));
} else {
  const fixtures = [
    {
      styleCode: "DEMO-A",
      sku: "DEMO-001",
      name: "演示标签纸",
      stock: 120,
      minStock: 20,
      maxStock: 100,
      sales7: 10,
      pendingShip: 2,
      daysCover: 84,
      tagText: "演示,清货",
      suggestedPurchase: 0,
    },
    {
      styleCode: "DEMO-A",
      sku: "DEMO-002",
      name: "演示碳带",
      stock: 5,
      minStock: 20,
      maxStock: 80,
      sales7: 14,
      pendingShip: 1,
      daysCover: 2.5,
      suggestedPurchase: 15,
    },
    {
      styleCode: "DEMO-B",
      sku: "DEMO-003",
      name: "演示扫描器",
      stock: 15,
      minStock: null,
      maxStock: null,
      sales7: null,
      pendingShip: 0,
      daysCover: null,
      tagText: "演示,滞销",
      suggestedPurchase: null,
    },
    {
      styleCode: "DEMO-C",
      sku: "DEMO-004",
      name: "演示配件",
      stock: 30,
      minStock: 10,
      maxStock: 40,
      sales7: 0,
      pendingShip: 0,
      daysCover: -0.3,
      tagText: "演示,下架",
      suggestedPurchase: 0,
    },
  ];
  const { items, warnings } = normalizeInventoryRows([
    inventoryHeaders,
    ...fixtures.map((item) =>
      inventoryFields.map((field) => item[field.key] ?? null),
    ),
  ]);
  importInventorySnapshot(
    app.db,
    {
      items,
      warnings,
      rowCount: items.length,
      summary: summarizeInventory(items),
      filename: "合成库存演示.xlsx",
      sheetName: "库存演示",
      asOfDate: businessDate(),
      sourceHash: createHash("sha256")
        .update(JSON.stringify(items))
        .digest("hex"),
    },
    Number(result.lastInsertRowid),
  );
}
app.server.listen(3002, "127.0.0.1", () =>
  console.log(
    "Disposable preview http://127.0.0.1:3002 · preview / Preview-only-2026",
  ),
);
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () =>
    app.server.close(() => {
      app.close();
      process.exit(0);
    }),
  );
