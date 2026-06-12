const app = getApp();
const api = require("../../utils/api");

Page({
  data: {
    tenant: {},
    inviteCode: "",
    requests: []
  },

  
  onShow() {
    this.setData({ tenant: app.globalData.currentTenant || {} });
    this.resolveInviteCode();
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  resolveInviteCode() {
    const tenant = app.globalData.currentTenant;
    if (!tenant) return;
    if (tenant.inviteCode) {
      this.setData({ inviteCode: tenant.inviteCode });
      return;
    }
    const list = app.globalData.tenants || [];
    const found = list.find(function (t) { return t.tenantId === tenant.tenantId; });
    if (found && found.inviteCode) {
      this.setData({ inviteCode: found.inviteCode });
    }
  },

  copyCode() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: function () {
        wx.showToast({ title: "已复制邀请码", icon: "success" });
      }
    });
  },

  load() {
    return api.callWithTenant("joinRequestReview", { action: "list" }).then((data) => {
      this.setData({
        requests: (data.requests || []).map((item) => Object.assign({}, item, {
          createdAtText: api.formatTime(item.createdAt)
        }))
      });
    }).catch(api.showError);
  },

  review(event) {
    const requestId = event.currentTarget.dataset.id;
    const action = event.currentTarget.dataset.action;
    api.callWithTenant("joinRequestReview", { requestId, action }).then(() => {
      wx.showToast({ title: "已处理" });
      this.load();
    }).catch(api.showError);
  }
});
