const app = getApp();
const api = require("../../utils/api");

Page({
  data: {
    name: "",
    saving: false
  },

  onName(event) {
    this.setData({ name: event.detail.value });
  },

  submit() {
    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: "请输入仓库名称", icon: "none" });
      return;
    }

    this.setData({ saving: true });
    api.call("tenantCreate", { name }).then((data) => {
      var member = Object.assign({}, data.member, { inviteCode: data.inviteCode });
      app.setCurrentTenant(member);

      var tenants = app.globalData.tenants || [];
      var exists = tenants.some(function (t) { return t.tenantId === member.tenantId; });
      if (!exists) {
        tenants.push({
          tenantId: member.tenantId,
          tenantName: name,
          inviteCode: data.inviteCode,
          tenantStatus: "pending",
          role: member.role
        });
        app.globalData.tenants = tenants;
      }

      wx.showModal({
        title: "创建成功",
        content: "仓库已创建，需等待系统管理员审核通过后才能使用。邀请码：" + data.inviteCode,
        showCancel: false,
        success: function () {
          wx.redirectTo({ url: "/pages/bootstrap/index" });
        }
      });
    }).catch(api.showError).finally(() => {
      this.setData({ saving: false });
    });
  },

  onPullDownRefresh() {
    wx.stopPullDownRefresh();
  }
});
