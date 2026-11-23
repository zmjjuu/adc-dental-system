const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: {
    tab: '', list: [], loaded: false,
    // 新增表单
    showForm: false, dentists: [], dentistNames: [],
    kind: '耗材', doc: '', line: '1', date: '2026-11-23', amount: '',
    allocs: [{ dentistIdx: 0, amount: '', treatmentIdx: 0, treatmentOptions: [], treatmentIds: [] }],
    saving: false,
  },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    try {
      const q = this.data.tab ? '?status=' + encodeURIComponent(this.data.tab) : '';
      const list = await api.get('/costs' + q);
      this.setData({
        list: list.map(c => ({ ...c, st_cls: fmt.badgeCls(c.status), amt: fmt.money(c.amount),
          day: fmt.d(c.incurred_at),
          allocText: c.allocations.map(a => `${a.dentist_name} ${fmt.money(a.allocated_amount)}`).join('、') || '—' })),
        loaded: true,
      });
    } catch (e) { api.toastErr(e); }
  },
  onTab(e) { this.setData({ tab: e.currentTarget.dataset.v }); this.load(); },
  onKind(e) { this.setData({ kind: e.detail.value === '0' ? '耗材' : '运营费' }); },
  onField(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }); },
  onAllocDentist(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ [`allocs[${i}].dentistIdx`]: Number(e.detail.value) });
    this.loadTreatments(i);
  },
  onAllocAmount(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ [`allocs[${i}].amount`]: e.detail.value });
  },
  onAllocTt(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ [`allocs[${i}].treatmentIdx`]: Number(e.detail.value) });
  },
  addAlloc() {
    this.data.allocs.push({ dentistIdx: 0, amount: '', treatmentIdx: 0, treatmentOptions: [], treatmentIds: [] });
    this.setData({ allocs: this.data.allocs });
    this.loadTreatments(this.data.allocs.length - 1);
  },
  delAlloc(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.data.allocs.splice(i, 1);
    if (!this.data.allocs.length) this.data.allocs.push({ dentistIdx: 0, amount: '', treatmentIdx: 0, treatmentOptions: [], treatmentIds: [] });
    this.setData({ allocs: this.data.allocs });
  },
  async loadTreatments(i) {
    const did = this.data.dentists[this.data.allocs[i].dentistIdx].dentist_id;
    try {
      const list = await api.get('/treatments/confirmed?dentist_id=' + did);
      this.setData({
        [`allocs[${i}].treatmentOptions`]: ['选择实际治疗…', ...list.map(t => `${t.visit_no} ${t.treatment_name} ×${t.units}`)],
        [`allocs[${i}].treatmentIds`]: [null, ...list.map(t => t.treatment_id)],
        [`allocs[${i}].treatmentIdx`]: 0,
      });
    } catch (e) { api.toastErr(e); }
  },
  async save() {
    if (this.data.saving) return;
    if (!this.data.doc || !this.data.amount) return api.toast('请填写凭证号与金额');
    this.setData({ saving: true });
    try {
      const kind = this.data.kind;
      const allocations = this.data.allocs.map(a => ({
        dentist_id: this.data.dentists[a.dentistIdx].dentist_id,
        amount: Number(a.amount),
        treatment_id: a.treatmentIds[a.treatmentIdx] || null,
        version_no: 1,
      }));
      const valid = allocations.every(a => a.amount > 0 && (kind !== '耗材' || a.treatment_id));
      if (!valid) return api.toast('请完整填写每行分摊（牙医、金额' + (kind === '耗材' ? '、治疗' : '') + '）');
      await api.post('/costs', {
        document_no: this.data.doc, line_no: Number(this.data.line), cost_kind: kind,
        incurred_at: this.data.date, amount: Number(this.data.amount), allocations,
      });
      api.toast('费用已登记（待确认）');
      this.setData({ showForm: false, doc: '', amount: '', allocs: [{ dentistIdx: 0, amount: '', treatmentIdx: 0, treatmentOptions: [], treatmentIds: [] }] });
      this.load();
    } catch (e) { api.toastErr(e); }
    this.setData({ saving: false });
  },
  async confirm(e) {
    try { await api.post(`/costs/${e.currentTarget.dataset.id}/confirm`); api.toast('已确认，进入季度归集'); this.load(); }
    catch (err) { api.toastErr(err); }
  },
  async openForm() {
    if (!this.data.dentists.length) {
      const m = await api.meta();
      this.setData({ dentists: m.dentists, dentistNames: m.dentists.map(d => `${d.employee_no} ${d.name}`) });
    }
    this.setData({ showForm: true });
    this.loadTreatments(0);
  },
});
