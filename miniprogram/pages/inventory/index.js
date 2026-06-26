const app = getApp();
const api = require("../../utils/api");

var PAGE_SIZE = 20;

Page({
  data: {
    tenant: {},
    tab: "active",
    records: [],
    searchName: "",
    searchMinArea: "",
    searchMaxArea: "",
    showSearch: false,
    page: 1,
    hasMore: true,
    loadingMore: false
  },

  onShow() {
    const tenant = app.globalData.currentTenant;
    if (!tenant) {
      wx.redirectTo({ url: "/pages/bootstrap/index" });
      return;
    }
    this.setData({ tenant });
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.loadMore();
  },

  _buildParams(page) {
    var params = {
      status: this.data.tab,
      page: page,
      pageSize: PAGE_SIZE
    };
    if (this.data.searchName) {
      params.nameKeyword = this.data.searchName;
    }
    if (this.data.searchMinArea) {
      params.minArea = Number(this.data.searchMinArea);
    }
    if (this.data.searchMaxArea) {
      params.maxArea = Number(this.data.searchMaxArea);
    }
    return params;
  },

  _mapRecords(list) {
    return list.map(function (item) {
      var converted = Object.assign({}, item);
      if (converted.lengthCm !== undefined) {
        converted.lengthM = api.formatNumber(Number(converted.lengthCm || 0) / 100, 4);
      }
      if (converted.widthCm !== undefined) {
        converted.widthM = api.formatNumber(Number(converted.widthCm || 0) / 100, 4);
      }
      return Object.assign(converted, {
        remainingArea: api.formatNumber(item.remainingArea),
        totalArea: api.formatNumber(item.totalArea),
        remainingPieces: api.remainingPieces(item),
        createdTimeText: api.formatTime(item.createdAt),
        updatedTimeText: api.formatTime(item.updatedAt)
      });
    });
  },

  refresh() {
    this.setData({ page: 1, hasMore: true });
    var self = this;
    return api.callWithTenant("inventoryList", this._buildParams(1)).then(function (data) {
      var records = self._mapRecords(data.records || []);
      self.setData({
        records: records,
        hasMore: records.length >= PAGE_SIZE
      });
    }).catch(api.showError);
  },

  loadMore() {
    var nextPage = this.data.page + 1;
    this.setData({ loadingMore: true });
    var self = this;
    return api.callWithTenant("inventoryList", this._buildParams(nextPage)).then(function (data) {
      var newRecords = self._mapRecords(data.records || []);
      self.setData({
        records: self.data.records.concat(newRecords),
        page: nextPage,
        hasMore: newRecords.length >= PAGE_SIZE
      });
    }).catch(api.showError).finally(function () {
      self.setData({ loadingMore: false });
    });
  },

  switchTab(event) {
    this.setData({ tab: event.currentTarget.dataset.tab });
    this.refresh();
  },

  onSearchInput(event) {
    var key = event.currentTarget.dataset.key;
    var value = event.detail.value;
    this.setData({ [key]: value });
  },

  search() {
    this.refresh();
  },

  resetSearch() {
    this.setData({
      searchName: "",
      searchMinArea: "",
      searchMaxArea: ""
    });
    this.refresh();
  },

  toggleSearch() {
    this.setData({ showSearch: !this.data.showSearch });
  },

  previewThumb(event) {
    var src = event.currentTarget.dataset.src;
    var images = event.currentTarget.dataset.images || [src];
    wx.previewImage({ urls: images, current: src });
  },

  openDetail(event) {
    wx.navigateTo({ url: "/pages/inbound-detail/index?id=" + event.currentTarget.dataset.id });
  },

  goCreate() {
    wx.navigateTo({ url: "/pages/inbound-form/index" });
  },

  goImport() {
    wx.navigateTo({ url: "/pages/inbound-import/index" });
  },

  goApprovals() {
    wx.navigateTo({ url: "/pages/approvals/index" });
  },

  backTenant() {
    app.clearCurrentTenant();
    wx.redirectTo({ url: "/pages/bootstrap/index" });
  }
});
