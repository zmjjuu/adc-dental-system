// ADC — 小程序 API 客户端
// 调用链：① 微信云托管私有协议（wx.cloud.callContainer，体验版/正式版免配置合法域名）
//        ② 本地后端 http://127.0.0.1:8000（开发者工具调试）
//        ③ 内置离线演示引擎（utils/mock.js，无网络时兜底）
const BASE = 'http://127.0.0.1:8000';
const CLOUD = { env: 'prod-d3gyx49ypd96d0cf0', service: 'adc' };
const USE_CLOUD = true;
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

/* ① 云托管私有协议请求 */
function cloudRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || !wx.cloud.callContainer) { reject(new Error('无云调用能力')); return; }
    wx.cloud.callContainer({
      config: { env: CLOUD.env },
      path: '/api' + path,
      method,
      data,
      header: { 'X-WX-SERVICE': CLOUD.service, 'X-Token': token, 'Content-Type': 'application/json' },
      success(res) {
        let d = res.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = { error: '响应解析失败' }; } }
        const status = res.statusCode || 200;
        if (status >= 200 && status < 300) resolve(d);
        else if (status === 401) { clearAuth(); wx.reLaunch({ url: '/pages/login/login' }); reject(new Error('登录已失效')); }
        else reject(new Error((d && d.error) || ('服务返回 ' + status)));
      },
      fail() { reject(new Error('云调用失败')); },
    });
  });
}

/* ② 本地后端 HTTP 请求 */
function httpRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE + '/api' + path,
      method,
      data,
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else if (res.statusCode === 401) { clearAuth(); wx.reLaunch({ url: '/pages/login/login' }); reject(new Error('登录已失效')); }
        else reject(httpError(res));
      },
      fail() { reject(new Error('本地后端不可达')); },
    });
  });
}

/* ③ 离线演示引擎 */
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
  const seq = USE_CLOUD
    ? [() => cloudRequest(method, path, data), () => httpRequest(method, path, data), () => mockRequest(method, path, data)]
    : [() => httpRequest(method, path, data), () => mockRequest(method, path, data)];
  const tryNext = i => new Promise((resolve, reject) => {
    if (i >= seq.length) { reject(new Error('无法连接服务器，请确认后端已启动（127.0.0.1:8000）')); return; }
    seq[i]().then(res => {
      if (i === seq.length - 1) { offline = true; wx.setStorageSync('adc_offline', 1); }
      resolve(res);
    }).catch(() => tryNext(i + 1).then(resolve, reject));
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
