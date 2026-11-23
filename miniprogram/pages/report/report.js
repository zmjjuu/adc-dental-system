const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: { year: '2026', qno: '4', rep: null, std: null, loaded: false },
  onLoad() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    try {
      const year = Number(this.data.year);
      const qno = Number(this.data.qno);
      const rep = await api.get(`/reports/cancellation?year=${year}&quarter=${qno}`);
      const std = await api.get('/reports/standardization');
      this.setData({
        rep: {
          ...rep, cutoff: fmt.dt(rep.cutoff),
          t: { ...rep.total, cancel_rate: rep.total.cancel_rate != null ? rep.total.cancel_rate + '%' : '—',
            noshow_rate: rep.total.noshow_rate != null ? rep.total.noshow_rate + '%' : '—' },
        },
        std, loaded: true,
      });
    } catch (e) { api.toastErr(e); }
  },
  onYear(e) { this.setData({ year: e.detail.value }); },
  onQno(e) { this.setData({ qno: e.detail.value }); },
});
