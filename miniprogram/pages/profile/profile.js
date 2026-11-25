const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: {
    patient: null,
    editMode: false,
    f: { phone: '', email: '', billing_address: '', emergency_contact_name: '', emergency_contact_phone: '' },
    allergyTypes: [], newAllergyIdx: 0, newAllergyNote: '',
    offline: false,
  },
  onShow() {
    const u = api.getUser();
    if (!u) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    this.setData({ patient: u, offline: api.isOffline() });
    this.load();
  },
  async load() {
    try {
      const [me, meta] = await Promise.all([api.get('/patient/me'), api.get('/patient/meta')]);
      this.setData({
        patient: { ...me, allergies: me.allergies.map(a => ({ ...a, st_cls: fmt.badgeCls(a.status), st_text: fmt.statusText(a.status) })) },
        allergyTypes: meta.allergy_types,
        f: { phone: me.phone || '', email: me.email || '', billing_address: me.billing_address || '',
          emergency_contact_name: me.emergency_contact_name || '', emergency_contact_phone: me.emergency_contact_phone || '' },
      });
    } catch (e) { api.toastErr(e); }
  },
  toggleEdit() { this.setData({ editMode: !this.data.editMode }); },
  onField(e) { this.setData({ ['f.' + e.currentTarget.dataset.k]: e.detail.value }); },
  async saveProfile() {
    try {
      const me = await api.put('/patient/me', this.data.f);
      api.setAuth(null, { ...api.getUser(), ...me });
      api.toast('档案已更新');
      this.setData({ editMode: false });
      this.load();
    } catch (e) { api.toastErr(e); }
  },
  onNewAllergy(e) { this.setData({ newAllergyIdx: Number(e.detail.value) }); },
  onNewNote(e) { this.setData({ newAllergyNote: e.detail.value }); },
  async addAllergy() {
    try {
      await api.post('/patient/me/allergies', {
        allergy_type_id: this.data.allergyTypes[this.data.newAllergyIdx].allergy_type_id,
        note: this.data.newAllergyNote,
      });
      api.toast('已添加健康备注（到店时服务人员会核对）');
      this.setData({ newAllergyNote: '' });
      this.load();
    } catch (e) { api.toastErr(e); }
  },
  logout() {
    wx.showModal({
      title: '退出登录', content: '确定退出当前账号？',
      success: r => {
        if (r.confirm) {
          api.post('/patient/logout').catch(() => {});
          api.clearAuth();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },
});
