const wx = require("wx-server-sdk");
const { __test } = require("wx-server-sdk");
const outbound = require("../cloudfunctions/inventoryOutbound/index");

describe("inventoryOutbound", () => {
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

  async function seedInbound(overrides = {}) {
    const defaults = {
      tenantId, name: "布料A", lengthCm: 200, widthCm: 150,
      totalArea: 30, remainingArea: 30, totalPieces: 10,
      status: "active", createdBy: "op-001", createdAt: new Date(),
      images: [], remark: ""
    };
    const data = Object.assign({}, defaults, overrides);
    const res = await db.collection("inbound_records").add({ data });
    return res._id;
  }

  test("outbound by area succeeds", async () => {
    const inboundId = await seedInbound();
    const res = await outbound.main({ tenantId, inboundId, inputUnit: "area", inputQuantity: 9 });
    expect(res.ok).toBe(true);
    expect(res.data.remainingArea).toBeCloseTo(21, 4);
  });

  test("outbound by pieces succeeds", async () => {
    const inboundId = await seedInbound();
    const res = await outbound.main({ tenantId, inboundId, inputUnit: "pieces", inputQuantity: 3 });
    expect(res.ok).toBe(true);
    expect(res.data.remainingArea).toBeCloseTo(21, 4);
  });

  test("full outbound sets status to cleared", async () => {
    const inboundId = await seedInbound();
    const res = await outbound.main({ tenantId, inboundId, inputUnit: "area", inputQuantity: 30 });
    expect(res.ok).toBe(true);
    expect(res.data.remainingArea).toBe(0);
    const record = (await db.collection("inbound_records").doc(inboundId).get()).data;
    expect(record.status).toBe("cleared");
  });

  test("fails when outbound exceeds remaining", async () => {
    const inboundId = await seedInbound();
    const res = await outbound.main({ tenantId, inboundId, inputUnit: "area", inputQuantity: 100 });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/超过/);
  });

  test("fails on cleared record", async () => {
    const inboundId = await seedInbound({ status: "cleared", remainingArea: 0 });
    const res = await outbound.main({ tenantId, inboundId, inputUnit: "area", inputQuantity: 1 });
    expect(res.ok).toBe(false);
  });

  test("fails with invalid inputUnit", async () => {
    const inboundId = await seedInbound();
    const res = await outbound.main({ tenantId, inboundId, inputUnit: "kg", inputQuantity: 1 });
    expect(res.ok).toBe(false);
  });

  test("fails without inboundId", async () => {
    const res = await outbound.main({ tenantId, inputUnit: "area", inputQuantity: 1 });
    expect(res.ok).toBe(false);
  });

  test("fails for non-member", async () => {
    __test.setOpenid("stranger");
    const inboundId = await seedInbound();
    const res = await outbound.main({ tenantId, inboundId, inputUnit: "area", inputQuantity: 1 });
    expect(res.ok).toBe(false);
  });

  test("BUG FIX: remaining area should not go negative after outbound", async () => {
    const inboundId = await seedInbound({ totalArea: 1.0, remainingArea: 1.0, lengthCm: 100, widthCm: 100, totalPieces: 1 });
    const res = await outbound.main({ tenantId, inboundId, inputUnit: "area", inputQuantity: 1.000001 });
    if (res.ok) {
      expect(res.data.remainingArea).toBeGreaterThanOrEqual(0);
    }
  });

  test("BUG FIX: outbound by pieces uses inputQuantity for pieces in movement", async () => {
    const inboundId = await seedInbound({ lengthCm: 33, widthCm: 33, totalArea: 0.3267, remainingArea: 0.3267, totalPieces: 3 });
    const res = await outbound.main({ tenantId, inboundId, inputUnit: "pieces", inputQuantity: 2 });
    expect(res.ok).toBe(true);
    const moves = (await db.collection("stock_movements").get()).data;
    const outMove = moves.find(m => m.type === "outbound");
    expect(outMove.pieces).toBe(2);
  });

  test("creates movement record", async () => {
    const inboundId = await seedInbound();
    await outbound.main({ tenantId, inboundId, inputUnit: "area", inputQuantity: 9, remark: "test" });
    const moves = (await db.collection("stock_movements").get()).data;
    expect(moves).toHaveLength(1);
    expect(moves[0].type).toBe("outbound");
  });
});
