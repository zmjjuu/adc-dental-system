const api = require('../../utils/api.js');

Page({
  data: { user: null, roleNames: '', offline: false },
  onShow() {
    const u = api.getUser();
    if (!u) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    this.setData({ user: u, roleNames: u.roles.map(r => r.role_name).join(' / '),
      offline: api.isOffline() });
  },
  toggleOffline() {
    const v = !api.isOffline();
    api.setOffline(v);
    this.setData({ offline: v });
    api.toast(v ? '已切换为离线演示模式（数据在手机本地）' : '已切换为在线模式（连接 ' + '127.0.0.1:8000）');
  },
  resetDemo() {
    wx.showModal({
      title: '重置演示数据',
      content: '将手机本地的演示数据恢复为初始状态（含 P-1001 预约、Q3 核算 122000 元等），确定？',
      success: r => {
        if (r.confirm) {
          api.resetDemo();
          api.toast('演示数据已重置');
        }
      },
    });
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
