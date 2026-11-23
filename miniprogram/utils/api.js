// ADC — 小程序 API 客户端
// 说明：优先请求真实后端（BASE）；后端不可达时自动切换到内置「离线演示引擎」（utils/mock.js），
//       与后端同规则、同演示数据，数据保存在手机本地，可在「我的」页一键重置。
const BASE = 'http://127.0.0.1:8000';
const mock = require('./mock.js');

let token = wx.getStorageSync('adc_token') || '';
let user = wx.getStorageSync('adc_user') || null;
let offline = wx.getStorageSync('adc_offline') === 1;

function clearAuth() {
  token = ''; user = null;
  wx.removeStorageSync('adc_token'); wx.removeStorageSync('adc_user');
  getApp().globalData.user = null;
}

function httpError(res) {
  return new Error((res.data && res.data.error) || ('请求失败 ' + res.statusCode));
}

function request(method, path, data) {
  // 离线模式：直接走内置演示引擎
  if (offline) {
    return new Promise((resolve, reject) => {
      try { resolve(mock.try(method, path, data)); }
      catch (e) {
        if (e.status === 401) { clearAuth(); wx.reLaunch({ url: '/pages/login/login' }); }
        reject(e);
      }
    });
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE + '/api' + path,
      method,
      data,
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else if (res.statusCode === 401) {
          clearAuth();
          wx.reLaunch({ url: '/pages/login/login' });
          reject(new Error('登录已失效'));
        } else {
          reject(httpError(res));
        }
      },
      fail() {
        // 后端不可达 → 自动切换到离线演示引擎（体验版无服务器时仍可完整体验）
        try {
          offline = true;
          wx.setStorageSync('adc_offline', 1);
          resolve(mock.try(method, path, data));
        } catch (e) {
          offline = false;
          wx.removeStorageSync('adc_offline');
          reject(e.status ? e : new Error('无法连接服务器，请确认后端已启动（127.0.0.1:8000）'));
        }
      },
    });
  });
}

function toast(title, icon = 'none') { wx.showToast({ title, icon, duration: 2200 }); }
function toastErr(e) { toast(e.message || String(e)); }

module.exports = {
  request,
  get: p => request('GET', p),
  post: (p, d) => request('POST', p, d || {}),
  put: (p, d) => request('PUT', p, d || {}),
  toast, toastErr, clearAuth,
  getUser: () => user,
  setAuth: (t, u) => {
    token = t; user = u;
    wx.setStorageSync('adc_token', t); wx.setStorageSync('adc_user', u);
    getApp().globalData.user = u;
  },
  hasRole: (...codes) => user && user.roles && codes.some(c => user.roles.some(r => r.role_code === c)),
  isOffline: () => offline,
  setOffline(v) {
    offline = v;
    if (v) wx.setStorageSync('adc_offline', 1); else wx.removeStorageSync('adc_offline');
  },
  resetDemo() { mock.reset(); },
};

/* 字典缓存 */
let _meta = null;
async function meta() {
  if (!_meta) _meta = await request('GET', '/meta');
  return _meta;
}
module.exports.meta = meta;
module.exports.clearMeta = () => { _meta = null; };
