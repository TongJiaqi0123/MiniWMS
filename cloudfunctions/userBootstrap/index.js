const {
  db,
  _,
  ok,
  fail,
  getOpenid,
  getTenantNameMap,
  getTenantDetailMap,
  ensureCollections
} = require("./common");

exports.main = async () => {
  try {
    await ensureCollections();
    const openid = await getOpenid();
    const memberRes = await db.collection("tenant_members")
      .where({ openid, status: "active" })
      .get();

    const tenantIds = memberRes.data.map((item) => item.tenantId);
    const tenantDetails = await getTenantDetailMap(tenantIds);
    const tenants = memberRes.data
      .filter((item) => {
        const d = tenantDetails[item.tenantId];
        return d && d.status !== "rejected";
      })
      .map((item) => ({
        tenantId: item.tenantId,
        tenantName: (tenantDetails[item.tenantId] && tenantDetails[item.tenantId].name) || "仓库空间",
        inviteCode: (tenantDetails[item.tenantId] && tenantDetails[item.tenantId].inviteCode) || "",
        tenantStatus: (tenantDetails[item.tenantId] && tenantDetails[item.tenantId].status) || "active",
        role: item.role
      }));

    const requestRes = await db.collection("join_requests")
      .where({ openid, status: _.in(["pending"]) })
      .orderBy("createdAt", "desc")
      .get();
    const requestTenantIds = requestRes.data.map((item) => item.tenantId);
    const requestNames = await getTenantNameMap(requestTenantIds);
    const requests = requestRes.data.map((item) => Object.assign({}, item, {
      tenantName: requestNames[item.tenantId] || ""
    }));


    // 检查是否为系统管理员
    let isSystemAdmin = false;
    let needSystemAdmin = false;
    try {
      const configRes = await db.collection("system_config").limit(1).get();
      if (configRes.data.length) {
        const config = configRes.data[0];
        isSystemAdmin = config.adminOpenids && config.adminOpenids.includes(openid);
      } else {
        needSystemAdmin = true;
      }
    } catch (e) {
      needSystemAdmin = true;
    }

    return ok({ openid, tenants, requests, isSystemAdmin, needSystemAdmin });
  } catch (error) {
    return fail(error.message);
  }
};
