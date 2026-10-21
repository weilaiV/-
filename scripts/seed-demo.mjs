import { openDatabase, insertBatch } from "../server/db.mjs";
import { demoRows } from "../server/domain.mjs";
const db = openDatabase(process.env.DATABASE_PATH || "./data/keran.sqlite");
try {
  if (db.prepare("SELECT 1 FROM records LIMIT 1").get())
    throw new Error("数据库非空，不会混入演示数据");
  const admin = db
    .prepare("SELECT id FROM users WHERE role='admin' LIMIT 1")
    .get();
  if (!admin) throw new Error("请先通过网页建立管理员账号");
  const batch = insertBatch(db, demoRows(), "系统合成演示数据", admin.id, true);
  console.log(`已生成 ${batch.count} 行合成演示数据，不是实际经营数据。`);
} finally {
  db.close();
}
