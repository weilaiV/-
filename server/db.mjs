import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AppError } from "./domain.mjs";
export function openDatabase(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','viewer')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS user_preferences(user_id INTEGER PRIMARY KEY REFERENCES users(id),json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS imports(id INTEGER PRIMARY KEY,filename TEXT NOT NULL,count INTEGER NOT NULL,user_id INTEGER REFERENCES users(id),is_demo INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS records(id INTEGER PRIMARY KEY,date TEXT NOT NULL,channel TEXT NOT NULL,shop TEXT NOT NULL,product TEXT NOT NULL,sales INTEGER NOT NULL,refunds INTEGER NOT NULL,cost INTEGER NOT NULL,ads INTEGER NOT NULL,platform INTEGER NOT NULL,shipping INTEGER NOT NULL,import_id INTEGER NOT NULL REFERENCES imports(id),UNIQUE(date,channel,shop,product));
    CREATE INDEX IF NOT EXISTS records_date_channel ON records(date,channel);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
  const recordColumns = new Set(
    db
      .prepare("PRAGMA table_info(records)")
      .all()
      .map((column) => column.name),
  );
  for (const name of ["refund_only", "return_refunds", "rewards"])
    if (!recordColumns.has(name))
      db.exec(`ALTER TABLE records ADD COLUMN ${name} INTEGER NULL`);
  return db;
}
export function insertBatch(db, rows, filename, userId, isDemo = false) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db
      .prepare(
        "INSERT INTO imports(filename,count,user_id,is_demo) VALUES (?,?,?,?)",
      )
      .run(filename, rows.length, userId, Number(isDemo));
    const insert = db.prepare(
      "INSERT INTO records(date,channel,shop,product,sales,refunds,cost,ads,platform,shipping,refund_only,return_refunds,rewards,import_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    );
    for (const row of rows)
      insert.run(
        row.date,
        row.channel,
        row.shop,
        row.product,
        row.sales,
        row.refunds,
        row.cost,
        row.ads,
        row.platform,
        row.shipping,
        row.refundOnly ?? null,
        row.returnRefunds ?? null,
        row.rewards ?? null,
        result.lastInsertRowid,
      );
    db.exec("COMMIT");
    return { id: Number(result.lastInsertRowid), count: rows.length };
  } catch (error) {
    db.exec("ROLLBACK");
    if (error.message.includes("UNIQUE constraint"))
      throw new AppError(
        "数据库已有相同日期、渠道、店铺和商品；整批未导入，请核对重复数据",
        409,
      );
    throw error;
  }
}
