const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: { visitId: null, v: null },
  onLoad(q) { this.setData({ visitId: Number(q.visit_id) }); },
  onShow() { this.load(); },
  async load() {
    try {
      const v = await api.get('/patient/visits/' + this.data.visitId);
      const inv = v.invoice;
      this.setData({
        v: {
          ...v,
          st_cls: fmt.badgeCls(v.status),
          when: fmt.dt(v.scheduled_start),
          inv: inv ? {
            ...inv,
            total: fmt.money(inv.total_amount),
            issued: fmt.dt(inv.issued_at),
            items: inv.items.map(i => ({ ...i, sub: fmt.money(i.subtotal),
              price: fmt.money(i.unit_price_snapshot) })),
          } : null,
        },
      });
    } catch (e) { api.toastErr(e); }
  },
});
