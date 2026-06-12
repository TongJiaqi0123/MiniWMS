const {
  db,
  ok,
  fail,
  now,
  requireTenantAccess,
  ensureCollections
} = require("./common");

exports.main = async (event) => {
  try {
    await ensureCollections();
    const tenantId = event.tenantId;
    const action = event.action;
    const { openid } = await requireTenantAccess(tenantId, ["admin"]);

    if (action === "list") {
      const res = await db.collection("join_requests")
        .where({ tenantId, status: "pending" })
        .orderBy("createdAt", "desc")
        .get();
      return ok({ requests: res.data });
    }

    if (!["approved", "rejected"].includes(action)) {
      return fail("审批动作无效");
    }

    const requestId = event.requestId;
    if (!requestId) return fail("缺少加入申请");

    const requestRes = await db.collection("join_requests").doc(requestId).get();
    const request = requestRes.data;
    if (!request || request.tenantId !== tenantId || request.status !== "pending") {
      return fail("申请不存在或已处理");
    }

    await db.collection("join_requests").doc(requestId).update({
      data: {
        status: action,
        reviewedBy: openid,
        reviewedAt: now()
      }
    });

    if (action === "approved") {
      const existing = await db.collection("tenant_members")
        .where({ tenantId, openid: request.openid })
        .limit(1)
        .get();
      if (existing.data.length) {
        await db.collection("tenant_members").doc(existing.data[0]._id).update({
          data: {
            role: "operator",
            status: "active",
            joinedAt: now()
          }
        });
      } else {
        await db.collection("tenant_members").add({
          data: {
            tenantId,
            openid: request.openid,
            role: "operator",
            status: "active",
            joinedAt: now()
          }
        });
      }
    }

    return ok();
  } catch (error) {
    return fail(error.message);
  }
};
