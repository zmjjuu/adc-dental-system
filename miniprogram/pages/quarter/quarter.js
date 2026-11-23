const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: {
    list: [], detail: null, year: '2026', qno: '4',
    canFinance: false, canHq: false, loaded: false,
  },
  onShow() {
    this.setData({ canFinance: api.hasRole('finance'), canHq: api.hasRole('hq') });
    this.load();
  },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    try {
      const list = await api.get('/quarters');
      this.setData({
        list: list.map(q => ({ ...q, net: fmt.money(q.net_profit),
          pool: q.pool_amount != null ? fmt.money(q.pool_amount) : '待政策确认',
          st_cls: fmt.badgeCls(q.status) })),
        loaded: true,
      });
    } catch (e) { api.toastErr(e); }
  },
  onYear(e) { this.setData({ year: e.detail.value }); },
  onQno(e) { this.setData({ qno: e.detail.value }); },
  async create() {
    try {
      const r = await api.post('/quarters', { year: Number(this.data.year), quarter_no: Number(this.data.qno) });
      api.toast('核算草稿已生成');
      this.load();
      this.open(r.quarter_close_id);
    } catch (e) { api.toastErr(e); }
  },
  async open(e) {
    try {
      const qid = e.currentTarget ? e.currentTarget.dataset.id : e;
      const q = await api.get('/quarters/' + qid);
      this.setData({
        detail: { ...q, net: fmt.money(q.net_profit),
          pool: q.pool_amount != null ? fmt.money(q.pool_amount) : '待政策确认',
          st_cls: fmt.badgeCls(q.status),
          results: q.results.map(r => ({ ...r, revenue: fmt.money(r.revenue),
            material: fmt.money(r.material_cost), op: fmt.money(r.operating_expense),
            net: fmt.money(r.net_profit) })),
          pending: q.pending.map(p => ({ ...p, amt: fmt.money(p.amount), st_cls: fmt.badgeCls(p.status) })) },
      });
    } catch (err) { api.toastErr(err); }
  },
  closeDetail() { this.setData({ detail: null }); },
  async submit() {
    try {
      await api.post(`/quarters/${this.data.detail.quarter_close_id}/submit`);
      api.toast('已提交审批'); this.load(); this.open(this.data.detail.quarter_close_id);
    } catch (e) { api.toastErr(e); }
  },
  async approve() {
    try {
      await api.post(`/quarters/${this.data.detail.quarter_close_id}/approve`);
      api.toast('核算已批准'); this.load(); this.open(this.data.detail.quarter_close_id);
    } catch (e) { api.toastErr(e); }
  },
});
