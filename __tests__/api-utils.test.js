// Mock wx global for miniprogram utils
global.wx = {
  cloud: { callFunction: jest.fn() },
  showToast: jest.fn(),
  getStorageSync: jest.fn(),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn()
};
global.getApp = () => ({
  globalData: { env: "test", openid: "", currentTenant: null, tenants: [] }
});

const api = require("../miniprogram/utils/api");

describe("api.js utility functions", () => {
  describe("formatNumber", () => {
    test("formats to 2 decimal places by default", () => {
      expect(api.formatNumber(3.14159)).toBe(3.14);
      expect(api.formatNumber(0)).toBe(0);
    });
    test("handles falsy values", () => {
      expect(api.formatNumber(null)).toBe(0);
      expect(api.formatNumber(undefined)).toBe(0);
    });
  });

  describe("pieceArea", () => {
    test("calculates area per piece", () => {
      expect(api.pieceArea({ lengthCm: 200, widthCm: 150 })).toBe(3);
    });
    test("returns 0 for missing dims", () => {
      expect(api.pieceArea({})).toBe(0);
    });
  });

  describe("remainingPieces", () => {
    test("calculates remaining pieces", () => {
      expect(api.remainingPieces({ lengthCm: 200, widthCm: 150, remainingArea: 10 })).toBe(3);
    });
    test("returns 0 when area per piece is 0", () => {
      expect(api.remainingPieces({ lengthCm: 0, widthCm: 0, remainingArea: 10 })).toBe(0);
    });
  });

  describe("formatTime", () => {
    test("returns empty for falsy", () => {
      expect(api.formatTime(null)).toBe("");
      expect(api.formatTime(undefined)).toBe("");
    });
    test("formats today time", () => {
      const now = new Date();
      expect(api.formatTime(now)).toMatch(/^今天/);
    });
    test("formats yesterday", () => {
      const yesterday = new Date(Date.now() - 86400000);
      expect(api.formatTime(yesterday)).toMatch(/^昨天/);
    });
    test("formats older dates", () => {
      const old = new Date(2024, 0, 1, 10, 30);
      const result = api.formatTime(old);
      expect(result).toMatch(/2024年01月01日/);
    });
  });
});
