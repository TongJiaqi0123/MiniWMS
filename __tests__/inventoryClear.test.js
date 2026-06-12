const wx = require("wx-server-sdk");
const { __test } = require("wx-server-sdk");
const clear = require("../cloudfunctions/inventoryClear/index");

describe("inventoryClear", () => {
  let db, tenantId;

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
  });

  async function seedActive(overrides = {}) {
    const defaults = {
      tenantId, name: "布料A", lengthCm: 200, widthCm: 150,
      totalArea: 30, remainingArea: 30, totalPieces: 10,
      status: "active", createdBy: "op-001", createdAt: new Date(),
      images: [], remark: ""
    };
    return db.collection("inbound_records").add({ data: Object.assign({}, defaults, overrides) });
  }

  test("clears active record", async () => {
    const rec = await seedActive();
    const res = await clear.main({ tenantId, inboundId: rec._id });
    expect(res.ok).toBe(true);
    const updated = (await db.collection("inbound_records").doc(rec._id).get()).data;
    expect(updated.remainingArea).toBe(0);
    expect(updated.status).toBe("cleared");
  });

  test("creates clear movement", async () => {
    const rec = await seedActive();
    await clear.main({ tenantId, inboundId: rec._id });
    const moves = (await db.collection("stock_movements").get()).data;
    expect(moves).toHaveLength(1);
    expect(moves[0].type).toBe("clear");
  });

  test("idempotent on already cleared record", async () => {
    const rec = await seedActive({ status: "cleared", remainingArea: 0 });
    const res = await clear.main({ tenantId, inboundId: rec._id });
    expect(res.ok).toBe(true);
    const moves = (await db.collection("stock_movements").get()).data;
    expect(moves).toHaveLength(0);
  });

  test("fails without inboundId", async () => {
    const res = await clear.main({ tenantId });
    expect(res.ok).toBe(false);
  });

  test("fails for wrong tenant", async () => {
    const rec = await seedActive();
    const res = await clear.main({ tenantId: "nonexistent", inboundId: rec._id });
    expect(res.ok).toBe(false);
  });
});
