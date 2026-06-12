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

exports.main = async (event) => {
  try {
    await ensureCollections();
    const tenantId = event.tenantId;
    const { openid } = await requireTenantAccess(tenantId, ["admin", "operator"]);

    const name = String(event.name || "").trim();
    const lengthCm = Number(event.lengthCm || 0);
    const widthCm = Number(event.widthCm || 0);
    const totalArea = round(event.totalArea);
    const totalPieces = Math.floor(Number(event.totalPieces || 0));
    const images = Array.isArray(event.images) ? event.images.slice(0, 3) : [];
    const remark = String(event.remark || "").trim();

    if (!name) return fail("请输入入库名称");
    if (lengthCm <= 0 || widthCm <= 0) return fail("请输入有效长宽");
    if (totalArea <= 0) return fail("请输入有效总平方");
    if (totalPieces <= 0) return fail("请输入有效总片数");

    const calculatedArea = round(lengthCm * widthCm / 10000 * totalPieces);
    if (Math.abs(calculatedArea - totalArea) > 0.05) {
      return fail("总平方需与长宽和片数匹配");
    }

    // Use transaction to ensure inbound record and movement are created together
    const recordId = await db.runTransaction(async (transaction) => {
      const recordData = {
        tenantId,
        name,
        remark,
        images,
        lengthCm,
        widthCm,
        totalArea,
        remainingArea: totalArea,
        totalPieces,
        status: "active",
        createdBy: openid,
        createdAt: now()
      };
      const record = await transaction.collection("inbound_records").add({ data: recordData });

      await transaction.collection("stock_movements").add({
        data: {
          tenantId,
          inboundId: record._id,
          type: "inbound",
          inputUnit: "area",
          inputQuantity: totalArea,
          areaDelta: totalArea,
          pieces: totalPieces,
          pieceArea: pieceArea(recordData),
          remark,
          operator: openid,
          createdAt: now()
        }
      });

      return record._id;
    });

    return ok({ id: recordId });
  } catch (error) {
    return fail(error.message);
  }
};
