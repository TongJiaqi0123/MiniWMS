const api = require("../../utils/api");

Page({
  data: {
    fileName: "",
    fileId: "",
    loading: false,
    result: null
  },

  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["xls", "xlsx"],
      success: (res) => {
        const file = res.tempFiles[0];
        this.setData({ fileName: file.name, fileId: "", result: null });
        wx.cloud.uploadFile({
          cloudPath: "imports/" + Date.now() + "-" + file.name,
          filePath: file.path
        }).then((upload) => {
          this.setData({ fileId: upload.fileID });
        }).catch(api.showError);
      }
    });
  },

  startImport() {
    if (!this.data.fileId) return;
    this.setData({ loading: true, result: null });
    api.callWithTenant("inboundBatchImport", {
      fileId: this.data.fileId
    }).then((data) => {
      this.setData({ result: data });
      wx.showToast({ title: "导入完成", icon: "success" });
    }).catch(api.showError).finally(() => {
      this.setData({ loading: false });
    });
  },

  onPullDownRefresh() {
    wx.stopPullDownRefresh();
  }
});
