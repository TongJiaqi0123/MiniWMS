const {
  db,
  _,
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
    const { openid } = await requireTenantAccess(tenantId);
    const movementId = event.movementId;

    if (!movementId) return fail("缺少流水记录ID");

    const result = await db.runTransaction(async (transaction) => {
      const movementRes = await transaction.collection("stock_movements").doc(movementId).get();
      const movement = movementRes.data;
      if (!movement || movement.tenantId !== tenantId) throw new Error("流水记录不存在");
      if (movement.reversed) throw new Error("该记录已撤销");
      if (movement.type === "clear") throw new Error("清空记录不可撤销");

      const inboundId = movement.inboundId;

      const latestRes = await transaction.collection("stock_movements")
        .where({ tenantId, inboundId, reversed: _.neq(true) })
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

      const latestMovement = latestRes.data && latestRes.data[0];
      if (!latestMovement || latestMovement._id !== movementId) {
        throw new Error("只能撤销最近一次操作");
      }

      const recordRes = await transaction.collection("inbound_records").doc(inboundId).get();
      const record = recordRes.data;
      if (!record || record.tenantId !== tenantId) throw new Error("入库记录不存在");

      const areaDelta = Number(movement.areaDelta || 0);
      const piecesDelta = Number(movement.pieces || 0);

      let newRemainingArea, newTotalArea, newTotalPieces, newStatus;

      if (movement.type === "inbound") {
        newRemainingArea = Math.max(0, round(Number(record.remainingArea || 0) - areaDelta));
        newTotalArea = Math.max(0, round(Number(record.totalArea || 0) - areaDelta));
        newTotalPieces = Math.max(0, Number(record.totalPieces || 0) - piecesDelta);
        newStatus = newRemainingArea <= 0 ? "cleared" : "active";
      } else {
        newRemainingArea = round(Number(record.remainingArea || 0) + areaDelta);
        newTotalArea = Number(record.totalArea || 0);
        newTotalPieces = Number(record.totalPieces || 0);
        newStatus = "active";
      }

      await transaction.collection("inbound_records").doc(inboundId).update({
        data: {
          remainingArea: newRemainingArea,
          totalArea: newTotalArea,
          totalPieces: newTotalPieces,
          status: newStatus,
          updatedAt: now()
        }
      });

      await transaction.collection("stock_movements").doc(movementId).update({
        data: {
          reversed: true,
          reversedBy: openid,
          reversedAt: now()
        }
      });

      return {
        remainingArea: newRemainingArea,
        totalArea: newTotalArea,
        totalPieces: newTotalPieces,
        areaDelta: areaDelta,
        pieces: piecesDelta
      };
    });

    return ok(result);
  } catch (error) {
    return fail(error.message);
  }
};