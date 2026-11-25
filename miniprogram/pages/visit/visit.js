const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: { id: null, v: null, loading: true },
  onLoad(q) { this.setData({ id: Number(q.id) }); },
  onShow() { this.load(); },
  async load() {
    if (!this.data.id) return;
    try {
      const v = await api.get('/patient/visits/' + this.data.id);
      this.setData({
        v: {
          ...v,
          st_cls: fmt.badgeCls(v.status),
          statusText: fmt.statusText(v.status),
          when: fmt.dt(v.scheduled_start),
          whenEnd: fmt.dt(v.scheduled_end).slice(11),
          invoiceTotal: v.invoice ? fmt.money(v.invoice.total_amount) : null,
          treatments: v.treatments.map(t => ({ ...t,
            sub: fmt.money(t.units * t.unit_price), price: fmt.money(t.unit_price) })),
        },
        loading: false,
      });
    } catch (e) { api.toastErr(e); this.setData({ loading: false }); }
  },
  goInvoice() { wx.navigateTo({ url: `/pages/invoice/invoice?visit_id=${this.data.id}` }); },
});
