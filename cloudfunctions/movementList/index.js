const {
  db,
  ok,
  fail,
  requireTenantAccess,
  ensureCollections
} = require("./common");

exports.main = async (event) => {
  try {
    await ensureCollections();
    const tenantId = event.tenantId;
    await requireTenantAccess(tenantId, ["admin", "operator"]);

    const inboundId = event.inboundId;
    if (!inboundId) return fail("缺少入库记录");

    const recordRes = await db.collection("inbound_records").doc(inboundId).get();
    const record = recordRes.data;
    if (!record || record.tenantId !== tenantId) return fail("入库记录不存在");

    const page = Math.max(Number(event.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(event.pageSize || 100), 1), 200);

    const res = await db.collection("stock_movements")
      .where({ tenantId, inboundId })
      .orderBy("createdAt", "asc")
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();
    return ok({ movements: res.data });
  } catch (error) {
    return fail(error.message);
  }
};
