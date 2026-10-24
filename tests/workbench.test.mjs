import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, insertBatch } from "../server/db.mjs";
import { parseCsv, summarize, demoRows } from "../server/domain.mjs";
import { createApp } from "../server/app.mjs";

const headers = "日期,渠道,店铺,商品,销售额,退款额,产品成本,广告费,平台费,运费";
const legacyCsv = headers + "\n2026-10-01,天猫,测试店,产品A,100.10,10,40,5,3,2";
const fullCsv =
  headers +
  ",仅退款,退货退款,奖励\n2026-10-01,天猫,测试店,产品A,100.10,10,40,5,3,2,3.25,6.75,1.23";

test("legacy CSV keeps unknown cost details null instead of inventing zero", () => {
  const [row] = parseCsv(legacyCsv);
  for (const key of ["refundOnly", "returnRefunds", "rewards"]) {
    assert.equal(row[key], null);
    assert.equal(summarize([row])[key], null);
    assert.equal(summarize([])[key], null);
  }
  assert.equal(summarize([row]).netProfit, 4010);
});

test("optional CSV details calculate exact cents and require a matching refund pair", () => {
  const [row] = parseCsv(fullCsv);
  assert.equal(row.refundOnly, 325);
  assert.equal(row.returnRefunds, 675);
  assert.equal(row.rewards, 123);
  const complete = summarize([row]);
  assert.equal(complete.netProfit, 4133);
  assert.equal(complete.rewards, 123);
  const mixed = summarize([row, ...parseCsv(legacyCsv)]);
  assert.equal(mixed.rewards, null);
  assert.equal(mixed.netProfit, 8143);
  assert.deepEqual(mixed.fieldCoverage.rewards, { provided: 1, total: 2 });
  for (const csv of [
    fullCsv.replace("3.25,6.75", "3.25,6.74"),
    fullCsv.replace("3.25,6.75", "3.25,"),
    fullCsv.replace("仅退款,退货退款,奖励", "仅退款,其他,奖励"),
    fullCsv.replace("奖励", "奖励,奖励").replace("1.23", "1.23,1.23"),
    headers + ",仅退款\n2026-10-01,天猫,测试店,产品A,100,10,40,5,3,2,10",
    fullCsv.replace("1.23", "-1"),
    fullCsv.replace("1.23", "1.001"),
    fullCsv.replace("1.23", "=1+1"),
  ])
    assert.throws(() => parseCsv(csv));
  const rewardsOnly =
    headers + ",奖励\n2026-10-01,天猫,测试店,产品A,100,10,40,5,3,2,0";
  assert.equal(parseCsv(rewardsOnly)[0].rewards, 0);
  const blankDetails = fullCsv.replace("3.25,6.75,1.23", ",,");
  assert.equal(parseCsv(blankDetails)[0].refundOnly, null);
});

test("demo details form a complete, synthetic refund split and reward contribution", () => {
  const rows = demoRows();
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.refundOnly + row.returnRefunds, row.refunds);
    assert.ok(Number.isSafeInteger(row.rewards) && row.rewards >= 0);
  }
  const result = summarize(rows);
  assert.equal(
    result.netProfit,
    result.netSales -
      result.cost -
      result.ads -
      result.platform -
      result.shipping +
      result.rewards,
  );
});

test("old SQLite schema migrates without changing records and inserts remain atomic", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keran-migration-"));
  const path = join(dir, "old.sqlite");
  let db;
  t.after(() => {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const old = new DatabaseSync(path);
  old.exec(
    "CREATE TABLE records(id INTEGER PRIMARY KEY,date TEXT NOT NULL,channel TEXT NOT NULL,shop TEXT NOT NULL,product TEXT NOT NULL,sales INTEGER NOT NULL,refunds INTEGER NOT NULL,cost INTEGER NOT NULL,ads INTEGER NOT NULL,platform INTEGER NOT NULL,shipping INTEGER NOT NULL,import_id INTEGER NOT NULL,UNIQUE(date,channel,shop,product)); INSERT INTO records VALUES(1,'2026-09-30','天猫','旧店','旧商品',100,10,30,2,3,4,1)",
  );
  old.close();
  db = openDatabase(path);
  const migrated = db.prepare("SELECT * FROM records").get();
  assert.equal(migrated.sales, 100);
  for (const key of ["refund_only", "return_refunds", "rewards"])
    assert.equal(migrated[key], null);
  insertBatch(db, parseCsv(fullCsv), "full.csv", null);
  assert.equal(
    db.prepare("SELECT rewards FROM records WHERE id=2").get().rewards,
    123,
  );
  assert.throws(
    () =>
      insertBatch(
        db,
        [{ ...parseCsv(fullCsv)[0], date: "2026-10-02" }, parseCsv(fullCsv)[0]],
        "duplicate.csv",
        null,
      ),
    /整批未导入/,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM records").get().n, 2);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM imports").get().n, 1);
});

async function api(t) {
  const app = createApp({ databasePath: ":memory:" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
  });
  let cookie = "";
  async function call(path, body, useCookie = cookie) {
    const response = await fetch(origin + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        cookie: useCookie,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  cookie = (
    await call("/auth/setup", {
      username: "owner",
      password: "Test-password-123",
    })
  ).cookie;
  return { app, call, cookie };
}

test("overview compares equal periods, exposes global bounds and generates only factual shop alerts", async (t) => {
  const { call } = await api(t);
  const csv =
    headers +
    ",仅退款,退货退款,奖励\n" +
    [
      "2026-09-29,天猫,下降店,产品A,100,10,40,5,3,2,3,7,0",
      "2026-09-30,天猫,下降店,产品A,100,10,40,5,3,2,3,7,0",
      "2026-10-01,天猫,下降店,产品A,80,16,40,5,3,2,6,10,0",
      "2026-10-02,天猫,下降店,产品A,80,16,40,5,3,2,6,10,0",
      "2026-09-29,京东,健康店,产品B,100,10,40,5,3,2,3,7,0",
      "2026-10-01,京东,健康店,产品B,120,6,40,5,3,2,2,4,0",
      "2026-10-01,天猫,新店,产品C,50,0,10,1,1,1,0,0,0",
      "2026-09-01,线下,历史店,历史商品,10,0,1,0,0,0,0,0,0",
    ].join("\n");
  assert.equal((await call("/imports", { csv })).status, 201);
  const data = (
    await call("/overview?start=2026-10-01&end=2026-10-02&channel=天猫")
  ).body;
  assert.deepEqual(data.dataBounds, { start: "2026-09-01", end: "2026-10-02" });
  assert.deepEqual(data.range.previous, {
    start: "2026-09-29",
    end: "2026-09-30",
  });
  for (const collection of [data.channels, data.shops, data.products]) {
    assert.ok(collection.every((row) => row.previous && "change" in row));
  }
  const shop = data.shops.find((row) => row.name === "下降店");
  assert.equal(shop.previous.netSales, 18000);
  assert.ok(Math.abs(shop.change - ((12800 - 18000) / 18000) * 100) < 1e-10);
  assert.equal(data.shops.find((row) => row.name === "新店").change, null);
  assert.equal(data.alerts.length, 1);
  const alert = data.alerts[0];
  assert.equal(alert.shop, "下降店");
  assert.equal(alert.channel, "天猫");
  assert.equal(alert.current.netSales, 12800);
  assert.equal(alert.previous.netSales, 18000);
  assert.equal(alert.reasons.length, 3);
  assert.equal(new Set(alert.reasons).size, 3);
  assert.ok(["attention", "severe"].includes(alert.severity));
  assert.deepEqual(
    (await call("/overview?start=2026-10-01&end=2026-10-02&channel=京东")).body
      .alerts,
    [],
  );
  assert.deepEqual(
    (await call("/overview?start=2001-01-01&end=2001-01-02")).body.alerts,
    [],
  );
});

test("refund rounding below the displayed precision does not create an alert", async (t) => {
  const { call } = await api(t);
  const csv =
    "日期,渠道,店铺,商品,销售额,退款额,产品成本,广告费,平台费,运费\n2026-09-30,天猫,平稳店,产品,1000,46,0,0,0,0\n2026-10-01,天猫,平稳店,产品,1000.01,46.01,0,0,0,0";
  assert.equal((await call("/imports", { csv })).status, 201);
  assert.deepEqual(
    (await call("/overview?start=2026-10-01&end=2026-10-01")).body.alerts,
    [],
  );
});

test("records exact shop and product filters compose with channel and text search", async (t) => {
  const { call } = await api(t);
  const csv =
    legacyCsv +
    "\n2026-10-01,天猫,测试店二,产品A,10,0,1,0,0,0\n2026-10-01,天猫,测试店,产品AB,10,0,1,0,0,0";
  assert.equal((await call("/imports", { csv })).status, 201);
  const query =
    "/records?start=2026-10-01&end=2026-10-02&shop=" +
    encodeURIComponent("测试店") +
    "&product=" +
    encodeURIComponent("产品A");
  const data = (await call(query)).body;
  assert.equal(data.total, 1);
  assert.equal(data.records[0].product, "产品A");
  assert.equal((await call(query + "&search=missing")).body.total, 0);
  assert.equal(
    (await call(query + "&channel=" + encodeURIComponent("京东"))).body.total,
    0,
  );
});

test("preferences persist per user, allow viewers and reject unknown shapes", async (t) => {
  const { call, cookie } = await api(t);
  assert.equal((await call("/preferences", undefined, "")).status, 401);
  const defaults = (await call("/preferences")).body;
  assert.equal(defaults.visiblePanels.length, 12);
  assert.equal(
    (await call("/preferences", { visiblePanels: ["metrics", "trend"] }))
      .status,
    200,
  );
  assert.deepEqual((await call("/preferences")).body, {
    visiblePanels: ["metrics", "trend"],
  });
  for (const body of [
    {},
    { visiblePanels: "metrics" },
    { visiblePanels: ["unknown"] },
    { visiblePanels: ["metrics", "metrics"] },
    { visiblePanels: [], role: "admin" },
  ]) {
    assert.equal((await call("/preferences", body)).status, 400);
  }
  await call("/users", {
    username: "reader",
    password: "Reader-password-123",
    role: "viewer",
  });
  const viewer = (
    await call("/auth/login", {
      username: "reader",
      password: "Reader-password-123",
    })
  ).cookie;
  assert.deepEqual(
    (await call("/preferences", undefined, viewer)).body,
    defaults,
  );
  assert.equal(
    (await call("/preferences", { visiblePanels: [] }, viewer)).status,
    200,
  );
  assert.deepEqual((await call("/preferences", undefined, viewer)).body, {
    visiblePanels: [],
  });
  assert.deepEqual((await call("/preferences", undefined, cookie)).body, {
    visiblePanels: ["metrics", "trend"],
  });
  assert.equal((await call("/users", undefined, viewer)).status, 403);
});
