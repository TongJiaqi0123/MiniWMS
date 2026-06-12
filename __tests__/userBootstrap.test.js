const wx = require("wx-server-sdk");
const { __test } = require("wx-server-sdk");
const userBootstrap = require("../cloudfunctions/userBootstrap/index");

describe("userBootstrap", () => {
  let db;

  beforeEach(() => {
    __test.resetStore();
    __test.setOpenid("user-001");
    db = wx.database();
  });

  test("returns empty tenants for new user", async () => {
    const res = await userBootstrap.main();
    expect(res.ok).toBe(true);
    expect(res.data.tenants).toHaveLength(0);
    expect(res.data.requests).toHaveLength(0);
    expect(res.data.openid).toBe("user-001");
  });

  test("returns active tenants user belongs to", async () => {
    const t = await db.collection("tenants").add({
      data: { name: "仓库A", inviteCode: "ABC", status: "active", createdBy: "admin", createdAt: new Date() }
    });
    await db.collection("tenant_members").add({
      data: { tenantId: t._id, openid: "user-001", role: "operator", status: "active" }
    });
    const res = await userBootstrap.main();
    expect(res.ok).toBe(true);
    expect(res.data.tenants).toHaveLength(1);
    expect(res.data.tenants[0].tenantName).toBe("仓库A");
    expect(res.data.tenants[0].role).toBe("operator");
  });

  test("filters out rejected tenants", async () => {
    const t = await db.collection("tenants").add({
      data: { name: "仓库B", inviteCode: "DEF", status: "rejected", createdBy: "admin", createdAt: new Date() }
    });
    await db.collection("tenant_members").add({
      data: { tenantId: t._id, openid: "user-001", role: "operator", status: "active" }
    });
    const res = await userBootstrap.main();
    expect(res.ok).toBe(true);
    expect(res.data.tenants).toHaveLength(0);
  });

  test("returns pending join requests", async () => {
    const t = await db.collection("tenants").add({
      data: { name: "仓库A", inviteCode: "ABC", status: "active", createdBy: "admin", createdAt: new Date() }
    });
    await db.collection("join_requests").add({
      data: { tenantId: t._id, openid: "user-001", status: "pending", createdAt: new Date() }
    });
    const res = await userBootstrap.main();
    expect(res.ok).toBe(true);
    expect(res.data.requests).toHaveLength(1);
    expect(res.data.requests[0].tenantName).toBe("仓库A");
  });

  test("detects system admin", async () => {
    await db.collection("system_config").add({
      data: { adminOpenids: ["user-001"], maxWarehousesPerUser: 3 }
    });
    const res = await userBootstrap.main();
    expect(res.ok).toBe(true);
    expect(res.data.isSystemAdmin).toBe(true);
    expect(res.data.needSystemAdmin).toBeFalsy();
  });

  test("sets needSystemAdmin when no config exists", async () => {
    const res = await userBootstrap.main();
    expect(res.ok).toBe(true);
    expect(res.data.isSystemAdmin).toBe(false);
    expect(res.data.needSystemAdmin).toBe(true);
  });

  test("non-admin user", async () => {
    await db.collection("system_config").add({
      data: { adminOpenids: ["other-user"], maxWarehousesPerUser: 3 }
    });
    const res = await userBootstrap.main();
    expect(res.ok).toBe(true);
    expect(res.data.isSystemAdmin).toBe(false);
  });
});
