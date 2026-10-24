import { AppError } from "./domain.mjs";
import { inventoryFlags, summarizeInventory } from "./inventory-domain.mjs";

const pageSize = 30;
const sorts = new Set([
  "stock",
  "daysCover",
  "sales7",
  "suggestedPurchase",
  "sku",
  "name",
  "updatedAt",
]);
const statuses = new Set([
  "all",
  "below-min",
  "above-max",
  "suggested",
  "anomaly",
  "missing-sales",
  "source-slow",
  "source-clearance",
  "source-delisted",
]);
const anomalyFlags = new Set([
  "negative-stock",
  "negative-days",
  "invalid-limits",
]);
const parameterNames = new Set([
  "snapshotId",
  "search",
  "style",
  "tag",
  "status",
  "sort",
  "direction",
  "page",
]);

export function ensureInventorySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_snapshots(
      id INTEGER PRIMARY KEY, filename TEXT NOT NULL, sheet_name TEXT NOT NULL,
      as_of_date TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 50000),
      source_hash TEXT NOT NULL UNIQUE, warnings_json TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS inventory_items(
      id INTEGER PRIMARY KEY, snapshot_id INTEGER NOT NULL REFERENCES inventory_snapshots(id),
      sku TEXT NOT NULL, style_code TEXT, name TEXT, stock INTEGER,
      days_cover REAL, sales7 INTEGER, suggested_purchase INTEGER, updated_at TEXT,
      item_json TEXT NOT NULL, UNIQUE(snapshot_id,sku));
    CREATE INDEX IF NOT EXISTS inventory_items_snapshot_stock ON inventory_items(snapshot_id,stock);
    CREATE INDEX IF NOT EXISTS inventory_items_snapshot_style ON inventory_items(snapshot_id,style_code);
  `);
}

function snapshot(row) {
  return {
    id: Number(row.id),
    filename: row.filename,
    sheetName: row.sheet_name,
    asOfDate: row.as_of_date,
    importedAt: row.imported_at,
    rowCount: row.row_count,
    sourceHash: row.source_hash,
  };
}

function safeFilename(value) {
  if (typeof value !== "string" || /[\u0000-\u001f]/.test(value))
    throw new AppError("来源文件名无效");
  const name = value.split(/[\\/]/).at(-1).trim();
  if (!name || name.length > 150) throw new AppError("来源文件名无效");
  return name;
}

export function importInventorySnapshot(db, parsed, userId) {
  if (
    !Array.isArray(parsed?.items) ||
    !parsed.items.length ||
    parsed.items.length > 50000
  )
    throw new AppError("库存快照必须包含1至50000条商品");
  if (parsed.rowCount !== parsed.items.length)
    throw new AppError("库存快照商品数量不一致");
  if (
    typeof parsed.sourceHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(parsed.sourceHash)
  )
    throw new AppError("库存文件摘要无效");
  const filename = safeFilename(parsed.filename);
  if (
    typeof parsed.sheetName !== "string" ||
    !parsed.sheetName.trim() ||
    parsed.sheetName.length > 200
  )
    throw new AppError("库存工作表名称无效");
  if (
    typeof parsed.asOfDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(parsed.asOfDate) ||
    Number.isNaN(Date.parse(parsed.asOfDate)) ||
    new Date(parsed.asOfDate).toISOString().slice(0, 10) !== parsed.asOfDate
  )
    throw new AppError("库存批次日期无效");
  if (!Number.isSafeInteger(userId) || userId < 1)
    throw new AppError("导入用户无效");

  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db
      .prepare(
        "INSERT INTO inventory_snapshots(filename,sheet_name,as_of_date,row_count,source_hash,warnings_json,user_id) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        filename,
        parsed.sheetName,
        parsed.asOfDate,
        parsed.items.length,
        parsed.sourceHash,
        JSON.stringify(parsed.warnings || []),
        userId,
      );
    const id = Number(result.lastInsertRowid);
    const insert = db.prepare(
      "INSERT INTO inventory_items(snapshot_id,sku,style_code,name,stock,days_cover,sales7,suggested_purchase,updated_at,item_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
    );
    for (const item of parsed.items) {
      if (typeof item?.sku !== "string" || !item.sku.trim())
        throw new AppError("库存商品编码无效");
      insert.run(
        id,
        item.sku,
        item.styleCode ?? null,
        item.name ?? null,
        item.stock ?? null,
        item.daysCover ?? null,
        item.sales7 ?? null,
        item.suggestedPurchase ?? null,
        item.updatedAt ?? null,
        JSON.stringify(item),
      );
    }
    const saved = snapshot(
      db.prepare("SELECT * FROM inventory_snapshots WHERE id=?").get(id),
    );
    db.exec("COMMIT");
    return saved;
  } catch (error) {
    db.exec("ROLLBACK");
    if (
      error.message.includes(
        "UNIQUE constraint failed: inventory_snapshots.source_hash",
      )
    )
      throw new AppError("该库存文件已导入，请查看已有快照", 409);
    if (
      error.message.includes(
        "UNIQUE constraint failed: inventory_items.snapshot_id, inventory_items.sku",
      )
    )
      throw new AppError("商品编码重复，整批未导入", 409);
    throw error;
  }
}

export function inventorySnapshots(db) {
  return db
    .prepare("SELECT * FROM inventory_snapshots ORDER BY id DESC")
    .all()
    .map(snapshot);
}

function parameters(input) {
  const entries =
    input instanceof URLSearchParams ? [...input] : Object.entries(input || {});
  const result = {};
  for (const [key, value] of entries) {
    if (
      !parameterNames.has(key) ||
      Object.hasOwn(result, key) ||
      !["string", "number"].includes(typeof value)
    )
      throw new AppError("库存查询参数无效");
    result[key] = String(value);
  }
  return result;
}

function positiveInteger(value, label) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new AppError(`${label}无效`);
  return Number(value);
}

function filterText(value, label) {
  if (value.length > 200 || /[\u0000-\u001f]/.test(value))
    throw new AppError(`${label}无效`);
  return value;
}

function compare(a, b) {
  return typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b), "zh-CN", { numeric: false });
}

export function queryInventory(db, input = {}) {
  const params = parameters(input);
  const selectedId =
    params.snapshotId === undefined || params.snapshotId === ""
      ? null
      : positiveInteger(params.snapshotId, "库存快照编号");
  const page = positiveInteger(params.page ?? "1", "页码");
  if (page > 1000000) throw new AppError("页码无效");
  const search = filterText(
    params.search ?? "",
    "搜索条件",
  ).toLocaleLowerCase();
  const style = filterText(params.style ?? "", "款式筛选");
  const tag = filterText(params.tag ?? "", "标签筛选");
  const status = params.status ?? "all",
    sort = params.sort ?? "stock",
    direction = params.direction ?? "desc";
  if (
    !statuses.has(status) ||
    !sorts.has(sort) ||
    !["asc", "desc"].includes(direction)
  )
    throw new AppError("库存状态或排序无效");
  const snapshots = inventorySnapshots(db);
  const selected =
    selectedId === null
      ? snapshots[0] || null
      : snapshots.find((row) => row.id === selectedId);
  if (selectedId !== null && !selected)
    throw new AppError("库存快照不存在", 404);
  const stored = selected
    ? db
        .prepare(
          "SELECT id,item_json FROM inventory_items WHERE snapshot_id=? ORDER BY id",
        )
        .all(selected.id)
    : [];
  const all = stored.map((row) => {
    const item = JSON.parse(row.item_json);
    return { ...item, id: Number(row.id), flags: inventoryFlags(item) };
  });
  const matching = all.filter((item) => {
    if (style && item.styleCode !== style) return false;
    if (tag && !item.tags?.includes(tag)) return false;
    if (
      search &&
      ![item.sku, item.name, item.variant, item.spec, item.styleCode].some(
        (value) =>
          String(value ?? "")
            .toLocaleLowerCase()
            .includes(search),
      )
    )
      return false;
    if (status === "anomaly")
      return item.flags.some((flag) => anomalyFlags.has(flag));
    if (status === "missing-sales") return item.sales7 === null;
    return status === "all" || item.flags.includes(status);
  });
  matching.sort((a, b) => {
    const value = (item) =>
      sort === "updatedAt" && Object.hasOwn(item, "updatedAtKey")
        ? item.updatedAtKey
        : item[sort];
    const left = value(a),
      right = value(b);
    if (left === null || left === undefined)
      return right === null || right === undefined ? a.id - b.id : 1;
    if (right === null || right === undefined) return -1;
    return (
      compare(left, right) * (direction === "desc" ? -1 : 1) || a.id - b.id
    );
  });
  const styles = new Map();
  for (const item of matching) {
    const name = item.styleCode || "未填写款式";
    if (!styles.has(name)) styles.set(name, []);
    styles.get(name).push(item);
  }
  const topStyles = [...styles]
    .map(([name, items]) => {
      const totals = summarizeInventory(items);
      return { name, skuCount: totals.skuCount, stockTotal: totals.stockTotal };
    })
    .sort((a, b) => b.stockTotal - a.stockTotal || compare(a.name, b.name))
    .slice(0, 10);
  const warnings = selected
    ? JSON.parse(
        db
          .prepare("SELECT warnings_json FROM inventory_snapshots WHERE id=?")
          .get(selected.id).warnings_json,
      )
    : [];
  return {
    snapshot: selected,
    snapshots,
    items: matching.slice((page - 1) * pageSize, page * pageSize),
    total: matching.length,
    page,
    pageSize,
    summary: summarizeInventory(matching),
    overallSummary: summarizeInventory(all),
    options: {
      styles: [
        ...new Set(all.map((item) => item.styleCode).filter(Boolean)),
      ].sort(compare),
      tags: [...new Set(all.flatMap((item) => item.tags || []))].sort(compare),
    },
    topStyles,
    warnings,
  };
}
