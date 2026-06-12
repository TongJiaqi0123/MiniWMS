const {
  db,
  _,
  ok,
  fail,
  now,
  getOpenid,
  inviteCode,
  ensureCollections
} = require("./common");

const MAX_WAREHOUSES_DEFAULT = 3;

exports.main = async (event) => {
  try {
    await ensureCollections();
    const name = String(event.name || "").trim();
    if (!name) return fail("请输入仓库名称");

    const openid = await getOpenid();

    let maxWarehouses = MAX_WAREHOUSES_DEFAULT;
    try {
      const configRes = await db.collection("system_config").limit(1).get();
      if (configRes.data.length && configRes.data[0].maxWarehousesPerUser) {
        maxWarehouses = configRes.data[0].maxWarehousesPerUser;
      }
    } catch (e) {}

    const existingTenants = await db.collection("tenants")
      .where({ createdBy: openid })
      .count();
    if (existingTenants.total >= maxWarehouses) {
      return fail("每个用户最多创建 " + maxWarehouses + " 个仓库");
    }

    let code = inviteCode();
    let codeUnique = false;
    for (let i = 0; i < 5; i += 1) {
      const existing = await db.collection("tenants").where({ inviteCode: code }).limit(1).get();
      if (!existing.data.length) { codeUnique = true; break; }
      code = inviteCode();
    }
    // BUG FIX: fail if all 5 attempts collided instead of silently using colliding code
    if (!codeUnique) {
      return fail("邀请码生成失败，请重试");
    }

    const tenant = await db.collection("tenants").add({
      data: {
        name,
        inviteCode: code,
        createdBy: openid,
        createdAt: now(),
        status: "pending",
        accessStatus: "enabled"
      }
    });

    await db.collection("tenant_members").add({
      data: {
        tenantId: tenant._id,
        openid,
        role: "admin",
        status: "active",
        joinedAt: now()
      }
    });

    return ok({
      inviteCode: code,
      member: {
        tenantId: tenant._id,
        tenantName: name,
        role: "admin"
      }
    });
  } catch (error) {
    return fail(error.message);
  }
};
