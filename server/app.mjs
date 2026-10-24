import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, insertBatch } from "./db.mjs";
import { handleFinance } from "./finance.mjs";
import { handleInventory } from "./inventory.mjs";
import { INVENTORY_IMAGE_ORIGINS } from "../src/inventory-images.mjs";
import {
  AppError,
  parseCsv,
  summarize,
  previousPeriod,
  demoRows,
  businessDate,
} from "./domain.mjs";
import {
  hashPassword,
  verifyPassword,
  validateUser,
  issueSession,
  getSession,
  revokeSession,
} from "./security.mjs";
const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const panels = [
  "metrics",
  "costs",
  "todos",
  "trend",
  "structure",
  "channels",
  "shops",
  "products",
  "health",
  "highlights",
  "issues",
  "followups",
];
const recordSelect =
  "r.*,r.refund_only AS refundOnly,r.return_refunds AS returnRefunds,i.is_demo";
function comparison(current, previous) {
  return previous.netSales > 0
    ? ((current.netSales - previous.netSales) / previous.netSales) * 100
    : null;
}
function groupSummaries(rows, before, key) {
  const currentGroups = Object.groupBy(rows, (row) => row[key]);
  const previousGroups = Object.groupBy(before, (row) => row[key]);
  return [
    ...new Set([...Object.keys(currentGroups), ...Object.keys(previousGroups)]),
  ]
    .map((name) => {
      const current = summarize(currentGroups[name] || []);
      const previous = summarize(previousGroups[name] || []);
      return {
        name,
        ...current,
        previous,
        change: comparison(current, previous),
      };
    })
    .sort((a, b) => b.netSales - a.netSales);
}
function shopAlerts(rows, before) {
  const key = (row) => JSON.stringify([row.channel, row.shop]);
  const currentGroups = Object.groupBy(rows, key);
  const previousGroups = Object.groupBy(before, key);
  const alerts = [];
  for (const id of new Set([
    ...Object.keys(currentGroups),
    ...Object.keys(previousGroups),
  ])) {
    const current = summarize(currentGroups[id] || []);
    const previous = summarize(previousGroups[id] || []);
    if (!previousGroups[id]?.length) continue;
    const reasons = [];
    if (previous.netSales > 0 && current.netSales < previous.netSales)
      reasons.push("净销售额较前期下降");
    if (current.netProfit < previous.netProfit)
      reasons.push("预估净利较前期下降");
    if (
      Math.round(current.refundRate * 100) >
      Math.round(previous.refundRate * 100)
    )
      reasons.push("退款占比较前期上升");
    if (reasons.length) {
      const [channel, shop] = JSON.parse(id);
      alerts.push({
        id,
        channel,
        shop,
        reasons,
        severity:
          current.netProfit < 0 || reasons.length === 3
            ? "severe"
            : "attention",
        current,
        previous,
      });
    }
  }
  return alerts;
}
async function bodyJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 6 * 1024 * 1024)
      throw new AppError("请求过大，CSV 最大 5MB", 413);
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!body || Array.isArray(body) || typeof body !== "object")
      throw new Error();
    return body;
  } catch {
    throw new AppError("请求必须是有效 JSON 对象");
  }
}
export function createApp({
  databasePath = "./data/keran.sqlite",
  production = false,
  publicOrigin,
  setupToken,
} = {}) {
  if (
    production &&
    (!publicOrigin?.startsWith("https://") ||
      !setupToken ||
      setupToken.length < 32)
  )
    throw new Error(
      "生产模式必须配置 HTTPS PUBLIC_ORIGIN 与至少 32 位 SETUP_TOKEN",
    );
  const db = openDatabase(databasePath);
  const attempts = new Map();
  let initializing = false;
  const send = (res, status, value) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  const cookie = (token) =>
    `keran_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 604800 : 0}${production ? "; Secure" : ""}`;
  const userCount = () =>
    Number(db.prepare("SELECT COUNT(*) n FROM users").get().n);
  function range(url) {
    const today = businessDate();
    const start =
      url.searchParams.get("start") ||
      new Date(Date.parse(today) - 29 * 86400000).toISOString().slice(0, 10);
    const end = url.searchParams.get("end") || today;
    const previous = previousPeriod(start, end);
    const channel = url.searchParams.get("channel") || "";
    if (channel.length > 200) throw new AppError("渠道筛选无效");
    return { start, end, previous, channel };
  }
  function rowsBetween(start, end, channel) {
    return db
      .prepare(
        `SELECT ${recordSelect} FROM records r JOIN imports i ON i.id=r.import_id WHERE date BETWEEN ? AND ? AND (? = '' OR channel = ?) ORDER BY date,r.id`,
      )
      .all(start, end, channel, channel);
  }
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${INVENTORY_IMAGE_ORIGINS.join(" ")}; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
    );
    try {
      if (
        !production &&
        !/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(req.headers.host || "")
      )
        throw new AppError("本地环境只接受 localhost 或 127.0.0.1 访问", 403);
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      const method = req.method;
      if (!path.startsWith("/api/")) {
        if (method !== "GET" && method !== "HEAD")
          throw new AppError("请求方式不支持", 405);
        const requested = resolve(root, "." + decodeURIComponent(path));
        if (requested !== root && !requested.startsWith(root + sep))
          throw new AppError("禁止访问", 403);
        const file =
          existsSync(requested) && statSync(requested).isFile()
            ? requested
            : resolve(root, "index.html");
        if (!existsSync(file))
          throw new AppError(
            "前端尚未构建，请执行 npm run build 或 npm run dev",
            404,
          );
        res.writeHead(200, {
          "content-type": mime[extname(file)] || "application/octet-stream",
          "cache-control":
            extname(file) === ".html" ? "no-cache" : "public, max-age=3600",
        });
        res.end(method === "HEAD" ? undefined : readFileSync(file));
        return;
      }
      if (!["GET", "POST"].includes(method))
        throw new AppError("请求方式不支持", 405);
      if (method === "POST") {
        const origin = req.headers.origin;
        const localOrigins = [
          `http://${req.headers.host}`,
          "http://127.0.0.1:5173",
          "http://localhost:5173",
        ];
        if (
          !origin ||
          (production
            ? origin !== publicOrigin
            : !localOrigins.includes(origin))
        )
          throw new AppError("请求来源不受信任，请从本系统页面操作", 403);
        if (!req.headers["content-type"]?.startsWith("application/json"))
          throw new AppError("请求必须使用 JSON", 415);
      }
      if (path === "/api/health" && method === "GET")
        return send(res, 200, { status: "ok" });
      if (path === "/api/auth/status" && method === "GET")
        return send(res, 200, {
          needsSetup: userCount() === 0,
          requiresSetupToken: production,
        });
      if (path === "/api/auth/setup" && method === "POST") {
        if (userCount() || initializing)
          throw new AppError("系统已完成初始化", 409);
        const body = await bodyJson(req);
        if (production && body.setupToken !== setupToken)
          throw new AppError("初始化令牌无效", 403);
        validateUser(body);
        if (userCount() || initializing)
          throw new AppError("系统已完成初始化", 409);
        initializing = true;
        try {
          const hash = await hashPassword(body.password);
          const result = db
            .prepare(
              "INSERT INTO users(username,name,password_hash,role) VALUES (?,?,?,?)",
            )
            .run(body.username, body.name || body.username, hash, "admin");
          res.setHeader(
            "set-cookie",
            cookie(issueSession(db, Number(result.lastInsertRowid))),
          );
          return send(res, 201, {
            user: {
              id: Number(result.lastInsertRowid),
              username: body.username,
              name: body.name || body.username,
              role: "admin",
            },
          });
        } finally {
          initializing = false;
        }
      }
      if (path === "/api/auth/login" && method === "POST") {
        const body = await bodyJson(req);
        if (
          typeof body.username !== "string" ||
          body.username.length > 40 ||
          typeof body.password !== "string" ||
          body.password.length > 128
        )
          throw new AppError("账号或密码错误", 401);
        const now = Date.now();
        const key =
          req.socket.remoteAddress + ":" + body.username.toLowerCase();
        // Reserve an attempt synchronously after reading the body, before scrypt yields.
        const recent = (attempts.get(key) || []).filter(
          (t) => now - t < 15 * 60000,
        );
        if (recent.length >= 10)
          throw new AppError("登录尝试过多，请 15 分钟后再试", 429);
        if (attempts.size >= 10000) {
          for (const [k, values] of attempts)
            if (!values.some((time) => now - time < 15 * 60000))
              attempts.delete(k);
        }
        if (!attempts.has(key) && attempts.size >= 10000)
          throw new AppError("登录请求过多，请稍后再试", 429);
        recent.push(now);
        attempts.set(key, recent);
        const user = db
          .prepare("SELECT * FROM users WHERE username=?")
          .get(body.username);
        const stored =
          user?.password_hash || "0".repeat(32) + ":" + "0".repeat(128);
        if (!(await verifyPassword(body.password, stored)) || !user)
          throw new AppError("账号或密码错误", 401);
        attempts.delete(key);
        res.setHeader("set-cookie", cookie(issueSession(db, user.id)));
        return send(res, 200, {
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          },
        });
      }
      const user = getSession(db, req);
      if (!user) throw new AppError("请先登录", 401);
      if (
        await handleInventory({
          db,
          req,
          res,
          url,
          path,
          method,
          user,
          bodyJson,
          send,
        })
      )
        return;
      if (
        await handleFinance({
          db,
          req,
          res,
          url,
          path,
          method,
          user,
          bodyJson,
          send,
        })
      )
        return;
      if (path === "/api/auth/me" && method === "GET")
        return send(res, 200, { user });
      if (path === "/api/auth/logout" && method === "POST") {
        revokeSession(db, req);
        res.setHeader("set-cookie", cookie(""));
        return send(res, 200, { ok: true });
      }
      if (path === "/api/preferences" && method === "GET") {
        const saved = db
          .prepare("SELECT json FROM user_preferences WHERE user_id=?")
          .get(user.id);
        return send(
          res,
          200,
          saved ? JSON.parse(saved.json) : { visiblePanels: panels },
        );
      }
      if (path === "/api/preferences" && method === "POST") {
        const body = await bodyJson(req);
        if (
          Object.keys(body).length !== 1 ||
          !Array.isArray(body.visiblePanels) ||
          body.visiblePanels.some((panel) => !panels.includes(panel)) ||
          new Set(body.visiblePanels).size !== body.visiblePanels.length
        )
          throw new AppError(
            "工作台配置必须只包含有效且不重复的 visiblePanels",
          );
        db.prepare(
          "INSERT INTO user_preferences(user_id,json) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json",
        ).run(user.id, JSON.stringify(body));
        return send(res, 200, body);
      }
      if (path === "/api/overview" && method === "GET") {
        const { start, end, previous, channel } = range(url);
        const rows = rowsBetween(start, end, channel);
        const before = rowsBetween(previous.start, previous.end, channel);
        const grouped = (key) => groupSummaries(rows, before, key);
        const dates = Object.groupBy(rows, (r) => r.date);
        const trend = [];
        for (
          let day = Date.parse(start);
          day <= Date.parse(end);
          day += 86400000
        ) {
          const date = new Date(day).toISOString().slice(0, 10);
          trend.push({ date, ...summarize(dates[date] || []) });
        }
        return send(res, 200, {
          current: summarize(rows),
          previous: summarize(before),
          range: { start, end, previous },
          trend,
          channels: grouped("channel"),
          shops: grouped("shop"),
          products: grouped("product"),
          dataBounds: db
            .prepare("SELECT MIN(date) start,MAX(date) end FROM records")
            .get(),
          alerts: shopAlerts(rows, before),
          availableChannels: db
            .prepare("SELECT DISTINCT channel FROM records ORDER BY channel")
            .all()
            .map((r) => r.channel),
          recordCount: rows.length,
          hasRecords: !!db.prepare("SELECT 1 FROM records LIMIT 1").get(),
          hasDemo: !!db
            .prepare("SELECT 1 FROM imports WHERE is_demo=1 LIMIT 1")
            .get(),
          hasReal: rows.some((r) => !r.is_demo),
        });
      }
      if (path === "/api/records" && method === "GET") {
        const { start, end, channel } = range(url);
        const page = Math.max(
          1,
          Math.min(100000, parseInt(url.searchParams.get("page"), 10) || 1),
        );
        const search = (url.searchParams.get("search") || "").slice(0, 100);
        const shop = url.searchParams.get("shop") || "";
        const product = url.searchParams.get("product") || "";
        if (shop.length > 200 || product.length > 200)
          throw new AppError("店铺或商品筛选无效");
        const where =
          "date BETWEEN ? AND ? AND (? = '' OR channel = ?) AND (? = '' OR shop = ?) AND (? = '' OR product = ?) AND (? = '' OR instr(shop,?)>0 OR instr(product,?)>0)";
        const args = [
          start,
          end,
          channel,
          channel,
          shop,
          shop,
          product,
          product,
          search,
          search,
          search,
        ];
        const total = Number(
          db
            .prepare(`SELECT COUNT(*) n FROM records WHERE ${where}`)
            .get(...args).n,
        );
        const records = db
          .prepare(
            `SELECT ${recordSelect} FROM records r JOIN imports i ON i.id=r.import_id WHERE ${where} ORDER BY date DESC,r.id DESC LIMIT 20 OFFSET ?`,
          )
          .all(...args, (page - 1) * 20);
        return send(res, 200, { records, total, page, pageSize: 20 });
      }
      if (user.role !== "admin")
        throw new AppError("此操作需要管理员权限", 403);
      if (path === "/api/imports/preview" && method === "POST") {
        const { csv } = await bodyJson(req);
        const rows = parseCsv(csv);
        const find = db.prepare(
          "SELECT 1 FROM records WHERE date=? AND channel=? AND shop=? AND product=?",
        );
        const duplicates = rows.filter((r) =>
          find.get(r.date, r.channel, r.shop, r.product),
        ).length;
        return send(res, 200, {
          count: rows.length,
          duplicates,
          preview: rows.slice(0, 5),
          totals: summarize(rows),
        });
      }
      if (path === "/api/imports" && method === "POST") {
        const body = await bodyJson(req);
        const rows = parseCsv(body.csv);
        if (db.prepare("SELECT 1 FROM imports WHERE is_demo=1").get())
          throw new AppError("请先清除演示数据，再导入真实数据", 409);
        const filename =
          typeof body.filename === "string"
            ? body.filename.slice(0, 150)
            : "导入.csv";
        return send(res, 201, insertBatch(db, rows, filename, user.id));
      }
      if (path === "/api/imports" && method === "GET")
        return send(res, 200, {
          imports: db
            .prepare(
              "SELECT i.*,u.name as user_name FROM imports i LEFT JOIN users u ON u.id=i.user_id ORDER BY i.id DESC LIMIT 100",
            )
            .all(),
        });
      if (path === "/api/demo" && method === "POST") {
        await bodyJson(req);
        if (db.prepare("SELECT 1 FROM records LIMIT 1").get())
          throw new AppError("已有业务数据，请使用空数据库体验演示", 409);
        return send(
          res,
          201,
          insertBatch(db, demoRows(), "系统合成演示数据", user.id, true),
        );
      }
      if (path === "/api/demo/clear" && method === "POST") {
        const body = await bodyJson(req);
        if (body.confirm !== "清除演示数据")
          throw new AppError("请明确确认清除演示数据");
        db.exec("BEGIN IMMEDIATE");
        try {
          db.exec(
            "DELETE FROM records WHERE import_id IN (SELECT id FROM imports WHERE is_demo=1); DELETE FROM imports WHERE is_demo=1; COMMIT",
          );
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        return send(res, 200, { ok: true });
      }
      if (path === "/api/users" && method === "GET")
        return send(res, 200, {
          users: db
            .prepare(
              "SELECT id,username,name,role,created_at FROM users ORDER BY id",
            )
            .all(),
        });
      if (path === "/api/users" && method === "POST") {
        const body = await bodyJson(req);
        validateUser(body);
        const hash = await hashPassword(body.password);
        try {
          const result = db
            .prepare(
              "INSERT INTO users(username,name,password_hash,role) VALUES (?,?,?,?)",
            )
            .run(
              body.username,
              body.name || body.username,
              hash,
              body.role || "viewer",
            );
          return send(res, 201, { id: Number(result.lastInsertRowid) });
        } catch (error) {
          if (error.message.includes("UNIQUE"))
            throw new AppError("此账号已存在", 409);
          throw error;
        }
      }
      throw new AppError("接口不存在", 404);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (!error.status) console.error("[server]", error.message);
      send(res, error.status || 500, {
        error: error.status ? error.message : "服务器处理失败，请稍后重试",
      });
    }
  });
  return { server, db, close: () => db.close() };
}
