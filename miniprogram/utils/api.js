const app = getApp();

function call(name, data = {}) {
  return wx.cloud.callFunction({
    name,
    data
  }).then((res) => {
    const result = res.result || {};
    if (!result.ok) {
      const error = new Error(result.message || "操作失败");
      error.code = result.code || "UNKNOWN";
      throw error;
    }
    return result.data || {};
  });
}

function tenantId() {
  return app.globalData.currentTenant && app.globalData.currentTenant.tenantId;
}

function callWithTenant(name, data = {}) {
  const currentTenantId = tenantId();
  if (!currentTenantId) {
    return Promise.reject(new Error("请先选择仓库空间"));
  }
  return call(name, Object.assign({}, data, { tenantId: currentTenantId }));
}

function showError(error) {
  wx.showToast({
    title: error.message || "操作失败",
    icon: "none"
  });
}

function formatNumber(value, digits = 2) {
  const num = Number(value || 0);
  return Number(num.toFixed(digits));
}

function pieceArea(record) {
  const area = Number(record.lengthCm || 0) * Number(record.widthCm || 0) / 10000;
  return Number(area.toFixed(6));
}

function remainingPieces(record) {
  const area = pieceArea(record);
  if (area <= 0) return 0;
  const remaining = Number(record.remainingArea || 0);
  return Math.round(remaining / area);
}

function formatTime(value) {
  if (!value) return "";
  if (value.$date) value = value.$date;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const pad = function(n) { return n < 10 ? "0" + n : "" + n; };
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((today.getTime() - target.getTime()) / 86400000);
  if (diff === 0) return "\u4eca\u5929 " + hh + ":" + mm;
  if (diff === 1) return "\u6628\u5929 " + hh + ":" + mm;
  if (diff === 2) return "\u524d\u5929 " + hh + ":" + mm;
  return d.getFullYear() + "\u5e74" + pad(d.getMonth() + 1) + "\u6708" + pad(d.getDate()) + "\u65e5 " + hh + ":" + mm;
}

module.exports = {
  call,
  callWithTenant,
  showError,
  formatNumber,
  pieceArea,
  remainingPieces,
  formatTime
};
