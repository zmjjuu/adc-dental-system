const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: {
    mode: 'book', visitId: null,
    patient: null, query: '', searchResults: [],
    clinics: [], clinicIdx: 0, date: '2026-11-23',
    tts: [], ttIdx: 0, want: '', needs: '',
    slots: [], slotGroups: [], slot: null, reason: '',
    submitting: false,
  },
  async onLoad(q) {
    if (q.mode === 'reschedule' && q.visit_id) {
      this.setData({ mode: 'reschedule', visitId: Number(q.visit_id) });
      wx.setNavigationBarTitle({ title: '改约' });
      try {
        const v = await api.get('/visits/' + this.data.visitId);
        this.setData({ patient: v.patient, want: v.requested_treatments || '', needs: v.special_needs || '' });
      } catch (e) { api.toastErr(e); }
    }
    try {
      const m = await api.meta();
      this.setData({
        clinics: m.clinics.map(c => c.clinic_code + ' · ' + c.postal_address),
        tts: ['不限（显示全部出诊牙医）', ...m.treatment_types.map(t => `${t.treatment_name}（¥${t.default_unit_price}/${t.unit_name}）`)],
      });
    } catch (e) { api.toastErr(e); }
  },
  onQuery(e) { this.setData({ query: e.detail.value }); },
  async doSearch() {
    const q = this.data.query.trim();
    if (!q) return api.toast('请输入账号 / 姓名 / 电话');
    try {
      const list = await api.get('/patients?q=' + encodeURIComponent(q));
      this.setData({ searchResults: list });
      if (!list.length) api.toast('没有匹配的患者，可到患者管理新建');
    } catch (e) { api.toastErr(e); }
  },
  async pickPatient(e) {
    const pid = e.currentTarget.dataset.id;
    try {
      const p = await api.get('/patients/' + pid);
      this.setData({ patient: p, searchResults: [] });
    } catch (err) { api.toastErr(err); }
  },
  onClinic(e) { this.setData({ clinicIdx: Number(e.detail.value) }); },
  onDate(e) { this.setData({ date: e.detail.value }); },
  onTt(e) { this.setData({ ttIdx: Number(e.detail.value) }); },
  onWant(e) { this.setData({ want: e.detail.value }); },
  onNeeds(e) { this.setData({ needs: e.detail.value }); },
  onReason(e) { this.setData({ reason: e.detail.value }); },
  async loadSlots() {
    try {
      const m = await api.meta();
      const clinicId = m.clinics[this.data.clinicIdx].clinic_id;
      let url = `/slots?clinic_id=${clinicId}&date=${this.data.date}`;
      if (this.data.ttIdx > 0) url += '&treatment_type_id=' + m.treatment_types[this.data.ttIdx - 1].treatment_type_id;
      const slots = await api.get(url);
      const by = {};
      slots.forEach(s => { (by[s.dentist_name] = by[s.dentist_name] || []).push(s); });
      const slotGroups = Object.keys(by).map(name => ({
        name: `${name}（${by[name][0].employee_no}）`,
        items: by[name].map(s => ({ ...s, label: fmt.dt(s.start).slice(11) + '–' + fmt.dt(s.end).slice(11), sel: false })),
      }));
      this.setData({ slots, slotGroups, slot: null });
      if (!slots.length) api.toast('该诊所当日没有可约时段');
    } catch (e) { api.toastErr(e); }
  },
  pickSlot(e) {
    const { g, i } = e.currentTarget.dataset;
    const slotGroups = this.data.slotGroups.map((grp, gi) => ({
      ...grp, items: grp.items.map((it, ii) => ({ ...it, sel: gi === Number(g) && ii === Number(i) })),
    }));
    const slot = this.data.slotGroups[g].items[i];
    this.setData({ slotGroups, slot });
  },
  async submit() {
    if (this.data.submitting) return;
    if (!this.data.patient) return api.toast('请先选择患者');
    if (!this.data.slot) return api.toast('请先选择可约时段');
    this.setData({ submitting: true });
    try {
      const m = await api.meta();
      const body = {
        clinic_id: m.clinics[this.data.clinicIdx].clinic_id,
        dentist_id: this.data.slot.dentist_id,
        scheduled_start: this.data.slot.start, scheduled_end: this.data.slot.end,
      };
      if (this.data.mode === 'reschedule') {
        body.reason = this.data.reason || '患者要求改约';
        await api.post(`/visits/${this.data.visitId}/reschedule`, body);
        api.toast('改约成功，原预约保留并标记已改约');
      } else {
        body.patient_id = this.data.patient.patient_id;
        body.requested_treatments = this.data.want;
        body.special_needs = this.data.needs;
        if (this.data.ttIdx > 0) body.treatment_type_id = m.treatment_types[this.data.ttIdx - 1].treatment_type_id;
        const r = await api.post('/visits', body);
        api.toast(`预约成功 ${r.visit_no}`);
      }
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e) { api.toastErr(e); }
    this.setData({ submitting: false });
  },
});
