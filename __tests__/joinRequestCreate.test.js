const wx = require("wx-server-sdk");
const { __test } = require("wx-server-sdk");
const joinCreate = require("../cloudfunctions/joinRequestCreate/index");

describe("joinRequestCreate", () => {
  let db, tenantId;

  beforeEach(async () => {
    __test.resetStore();
    __test.setOpenid("user-001");
    db = wx.database();
    const t = await db.collection("tenants").add({
      data: { name: "仓库A", inviteCode: "ABC123", status: "active", createdBy: "admin", createdAt: new Date() }
    });
    tenantId = t._id;
  });

  test("creates join request with valid code", async () => {
    const res = await joinCreate.main({ inviteCode: "abc123" });
    expect(res.ok).toBe(true);
    const reqs = (await db.collection("join_requests").get()).data;
    expect(reqs).toHaveLength(1);
    expect(reqs[0].status).toBe("pending");
  });

  test("case insensitive invite code", async () => {
    const res = await joinCreate.main({ inviteCode: "abc123" });
    expect(res.ok).toBe(true);
  });

  test("fails with invalid code", async () => {
    const res = await joinCreate.main({ inviteCode: "XXXXXX" });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/邀请码/);
  });

  test("fails if already a member", async () => {
    await db.collection("tenant_members").add({
      data: { tenantId, openid: "user-001", role: "operator", status: "active" }
    });
    const res = await joinCreate.main({ inviteCode: "ABC123" });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/已加入/);
  });

  test("fails if already has pending request", async () => {
    await joinCreate.main({ inviteCode: "ABC123" });
    const res = await joinCreate.main({ inviteCode: "ABC123" });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/已提交/);
  });

  test("fails without invite code", async () => {
    const res = await joinCreate.main({});
    expect(res.ok).toBe(false);
  });
});
