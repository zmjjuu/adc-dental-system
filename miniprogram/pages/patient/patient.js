const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: {
    mode: 'detail', id: null,
    p: null, allergyTypes: [],
    // 建档表单
    f: { name: '', birth_date: '', phone: '', email: '', billing_address: '',
      emergency_contact_name: '', emergency_contact_phone: '' },
    checkAllergies: {},
    // 新增过敏
    newAllergyIdx: 0, newAllergyNote: '',
    creating: false,
  },
  async onLoad(q) {
    if (q.mode === 'create') {
      this.setData({ mode: 'create' });
      wx.setNavigationBarTitle({ title: '新建患者档案' });
    } else {
      this.setData({ id: Number(q.id) });
    }
    try {
      const m = await api.meta();
      this.setData({ allergyTypes: m.allergy_types });
      if (this.data.id) await this.load();
    } catch (e) { api.toastErr(e); }
  },
  async load() {
    try {
      const p = await api.get('/patients/' + this.data.id);
      this.setData({ p: { ...p, allergies: p.allergies.map(a => ({ ...a, st_cls: fmt.badgeCls(a.status) })),
        visits: p.visits.map(v => ({ ...v, st_cls: fmt.badgeCls(v.status), when: fmt.dt(v.scheduled_start) })) } });
    } catch (e) { api.toastErr(e); }
  },
  onField(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ ['f.' + k]: e.detail.value });
  },
  onAllergyToggle(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ ['checkAllergies.' + id]: e.detail.value.length > 0 });
  },
  async doCreate() {
    if (this.data.creating) return;
    const f = this.data.f;
    if (!f.name || !f.birth_date || !f.phone || !f.billing_address ||
        !f.emergency_contact_name || !f.emergency_contact_phone)
      return api.toast('必填字段缺失（邮箱可以不填）');
    this.setData({ creating: true });
    try {
      const allergies = Object.keys(this.data.checkAllergies)
        .filter(k => this.data.checkAllergies[k]).map(k => ({ allergy_type_id: Number(k), note: '' }));
      const p = await api.post('/patients', { ...f, email: f.email || null, allergies });
      api.toast(`建档成功 ${p.account_no}`);
      setTimeout(() => wx.redirectTo({ url: `/pages/patient/patient?id=${p.patient_id}` }), 700);
    } catch (e) { api.toastErr(e); }
    this.setData({ creating: false });
  },
  async saveAllergy(e) {
    const idx = e.currentTarget.dataset.idx;
    const a = this.data.p.allergies[idx];
    try {
      const at = this.data.allergyTypes.find(t => t.allergy_name === a.allergy_name);
      await api.post(`/patients/${this.data.p.patient_id}/allergies`,
        { allergy_type_id: at.allergy_type_id, status: a.status, note: a.note });
      api.toast('过敏记录已保存');
    } catch (err) { api.toastErr(err); }
  },
  onAllergyStatus(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`p.allergies[${idx}].status`]: e.detail.value });
  },
  onAllergyNote(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`p.allergies[${idx}].note`]: e.detail.value });
  },
  onNewAllergy(e) { this.setData({ newAllergyIdx: Number(e.detail.value) }); },
  onNewNote(e) { this.setData({ newAllergyNote: e.detail.value }); },
  async addAllergy() {
    try {
      await api.post(`/patients/${this.data.p.patient_id}/allergies`,
        { allergy_type_id: this.data.allergyTypes[this.data.newAllergyIdx].allergy_type_id,
          note: this.data.newAllergyNote });
      api.toast('已添加（待核实）'); this.setData({ newAllergyNote: '' }); this.load();
    } catch (e) { api.toastErr(e); }
  },
  goVisit(e) { wx.navigateTo({ url: '/pages/visit/visit?id=' + e.currentTarget.dataset.id }); },
});
