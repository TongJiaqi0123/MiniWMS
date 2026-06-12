const {
  db,
  ok,
  fail,
  requireMember,
  resolveImages,
  ensureCollections
} = require("./common");

exports.main = async (event) => {
  try {
    await ensureCollections();
    const tenantId = event.tenantId;
    await requireMember(tenantId, ["admin", "operator"]);

    const inboundId = event.inboundId;
    if (!inboundId) return fail("缺少入库记录ID");

    const images = Array.isArray(event.images) ? event.images.slice(0, 10) : [];

    const recordRes = await db.collection("inbound_records").doc(inboundId).get();
    const record = recordRes.data;
    if (!record || record.tenantId !== tenantId) return fail("入库记录不存在");

    await db.collection("inbound_records").doc(inboundId).update({
      data: { images }
    });

    var resolved = await resolveImages({ images: images });
    return ok({ images: resolved.images });
  } catch (error) {
    return fail(error.message);
  }
};
