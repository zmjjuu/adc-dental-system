const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: {
    mode: 'book', visitId: null,
    clinics: [], clinicIdx: 0, date: '2026-11-25',
    tts: [], ttIdx: 0, want: '', needs: '',
    slots: [], slotGroups: [], slot: null, reason: '',
    submitting: false, today: '',
  },
  async onLoad(q) {
    const today = new Date();
    const p = n => String(n).padStart(2, '0');
    this.setData({ today: `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`,
      date: `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}` });
    if (q.mode === 'reschedule' && q.visit_id) {
      this.setData({ mode: 'reschedule', visitId: Number(q.visit_id) });
      wx.setNavigationBarTitle({ title: '改约' });
      try {
        const v = await api.get('/patient/visits/' + this.data.visitId);
        this.setData({ want: v.requested_treatments || '', needs: v.special_needs || '' });
      } catch (e) { api.toastErr(e); }
    }
    try {
      const m = await api.get('/patient/meta');
      this.setData({
        clinics: m.clinics.map(c => `${c.clinic_code} · ${c.postal_address}`),
        tts: ['不限（显示全部医生）', ...m.treatment_types.map(t => `${t.treatment_name}（¥${t.default_unit_price}/${t.unit_name}）`)],
      });
    } catch (e) { api.toastErr(e); }
  },
  onClinic(e) { this.setData({ clinicIdx: Number(e.detail.value) }); },
  onDate(e) { this.setData({ date: e.detail.value }); },
  onTt(e) { this.setData({ ttIdx: Number(e.detail.value) }); },
  onWant(e) { this.setData({ want: e.detail.value }); },
  onNeeds(e) { this.setData({ needs: e.detail.value }); },
  onReason(e) { this.setData({ reason: e.detail.value }); },
  async loadSlots() {
    if (this.data.date < this.data.today) return api.toast('请选择今天或之后的日期');
    try {
      const m = await api.get('/patient/meta');
      const clinicId = m.clinics[this.data.clinicIdx].clinic_id;
      let url = `/patient/slots?clinic_id=${clinicId}&date=${this.data.date}`;
      if (this.data.ttIdx > 0) url += '&treatment_type_id=' + m.treatment_types[this.data.ttIdx - 1].treatment_type_id;
      const slots = await api.get(url);
      const by = {};
      slots.forEach(s => { (by[s.dentist_name] = by[s.dentist_name] || []).push(s); });
      this.setData({
        slots,
        slot: null,
        slotGroups: Object.keys(by).map(name => ({
          name: `${name}医生（${by[name][0].employee_no}）`,
          items: by[name].map(s => ({ ...s, label: fmt.dt(s.start).slice(11) + '–' + fmt.dt(s.end).slice(11), sel: false })),
        })),
      });
      if (!slots.length) api.toast('该诊所当日没有可约时段，换个日期试试');
    } catch (e) { api.toastErr(e); }
  },
  pickSlot(e) {
    const { g, i } = e.currentTarget.dataset;
    const slotGroups = this.data.slotGroups.map((grp, gi) => ({
      ...grp, items: grp.items.map((it, ii) => ({ ...it, sel: gi === Number(g) && ii === Number(i) })),
    }));
    this.setData({ slotGroups, slot: this.data.slotGroups[g].items[i] });
  },
  async submit() {
    if (this.data.submitting) return;
    if (!this.data.slot) return api.toast('请先选择就诊时段');
    this.setData({ submitting: true });
    try {
      const m = await api.get('/patient/meta');
      const body = {
        clinic_id: m.clinics[this.data.clinicIdx].clinic_id,
        dentist_id: this.data.slot.dentist_id,
        scheduled_start: this.data.slot.start,
        scheduled_end: this.data.slot.end,
      };
      if (this.data.mode === 'reschedule') {
        body.reason = this.data.reason || '患者自助改约';
        await api.post(`/patient/visits/${this.data.visitId}/reschedule`, body);
        api.toast('改约成功');
      } else {
        body.requested_treatments = this.data.want;
        body.special_needs = this.data.needs;
        if (this.data.ttIdx > 0) body.treatment_type_id = m.treatment_types[this.data.ttIdx - 1].treatment_type_id;
        const r = await api.post('/patient/visits', body);
        api.toast(`预约成功 ${r.visit_no}`);
      }
      setTimeout(() => wx.navigateBack(), 900);
    } catch (e) { api.toastErr(e); }
    this.setData({ submitting: false });
  },
});
