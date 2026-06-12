App({
  globalData: {
    env: "cloudbase-d5gmkrx24700f9405",
    openid: "",
    currentTenant: null,
    tenants: []
  },

  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({
        title: "基础库版本过低",
        content: "请使用 2.2.3 或以上基础库以支持云开发。"
      });
      return;
    }

    wx.cloud.init({
      env: this.globalData.env,
      traceUser: true
    });

    const cachedTenant = wx.getStorageSync("currentTenant");
    if (cachedTenant) {
      this.globalData.currentTenant = cachedTenant;
    }
  },

  setCurrentTenant(tenant) {
    this.globalData.currentTenant = tenant;
    wx.setStorageSync("currentTenant", tenant);
  },

  clearCurrentTenant() {
    this.globalData.currentTenant = null;
    wx.removeStorageSync("currentTenant");
  }
});
