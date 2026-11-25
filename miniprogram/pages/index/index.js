const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: { patient: null, clinics: [], treatments: [], loaded: false },
  async onShow() {
    const u = api.getUser();
    if (!u) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    this.setData({ patient: u });
    await this.load();
  },
  async load() {
    try {
      const meta = await api.get('/patient/meta');
      this.setData({
        clinics: meta.clinics,
        treatments: meta.treatment_types.map(t => ({ ...t, price: fmt.money(t.default_unit_price) })),
        loaded: true,
      });
    } catch (e) { api.toastErr(e); }
  },
  goVisits() { wx.switchTab({ url: '/pages/visits/visits' }); },
});
