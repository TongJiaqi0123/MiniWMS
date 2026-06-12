const app = getApp();
const api = require("../../utils/api");

Page({
  data: {
    tab: "pending",
    pendingTenants: [],
    allTenants: [],
    config: null,
    maxInput: "",
    maxImagesInput: "",

    loading: false,
    saving: false
  },

  
  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    return Promise.all([
      api.call("systemAdmin", { action: "listPending" }),
      api.call("systemAdmin", { action: "listAll" }),
      api.call("systemAdmin", { action: "getConfig" })
    ]).then(([pending, all, cfg]) => {
      this.setData({
        pendingTenants: pending.tenants || [],
        allTenants: (all.tenants || []).map((item) => Object.assign({}, item, {
          accessStatusText: item.accessStatus === "disabled" ? "禁用" : "启用",
          createdAtText: api.formatTime(item.createdAt)
        })),
        config: cfg.config || {},
        maxInput: String((cfg.config && cfg.config.maxWarehousesPerUser) || 3),
        maxImagesInput: String((cfg.config && cfg.config.maxImagesPerRecord) || 3),
      });
    }).catch(api.showError).finally(() => {
      this.setData({ loading: false });
    });
  },

  switchTab(event) {
    this.setData({ tab: event.currentTarget.dataset.tab });
  },

  approve(event) {
    const id = event.currentTarget.dataset.id;
    api.call("systemAdmin", { action: "approve", tenantId: id }).then(() => {
      wx.showToast({ title: "已通过", icon: "success" });
      this.load();
    }).catch(api.showError);
  },

  reject(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "确认拒绝",
      content: "拒绝后该仓库将不可用",
      success: (res) => {
        if (!res.confirm) return;
        api.call("systemAdmin", { action: "reject", tenantId: id }).then(() => {
          wx.showToast({ title: "已拒绝", icon: "success" });
          this.load();
        }).catch(api.showError);
      }
    });
  },

  onMaxImagesInput(event) {
    this.setData({ maxImagesInput: event.detail.value });
  },

  onMaxInput(event) {
    this.setData({ maxInput: event.detail.value });
  },




  saveConfig() {
    const max = Number(this.data.maxInput);
    if (!max || max < 1) {
      wx.showToast({ title: "请输入有效数字", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    api.call("systemAdmin", { action: "updateConfig", maxWarehousesPerUser: max, maxImagesPerRecord: Number(this.data.maxImagesInput) || 3 }).then(() => {
      wx.showToast({ title: "配置已保存", icon: "success" });
      this.load();
    }).catch(api.showError).finally(() => {
      this.setData({ saving: false });
    });
  },

  enterTenant(event) {
    const item = event.currentTarget.dataset.item;
    if (!item || !item._id) return;
    api.call("systemAdmin", { action: "enterTenant", tenantId: item._id }).then((data) => {
      app.setCurrentTenant({
        tenantId: data.tenantId || item._id,
        tenantName: data.tenantName || item.name,
        inviteCode: data.inviteCode || item.inviteCode,
        tenantStatus: data.status || item.status,
        role: "admin",
        adminOverride: true
      });
      wx.navigateTo({ url: "/pages/inventory/index" });
    }).catch(api.showError);
  },

  toggleAccess(event) {
    const item = event.currentTarget.dataset.item;
    if (!item || !item._id) return;
    const next = item.accessStatus === "disabled" ? "enabled" : "disabled";
    api.call("systemAdmin", { action: "setAccessStatus", tenantId: item._id, accessStatus: next }).then(() => {
      wx.showToast({ title: next === "disabled" ? "已禁用" : "已启用", icon: "success" });
      this.load();
    }).catch(api.showError);
  },

  statusText(status) {
    if (status === "pending") return "待审核";
    if (status === "active") return "已通过";
    if (status === "rejected") return "已拒绝";
    return status || "";
  }
});
