const api = require("../../utils/api");
const { editOneImage } = require("../../utils/image");

Page({
  data: {
    id: "",
    record: null,
    tab: "outbound",
    units: ["按平方", "按片数"],
    unitIndex: 1,
    quantity: "",
    remark: "",
    previewArea: 0,
    previewPieces: 0,
    saving: false,
    maxImages: 3
  },

  onLoad(options) {
    this.setData({ id: options.id });
  },

  onShow() {
    this.load();
    api.call("systemAdmin", { action: "getPublicConfig" }).then((data) => {
      this.setData({ maxImages: data.maxImagesPerRecord || 3 });
    }).catch(() => {});
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  load() {
    return api.callWithTenant("inventoryList", { id: this.data.id }).then((data) => {
      const record = data.record;
      if (record.lengthCm !== undefined && record.lengthM === undefined) {
        record.lengthM = api.formatNumber(Number(record.lengthCm || 0) / 100, 4);
      }
      if (record.widthCm !== undefined && record.widthM === undefined) {
        record.widthM = api.formatNumber(Number(record.widthCm || 0) / 100, 4);
      }
      record.pieceArea = api.formatNumber(api.pieceArea(record), 4);
      record.remainingArea = api.formatNumber(record.remainingArea);
      record.totalArea = api.formatNumber(record.totalArea);
      record.remainingPieces = api.remainingPieces(record);
      // BUG FIX: use this.data.maxImages instead of hardcoded 3
      this.setData({ record });
      this.updatePreview();
    }).catch(api.showError);
  },

  onUnit(event) {
    this.setData({ unitIndex: Number(event.detail.value) });
    this.updatePreview();
  },

  onQuantity(event) {
    this.setData({ quantity: event.detail.value });
    this.updatePreview();
  },

  onRemark(event) {
    this.setData({ remark: event.detail.value });
  },

  switchTab(event) {
    const tab = event.currentTarget.dataset.tab;
    this.setData({ tab, quantity: "", remark: "" });
    this.updatePreview();
  },

  updatePreview() {
    const record = this.data.record;
    if (!record) return;
    const quantity = Number(this.data.quantity || 0);
    const areaPerPiece = api.pieceArea(record);
    const area = this.data.unitIndex === 0 ? quantity : quantity * areaPerPiece;
    this.setData({
      previewArea: api.formatNumber(area, 4),
      previewPieces: areaPerPiece > 0 ? Math.floor(area / areaPerPiece) : 0
    });
  },

  submitOutbound() {
    const quantity = Number(this.data.quantity);
    if (!this.data.quantity || quantity <= 0) {
      wx.showToast({ title: "请输入有效出库数量", icon: "none" });
      return;
    }
    const record = this.data.record;
    const areaPerPiece = api.pieceArea(record);
    const maxVal = this.data.unitIndex === 0 ? Number(record.remainingArea) : Math.floor(Number(record.remainingArea) / areaPerPiece);
    if (quantity > maxVal + 0.000001) {
      wx.showToast({ title: "出库数量超过剩余库存", icon: "none" });
      return;
    }

    this.setData({ saving: true });
    api.callWithTenant("inventoryOutbound", {
      inboundId: this.data.id,
      inputUnit: this.data.unitIndex === 0 ? "area" : "pieces",
      inputQuantity: quantity,
      remark: this.data.remark.trim()
    }).then(() => {
      wx.showToast({ title: "已出库" });
      this.setData({ quantity: "", remark: "" });
      this.load();
    }).catch(api.showError).finally(() => {
      this.setData({ saving: false });
    });
  },

  submitInbound() {
    const quantity = Number(this.data.quantity);
    if (!this.data.quantity || quantity <= 0) {
      wx.showToast({ title: "请输入有效入库数量", icon: "none" });
      return;
    }

    this.setData({ saving: true });
    api.callWithTenant("inventoryInbound", {
      inboundId: this.data.id,
      inputUnit: this.data.unitIndex === 0 ? "area" : "pieces",
      inputQuantity: quantity,
      remark: this.data.remark.trim()
    }).then(() => {
      wx.showToast({ title: "已入库" });
      this.setData({ quantity: "", remark: "" });
      this.load();
    }).catch(api.showError).finally(() => {
      this.setData({ saving: false });
    });
  },

  clearRecord() {
    wx.showModal({
      title: "确认清空",
      content: "清空后剩余平方将归零，库存流水会保留。",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ saving: true });
        api.callWithTenant("inventoryClear", { inboundId: this.data.id }).then(() => {
          wx.showToast({ title: "已清空" });
          this.load();
        }).catch(api.showError).finally(() => {
          this.setData({ saving: false });
        });
      }
    });
  },

  previewImage(event) {
    wx.previewImage({
      urls: this.data.record.images,
      current: event.currentTarget.dataset.src
    });
  },

  addImages() {
    const current = this.data.record.images || [];
    if (current.length >= this.data.maxImages) {
      wx.showToast({ title: "已达上限", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const rawPath = res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (!rawPath) return;
        editOneImage(rawPath).then((editedPath) => {
          const newImages = current.concat(editedPath).slice(0, this.data.maxImages);
          this.saveImages(newImages);
        });
      }
    });
  },

  deleteImage(event) {
    const index = event.currentTarget.dataset.index;
    const images = (this.data.record.images || []).slice();
    images.splice(index, 1);
    this.saveImages(images);
  },

  saveImages(images) {
    const existing = [];
    const toUpload = [];
    for (var i = 0; i < images.length; i++) {
      if (images[i].startsWith('cloud://') || images[i].startsWith('http')) {
        existing.push(images[i]);
      } else {
        toUpload.push(images[i]);
      }
    }

    if (!toUpload.length) {
      this.updateImagesOnServer(images);
      return;
    }

    wx.showLoading({ title: "上传中.." });
    const timestamp = Date.now();
    Promise.all(toUpload.map((path, idx) => {
      var ext = path.split('.').pop() || 'jpg';
      return wx.cloud.uploadFile({
        cloudPath: "inbound/" + timestamp + "-" + idx + "." + ext,
        filePath: path
      }).then(function(res) { return res.fileID; });
    })).then((uploaded) => {
      wx.hideLoading();
      var final = existing.concat(uploaded);
      this.updateImagesOnServer(final);
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: "上传失败", icon: "none" });
    });
  },

  updateImagesOnServer(images) {
    api.callWithTenant("inventoryUpdateImages", {
      inboundId: this.data.id,
      images: images
    }).then((data) => {
      var record = this.data.record;
      record.images = data.images || images;
      this.setData({ record: record });
      wx.showToast({ title: "已更新", icon: "success" });
    }).catch(api.showError);
  },

  goMovements() {
    wx.navigateTo({ url: "/pages/movements/index?id=" + this.data.id });
  }
});