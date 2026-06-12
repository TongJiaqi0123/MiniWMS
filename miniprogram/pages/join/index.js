const api = require("../../utils/api");

Page({
  data: {
    inviteCode: "",
    remark: "",
    saving: false
  },

  onCode(event) {
    this.setData({ inviteCode: event.detail.value });
  },

  onRemark(event) {
    this.setData({ remark: event.detail.value });
  },

  submit() {
    const inviteCode = this.data.inviteCode.trim().toUpperCase();
    if (!inviteCode) {
      wx.showToast({ title: "请输入邀请码", icon: "none" });
      return;
    }

    this.setData({ saving: true });
    api.call("joinRequestCreate", {
      inviteCode,
      remark: this.data.remark.trim()
    }).then(() => {
      wx.showModal({
        title: "已提交申请",
        content: "请等待管理员审批。",
        showCancel: false,
        success: () => wx.navigateBack()
      });
    }).catch(api.showError).finally(() => {
      this.setData({ saving: false });
    });
  },

  onPullDownRefresh() {
    wx.stopPullDownRefresh();
  }
});
