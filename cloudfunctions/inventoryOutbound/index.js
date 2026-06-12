const {
  db,
  ok,
  fail,
  now,
  round,
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
    const inputUnit = event.inputUnit;
    const inputQuantity = Number(event.inputQuantity || 0);
    const remark = String(event.remark || "").trim();

    if (!inboundId) return fail("缺少入库记录");
    if (!["area", "pieces"].includes(inputUnit)) return fail("出库单位无效");
    if (inputQuantity <= 0) return fail("请输入有效出库数量");

    // Use transaction to prevent concurrent outbound from causing negative stock
    const result = await db.runTransaction(async (transaction) => {
      const recordRes = await transaction.collection("inbound_records").doc(inboundId).get();
      const record = recordRes.data;
      if (!record || record.tenantId !== tenantId) throw new Error("入库记录不存在");
      if (record.status === "cleared") throw new Error("该记录已清空");

      const areaPerPiece = pieceArea(record);
      if (areaPerPiece <= 0) throw new Error("规格无效，无法换算");
      const areaDelta = round(inputUnit === "area" ? inputQuantity : inputQuantity * areaPerPiece);
      if (areaDelta <= 0) throw new Error("请输入有效出库数量");
      if (areaDelta > Number(record.remainingArea || 0) + 0.000001) throw new Error("出库数量超过剩余库存");

      const nextRemaining = Math.max(0, round(Number(record.remainingArea || 0) - areaDelta));
      await transaction.collection("inbound_records").doc(inboundId).update({
        data: {
          remainingArea: nextRemaining,
          status: nextRemaining <= 0 ? "cleared" : "active",
          updatedAt: now()
        }
      });

      await transaction.collection("stock_movements").add({
        data: {
          tenantId,
          inboundId,
          type: "outbound",
          inputUnit,
          inputQuantity,
          areaDelta,
          pieces: inputUnit === "pieces" ? Math.floor(inputQuantity) : piecesFromArea(areaDelta, record),
          pieceArea: areaPerPiece,
          remark,
          operator: openid,
          createdAt: now()
        }
      });

      return { remainingArea: nextRemaining };
    });

    return ok(result);
  } catch (error) {
    return fail(error.message);
  }
};
