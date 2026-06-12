const wx = require("wx-server-sdk");
const { __test } = require("wx-server-sdk");
const joinReview = require("../cloudfunctions/joinRequestReview/index");

describe("joinRequestReview", () => {
  let db, tenantId;

  beforeEach(async () => {
    __test.resetStore();
    __test.setOpenid("admin-001");
    db = wx.database();
    const t = await db.collection("tenants").add({
      data: { name: "仓库A", inviteCode: "ABC", status: "active", createdBy: "admin-001", createdAt: new Date() }
    });
    tenantId = t._id;
    await db.collection("tenant_members").add({
      data: { tenantId, openid: "admin-001", role: "admin", status: "active", joinedAt: new Date() }
    });
  });

  async function seedRequest(openid = "applicant-001") {
    return db.collection("join_requests").add({
      data: { tenantId, openid, remark: "", status: "pending", createdAt: new Date() }
    });
  }

  test("lists pending requests", async () => {
    await seedRequest();
    await seedRequest("applicant-002");
    const res = await joinReview.main({ tenantId, action: "list" });
    expect(res.ok).toBe(true);
    expect(res.data.requests).toHaveLength(2);
  });

  test("approves request and creates member", async () => {
    const req = await seedRequest();
    const res = await joinReview.main({ tenantId, action: "approved", requestId: req._id });
    expect(res.ok).toBe(true);
    const members = (await db.collection("tenant_members").where({ tenantId, openid: "applicant-001" }).get()).data;
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("operator");
    expect(members[0].status).toBe("active");
    const updatedReq = (await db.collection("join_requests").doc(req._id).get()).data;
    expect(updatedReq.status).toBe("approved");
  });

  test("rejects request", async () => {
    const req = await seedRequest();
    const res = await joinReview.main({ tenantId, action: "rejected", requestId: req._id });
    expect(res.ok).toBe(true);
    const members = (await db.collection("tenant_members").where({ openid: "applicant-001" }).get()).data;
    expect(members).toHaveLength(0);
  });

  test("re-approving existing member updates role", async () => {
    await db.collection("tenant_members").add({
      data: { tenantId, openid: "applicant-001", role: "operator", status: "inactive", joinedAt: new Date() }
    });
    const req = await seedRequest();
    const res = await joinReview.main({ tenantId, action: "approved", requestId: req._id });
    expect(res.ok).toBe(true);
    const members = (await db.collection("tenant_members").where({ tenantId, openid: "applicant-001" }).get()).data;
    expect(members).toHaveLength(1);
    expect(members[0].status).toBe("active");
  });

  test("fails with invalid action", async () => {
    const res = await joinReview.main({ tenantId, action: "invalid" });
    expect(res.ok).toBe(false);
  });

  test("fails for non-admin", async () => {
    __test.setOpenid("non-admin");
    await db.collection("tenant_members").add({
      data: { tenantId, openid: "non-admin", role: "operator", status: "active" }
    });
    const res = await joinReview.main({ tenantId, action: "list" });
    expect(res.ok).toBe(false);
  });

  test("fails for already processed request", async () => {
    const req = await seedRequest();
    await joinReview.main({ tenantId, action: "approved", requestId: req._id });
    const res = await joinReview.main({ tenantId, action: "approved", requestId: req._id });
    expect(res.ok).toBe(false);
  });
});
