import { DatabaseSync, backup } from "node:sqlite";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { openDatabase } from "../server/db.mjs";
import { businessDate } from "../server/domain.mjs";
import { parseInventoryWorkbook } from "../server/inventory-xlsx.mjs";
import {
  importInventorySnapshot,
  queryInventory,
} from "../server/inventory-db.mjs";

const file = process.argv[2];
if (!file)
  throw new Error(
    "用法：node scripts/import-inventory.mjs <库存.xlsx路径> [快照日期YYYY-MM-DD]",
  );
const databasePath = resolve(
  process.env.DATABASE_PATH || "./data/keran.sqlite",
);
if (!existsSync(databasePath))
  throw new Error("本地数据库不存在，请先启动网站并创建管理员账号");
const parsed = await parseInventoryWorkbook(readFileSync(resolve(file)), {
  filename: basename(file),
  asOfDate: process.argv[3] || businessDate(),
});
const source = new DatabaseSync(databasePath, { readOnly: true });
let admin, before, destination;
const tables = [
  "users",
  "records",
  "imports",
  "finance_expenses",
  "finance_rules",
];
const counts = (db) =>
  Object.fromEntries(
    tables
      .filter((table) =>
        db
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
          .get(table),
      )
      .map((table) => [
        table,
        Number(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n),
      ]),
  );
try {
  admin = source
    .prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1")
    .get();
  if (!admin) throw new Error("没有现有管理员账号，不会自动创建账号");
  if (
    source
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='inventory_snapshots'",
      )
      .get() &&
    source
      .prepare("SELECT 1 FROM inventory_snapshots WHERE source_hash=?")
      .get(parsed.sourceHash)
  )
    throw new Error("该文件已导入，未重复保存");
  before = counts(source);
  const directory = join(dirname(databasePath), "backups");
  mkdirSync(directory, { recursive: true });
  destination = join(
    directory,
    "before-inventory-" +
      new Date().toISOString().replaceAll(":", "-") +
      ".sqlite",
  );
  await backup(source, destination);
} finally {
  source.close();
}
const db = openDatabase(databasePath);
try {
  const snapshot = importInventorySnapshot(db, parsed, Number(admin.id));
  const saved = queryInventory(db, { snapshotId: String(snapshot.id) });
  if (
    saved.total !== parsed.rowCount ||
    saved.overallSummary.stockTotal !== parsed.summary.stockTotal
  )
    throw new Error("导入后校对不一致，请检查数据库和备份");
  const after = counts(db);
  if (Object.keys(before).some((table) => before[table] !== after[table]))
    throw new Error("原有业务记录数发生变化，请核对备份");
  console.log(
    JSON.stringify(
      {
        snapshot,
        summary: saved.overallSummary,
        backup: destination,
        originalBusinessCountsPreserved: true,
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
