const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: {
    id: null, v: null, tts: [], ttNames: [], ttIdx: 0,
    units: '1', price: '', note: '',
    sheet: null, rvUnits: '', rvPrice: '', rvNote: '', rvId: null,
  },
  async onLoad(q) {
    this.setData({ id: Number(q.id) });
    try {
      const m = await api.meta();
      this.setData({ tts: m.treatment_types, ttNames: m.treatment_types.map(t => `${t.treatment_name}（¥${t.default_unit_price}/${t.unit_name}）`) });
    } catch (e) { api.toastErr(e); }
  },
  onShow() { this.load(); },
  async load() {
    try {
      const v = await api.get('/visits/' + this.data.id);
      const s = { ...v, st_cls: fmt.badgeCls(v.status),
        invoiceTotal: v.invoice ? fmt.money(v.invoice.total_amount) : null,
        allergies: v.allergies.map(a => ({ ...a, st_cls: fmt.badgeCls(a.status) })),
        treatments: v.treatments.map(t => ({ ...t, sub: fmt.money(t.units * t.unit_price),
          price: fmt.money(t.unit_price), st_cls: fmt.badgeCls(t.status) })) };
      this.setData({ v: s });
    } catch (e) { api.toastErr(e); }
  },
  onTt(e) {
    const i = Number(e.detail.value);
    this.setData({ ttIdx: i, price: String(this.data.tts[i].default_unit_price) });
  },
  onUnits(e) { this.setData({ units: e.detail.value }); },
  onPrice(e) { this.setData({ price: e.detail.value }); },
  onNote(e) { this.setData({ note: e.detail.value }); },
  async addTreatment() {
    try {
      const tt = this.data.tts[this.data.ttIdx];
      await api.post(`/visits/${this.data.id}/treatments`, {
        treatment_type_id: tt.treatment_type_id,
        units: Number(this.data.units),
        unit_price: this.data.price ? Number(this.data.price) : null,
        note: this.data.note,
      });
      api.toast('治疗行已记录（草稿）');
      this.setData({ units: '1', price: '', note: '' });
      this.load();
    } catch (e) { api.toastErr(e); }
  },
  async confirm(e) {
    try {
      await api.post(`/treatments/${e.currentTarget.dataset.id}/confirm`);
      api.toast('已签署确认'); this.load();
    } catch (err) { api.toastErr(err); }
  },
  openRevise(e) {
    this.setData({ sheet: 'revise', rvId: e.currentTarget.dataset.id, rvUnits: '', rvPrice: '', rvNote: '' });
  },
  onRvUnits(e) { this.setData({ rvUnits: e.detail.value }); },
  onRvPrice(e) { this.setData({ rvPrice: e.detail.value }); },
  onRvNote(e) { this.setData({ rvNote: e.detail.value }); },
  async doRevise() {
    try {
      await api.post(`/treatments/${this.data.rvId}/revise`, {
        units: this.data.rvUnits ? Number(this.data.rvUnits) : null,
        unit_price: this.data.rvPrice ? Number(this.data.rvPrice) : null,
        note: this.data.rvNote,
      });
      api.toast('更正已生成新版本，请再次签署');
      this.setData({ sheet: null }); this.load();
    } catch (e) { api.toastErr(e); }
  },
  async confirmAllergy(e) {
    const a = e.currentTarget.dataset;
    try {
      await api.post(`/patients/${a.pid}/allergies`,
        { allergy_type_id: Number(a.aid), status: '已确认' });
      api.toast('过敏已复核确认'); this.load();
    } catch (err) { api.toastErr(err); }
  },
  closeSheet() { this.setData({ sheet: null }); },
  goInvoice() { wx.navigateTo({ url: `/pages/invoice/invoice?visit_id=${this.data.id}` }); },
});
