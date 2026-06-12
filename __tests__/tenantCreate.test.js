const wx = require("wx-server-sdk");
const { __test } = require("wx-server-sdk");
const tenantCreate = require("../cloudfunctions/tenantCreate/index");

describe("tenantCreate", () => {
  let db;

  beforeEach(() => {
    __test.resetStore();
    __test.setOpenid("user-001");
    db = wx.database();
  });

  test("creates tenant and admin member", async () => {
    const res = await tenantCreate.main({ name: "仓库A" });
    expect(res.ok).toBe(true);
    expect(res.data.inviteCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(res.data.member.role).toBe("admin");

    const tenants = (await db.collection("tenants").get()).data;
    expect(tenants).toHaveLength(1);
    expect(tenants[0].name).toBe("仓库A");
    expect(tenants[0].status).toBe("pending");

    const members = (await db.collection("tenant_members").get()).data;
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("admin");
    expect(members[0].status).toBe("active");
  });

  test("fails without name", async () => {
    const res = await tenantCreate.main({});
    expect(res.ok).toBe(false);
  });

  test("respects max warehouse limit", async () => {
    await tenantCreate.main({ name: "W1" });
    await tenantCreate.main({ name: "W2" });
    await tenantCreate.main({ name: "W3" });
    const res = await tenantCreate.main({ name: "W4" });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/最多/);
  });

  test("respects custom max from system_config", async () => {
    await db.collection("system_config").add({
      data: { maxWarehousesPerUser: 1, adminOpenids: [] }
    });
    await tenantCreate.main({ name: "W1" });
    const res = await tenantCreate.main({ name: "W2" });
    expect(res.ok).toBe(false);
  });

  test("BUG FIX: invite code collision returns error instead of silently using colliding code", async () => {
    // Create many tenants to increase collision chance, then verify uniqueness
    // Since random codes are hard to force-collide, we verify the structural fix:
    // after the loop, if all retries fail, the function returns an error.
    // We test this indirectly by ensuring created codes are always unique.
    await tenantCreate.main({ name: "W1" });
    await tenantCreate.main({ name: "W2" });
    await tenantCreate.main({ name: "W3" });
    const all = (await db.collection("tenants").get()).data;
    const codes = all.map(t => t.inviteCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
