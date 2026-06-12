const {
  db,
  _,
  ok,
  fail,
  now,
  getOpenid,
  isSystemAdmin,
  ensureCollections
} = require("./common");

async function requireSystemAdmin() {
  const openid = await getOpenid();
  try {
    const configRes = await db.collection("system_config").limit(1).get();
    if (!configRes.data.length) {
      await db.collection("system_config").add({
        data: {
          adminOpenids: [openid],
          maxWarehousesPerUser: 3,
          createdAt: now()
        }
      });
      return openid;
    }
    const config = configRes.data[0];
    const isAdmin = await isSystemAdmin(openid);
    if (!isAdmin) {
      throw new Error("无权操作，仅系统管理员可用");
    }
    return openid;
  } catch (error) {
    if (error.message.includes("无权")) throw error;
    throw new Error("系统配置异常");
  }
}

exports.main = async (event) => {
  try {
    await ensureCollections();
    const action = event.action;

    if (action === "getConfig") {
      await requireSystemAdmin();
      const configRes = await db.collection("system_config").limit(1).get();
      const config = configRes.data[0] || { maxWarehousesPerUser: 3, maxImagesPerRecord: 3, adminOpenids: [] };
      return ok({ config });
    }

    if (action === "updateConfig") {
      await requireSystemAdmin();
      const configRes = await db.collection("system_config").limit(1).get();
      if (!configRes.data.length) return fail("系统配置不存在");
      const configId = configRes.data[0]._id;
      const updateData = {};
      if (event.maxWarehousesPerUser !== undefined) {
        const max = Number(event.maxWarehousesPerUser);
        if (max < 1 || max > 99) return fail("仓库数量限制顼在 1-99 之间");
        updateData.maxWarehousesPerUser = max;
      }
      if (event.adminOpenids !== undefined) {
        updateData.adminOpenids = event.adminOpenids;
      }
      if (event.maxImagesPerRecord !== undefined) {
        const imgMax = Number(event.maxImagesPerRecord);
        if (imgMax < 1 || imgMax > 10) return fail("图片数量限制须在 1-10 之间");
        updateData.maxImagesPerRecord = imgMax;
      }
      await db.collection("system_config").doc(configId).update({ data: updateData });
      return ok({ message: "配置已更新" });
    }

    if (action === "listPending") {
      await requireSystemAdmin();
      const res = await db.collection("tenants")
        .where({ status: "pending" })
        .orderBy("createdAt", "desc")
        .get();
      const list = res.data.map(t => ({
        _id: t._id,
        name: t.name,
        inviteCode: t.inviteCode,
        createdBy: t.createdBy,
        createdAtText: t.createdAt ? new Date(t.createdAt).toLocaleString() : ""
      }));
      return ok({ tenants: list });
    }

    if (action === "listAll") {
      await requireSystemAdmin();
      const res = await db.collection("tenants")
        .orderBy("createdAt", "desc")
        .get();
      const list = res.data.map(t => ({
        _id: t._id,
        name: t.name,
        inviteCode: t.inviteCode,
        accessStatus: t.accessStatus || "enabled",
        status: t.status,
        createdBy: t.createdBy,
        createdAtText: t.createdAt ? new Date(t.createdAt).toLocaleString() : ""
      }));
      return ok({ tenants: list });
    }

    if (action === "enterTenant") {
      const openid = await requireSystemAdmin();
      const tenantId = event.tenantId;
      if (!tenantId) return fail("缺少仓库ID");

      const tenantRes = await db.collection("tenants").doc(tenantId).get();
      const tenant = tenantRes.data;
      if (!tenant) return fail("仓库不存在");

      const memberRes = await db.collection("tenant_members")
        .where({ tenantId, openid })
        .limit(1)
        .get();

      if (!memberRes.data.length) {
        await db.collection("tenant_members").add({
          data: {
            tenantId,
            openid,
            role: "admin",
            status: "active",
            joinedAt: now(),
            grant: "system_admin"
          }
        });
      } else if (memberRes.data[0].status !== "active" || memberRes.data[0].role !== "admin") {
        await db.collection("tenant_members").doc(memberRes.data[0]._id).update({
          data: {
            role: "admin",
            status: "active"
          }
        });
      }

      return ok({ tenantId, tenantName: tenant.name, inviteCode: tenant.inviteCode, status: tenant.status });
    }

    if (action === "approve") {
      await requireSystemAdmin();
      const tenantId = event.tenantId;
      if (!tenantId) return fail("缺少仓库ID");
      await db.collection("tenants").doc(tenantId).update({
        data: { status: "active" }
      });
      return ok({ message: "已通过" });
    }

    if (action === "reject") {
      await requireSystemAdmin();
      const tenantId = event.tenantId;
      if (!tenantId) return fail("缺少仓库ID");
      await db.collection("tenants").doc(tenantId).update({
        data: { status: "rejected" }
      });
      return ok({ message: "已拒绝" });
    }

    if (action === "setAccessStatus") {
      await requireSystemAdmin();
      const tenantId = event.tenantId;
      const accessStatus = event.accessStatus;
      if (!tenantId) return fail("缺少仓库ID");
      if (!["enabled", "disabled"].includes(accessStatus)) return fail("状态值无效");
      await db.collection("tenants").doc(tenantId).update({
        data: { accessStatus }
      });
      return ok({ message: "已更新" });
    }

    if (action === "getPublicConfig") {
      try {
        const configRes = await db.collection("system_config").limit(1).get();
        const config = configRes.data[0] || {};
        return ok({ maxImagesPerRecord: config.maxImagesPerRecord || 3 });
      } catch (e) {
        return ok({ maxImagesPerRecord: 3 });
      }
    }

    return fail("未知操作: " + action);
  } catch (error) {
    return fail(error.message);
  }
};
