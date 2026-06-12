const wx = require("wx-server-sdk");
const { __test } = require("wx-server-sdk");
const inbound = require("../cloudfunctions/inventoryCreateInbound/index");

describe("inventoryCreateInbound", () => {
  let db;
  let tenantId;

  beforeEach(async () => {
    __test.resetStore();
    __test.setOpenid("admin-001");
    db = wx.database();
    const t = await db.collection("tenants").add({
      data: { name: "仓库A", inviteCode: "ABC", status: "active", createdBy: "admin-001", createdAt: new Date() }
    });
    tenantId = t._id;
    await db.collection("tenant_members").add({
      data: { tenantId, openid: "admin-001", role: "admin", status: "active" }
    });
  });

  test("creates inbound record and movement", async () => {
    const res = await inbound.main({
      tenantId, name: "布料A", lengthCm: 100, widthCm: 100,
      totalArea: 10, totalPieces: 10, remark: "首批"
    });
    expect(res.ok).toBe(true);
    expect(res.data.id).toBeTruthy();

    const records = await db.collection("inbound_records").get();
    expect(records.data).toHaveLength(1);
    expect(records.data[0].name).toBe("布料A");
    expect(records.data[0].status).toBe("active");
    expect(records.data[0].remainingArea).toBe(10);

    const moves = await db.collection("stock_movements").get();
    expect(moves.data).toHaveLength(1);
    expect(moves.data[0].type).toBe("inbound");
    expect(moves.data[0].pieces).toBe(10);
  });

  test("fails without name", async () => {
    const res = await inbound.main({ tenantId, lengthCm: 100, widthCm: 100, totalArea: 1, totalPieces: 1 });
    expect(res.ok).toBe(false);
  });

  test("fails with invalid dimensions", async () => {
    const res = await inbound.main({ tenantId, name: "X", lengthCm: 0, widthCm: 100, totalArea: 1, totalPieces: 1 });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/长宽/);
  });

  test("fails when area does not match dimensions * pieces", async () => {
    const res = await inbound.main({ tenantId, name: "X", lengthCm: 100, widthCm: 100, totalArea: 999, totalPieces: 1 });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/匹配/);
  });

  test("fails without tenantId", async () => {
    const res = await inbound.main({ name: "X", lengthCm: 100, widthCm: 100, totalArea: 1, totalPieces: 1 });
    expect(res.ok).toBe(false);
  });

  test("fails for non-member", async () => {
    __test.setOpenid("stranger");
    const res = await inbound.main({ tenantId, name: "X", lengthCm: 100, widthCm: 100, totalArea: 1, totalPieces: 1 });
    expect(res.ok).toBe(false);
  });

  test("fails for rejected tenant", async () => {
    await db.collection("tenants").doc(tenantId).update({ data: { status: "rejected" } });
    const res = await inbound.main({ tenantId, name: "X", lengthCm: 100, widthCm: 100, totalArea: 1, totalPieces: 1 });
    expect(res.ok).toBe(false);
  });

  test("limits images to 3", async () => {
    const res = await inbound.main({
      tenantId, name: "X", lengthCm: 100, widthCm: 100,
      totalArea: 1, totalPieces: 1, images: ["a", "b", "c", "d", "e"]
    });
    expect(res.ok).toBe(true);
    const rec = (await db.collection("inbound_records").get()).data[0];
    expect(rec.images).toHaveLength(3);
  });

  test("uses totalPieces for movement pieces (not recalculated from area)", async () => {
    const res = await inbound.main({
      tenantId, name: "浮点测试", lengthCm: 33, widthCm: 33,
      totalArea: 0.3267, totalPieces: 3
    });
    expect(res.ok).toBe(true);
    const move = (await db.collection("stock_movements").get()).data[0];
    expect(move.pieces).toBe(3);
  });
});
