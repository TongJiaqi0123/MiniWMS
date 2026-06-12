const wx = require("wx-server-sdk");
const { __test } = require("wx-server-sdk");
const updateImages = require("../cloudfunctions/inventoryUpdateImages/index");

describe("inventoryUpdateImages", () => {
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

  async function seedRecord() {
    return db.collection("inbound_records").add({
      data: { tenantId, name: "X", remainingArea: 1, status: "active",
              createdAt: new Date(), images: [], lengthCm: 100, widthCm: 100 }
    });
  }

  test("updates images", async () => {
    const rec = await seedRecord();
    const imgs = ["cloud://env/a.jpg", "cloud://env/b.jpg"];
    const res = await updateImages.main({ tenantId, inboundId: rec._id, images: imgs });
    expect(res.ok).toBe(true);
    expect(res.data.images).toHaveLength(2);
    const dbRec = (await db.collection("inbound_records").doc(rec._id).get()).data;
    expect(dbRec.images).toEqual(imgs);
  });

  test("limits to 10 images", async () => {
    const rec = await seedRecord();
    const imgs = Array.from({ length: 15 }, (_, i) => "img" + i);
    const res = await updateImages.main({ tenantId, inboundId: rec._id, images: imgs });
    expect(res.ok).toBe(true);
    expect(res.data.images).toHaveLength(10);
  });

  test("fails without inboundId", async () => {
    const res = await updateImages.main({ tenantId, images: [] });
    expect(res.ok).toBe(false);
  });

  test("fails for wrong tenant", async () => {
    const rec = await seedRecord();
    const res = await updateImages.main({ tenantId: "nonexistent", inboundId: rec._id, images: [] });
    expect(res.ok).toBe(false);
  });
});
