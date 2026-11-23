const api = require('../../utils/api.js');

Page({
  data: { user: null, roleNames: '' },
  onShow() {
    const u = api.getUser();
    if (!u) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    this.setData({ user: u, roleNames: u.roles.map(r => r.role_name).join(' / ') });
  },
  logout() {
    wx.showModal({
      title: '退出登录', content: '确定退出当前账号？',
      success: r => {
        if (r.confirm) {
          api.post('/logout').catch(() => {});
          api.clearAuth();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },
  go(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },
});
