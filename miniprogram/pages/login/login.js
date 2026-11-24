const api = require('../../utils/api.js');

Page({
  data: {
    loginName: 'P-1001',
    password: '123456',
    loading: false,
  },
  onShow() {
    if (api.getUser()) wx.switchTab({ url: '/pages/index/index' });
  },
  onName(e) { this.setData({ loginName: e.detail.value }); },
  onPwd(e) { this.setData({ password: e.detail.value }); },
  async onLogin() {
    if (this.data.loading) return;
    if (!this.data.loginName.trim() || !this.data.password) return api.toast('请输入账号和密码');
    this.setData({ loading: true });
    try {
      const r = await api.post('/patient/login', {
        login_name: this.data.loginName.trim(),
        password: this.data.password,
      });
      api.setAuth(r.token, r.patient);
      api.toast(`欢迎，${r.patient.name}`);
      wx.switchTab({ url: '/pages/index/index' });
    } catch (e) {
      api.toastErr(e);
    }
    this.setData({ loading: false });
  },
});
