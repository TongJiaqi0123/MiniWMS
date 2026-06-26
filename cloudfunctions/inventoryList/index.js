const {
  db,
  _,
  ok,
  fail,
  round,
  requireTenantAccess,
  resolveImages,
  ensureCollections
} = require("./common");

exports.main = async (event) => {
  try {
    await ensureCollections();
    const tenantId = event.tenantId;
    await requireTenantAccess(tenantId, ["admin", "operator"]);

    if (event.id) {
      const res = await db.collection("inbound_records").doc(event.id).get();
      const record = res.data;
      if (!record || record.tenantId !== tenantId) return fail("入库记录不存在");
      return ok({ record: await resolveImages(record) });
    }

    const page = Math.max(Number(event.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(event.pageSize || 50), 1), 100);

    const query = { tenantId };

    if (event.nameKeyword) {
      const keyword = String(event.nameKeyword).slice(0, 50);
      query.name = db.RegExp({
        regexp: keyword,
        options: "i"
      });
    }

    const isActive = event.status === "active";

    if (event.status) {
      if (isActive) {
        query.status = _.neq("cleared");
      } else {
        query.status = event.status;
      }
    }

    const minArea = Number(event.minArea || 0);
    const maxArea = Number(event.maxArea || 0);
    const areaConditions = [];
    if (isActive) areaConditions.push(_.gt(0));
    if (minArea > 0) areaConditions.push(_.gte(minArea));
    if (maxArea > 0) areaConditions.push(_.lte(maxArea));
    if (areaConditions.length === 1) {
      query.remainingArea = areaConditions[0];
    } else if (areaConditions.length > 1) {
      query.remainingArea = _.and(areaConditions[0], ...areaConditions.slice(1));
    }

    const res = await db.collection("inbound_records")
      .where(query)
      .orderBy("createdAt", "desc")
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    var records = await Promise.all(res.data.map(resolveImages));
    records = records.map((record) => {
      const converted = Object.assign({}, record);
      if (converted.lengthCm !== undefined) {
        converted.lengthM = round(Number(converted.lengthCm || 0) / 100, 4);
      }
      if (converted.widthCm !== undefined) {
        converted.widthM = round(Number(converted.widthCm || 0) / 100, 4);
      }
      return converted;
    });
    return ok({ records });
  } catch (error) {
    return fail(error.message);
  }
};
