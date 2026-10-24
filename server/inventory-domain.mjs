import { AppError, validDate } from "./domain.mjs";
import { inventoryFields } from "../src/inventory-schema.mjs";

const empty = (value) =>
  value == null || (typeof value === "string" && value.trim() === "");
const normalizeHeader = (value) =>
  String(value ?? "")
    .trim()
    .replaceAll("（", "(")
    .replaceAll("）", ")");
export function inventoryFlags(item) {
  const flags = [];
  const invalidLimits =
    (item.minStock != null && item.minStock < 0) ||
    (item.maxStock != null && item.maxStock < 0) ||
    (item.minStock > 0 && item.maxStock > 0 && item.minStock > item.maxStock);
  if (invalidLimits) flags.push("invalid-limits");
  else {
    if (item.minStock > 0 && item.stock < item.minStock)
      flags.push("below-min");
    if (item.maxStock > 0 && item.stock > item.maxStock)
      flags.push("above-max");
  }
  if (item.suggestedPurchase > 0) flags.push("suggested");
  if (item.stock < 0) flags.push("negative-stock");
  if (item.daysCover != null && item.daysCover < 0) flags.push("negative-days");
  const tags = item.tags || [];
  if (tags.includes("滞销")) flags.push("source-slow");
  if (tags.includes("清货")) flags.push("source-clearance");
  if (tags.includes("下架")) flags.push("source-delisted");
  return flags;
}
function sum(values) {
  let total = 0n;
  for (const value of values) {
    if (!Number.isSafeInteger(value))
      throw new AppError("库存数量超出支持的整数范围");
    total += BigInt(value);
  }
  if (
    total > BigInt(Number.MAX_SAFE_INTEGER) ||
    total < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new AppError("库存合计超出安全范围");
  return Number(total);
}
export function summarizeInventory(items) {
  function partial(key) {
    const values = items
      .map((item) => item[key])
      .filter((value) => value != null);
    return {
      value: values.length ? sum(values) : null,
      provided: values.length,
      total: items.length,
    };
  }
  const flags = items.map(inventoryFlags);
  return {
    skuCount: items.length,
    styleCount: new Set(items.map((item) => item.styleCode)).size,
    stockTotal: sum(items.map((item) => item.stock)),
    belowMinCount: flags.filter((row) => row.includes("below-min")).length,
    aboveMaxCount: flags.filter((row) => row.includes("above-max")).length,
    anomalyCount: flags.filter((row) =>
      row.some((flag) =>
        ["negative-stock", "negative-days", "invalid-limits"].includes(flag),
      ),
    ).length,
    missingSalesCount: items.filter((item) => item.sales7 == null).length,
    slowTagCount: flags.filter((row) => row.includes("source-slow")).length,
    delistedCount: flags.filter((row) => row.includes("source-delisted"))
      .length,
    pendingShip: partial("pendingShip"),
    sales7: partial("sales7"),
    suggestedPurchase: partial("suggestedPurchase"),
  };
}
function text(value, field, rowNumber) {
  if (empty(value)) {
    if (field.required)
      throw new AppError(`第${rowNumber}行${field.label}不能为空`);
    return null;
  }
  if (field.type === "identifier" && typeof value !== "string")
    throw new AppError(
      `第${rowNumber}行${field.label}必须为文本，避免丢失前导零；请按文本导出`,
    );
  if (!["string", "number", "boolean"].includes(typeof value))
    throw new AppError(`第${rowNumber}行${field.label}格式无效`);
  const result = String(value).trim();
  const limit =
    field.type === "image"
      ? 3000
      : field.key === "sku" || field.key === "styleCode"
        ? 200
        : 2000;
  if (
    result.length > limit ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)
  )
    throw new AppError(`第${rowNumber}行${field.label}过长或含控制字符`);
  return result;
}
function numeric(value, field, rowNumber) {
  if (empty(value)) {
    if (field.required)
      throw new AppError(`第${rowNumber}行${field.label}不能为空`);
    return null;
  }
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^-?\d+(?:\.\d{1,3})?$/.test(value.trim()))
  )
    throw new AppError(`第${rowNumber}行${field.label}必须为有效数字`);
  const result = Number(value);
  if (
    !Number.isFinite(result) ||
    Math.abs(result) > 1_000_000_000 ||
    (field.type === "quantity" && !Number.isSafeInteger(result))
  )
    throw new AppError(
      `第${rowNumber}行${field.label}须为有效${field.type === "quantity" ? "整数数量" : "天数"}，绝对值不超过十亿`,
    );
  return result;
}
function normalizedTime(value) {
  if (!value) return null;
  const match =
    /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(
      value,
    );
  if (!match) return null;
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  if (
    !validDate(date) ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    return null;
  return `${date} ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}`;
}
export function normalizeInventoryRows(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2 || !Array.isArray(matrix[0]))
    throw new AppError("库存表至少需要表头和一行商品");
  if (matrix.length > 50001) throw new AppError("单次最多导入50000条商品");
  const headers = matrix[0].map(normalizeHeader);
  const known = new Set(
    inventoryFields.map((field) => normalizeHeader(field.label)),
  );
  const seenHeaders = new Set();
  for (const header of headers) {
    if (known.has(header) && seenHeaders.has(header))
      throw new AppError(`库存表存在重复表头：${header}`);
    seenHeaders.add(header);
  }
  for (const field of inventoryFields.filter((field) => field.required))
    if (!headers.includes(normalizeHeader(field.label)))
      throw new AppError(`库存表缺少必填列：${field.label}`);
  const indexes = inventoryFields.map((field) =>
    headers.indexOf(normalizeHeader(field.label)),
  );
  const items = [],
    codes = new Set();
  let badImages = 0,
    badTimes = 0;
  for (let index = 1; index < matrix.length; index++) {
    const source = matrix[index];
    if (!Array.isArray(source) || source.every(empty)) continue;
    const rowNumber = index + 1,
      item = { rowNumber };
    inventoryFields.forEach((field, position) => {
      let value = indexes[position] < 0 ? null : source[indexes[position]];
      if (field.type === "datetime" && value instanceof Date)
        value = value.toISOString().slice(0, 19).replace("T", " ");
      item[field.key] = ["quantity", "decimal"].includes(field.type)
        ? numeric(value, field, rowNumber)
        : text(value, field, rowNumber);
    });
    if (codes.has(item.sku))
      throw new AppError(
        `第${rowNumber}行商品编码重复：${item.sku}；整批未导入`,
      );
    codes.add(item.sku);
    if (item.imageUrl) {
      try {
        const url = new URL(item.imageUrl);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error();
      } catch {
        item.imageUrl = null;
        badImages++;
      }
    }
    item.tags = [
      ...new Set(
        (item.tagText || "")
          .split(/[,，、;；]/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    item.updatedAtKey = normalizedTime(item.updatedAt);
    if (item.updatedAt && !item.updatedAtKey) badTimes++;
    item.flags = inventoryFlags(item);
    items.push(item);
  }
  if (!items.length) throw new AppError("库存表没有可导入的商品记录");
  const warnings = [];
  const missing = inventoryFields
    .filter((field, index) => indexes[index] < 0 && !field.required)
    .map((field) => field.label);
  if (missing.length)
    warnings.push(`未提供以下列，按缺失值保留：${missing.join("、")}`);
  if (badImages)
    warnings.push(
      `${badImages}条图片链接格式不安全，已忽略图片链接，库存数据保留`,
    );
  if (badTimes)
    warnings.push(`${badTimes}条库存更新时间格式无法识别，已保留原文`);
  const summary = summarizeInventory(items);
  if (summary.anomalyCount)
    warnings.push(
      `${summary.anomalyCount}个商品存在负库存、负可售天数或矛盾安全上下限，请核对原表`,
    );
  if (summary.missingSalesCount)
    warnings.push(
      `${summary.missingSalesCount}个商品未提供7天销量，不按零销量处理`,
    );
  warnings.push("此表未提供成本单价和仓库维度，不计算库存金额或仓库分布");
  return { items, warnings };
}
