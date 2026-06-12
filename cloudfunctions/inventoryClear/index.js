const {
  db,
  ok,
  fail,
  now,
  pieceArea,
  piecesFromArea,
  requireTenantAccess,
  ensureCollections
} = require("./common");

exports.main = async (event) => {
  try {
    await ensureCollections();
    const tenantId = event.tenantId;
    const { openid } = await requireTenantAccess(tenantId, ["admin", "operator"]);
    const inboundId = event.inboundId;
    if (!inboundId) return fail("缺少入库记录");

    const recordRes = await db.collection("inbound_records").doc(inboundId).get();
    const record = recordRes.data;
    if (!record || record.tenantId !== tenantId) return fail("入库记录不存在");
    if (record.status === "cleared") return ok();

    const remainingArea = Number(record.remainingArea || 0);
    await db.collection("inbound_records").doc(inboundId).update({
      data: {
        remainingArea: 0,
        status: "cleared",
        updatedAt: now()
      }
    });

    await db.collection("stock_movements").add({
      data: {
        tenantId,
        inboundId,
        type: "clear",
        inputUnit: "area",
        inputQuantity: remainingArea,
        areaDelta: remainingArea,
        pieces: piecesFromArea(remainingArea, record),
        pieceArea: pieceArea(record),
        remark: "标记清空",
        operator: openid,
        createdAt: now()
      }
    });

    return ok();
  } catch (error) {
    return fail(error.message);
  }
};
