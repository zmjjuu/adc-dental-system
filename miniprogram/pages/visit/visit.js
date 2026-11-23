const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: { id: null, v: null, sheet: null, cancelWho: '患者', cancelReason: '', loading: true },
  onLoad(q) { this.setData({ id: Number(q.id) }); },
  onShow() { this.load(); },
  async load() {
    if (!this.data.id) return;
    try {
      const v = await api.get('/visits/' + this.data.id);
      const s = { ...v, st_cls: fmt.badgeCls(v.status),
        when: fmt.dt(v.scheduled_start), whenEnd: fmt.dt(v.scheduled_end),
        arrived: v.arrived_at ? fmt.dt(v.arrived_at) : null,
        cancelledAt: v.cancelled_at ? fmt.dt(v.cancelled_at) : null,
        total: v.invoice ? fmt.money(v.invoice.total_amount) : null };
      if (s.treatments) s.treatments = s.treatments.map(t => ({
        ...t, sub: fmt.money(t.units * t.unit_price), price: fmt.money(t.unit_price),
        st_cls: fmt.badgeCls(t.status), performed: fmt.dt(t.performed_at) }));
      if (s.allergies) s.allergies = s.allergies.map(a => ({ ...a, st_cls: fmt.badgeCls(a.status) }));
      this.setData({ v: s, loading: false });
    } catch (e) { api.toastErr(e); this.setData({ loading: false }); }
  },
  isReception() { return api.hasRole('reception'); },
  isDentist() { return api.hasRole('dentist'); },
  canCheckin() { const v = this.data.v; return this.isReception() && v && (v.status === '待到诊' || v.status === '待核实'); },
  canCancel() { const v = this.data.v; return this.isReception() && v && (v.status === '待到诊' || v.status === '待核实'); },
  canResched() { const v = this.data.v; return this.isReception() && v && (v.status === '待到诊' || v.status === '待核实'); },
  canMark() { const v = this.data.v;
    return this.isReception() && v && v.status === '待到诊' &&
      new Date(String(v.scheduled_start).replace(' ', 'T')) < new Date(); },
  canConfirmNoshow() { return this.isReception() && this.data.v && this.data.v.status === '待核实'; },
  canInvoice() { return this.isReception() && this.data.v && this.data.v.status === '已到诊'; },
  canTreat() { const v = this.data.v; return this.isDentist() && v &&
    (v.status === '已到诊' || v.status === '治疗完成') && v.dentist_id === api.getUser().dentist_id; },

  async doCheckin() {
    try { await api.post(`/visits/${this.data.id}/checkin`); api.toast('已登记到诊'); this.load(); }
    catch (e) { api.toastErr(e); }
  },
  openCancel() { this.setData({ sheet: 'cancel' }); },
  onCancelWho(e) { this.setData({ cancelWho: e.detail.value === '0' ? '患者' : '诊所' }); },
  onCancelReason(e) { this.setData({ cancelReason: e.detail.value }); },
  async doCancel() {
    try {
      await api.post(`/visits/${this.data.id}/cancel`,
        { initiator: this.data.cancelWho, reason: this.data.cancelReason });
      api.toast('已取消'); this.setData({ sheet: null, cancelReason: '' }); this.load();
    } catch (e) { api.toastErr(e); }
  },
  doResched() {
    wx.navigateTo({ url: `/pages/book/book?mode=reschedule&visit_id=${this.data.id}` });
  },
  async doMark() {
    try { await api.post(`/visits/${this.data.id}/noshow`, { action: 'mark' }); api.toast('已进入待核实'); this.load(); }
    catch (e) { api.toastErr(e); }
  },
  openNoshow() { this.setData({ sheet: 'noshow' }); },
  async doConfirmNoshow() {
    try {
      await api.post(`/visits/${this.data.id}/noshow`,
        { action: 'confirm', reason: this.data.cancelReason || '已电话联系确认爽约' });
      api.toast('已登记未到诊'); this.setData({ sheet: null }); this.load();
    } catch (e) { api.toastErr(e); }
  },
  async doInvoice() {
    try {
      const inv = await api.post(`/visits/${this.data.id}/invoice`);
      api.toast(`结算单 ${inv.invoice_no} 合计 ${fmt.money(inv.total_amount)}`);
      this.load();
    } catch (e) { api.toastErr(e); }
  },
  goTreat() { wx.navigateTo({ url: `/pages/treat/treat?id=${this.data.id}` }); },
  goPatient() { wx.navigateTo({ url: `/pages/patient/patient?id=${this.data.v.patient.patient_id}` }); },
  goInvoice() { wx.navigateTo({ url: `/pages/invoice/invoice?visit_id=${this.data.id}` }); },
  closeSheet() { this.setData({ sheet: null }); },
  noop() {},
});
