import { createHash } from "node:crypto";
import unzipper from "unzipper";
import { zipSync, strToU8 } from "fflate";
import readXlsxFile, { readSheetNames } from "read-excel-file/node";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { AppError, validDate } from "./domain.mjs";
import {
  normalizeInventoryRows,
  summarizeInventory,
} from "./inventory-domain.mjs";

const MAX_FILE = 4 * 1024 * 1024;
const MAX_UNPACKED = 40 * 1024 * 1024;
let parsing = false;

async function boundedEntry(entry, budget) {
  const pieces = [];
  let size = 0;
  for await (const part of entry.stream()) {
    size += part.length;
    if (size > entry.uncompressedSize || size > budget)
      throw new AppError("Excel展开体积超过限制");
    pieces.push(part);
  }
  if (size !== entry.uncompressedSize)
    throw new AppError("Excel压缩内容不完整");
  return Buffer.concat(pieces, size);
}
async function normalizePackage(buffer) {
  const directory = await unzipper.Open.buffer(buffer);
  if (directory.files.length > 200)
    throw new AppError("Excel内部文件数量超过限制");
  const paths = new Set();
  let expected = 0;
  for (const file of directory.files) {
    if (
      !Number.isSafeInteger(file.uncompressedSize) ||
      file.uncompressedSize < 0
    )
      throw new AppError("Excel压缩内容无效");
    expected += file.uncompressedSize;
    if (expected > MAX_UNPACKED)
      throw new AppError("Excel展开体积不能超过40MB");
    if (
      paths.has(file.path) ||
      /(^|[\\/])\.\.([\\/]|$)|^[\\/]|[\u0000:]/.test(file.path) ||
      /vbaProject|\.bin$/i.test(file.path) ||
      file.flags & 1
    )
      throw new AppError("不支持宏、加密或异常Excel文件");
    paths.add(file.path);
  }
  if (!paths.has("xl/workbook.xml") || !paths.has("[Content_Types].xml"))
    throw new AppError("请上传有效的.xlsx库存表");
  const files = Object.create(null);
  let unpacked = 0;
  for (const file of directory.files) {
    if (file.type === "Directory") continue;
    const bytes = await boundedEntry(file, MAX_UNPACKED - unpacked);
    unpacked += bytes.length;
    if (/\.xml$/i.test(file.path)) {
      let xml = bytes.toString("utf8");
      if (/<!DOCTYPE|<!ENTITY/i.test(xml))
        throw new AppError("Excel包含不支持的XML定义");
      if (/^xl\/worksheets\/[^/]+\.xml$/i.test(file.path)) {
        const invalidXml = () => {
          throw new AppError("Excel XML格式无效");
        };
        const document = new DOMParser({
          errorHandler: {
            warning: invalidXml,
            error: invalidXml,
            fatalError: invalidXml,
          },
        }).parseFromString(xml, "application/xml");
        let cellCount = 0;
        let maxRow = 0,
          maxColumn = 0;
        const elements = Array.from(document.getElementsByTagName("*"));
        for (const element of elements) {
          if (element.localName === "f")
            throw new AppError("库存表包含公式，请先将公式转为数值再导入");
          if (element.localName === "c") {
            const match = /^([A-Za-z]+)([1-9]\d*)$/.exec(
              element.getAttribute("r"),
            );
            let column = 0;
            if (match)
              for (const letter of match[1].toUpperCase())
                column = column * 26 + letter.charCodeAt(0) - 64;
            const row = match ? Number(match[2]) : 0;
            maxRow = Math.max(maxRow, row);
            maxColumn = Math.max(maxColumn, column);
            if (
              !match ||
              ++cellCount > 2_000_000 ||
              column > 256 ||
              row > 50001 ||
              row < 1 ||
              maxRow * maxColumn > 2_000_000
            )
              throw new AppError(
                "库存表范围超出限制：最多50000条商品和256列，展开范围不超过200万格",
              );
          }
          if (element.localName === "row") {
            const row = element.getAttribute("r");
            if (!/^[1-9]\d*$/.test(row) || Number(row) > 50001)
              throw new AppError("库存表最多支持50000条商品");
          }
          // Some ERP exports incorrectly declare A1 although all cells are present.
          if (element.localName === "dimension")
            element.parentNode.removeChild(element);
        }
        xml = new XMLSerializer().serializeToString(document);
      }
      files[file.path] = strToU8(xml);
    } else files[file.path] = new Uint8Array(bytes);
  }
  return Buffer.from(zipSync(files, { level: 0 }));
}

export async function parseInventoryWorkbook(
  buffer,
  { filename, asOfDate } = {},
) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_FILE)
    throw new AppError("Excel文件不能为空且不能超过4MB");
  if (
    typeof filename !== "string" ||
    !filename.trim() ||
    filename.length > 240 ||
    !/\.xlsx$/i.test(filename) ||
    /[\u0000-\u001f]/.test(filename)
  )
    throw new AppError("请上传.xlsx格式的库存表");
  if (!validDate(asOfDate))
    throw new AppError("请选择2000年至2100年的有效快照日期");
  if (parsing) throw new AppError("正在解析另一份库存表，请稍后重试", 429);
  parsing = true;
  try {
    const prepared = await normalizePackage(buffer);
    const sheets = await readSheetNames(prepared);
    if (!sheets.length) throw new AppError("Excel没有可读取的工作表");
    const matrix = await readXlsxFile(prepared, { sheet: 1, trim: false });
    const { items, warnings } = normalizeInventoryRows(matrix);
    if (sheets.length > 1)
      warnings.push(
        `文件有${sheets.length}个工作表，本次读取第一个工作表：${sheets[0]}`,
      );
    return {
      items,
      warnings,
      summary: summarizeInventory(items),
      rowCount: items.length,
      sourceHash: createHash("sha256").update(buffer).digest("hex"),
      filename: filename.trim().split(/[\\/]/).at(-1),
      sheetName: sheets[0],
      asOfDate,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "无法读取Excel，请确认文件完整且未加密，并使用.xlsx格式",
    );
  } finally {
    parsing = false;
  }
}
