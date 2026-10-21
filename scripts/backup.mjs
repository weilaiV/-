import { DatabaseSync, backup } from "node:sqlite";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
const source = process.env.DATABASE_PATH || "./data/keran.sqlite";
const db = new DatabaseSync(source, { readOnly: true });
const directory = resolve(process.argv[2] || "./data/backups");
mkdirSync(directory, { recursive: true });
const destination = resolve(
  directory,
  `keran-${new Date().toISOString().replaceAll(":", "-")}.sqlite`,
);
try {
  await backup(db, destination);
  console.log("一致性备份已保存：" + destination);
} finally {
  db.close();
}
