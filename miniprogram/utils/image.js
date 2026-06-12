function editOneImage(src) {
  return new Promise((resolve) => {
    wx.showLoading({ title: "正在打开编辑器...", mask: true });
    wx.editImage({
      src,
      success(res) {
        wx.hideLoading();
        resolve(res && res.tempFilePath ? res.tempFilePath : src);
      },
      fail() {
        wx.hideLoading();
        wx.showToast({ title: "编辑失败，已保留原图", icon: "none" });
        resolve(src);
      }
    });
  });
}

module.exports = {
  editOneImage
};
