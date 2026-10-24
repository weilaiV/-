import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { parseInventoryWorkbook } from "../server/inventory-xlsx.mjs";

function workbook(extra = {}, dimension = null) {
  const strings = ["款式编码", "商品编码", "商品名称", "实际库存数", "7天销量"];
  const cell = (address, text) =>
    `<c r="${address}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1"/><sheetData><row r="1">${strings.map((text, i) => cell(String.fromCharCode(65 + i) + "1", text)).join("")}</row><row r="2">${cell("A2", "STYLE-X")}${cell("B2", "000001")}${cell("C2", "测试商品")}<c r="D2"><v>12</v></c><c r="E2"><v>0</v></c></row><row r="3">${cell("A3", "STYLE-X")}${cell("B3", "000002")}${cell("C3", "测试配件")}<c r="D3"><v>8</v></c></row></sheetData></worksheet>`;
  const files = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="库存" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": sheet,
    ...extra,
  };
  if (dimension)
    files["xl/worksheets/sheet1.xml"] = files[
      "xl/worksheets/sheet1.xml"
    ].replace('<dimension ref="A1"/>', dimension);
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([key, value]) => [key, strToU8(value)]),
      ),
    ),
  );
}
const meta = { filename: "库存测试.xlsx", asOfDate: "2026-10-24" };
test("parsed XML coordinates enforce limits with whitespace and entities", async () => {
  for (const attribute of ['r = "IW3"', 'r="&#73;W3"', 'r = "A50002"']) {
    const buffer = workbook({
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="3"><c ${attribute}><v>1</v></c></row></sheetData></worksheet>`,
    });
    await assert.rejects(
      () => parseInventoryWorkbook(buffer, meta),
      /范围超出限制/,
    );
  }
  for (const attribute of ['r = "50002"', 'r="&#53;0002"']) {
    const buffer = workbook({
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row ${attribute}/></sheetData></worksheet>`,
    });
    await assert.rejects(
      () => parseInventoryWorkbook(buffer, meta),
      /50000条商品/,
    );
  }
});
test("xlsx importer ignores broken A1 dimensions and preserves all rows and blanks", async () => {
  const result = await parseInventoryWorkbook(workbook(), meta);
  assert.equal(result.rowCount, 2);
  assert.equal(result.sheetName, "库存");
  assert.equal(result.summary.stockTotal, 20);
  assert.equal(result.items[0].sku, "000001");
  assert.equal(result.items[0].sales7, 0);
  assert.equal(result.items[1].sales7, null);
  assert.match(result.sourceHash, /^[a-f0-9]{64}$/);
});
test("explicitly closed dimension elements also use actual cells", async () => {
  const result = await parseInventoryWorkbook(
    workbook({}, '<dimension ref="A1"></dimension>'),
    meta,
  );
  assert.equal(result.rowCount, 2);
  assert.equal(result.summary.stockTotal, 20);
});
test("xlsx parser rejects formulas, macros, oversized ranges and invalid files", async () => {
  for (const [buffer, options] of [
    [Buffer.from("not-xlsx"), meta],
    [workbook(), { ...meta, filename: "wrong.csv" }],
    [workbook(), { ...meta, asOfDate: "2026-02-30" }],
    [workbook({ "xl/vbaProject.bin": "macro" }), meta],
    [
      workbook({
        "xl/worksheets/sheet1.xml":
          '<worksheet><sheetData><row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>',
      }),
      meta,
    ],
    [
      workbook({
        "xl/worksheets/sheet1.xml":
          '<worksheet><sheetData><row r="999999"><c r="A999999"><v>2</v></c></row></sheetData></worksheet>',
      }),
      meta,
    ],
    [
      workbook({
        "xl/worksheets/sheet1.xml":
          '<!DOCTYPE worksheet [<!ENTITY x "boom">]><worksheet/>',
      }),
      meta,
    ],
    [Buffer.alloc(4 * 1024 * 1024 + 1), meta],
  ])
    await assert.rejects(() => parseInventoryWorkbook(buffer, options));
});
