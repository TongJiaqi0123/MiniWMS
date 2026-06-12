const {
  db,
  ok,
  fail,
  now,
  getOpenid,
  ensureCollections
} = require("./common");

exports.main = async (event) => {
  try {
    await ensureCollections();
    const inviteCode = String(event.inviteCode || "").trim().toUpperCase();
    const remark = String(event.remark || "").trim();
    if (!inviteCode) return fail("请输入邀请码");

    const tenantRes = await db.collection("tenants")
      .where({ inviteCode, status: "active" })
      .limit(1)
      .get();
    const tenant = tenantRes.data[0];
    if (!tenant) return fail("邀请码不存在");
    if (tenant.accessStatus === "disabled") return fail("仓库已禁用，暂不接受加入");

    const openid = await getOpenid();
    const memberRes = await db.collection("tenant_members")
      .where({ tenantId: tenant._id, openid, status: "active" })
      .limit(1)
      .get();
    if (memberRes.data.length) return fail("你已加入该仓库");

    const pendingRes = await db.collection("join_requests")
      .where({ tenantId: tenant._id, openid, status: "pending" })
      .limit(1)
      .get();
    if (pendingRes.data.length) return fail("已提交申请，请等待审批");

    await db.collection("join_requests").add({
      data: {
        tenantId: tenant._id,
        openid,
        remark,
        status: "pending",
        createdAt: now()
      }
    });

    return ok();
  } catch (error) {
    return fail(error.message);
  }
};
