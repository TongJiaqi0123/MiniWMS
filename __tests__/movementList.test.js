const wx = require("wx-server-sdk");
const { __test } = require("wx-server-sdk");
const movementList = require("../cloudfunctions/movementList/index");

describe("movementList", () => {
  let db, tenantId, inboundId;

  beforeEach(async () => {
    __test.resetStore();
    __test.setOpenid("op-001");
    db = wx.database();
    const t = await db.collection("tenants").add({
      data: { name: "仓库A", inviteCode: "ABC", status: "active", createdBy: "admin", createdAt: new Date() }
    });
    tenantId = t._id;
    await db.collection("tenant_members").add({
      data: { tenantId, openid: "op-001", role: "operator", status: "active" }
    });
    const rec = await db.collection("inbound_records").add({
      data: { tenantId, name: "A", remainingArea: 1, status: "active",
              createdAt: new Date(), images: [], lengthCm: 100, widthCm: 100 }
    });
    inboundId = rec._id;
  });

  async function seedMovements(count) {
    for (let i = 0; i < count; i++) {
      await db.collection("stock_movements").add({
        data: { tenantId, inboundId, type: i === 0 ? "inbound" : "outbound", areaDelta: 1, createdAt: new Date(2024, 0, i + 1) }
      });
    }
  }

  test("lists movements for inbound record", async () => {
    await seedMovements(2);
    const res = await movementList.main({ tenantId, inboundId });
    expect(res.ok).toBe(true);
    expect(res.data.movements).toHaveLength(2);
  });

  test("default pageSize is 100", async () => {
    await seedMovements(3);
    const res = await movementList.main({ tenantId, inboundId });
    expect(res.ok).toBe(true);
    expect(res.data.movements).toHaveLength(3);
  });

  test("paginates page 1", async () => {
    await seedMovements(5);
    const res = await movementList.main({ tenantId, inboundId, page: 1, pageSize: 2 });
    expect(res.ok).toBe(true);
    expect(res.data.movements).toHaveLength(2);
  });

  test("paginates page 2 with no overlap", async () => {
    await seedMovements(5);
    const p1 = await movementList.main({ tenantId, inboundId, page: 1, pageSize: 2 });
    const p2 = await movementList.main({ tenantId, inboundId, page: 2, pageSize: 2 });
    expect(p2.ok).toBe(true);
    expect(p2.data.movements).toHaveLength(2);
    const ids1 = p1.data.movements.map(m => m._id);
    const ids2 = p2.data.movements.map(m => m._id);
    expect(ids1).not.toEqual(ids2);
  });

  test("last page returns remaining", async () => {
    await seedMovements(5);
    const res = await movementList.main({ tenantId, inboundId, page: 3, pageSize: 2 });
    expect(res.ok).toBe(true);
    expect(res.data.movements).toHaveLength(1);
  });

  test("page beyond data returns empty", async () => {
    await seedMovements(2);
    const res = await movementList.main({ tenantId, inboundId, page: 5, pageSize: 10 });
    expect(res.ok).toBe(true);
    expect(res.data.movements).toHaveLength(0);
  });

  test("pageSize > 200 is clamped to 200", async () => {
    await seedMovements(3);
    const res = await movementList.main({ tenantId, inboundId, page: 1, pageSize: 999 });
    expect(res.ok).toBe(true);
    expect(res.data.movements).toHaveLength(3);
  });

  test("all pages cover all records", async () => {
    await seedMovements(7);
    const allIds = [];
    for (let p = 1; p <= 4; p++) {
      const res = await movementList.main({ tenantId, inboundId, page: p, pageSize: 3 });
      expect(res.ok).toBe(true);
      res.data.movements.forEach(m => allIds.push(m._id));
    }
    expect(allIds).toHaveLength(7);
    expect(new Set(allIds).size).toBe(7);
  });

  test("fails without inboundId", async () => {
    const res = await movementList.main({ tenantId });
    expect(res.ok).toBe(false);
  });

  test("fails for non-existent record", async () => {
    const res = await movementList.main({ tenantId, inboundId: "nonexistent" });
    expect(res.ok).toBe(false);
  });
});
