import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { request } from "node:http";

test("real HTTP flow protects data, imports atomically and enforces roles", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keran-test-"));
  const app = createApp({ databasePath: join(dir, "test.sqlite") });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let cookie = "";
  const call = async (path, body, options = {}) => {
    const res = await fetch(origin + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie,
        ...options.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...options,
    });
    return {
      status: res.status,
      body: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  };
  assert.equal((await call("/overview")).status, 401);
  assert.equal((await call("/auth/status")).body.needsSetup, true);
  const setup = await call("/auth/setup", {
    username: "owner",
    password: "Test-only-password-123",
    name: "管理员",
  });
  assert.equal(setup.status, 201);
  cookie = setup.cookie;
  assert.equal(
    (
      await call("/auth/setup", {
        username: "intruder",
        password: "another-test-pass",
      })
    ).status,
    409,
  );
  assert.equal((await call("/auth/me")).body.user.role, "admin");
  const csv =
    "日期,渠道,店铺,商品,销售额,退款额,产品成本,广告费,平台费,运费\n2026-10-01,天猫,测试店,产品A,100.10,10,40,5,3,2";
  assert.equal((await call("/imports/preview", { csv })).body.count, 1);
  assert.equal(
    (await call("/imports", { csv, filename: "test.csv" })).status,
    201,
  );
  assert.equal(
    (await call("/imports", { csv, filename: "duplicate.csv" })).status,
    409,
  );
  const partialDuplicate =
    csv.replace("2026-10-01", "2026-10-02") +
    "\n2026-10-01,天猫,测试店,产品A,100.10,10,40,5,3,2";
  assert.equal((await call("/imports", { csv: partialDuplicate })).status, 409);
  const invalid =
    csv.replace("2026-10-01", "2026-10-02") +
    "\n2026-02-30,天猫,测试店,产品B,20,0,1,0,0,0";
  assert.equal((await call("/imports", { csv: invalid })).status, 400);
  const records = await call("/records?start=2026-10-01&end=2026-10-31");
  assert.equal(records.body.total, 1);
  assert.equal(records.body.records[0].sales, 10010);
  const summary = await call("/overview?start=2026-10-01&end=2026-10-31");
  assert.equal(summary.body.current.netProfit, 4010);
  assert.equal(summary.body.trend.length, 31);
  assert.equal(
    (await call("/overview?start=2026-02-30&end=2026-10-01")).status,
    400,
  );
  const forged = await fetch(origin + "/api/users", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      origin: "https://attacker.example",
    },
    body: JSON.stringify({
      username: "evil",
      password: "test-password-123",
      role: "admin",
      name: "bad",
    }),
  });
  assert.equal(forged.status, 403);
  assert.equal(
    (
      await call("/users", {
        username: "reader",
        password: "Reader-password-123",
        role: "viewer",
        name: "只读用户",
      })
    ).status,
    201,
  );
  const adminCookie = cookie;
  const viewer = await call("/auth/login", {
    username: "reader",
    password: "Reader-password-123",
  });
  assert.equal(viewer.status, 200);
  cookie = viewer.cookie;
  assert.equal(
    (await call("/overview?start=2026-10-01&end=2026-10-31")).status,
    200,
  );
  assert.equal((await call("/imports", { csv })).status, 403);
  assert.equal((await call("/users")).status, 403);
  await call("/auth/logout", {});
  assert.equal((await call("/auth/me")).status, 401);
  cookie = adminCookie;
  assert.equal(
    (await call("/auth/login", { username: "owner", password: "wrong" }))
      .status,
    401,
  );
  assert.equal((await call("/users")).body.users.length, 2);
  assert.equal((await call("/demo", {})).status, 409);
  assert.equal((await call("/imports")).body.imports.length, 1);
});

test("demo status is global across date filters and real imports stay separate", async (t) => {
  const app = createApp({ databasePath: ":memory:" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
  });
  const setup = await fetch(origin + "/api/auth/setup", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ username: "owner", password: "Test-password-123" }),
  });
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const post = (path, body) =>
    fetch(origin + "/api" + path, {
      method: "POST",
      headers: { origin, cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await post("/demo", {})).status, 201);
  const response = await fetch(
    origin + "/api/overview?start=2001-01-01&end=2001-01-02",
    { headers: { cookie } },
  );
  const data = await response.json();
  assert.equal(data.recordCount, 0);
  assert.equal(data.hasDemo, true);
  const csv =
    "日期,渠道,店铺,商品,销售额,退款额,产品成本,广告费,平台费,运费\n2026-10-01,天猫,新店,新商品,20,0,1,0,0,0";
  assert.equal((await post("/imports", { csv })).status, 409);
  assert.equal(
    (await post("/demo/clear", { confirm: "清除演示数据" })).status,
    200,
  );
  assert.equal((await post("/imports", { csv })).status, 201);
  assert.equal(
    (
      await fetch(origin + "/api/overview?start=2026-10-01&end=2026-10-02", {
        headers: { cookie },
      })
    ).status,
    200,
  );
});

test("production cannot start without explicit HTTPS and setup secret", () => {
  assert.throws(
    () => createApp({ databasePath: ":memory:", production: true }),
    /PUBLIC_ORIGIN/,
  );
});

test("local setup rejects untrusted Host even when Origin matches", async (t) => {
  const app = createApp({ databasePath: ":memory:" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
  });
  const status = await new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: app.server.address().port,
        path: "/api/auth/status",
        headers: { host: "untrusted.example" },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(status, 403);
});

test("parallel incomplete login bodies cannot bypass the attempt limit", async (t) => {
  const app = createApp({ databasePath: ":memory:" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
  });
  let received = 0;
  let ready;
  const allReceived = new Promise((resolve) => {
    ready = resolve;
  });
  app.server.on("request", () => {
    if (++received === 12) ready();
  });
  const requests = [];
  const responses = Array.from(
    { length: 12 },
    () =>
      new Promise((resolve, reject) => {
        const req = request(
          origin + "/api/auth/login",
          {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
          },
          (res) => {
            res.resume();
            res.on("end", () => resolve(res.statusCode));
          },
        );
        req.on("error", reject);
        req.write('{"username":');
        requests.push(req);
      }),
  );
  await allReceived;
  for (const req of requests)
    req.end('"missing","password":"incorrect-password"}');
  const statuses = await Promise.all(responses);
  assert.equal(statuses.filter((s) => s === 429).length, 2);
});
