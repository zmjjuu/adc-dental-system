// ADC — 小程序 API 客户端
// 调用链：① 云端后端（微信云托管公网 HTTPS 域名，体验版/正式版使用，需加入 request 合法域名）
//        ② 本地后端 http://127.0.0.1:8000（开发者工具调试）
//        ③ 内置离线演示引擎（utils/mock.js，无网络时兜底）
const BASE = 'https://adc-353510-13-1540267336.sh.run.tcloudbase.com';
const LOCAL = 'http://127.0.0.1:8000';
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

/* HTTP 请求（base 可选云端或本地） */
function httpRequest(base, method, path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: base + '/api' + path,
      method,
      data,
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else if (res.statusCode === 401) {
          // 服务器可达但登录失效：清登录态回登录页，不再回落到其他后端
          clearAuth();
          wx.reLaunch({ url: '/pages/login/login' });
          const e = new Error('登录已失效，请重新登录');
          e.noFallback = true;
          reject(e);
        } else reject(httpError(res));
      },
      fail() { reject(new Error(base + ' 不可达')); },
    });
  });
}

/* 离线演示引擎 */
function mockRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    try { resolve(mock.try(method, path, data)); }
    catch (e) {
      if (e.status === 401) { clearAuth(); wx.reLaunch({ url: '/pages/login/login' }); }
      reject(e);
    }
  });
}

function request(method, path, data) {
  if (offline) return mockRequest(method, path, data);
  const seq = [
    () => httpRequest(BASE, method, path, data),
    () => httpRequest(LOCAL, method, path, data),
    () => mockRequest(method, path, data),
  ];
  const tryNext = i => new Promise((resolve, reject) => {
    if (i >= seq.length) { reject(new Error('无法连接服务器（云端与本地均不可达）')); return; }
    seq[i]().then(res => {
      if (i === seq.length - 1) { offline = true; wx.setStorageSync('adc_offline', 1); }
      resolve(res);
    }).catch(err => {
      if (err && err.noFallback) { reject(err); return; } // 401 等业务错误不回落到其他后端
      tryNext(i + 1).then(resolve, reject);
    });
  });
  return tryNext(0);
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
    if (v) { wx.setStorageSync('adc_offline', 1); }
    else {
      // 切回在线模式：清掉离线签发的假令牌，强制重新登录云端
      wx.removeStorageSync('adc_offline');
      if (token === 'offline-token') clearAuth();
    }
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
