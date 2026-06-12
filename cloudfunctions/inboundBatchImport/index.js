const XLSX = require("xlsx");
const {
  db,
  ok,
  fail,
  now,
  round,
  pieceArea,
  requireTenantAccess,
  ensureCollections
} = require("./common");

const MAX_ROWS = 500;
const ALLOWED_UNITS = ["m", "cm", "mm"];
const REQUIRED_HEADERS = ["入库名称", "长宽单位", "长度", "宽度", "总片数"];

function headerIndex(headers, name) {
  const idx = headers.indexOf(name);
  return idx >= 0 ? idx : -1;
}

function toStringCell(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function toNumberCell(value) {
  if (value === undefined || value === null || value === "") return NaN;
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

exports.main = async (event) => {
  try {
    await ensureCollections();
    const tenantId = event.tenantId;
    const fileId = event.fileId;
    const { openid } = await requireTenantAccess(tenantId, ["admin"]);

    if (!fileId) return fail("请先上传 Excel 文件");

    const fileRes = await db.downloadFile({ fileID: fileId });
    const workbook = XLSX.read(fileRes.fileContent, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return fail("Excel 文件无工作表");

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (!rows.length) return fail("Excel 文件无数据");

    const headerRow = rows[0].map((item) => toStringCell(item));
    for (const header of REQUIRED_HEADERS) {
      if (!headerRow.includes(header)) {
        return fail("表头缺少必填列：" + header);
      }
    }

    const dataRows = rows.slice(1);
    const effectiveRows = [];
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const isEmpty = row.every((cell) => toStringCell(cell) === "");
      if (!isEmpty) {
        effectiveRows.push({ rowIndex: i + 2, columns: row });
      }
    }

    if (!effectiveRows.length) return fail("Excel 无有效数据行");
    if (effectiveRows.length > MAX_ROWS) return fail("单次导入不能超过 " + MAX_ROWS + " 行");

    const nameIdx = headerIndex(headerRow, "入库名称");
    const unitIdx = headerIndex(headerRow, "长宽单位");
    const lengthIdx = headerIndex(headerRow, "长度");
    const widthIdx = headerIndex(headerRow, "宽度");
    const piecesIdx = headerIndex(headerRow, "总片数");
    const areaIdx = headerIndex(headerRow, "总平方");
    const remarkIdx = headerIndex(headerRow, "备注");

    const errors = [];
    const prepared = [];

    for (const item of effectiveRows) {
      const columns = item.columns;
      const name = toStringCell(columns[nameIdx]);
      const unit = toStringCell(columns[unitIdx]).toLowerCase();
      const length = toNumberCell(columns[lengthIdx]);
      const width = toNumberCell(columns[widthIdx]);
      const totalPieces = Math.floor(toNumberCell(columns[piecesIdx]));
      const remark = remarkIdx >= 0 ? toStringCell(columns[remarkIdx]) : "";

      if (!name) {
        errors.push({ row: item.rowIndex, reason: "入库名称不能为空" });
        continue;
      }
      if (!ALLOWED_UNITS.includes(unit)) {
        errors.push({ row: item.rowIndex, reason: "长宽单位仅允许 cm 或 mm" });
        continue;
      }
      if (!Number.isFinite(length) || length <= 0) {
        errors.push({ row: item.rowIndex, reason: "长度必须为正数" });
        continue;
      }
      if (!Number.isFinite(width) || width <= 0) {
        errors.push({ row: item.rowIndex, reason: "宽度必须为正数" });
        continue;
      }
      if (!Number.isFinite(totalPieces) || totalPieces <= 0) {
        errors.push({ row: item.rowIndex, reason: "总片数必须为正整数" });
        continue;
      }

      const lengthCm = unit === "cm" ? length : length / 10;
      const widthCm = unit === "cm" ? width : width / 10;
      const pieceAreaValue = round((lengthCm * widthCm) / 10000);
      const autoArea = round(pieceAreaValue * totalPieces, 4);

      let totalArea = autoArea;
      if (areaIdx >= 0 && toStringCell(columns[areaIdx]) !== "") {
        const inputArea = toNumberCell(columns[areaIdx]);
        if (!Number.isFinite(inputArea) || inputArea <= 0) {
          errors.push({ row: item.rowIndex, reason: "总平方必须为正数" });
          continue;
        }
        if (Math.abs(inputArea - autoArea) > 0.05) {
          errors.push({ row: item.rowIndex, reason: "总平方需与长宽和片数匹配" });
          continue;
        }
        totalArea = round(inputArea, 4);
      }

      prepared.push({
        row: item.rowIndex,
        record: {
          tenantId,
          name,
          remark,
          images: [],
          lengthCm: round(lengthCm, 4),
          widthCm: round(widthCm, 4),
          totalArea,
          remainingArea: totalArea,
          totalPieces,
          status: "active",
          createdBy: openid,
          createdAt: now()
        },
        movement: {
          tenantId,
          inboundId: null,
          type: "inbound",
          inputUnit: "area",
          inputQuantity: totalArea,
          areaDelta: totalArea,
          pieces: totalPieces,
          pieceArea: pieceAreaValue,
          remark,
          operator: openid,
          createdAt: now()
        }
      });
    }

    let imported = 0;
    for (const item of prepared) {
      const recordId = await db.runTransaction(async (transaction) => {
        const recordRes = await transaction.collection("inbound_records").add({ data: item.record });
        item.movement.inboundId = recordRes._id;
        await transaction.collection("stock_movements").add({ data: item.movement });
        return recordRes._id;
      });
      imported += 1;
    }

    return ok({
      total: effectiveRows.length,
      imported,
      errors
    });
  } catch (error) {
    return fail(error.message);
  }
};
