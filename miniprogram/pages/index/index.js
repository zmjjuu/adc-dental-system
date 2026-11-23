const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

Page({
  data: { user: null, roleNames: '', stats: [], quick: [], recent: [], loaded: false },
  async onShow() {
    const u = api.getUser();
    if (!u) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    this.setData({ user: u, roleNames: u.roles.map(r => r.role_name).join(' / ') });
    await this.load();
  },
  async load() {
    try {
      const [visits, patients] = await Promise.all([api.get('/visits'), api.get('/patients?q=')]);
      const cnt = st => visits.filter(v => v.status === st).length;
      const stats = [];
      const quick = [];
      if (api.hasRole('reception')) {
        stats.push(
          { n: cnt('待到诊'), t: '待到诊预约' },
          { n: cnt('已到诊'), t: '已到诊待治疗' },
          { n: cnt('待核实'), t: '到期待核实', warn: true },
          { n: patients.length, t: '患者档案' },
        );
        quick.push({ icon: '📞', t: '预约工作台', url: '/pages/book/book' });
        quick.push({ icon: '👥', t: '患者管理', url: '/pages/patients/patients' });
        quick.push({ icon: '🧮', t: '结算单', url: '/pages/visits/visits' });
      }
      if (api.hasRole('dentist')) {
        const mine = visits.filter(v => v.dentist_id === api.getUser().dentist_id);
        stats.push(
          { n: mine.filter(v => v.status === '已到诊').length, t: '我的已到诊' },
          { n: mine.filter(v => v.status === '待到诊').length, t: '我的待接诊' },
        );
        quick.push({ icon: '🩺', t: '我的接诊', url: '/pages/visits/visits?mine=1' });
      }
      if (api.hasRole('finance')) {
        const c1 = await api.get('/costs?status=' + encodeURIComponent('待分摊'));
        const c2 = await api.get('/costs?status=' + encodeURIComponent('待确认'));
        stats.push(
          { n: c1.length, t: '待分摊费用', warn: true },
          { n: c2.length, t: '待确认费用', warn: true },
        );
        quick.push({ icon: '💰', t: '费用登记', url: '/pages/costs/costs' });
        quick.push({ icon: '📊', t: '季度核算', url: '/pages/quarter/quarter' });
      }
      if (api.hasRole('hq')) {
        const qs = await api.get('/quarters');
        if (qs.length) {
          stats.push(
            { n: fmt.money(qs[0].net_profit), t: `最近核算净利润` },
            { n: qs[0].pool_amount != null ? fmt.money(qs[0].pool_amount) : '—', t: '激励基金(10%)' },
          );
        }
        quick.push({ icon: '📈', t: '运营报表', url: '/pages/report/report' });
        quick.push({ icon: '✅', t: '季度审批', url: '/pages/quarter/quarter' });
      }
      if (api.hasRole('ops')) {
        quick.push({ icon: '🗓', t: '运营维护', url: '/pages/manage/manage' });
      }
      const recent = visits.slice(0, 8).map(v => ({ ...v, st_cls: fmt.badgeCls(v.status) }));
      this.setData({ stats, quick, recent, loaded: true });
    } catch (e) { api.toastErr(e); }
  },
  goQuick(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }); },
  goVisit(e) { wx.navigateTo({ url: '/pages/visit/visit?id=' + e.currentTarget.dataset.id }); },
});
