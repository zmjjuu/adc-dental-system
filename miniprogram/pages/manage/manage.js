const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: {
    tab: 'dentists',
    meta: null, schedules: [],
    // 牙医表单
    df: { employee_no: '', name: '', birth_date: '', phone: '', email: '', home_address: '' },
    dQuals: {}, qualIdFor: null,
    // 诊所表单
    cf: { clinic_code: '', postal_address: '', manager_name: '', phone: '', email: '', area_m2: '' },
    // 出诊表单
    sf: { dentistIdx: 0, clinicIdx: 0, start: '2026-11-23 09:00', end: '2026-11-23 18:00' },
    // 项目表单
    tf: { treatment_code: '', treatment_name: '', unit_name: '', default_unit_price: '', allows_fraction: false, mode: 'ANY' },
    tQuals: {},
  },
  async onLoad() {
    try {
      const meta = await api.meta();
      this.setData({ meta });
      await this.loadSchedules();
    } catch (e) { api.toastErr(e); }
  },
  async loadSchedules() {
    try { this.setData({ schedules: await api.get('/schedules') }); }
    catch (e) { api.toastErr(e); }
  },
  onTab(e) { this.setData({ tab: e.currentTarget.dataset.v }); if (e.currentTarget.dataset.v === 'schedules') this.loadSchedules(); },

  onDf(e) { this.setData({ ['df.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onDQual(e) { const id = e.currentTarget.dataset.id; this.setData({ ['dQuals.' + id]: e.detail.value.length > 0 }); },
  async createDentist() {
    const f = this.data.df;
    if (!f.employee_no || !f.name || !f.phone || !f.email) return api.toast('请填写编号/姓名/电话/邮箱');
    try {
      const qualifications = Object.keys(this.data.dQuals).filter(k => this.data.dQuals[k]).map(k => ({
        qualification_id: Number(k), verification_status: '已核实', valid_from: '2025-01-01',
        certificate_no: 'ZC-' + f.employee_no + '-' + k }));
      await api.post('/dentists', { ...f, qualifications });
      api.toast('牙医已建档'); api.clearMeta();
      this.setData({ df: { employee_no: '', name: '', birth_date: '', phone: '', email: '', home_address: '' }, dQuals: {} });
      this.onLoad();
    } catch (e) { api.toastErr(e); }
  },
  openQualFor(e) {
    this.setData({ qualFor: e.currentTarget.dataset.id });
    wx.showActionSheet({
      itemList: ['未核实', '已核实'],
      success: async r => {
        try {
          await api.post(`/dentists/${e.currentTarget.dataset.id}/qualifications`,
            { qualification_id: Number(e.currentTarget.dataset.qid),
              verification_status: r.tapIndex === 1 ? '已核实' : '未核实', valid_from: '2025-01-01' });
          api.toast('资质已保存'); api.clearMeta(); this.onLoad();
        } catch (err) { api.toastErr(err); }
      },
    });
  },
  async toggleDentist(e) {
    try {
      await api.put(`/dentists/${e.currentTarget.dataset.id}`, { active: e.currentTarget.dataset.active ? 0 : 1 });
      api.toast(e.currentTarget.dataset.active ? '已停用（历史保留）' : '已恢复'); api.clearMeta(); this.onLoad();
    } catch (err) { api.toastErr(err); }
  },

  onCf(e) { this.setData({ ['cf.' + e.currentTarget.dataset.k]: e.detail.value }); },
  async createClinic() {
    const f = this.data.cf;
    if (!f.clinic_code || !f.postal_address) return api.toast('请填写门店代码与地址');
    try {
      await api.post('/clinics', { ...f, area_m2: Number(f.area_m2) || 100 });
      api.toast('诊所已建档'); api.clearMeta();
      this.setData({ cf: { clinic_code: '', postal_address: '', manager_name: '', phone: '', email: '', area_m2: '' } });
      this.onLoad();
    } catch (e) { api.toastErr(e); }
  },

  onSf(e) { this.setData({ ['sf.' + e.currentTarget.dataset.k]: e.detail.value }); },
  async createSchedule() {
    const m = this.data.meta;
    const f = this.data.sf;
    try {
      await api.post('/schedules', {
        dentist_id: m.dentists[f.dentistIdx].dentist_id,
        clinic_id: m.clinics[f.clinicIdx].clinic_id,
        start_at: f.start, end_at: f.end });
      api.toast('出诊安排已保存（重叠会被拒绝）'); this.loadSchedules();
    } catch (e) { api.toastErr(e); }
  },

  onTf(e) { this.setData({ ['tf.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onTQual(e) { const id = e.currentTarget.dataset.id; this.setData({ ['tQuals.' + id]: e.detail.value.length > 0 }); },
  async createType() {
    const f = this.data.tf;
    if (!f.treatment_code || !f.treatment_name || !f.default_unit_price) return api.toast('请填写代码/名称/标准价');
    try {
      await api.post('/treatment-types', {
        ...f, default_unit_price: Number(f.default_unit_price),
        qualification_match_mode: f.mode,
        qualification_ids: Object.keys(this.data.tQuals).filter(k => this.data.tQuals[k]).map(Number) });
      api.toast('治疗项目已入目录'); api.clearMeta();
      this.setData({ tf: { treatment_code: '', treatment_name: '', unit_name: '', default_unit_price: '', allows_fraction: false, mode: 'ANY' }, tQuals: {} });
      this.onLoad();
    } catch (e) { api.toastErr(e); }
  },
});
