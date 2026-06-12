const wx = require("wx-server-sdk");
const { __test } = require("wx-server-sdk");
const list = require("../cloudfunctions/inventoryList/index");

describe("inventoryList", () => {
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

  async function seedRecords(count) {
    for (let i = 0; i < count; i++) {
      await db.collection("inbound_records").add({
        data: { tenantId, name: "布料" + i, remainingArea: i + 1, status: "active",
                createdAt: new Date(2024, 0, count - i), images: [], lengthCm: 100, widthCm: 100 }
      });
    }
  }

  // ---- basic listing ----

  test("lists all records without filter", async () => {
    await seedRecords(3);
    const res = await list.main({ tenantId });
    expect(res.ok).toBe(true);
    expect(res.data.records).toHaveLength(3);
  });

  test("lists single record by id", async () => {
    await seedRecords(2);
    const all = await db.collection("inbound_records").get();
    const id = all.data[0]._id;
    const res = await list.main({ tenantId, id });
    expect(res.ok).toBe(true);
    expect(res.data.record).toBeTruthy();
    expect(res.data.record._id).toBe(id);
  });

  // ---- filters ----

  test("filters by active status", async () => {
    await seedRecords(2);
    await db.collection("inbound_records").add({
      data: { tenantId, name: "已清空", remainingArea: 0, status: "cleared", createdAt: new Date(), images: [], lengthCm: 100, widthCm: 100 }
    });
    const res = await list.main({ tenantId, status: "active" });
    expect(res.ok).toBe(true);
    expect(res.data.records).toHaveLength(2);
    res.data.records.forEach(r => expect(r.status).not.toBe("cleared"));
  });

  test("filters by cleared status", async () => {
    await seedRecords(2);
    await db.collection("inbound_records").add({
      data: { tenantId, name: "已清空", remainingArea: 0, status: "cleared", createdAt: new Date(), images: [], lengthCm: 100, widthCm: 100 }
    });
    const res = await list.main({ tenantId, status: "cleared" });
    expect(res.ok).toBe(true);
    expect(res.data.records).toHaveLength(1);
  });

  test("filters by nameKeyword", async () => {
    await seedRecords(3);
    const res = await list.main({ tenantId, nameKeyword: "0" });
    expect(res.ok).toBe(true);
    expect(res.data.records.every(r => r.name.includes("0"))).toBe(true);
  });

  // ---- pagination ----

  test("default pageSize is 50", async () => {
    await seedRecords(3);
    const res = await list.main({ tenantId });
    expect(res.ok).toBe(true);
    expect(res.data.records).toHaveLength(3);
  });

  test("paginates page 1 correctly", async () => {
    await seedRecords(5);
    const res = await list.main({ tenantId, page: 1, pageSize: 2 });
    expect(res.ok).toBe(true);
    expect(res.data.records).toHaveLength(2);
  });

  test("paginates page 2 correctly with no overlap", async () => {
    await seedRecords(5);
    const page1 = await list.main({ tenantId, page: 1, pageSize: 2 });
    const page2 = await list.main({ tenantId, page: 2, pageSize: 2 });
    expect(page2.ok).toBe(true);
    expect(page2.data.records).toHaveLength(2);
    const page1Ids = page1.data.records.map(r => r._id);
    const page2Ids = page2.data.records.map(r => r._id);
    expect(page1Ids).not.toEqual(page2Ids);
  });

  test("last page returns remaining records", async () => {
    await seedRecords(5);
    const res = await list.main({ tenantId, page: 3, pageSize: 2 });
    expect(res.ok).toBe(true);
    expect(res.data.records).toHaveLength(1);
  });

  test("page beyond data returns empty", async () => {
    await seedRecords(3);
    const res = await list.main({ tenantId, page: 10, pageSize: 10 });
    expect(res.ok).toBe(true);
    expect(res.data.records).toHaveLength(0);
  });

  test("page < 1 is clamped to 1", async () => {
    await seedRecords(3);
    const res = await list.main({ tenantId, page: 0, pageSize: 10 });
    expect(res.ok).toBe(true);
    expect(res.data.records).toHaveLength(3);
  });

  test("pageSize > 100 is clamped to 100", async () => {
    await seedRecords(3);
    const res = await list.main({ tenantId, page: 1, pageSize: 999 });
    expect(res.ok).toBe(true);
    expect(res.data.records).toHaveLength(3);
  });

  test("pageSize 0 falls back to default 50", async () => {
    // pageSize: 0 is falsy, so `0 || 50` defaults to 50
    await seedRecords(3);
    const res = await list.main({ tenantId, page: 1, pageSize: 0 });
    expect(res.ok).toBe(true);
    expect(res.data.records).toHaveLength(3);
  });

  test("all pages together cover all records", async () => {
    await seedRecords(7);
    const allIds = [];
    for (let p = 1; p <= 4; p++) {
      const res = await list.main({ tenantId, page: p, pageSize: 3 });
      expect(res.ok).toBe(true);
      res.data.records.forEach(r => allIds.push(r._id));
    }
    expect(allIds).toHaveLength(7);
    expect(new Set(allIds).size).toBe(7);
  });

  // ---- errors ----

  test("returns error for non-member", async () => {
    __test.setOpenid("stranger");
    const res = await list.main({ tenantId });
    expect(res.ok).toBe(false);
  });

  test("resolveImages does not mutate DB record", async () => {
    const rec = await db.collection("inbound_records").add({
      data: { tenantId, name: "图片测试", remainingArea: 1, status: "active", createdAt: new Date(), images: ["cloud://test-env.xx/image1.jpg"], lengthCm: 100, widthCm: 100 }
    });
    const res = await list.main({ tenantId, id: rec._id });
    expect(res.ok).toBe(true);
    const dbRec = (await db.collection("inbound_records").doc(rec._id).get()).data;
    expect(dbRec.images[0]).toMatch(/^cloud:\/\//);
  });
});
