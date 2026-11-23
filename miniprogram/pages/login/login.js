const api = require('../../utils/api.js');

const ACCOUNTS = [
  { name: 'reception01', label: '前台 · 周小燕' },
  { name: 'dentist01', label: '牙医 · 李铭（D-3012）' },
  { name: 'dentist02', label: '牙医 · 王雅（D-3015）' },
  { name: 'finance01', label: '财务 · 郑晓东' },
  { name: 'ops01', label: '运营经理 · 吴建国' },
  { name: 'hq01', label: '总部经理 · 赵德柱' },
];

Page({
  data: {
    accounts: ACCOUNTS.map(a => a.label),
    index: 0,
    password: '123456',
    loading: false,
  },
  onShow() {
    if (api.getUser()) wx.switchTab({ url: '/pages/index/index' });
  },
  onPick(e) { this.setData({ index: Number(e.detail.value) }); },
  onPwd(e) { this.setData({ password: e.detail.value }); },
  async onLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const r = await api.post('/login', {
        login_name: ACCOUNTS[this.data.index].name,
        password: this.data.password,
      });
      api.setAuth(r.token, r.user);
      api.toast(`欢迎，${r.user.display_name}`);
      wx.switchTab({ url: '/pages/index/index' });
    } catch (e) {
      api.toastErr(e);
    }
    this.setData({ loading: false });
  },
});
