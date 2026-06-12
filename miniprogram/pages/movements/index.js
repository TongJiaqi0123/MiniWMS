const api = require("../../utils/api");

var PAGE_SIZE = 50;

Page({
  data: {
    id: "",
    record: null,
    movements: [],
    page: 1,
    hasMore: true,
    loadingMore: false,
    saving: false,
    dialogVisible: false,
    dialogLines: [],
    pendingMovementId: ""
  },

  onLoad(options) {
    this.setData({ id: options.id });
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.loadMore();
  },

  _mapMovements(list) {
    var lastIndex = list.length - 1;
    var canReverseLatest = lastIndex >= 0 && list[lastIndex].type !== "clear" && !list[lastIndex].reversed;

    return list.map(function (item, index) {
      return Object.assign({}, item, {
        typeText: item.type === "inbound" ? "入库" : item.type === "outbound" ? "出库" : "清空",
        inputUnitText: item.inputUnit === "area" ? "平方" : item.inputUnit === "pieces" ? "片" : "-",
        areaDelta: api.formatNumber(item.areaDelta, 4),
        createdAtText: api.formatTime(item.createdAt),
        canReverse: canReverseLatest && index === lastIndex
      });
    });
  },

  refresh() {
    this.setData({ page: 1, hasMore: true });
    var self = this;

    api.callWithTenant("inventoryList", { id: this.data.id }).then(function (data) {
      self.setData({ record: data.record });
    }).catch(function () {});

    return api.callWithTenant("movementList", {
      inboundId: this.data.id,
      page: 1,
      pageSize: PAGE_SIZE
    }).then(function (data) {
      var movements = self._mapMovements(data.movements || []);
      self.setData({
        movements: movements,
        hasMore: movements.length >= PAGE_SIZE
      });
    }).catch(api.showError);
  },

  loadMore() {
    var nextPage = this.data.page + 1;
    this.setData({ loadingMore: true });
    var self = this;
    return api.callWithTenant("movementList", {
      inboundId: this.data.id,
      page: nextPage,
      pageSize: PAGE_SIZE
    }).then(function (data) {
      var newItems = self._mapMovements(data.movements || []);
      self.setData({
        movements: self.data.movements.concat(newItems),
        page: nextPage,
        hasMore: newItems.length >= PAGE_SIZE
      });
    }).catch(api.showError).finally(function () {
      self.setData({ loadingMore: false });
    });
  },

  reverseMovement(event) {
    var movementId = event.currentTarget.dataset.id;
    var typeText = event.currentTarget.dataset.type;
    var areaDelta = Number(event.currentTarget.dataset.area || 0);
    var pieces = Number(event.currentTarget.dataset.pieces || 0);
    var inputUnit = event.currentTarget.dataset.unit;
    var record = this.data.record;

    var currentArea = record ? Number(record.remainingArea || 0) : 0;
    var currentPieces = record ? api.remainingPieces(record) : 0;

    var newArea, newPieces;
    if (typeText === "入库") {
      newArea = Math.max(0, currentArea - areaDelta);
      newPieces = Math.max(0, currentPieces - pieces);
    } else {
      newArea = currentArea + areaDelta;
      newPieces = currentPieces + pieces;
    }

    var deltaText = inputUnit === "area"
      ? api.formatNumber(areaDelta, 4) + "㎡"
      : pieces + "片";

    var dialogLines = [
      { text: "撤销这条" + typeText + "记录", bold: false },
      { text: "变化数量：" + deltaText, bold: true },
      { text: "当前库存：" + api.formatNumber(currentArea, 4) + "㎡ / " + currentPieces + "片", bold: false },
      { text: "撤销后库存：" + api.formatNumber(newArea, 4) + "㎡ / " + newPieces + "片", bold: true }
    ];

    this.setData({
      dialogVisible: true,
      dialogLines: dialogLines,
      pendingMovementId: movementId
    });
  },

  onDialogCancel() {
    this.setData({ dialogVisible: false, pendingMovementId: "" });
  },

  onDialogConfirm() {
    var movementId = this.data.pendingMovementId;
    if (!movementId) return;

    this.setData({ dialogVisible: false, saving: true });
    api.callWithTenant("movementReverse", { movementId }).then(() => {
      wx.showToast({ title: "已撤销" });
      this.refresh();
    }).catch(api.showError).finally(() => {
      this.setData({ saving: false, pendingMovementId: "" });
    });
  }
});