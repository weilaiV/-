import { AppError } from "./domain.mjs";
import { parseInventoryWorkbook } from "./inventory-xlsx.mjs";
import { importInventorySnapshot, queryInventory } from "./inventory-db.mjs";

const maxBytes = 4 * 1024 * 1024;
function uploadBuffer(body) {
  if (typeof body.base64 !== "string" || !body.base64.length)
    throw new AppError("请提供库存Excel文件");
  if (body.base64.length > Math.ceil(maxBytes / 3) * 4)
    throw new AppError("Excel文件最大4MB", 413);
  if (
    body.base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64)
  )
    throw new AppError("Excel文件编码无效");
  const buffer = Buffer.from(body.base64, "base64");
  if (buffer.length > maxBytes) throw new AppError("Excel文件最大4MB", 413);
  if (buffer.toString("base64") !== body.base64)
    throw new AppError("Excel文件编码无效");
  return buffer;
}

// The app invokes this after its Host, Origin, JSON and session guards.
export async function handleInventory({
  db,
  req,
  res,
  url,
  path,
  method,
  user,
  bodyJson,
  send,
}) {
  if (path !== "/api/inventory" && !path.startsWith("/api/inventory/"))
    return false;
  if (!user) throw new AppError("请先登录", 401);
  if (method === "POST" && user.role !== "admin")
    throw new AppError("此操作需要管理员权限", 403);
  const respond = (status, value) => {
    send(res, status, value);
    return true;
  };
  if (path === "/api/inventory" && method === "GET")
    return respond(200, queryInventory(db, url.searchParams));

  const preview = path === "/api/inventory/import/preview";
  if ((preview || path === "/api/inventory/import") && method === "POST") {
    const body = await bodyJson(req);
    const parsed = await parseInventoryWorkbook(uploadBuffer(body), {
      filename: body.filename,
      asOfDate: body.asOfDate,
    });
    if (preview)
      return respond(200, {
        filename: parsed.filename,
        sheetName: parsed.sheetName,
        asOfDate: parsed.asOfDate,
        rowCount: parsed.rowCount,
        summary: parsed.summary,
        warnings: parsed.warnings,
        sample: parsed.items.slice(0, 5),
        sourceHash: parsed.sourceHash,
      });
    if (
      typeof body.expectedHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.expectedHash) ||
      body.expectedHash !== parsed.sourceHash
    )
      throw new AppError("文件与预检内容不一致，请重新预检后确认导入");
    return respond(201, {
      snapshot: importInventorySnapshot(db, parsed, user.id),
    });
  }
  throw new AppError("接口不存在", 404);
}
