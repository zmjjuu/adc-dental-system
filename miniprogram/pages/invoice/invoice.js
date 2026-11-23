const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: { visitId: null, v: null, generating: false },
  onLoad(q) { this.setData({ visitId: Number(q.visit_id) }); },
  onShow() { this.load(); },
  async load() {
    try {
      const v = await api.get('/visits/' + this.data.visitId);
      const inv = v.invoice;
      this.setData({
        v: { ...v, st_cls: fmt.badgeCls(v.status), when: fmt.dt(v.scheduled_start),
          inv: inv ? {
            ...inv, total: fmt.money(inv.total_amount), issued: fmt.dt(inv.issued_at),
            items: inv.items.map(i => ({ ...i, sub: fmt.money(i.subtotal),
              price: fmt.money(i.unit_price_snapshot), performed: fmt.dt(i.performed_at) })),
          } : null },
      });
    } catch (e) { api.toastErr(e); }
  },
  async doGenerate() {
    if (this.data.generating) return;
    this.setData({ generating: true });
    try {
      const inv = await api.post(`/visits/${this.data.visitId}/invoice`);
      api.toast(`结算单 ${inv.invoice_no}（合计 ${fmt.money(inv.total_amount)}）`);
      this.load();
    } catch (e) { api.toastErr(e); }
    this.setData({ generating: false });
  },
});
