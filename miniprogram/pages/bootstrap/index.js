const app = getApp();
const api = require("../../utils/api");

Page({
  data: {
    loading: true,
    tenants: [],
    requests: [],
    isSystemAdmin: false,
    needSystemAdmin: false
  },
  _booted: false,

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    return api.call("userBootstrap").then((data) => {
      app.globalData.openid = data.openid;
      app.globalData.tenants = data.tenants || [];
      this.setData({
        tenants: data.tenants || [],
        requests: data.requests || [],
        isSystemAdmin: data.isSystemAdmin || false,
        needSystemAdmin: data.needSystemAdmin || false
      });

      const cached = app.globalData.currentTenant;
      const stillValid = cached && (data.tenants || []).some((item) => item.tenantId === cached.tenantId);
      if (!stillValid) {
        app.clearCurrentTenant();
      }
    }).then(() => {
      if (!this._booted) {
        var t = this.data.tenants;
        if (t.length === 1 && t[0].tenantStatus !== "pending" && !app.globalData.hasAutoSwitched) {
          this._booted = true;
          app.globalData.hasAutoSwitched = true;
          app.setCurrentTenant(t[0]);
          wx.redirectTo({ url: "/pages/inventory/index" });
          return;
        }
      }
      this._booted = true;
    }).catch(api.showError).finally(() => {
      this._booted = true;
      this.setData({ loading: false });
    });
  },

  selectTenant(event) {
    const item = event.currentTarget.dataset.item;
    if (item.tenantStatus === "pending") {
      wx.showToast({ title: "仓库待审核，请等待系统管理员通过", icon: "none" });
      return;
    }
    app.globalData.hasAutoSwitched = false;
    app.setCurrentTenant(item);
    wx.redirectTo({ url: "/pages/inventory/index" });
  },

  goTenant() {
    wx.navigateTo({ url: "/pages/tenant/index" });
  },

  goJoin() {
    wx.navigateTo({ url: "/pages/join/index" });
  },

  goSystemAdmin() {
    wx.navigateTo({ url: "/pages/system-admin/index" });
  }
});
