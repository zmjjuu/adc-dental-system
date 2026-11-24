const api = require('../../utils/api.js');

const ACCOUNTS = [
  { name: 'reception01', label: '前台接待 · reception01', role: '预约 / 到诊 / 结算' },
  { name: 'reception02', label: '前台接待 · reception02', role: '预约 / 到诊 / 结算' },
  { name: 'dentist01', label: '牙医 · dentist01', role: '接诊治疗（李铭 D-3012）' },
  { name: 'dentist02', label: '牙医 · dentist02', role: '接诊治疗（王雅 D-3015）' },
  { name: 'finance01', label: '财务 · finance01', role: '费用 / 季度核算' },
  { name: 'ops01', label: '运营经理 · ops01', role: '诊所 / 牙医 / 出诊' },
  { name: 'hq01', label: '总部经理 · hq01', role: '报表 / 审批 / 审计' },
];

Page({
  data: {
    accounts: ACCOUNTS.map(a => a.label),
    accountRoles: ACCOUNTS.map(a => a.role),
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
