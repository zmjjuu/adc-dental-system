const api = require('../../utils/api.js');

Page({
  data: { query: '', list: [], loaded: false },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    try {
      const list = await api.get('/patients?q=' + encodeURIComponent(this.data.query.trim()));
      this.setData({ list, loaded: true });
    } catch (e) { api.toastErr(e); }
  },
  onQuery(e) { this.setData({ query: e.detail.value }); },
  doSearch() { this.load(); },
  goPatient(e) { wx.navigateTo({ url: '/pages/patient/patient?id=' + e.currentTarget.dataset.id }); },
  goCreate() { wx.navigateTo({ url: '/pages/patient/patient?mode=create' }); },
});
