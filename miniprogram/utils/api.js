// ADC — 小程序 API 客户端
const BASE = 'http://127.0.0.1:8000';

let token = wx.getStorageSync('adc_token') || '';
let user = wx.getStorageSync('adc_user') || null;

function clearAuth() {
  token = ''; user = null;
  wx.removeStorageSync('adc_token'); wx.removeStorageSync('adc_user');
  getApp().globalData.user = null;
}

function request(method, path, data) {
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
          reject(new Error((res.data && res.data.error) || ('请求失败 ' + res.statusCode)));
        }
      },
      fail() {
        reject(new Error('无法连接服务器 127.0.0.1:8000，请确认后端已启动，并在开发者工具「详情→本地设置」勾选「不校验合法域名」'));
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
};

/* 字典缓存 */
let _meta = null;
async function meta() {
  if (!_meta) _meta = await request('GET', '/meta');
  return _meta;
}
module.exports.meta = meta;
module.exports.clearMeta = () => { _meta = null; };
