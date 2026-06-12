const api = require("../../utils/api");
const { editOneImage } = require("../../utils/image");

Page({
  data: {
    saving: false,
    images: [],
    maxImages: 3,
    pieceArea: 0,
    form: {
      name: "",
      lengthM: "",
      widthM: "",
      totalArea: "",
      totalPieces: "",
      remark: ""
    }
  },

  onShow() {
    api.call("systemAdmin", { action: "getPublicConfig" }).then((data) => {
      this.setData({ maxImages: data.maxImagesPerRecord || 3 });
    }).catch(() => {});
  },

  onInput(event) {
    const key = event.currentTarget.dataset.key;
    const value = event.detail.value;
    const form = Object.assign({}, this.data.form, { [key]: value });
    const pieceArea = Number(form.lengthM || 0) * Number(form.widthM || 0);
    if (pieceArea > 0) {
      if (key === "totalPieces" || (form.totalPieces && key !== "totalArea")) {
        const pieces = Number(form.totalPieces || 0);
        if (pieces > 0) {
          form.totalArea = api.formatNumber(pieces * pieceArea, 4);
        }
      } else if (key === "totalArea") {
        const area = Number(form.totalArea || 0);
        if (area > 0) {
          const pieces = Math.round(area / pieceArea);
          form.totalPieces = pieces > 0 ? String(pieces) : "";
        }
      }
    }
    this.setData({
      form,
      pieceArea: api.formatNumber(pieceArea, 4)
    });
  },

  chooseImages() {
    if (this.data.images.length >= this.data.maxImages) {
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
        editOneImage(rawPath).then((path) => {
          this.setData({ images: this.data.images.concat(path).slice(0, this.data.maxImages) });
        });
      }
    });
  },

  previewImage(event) {
    wx.previewImage({
      urls: this.data.images,
      current: event.currentTarget.dataset.src
    });
  },

  deleteImage(event) {
    const index = event.currentTarget.dataset.index;
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images });
  },

  validate() {
    const form = this.data.form;
    if (!form.name.trim()) return "请输入入库名称";
    const length = Number(form.lengthM);
    const width = Number(form.widthM);
    if (!form.lengthM || length <= 0) return "请输入有效长度";
    if (!form.widthM || width <= 0) return "请输入有效宽度";
    if (length > 100) return "长度超出合理范围";
    if (width > 100) return "宽度超出合理范围";
    const area = Number(form.totalArea);
    const pieces = Number(form.totalPieces);
    if (!form.totalArea && !form.totalPieces) return "请输入总平方或总片数";
    if (form.totalArea && area <= 0) return "总平方必须大于0";
    if (form.totalPieces && pieces <= 0) return "总片数必须大于0";
    if (!form.totalPieces || !form.totalArea) {
      const pieceArea = length * width;
      if (form.totalArea && !form.totalPieces) {
        form.totalPieces = String(Math.round(area / pieceArea));
      } else if (form.totalPieces && !form.totalArea) {
        form.totalArea = String(api.formatNumber(pieces * pieceArea, 4));
      }
      this.setData({ form });
    }
    const pieceArea = length * width;
    const calculatedArea = pieceArea * Number(form.totalPieces);
    if (Math.abs(calculatedArea - Number(form.totalArea)) > 0.05) {
      return "总平方需与长宽和片数匹配";
    }
    return "";
  },

  uploadImages() {
    const timestamp = Date.now();
    return Promise.all(this.data.images.map((path, index) => {
      const ext = path.split(".").pop() || "jpg";
      return wx.cloud.uploadFile({
        cloudPath: "inbound/" + timestamp + "-" + index + "." + ext,
        filePath: path
      }).then((res) => res.fileID);
    }));
  },

  submit() {
    const message = this.validate();
    if (message) {
      wx.showToast({ title: message, icon: "none" });
      return;
    }

    this.setData({ saving: true });
    this.uploadImages().then((images) => {
      const form = this.data.form;
      return api.callWithTenant("inventoryCreateInbound", {
        name: form.name.trim(),
        lengthCm: Number(form.lengthM) * 100,
        widthCm: Number(form.widthM) * 100,
        totalArea: Number(form.totalArea),
        totalPieces: Number(form.totalPieces),
        images,
        remark: form.remark.trim()
      });
    }).then(() => {
      wx.showToast({ title: "已保存" });
      setTimeout(() => wx.navigateBack(), 500);
    }).catch(api.showError).finally(() => {
      this.setData({ saving: false });
    });
  },

  onPullDownRefresh() {
    wx.stopPullDownRefresh();
  }
});