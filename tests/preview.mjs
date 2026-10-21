// Disposable browser-QA fixture. No disk database or real credentials.
import { createApp } from "../server/app.mjs";
import { hashPassword } from "../server/security.mjs";
import { insertBatch } from "../server/db.mjs";
import { demoRows } from "../server/domain.mjs";
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
