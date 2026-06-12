const wx = require("wx-server-sdk");
const { __test } = require("wx-server-sdk");
const systemAdmin = require("../cloudfunctions/systemAdmin/index");

describe("systemAdmin", () => {
  let db;

  beforeEach(() => {
    __test.resetStore();
    __test.setOpenid("sysadmin-001");
    db = wx.database();
  });

  async function seedConfig() {
    await db.collection("system_config").add({
      data: { adminOpenids: ["sysadmin-001"], maxWarehousesPerUser: 3, maxImagesPerRecord: 3, createdAt: new Date() }
    });
  }

  describe("getConfig / updateConfig", () => {
    test("getConfig returns config", async () => {
      await seedConfig();
      const res = await systemAdmin.main({ action: "getConfig" });
      expect(res.ok).toBe(true);
      expect(res.data.config.maxWarehousesPerUser).toBe(3);
    });

    test("first admin auto-registers when no config exists", async () => {
      const res = await systemAdmin.main({ action: "getConfig" });
      expect(res.ok).toBe(true);
      const cfg = (await db.collection("system_config").get()).data[0];
      expect(cfg.adminOpenids).toContain("sysadmin-001");
    });

    test("updateConfig modifies settings", async () => {
      await seedConfig();
      const res = await systemAdmin.main({ action: "updateConfig", maxWarehousesPerUser: 5 });
      expect(res.ok).toBe(true);
      const cfg = (await db.collection("system_config").get()).data[0];
      expect(cfg.maxWarehousesPerUser).toBe(5);
    });

    test("updateConfig validates range for maxWarehousesPerUser", async () => {
      await seedConfig();
      const res = await systemAdmin.main({ action: "updateConfig", maxWarehousesPerUser: 0 });
      expect(res.ok).toBe(false);
    });

    test("updateConfig validates maxImagesPerRecord", async () => {
      await seedConfig();
      const res = await systemAdmin.main({ action: "updateConfig", maxImagesPerRecord: 11 });
      expect(res.ok).toBe(false);
    });
  });

  describe("tenant management", () => {
    test("listPending returns pending tenants", async () => {
      await seedConfig();
      await db.collection("tenants").add({
        data: { name: "W1", status: "pending", inviteCode: "X", createdBy: "u1", createdAt: new Date() }
      });
      const res = await systemAdmin.main({ action: "listPending" });
      expect(res.ok).toBe(true);
      expect(res.data.tenants).toHaveLength(1);
    });

    test("approve sets tenant active", async () => {
      await seedConfig();
      const t = await db.collection("tenants").add({
        data: { name: "W1", status: "pending", inviteCode: "X", createdBy: "u1", createdAt: new Date() }
      });
      const res = await systemAdmin.main({ action: "approve", tenantId: t._id });
      expect(res.ok).toBe(true);
      const tenant = (await db.collection("tenants").doc(t._id).get()).data;
      expect(tenant.status).toBe("active");
    });

    test("reject sets tenant rejected", async () => {
      await seedConfig();
      const t = await db.collection("tenants").add({
        data: { name: "W1", status: "pending", inviteCode: "X", createdBy: "u1", createdAt: new Date() }
      });
      const res = await systemAdmin.main({ action: "reject", tenantId: t._id });
      expect(res.ok).toBe(true);
      const tenant = (await db.collection("tenants").doc(t._id).get()).data;
      expect(tenant.status).toBe("rejected");
    });

    test("listAll returns all tenants", async () => {
      await seedConfig();
      await db.collection("tenants").add({ data: { name: "W1", status: "active", createdAt: new Date() } });
      await db.collection("tenants").add({ data: { name: "W2", status: "pending", createdAt: new Date() } });
      const res = await systemAdmin.main({ action: "listAll" });
      expect(res.ok).toBe(true);
      expect(res.data.tenants).toHaveLength(2);
    });
  });

  describe("getPublicConfig", () => {
    test("returns default when no config", async () => {
      const res = await systemAdmin.main({ action: "getPublicConfig" });
      expect(res.ok).toBe(true);
      expect(res.data.maxImagesPerRecord).toBe(3);
    });

    test("returns configured value", async () => {
      await db.collection("system_config").add({ data: { maxImagesPerRecord: 5 } });
      const res = await systemAdmin.main({ action: "getPublicConfig" });
      expect(res.ok).toBe(true);
      expect(res.data.maxImagesPerRecord).toBe(5);
    });
  });

  test("fails for non-admin when config exists", async () => {
    await seedConfig();
    __test.setOpenid("stranger");
    const res = await systemAdmin.main({ action: "getConfig" });
    expect(res.ok).toBe(false);
  });

  test("fails for unknown action", async () => {
    await seedConfig();
    const res = await systemAdmin.main({ action: "unknownAction" });
    expect(res.ok).toBe(false);
  });
});
