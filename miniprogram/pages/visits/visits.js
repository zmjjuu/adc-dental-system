const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

const TABS = [['', '全部'], ['待到诊', '待到诊'], ['已到诊', '已到诊'], ['治疗完成', '已完成'],
  ['患者取消', '已取消'], ['未到诊', '未到诊'], ['待核实', '待核实'], ['已改约', '已改约']];

Page({
  data: { tabs: TABS, tab: '待到诊', list: [], loaded: false },
  onShow() {
    if (!api.getUser()) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    this.load();
  },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    try {
      const list = await api.get('/patient/visits');
      const filtered = this.data.tab ? list.filter(v => v.status === this.data.tab) : list;
      this.setData({
        list: filtered.map(v => ({ ...v, st_cls: fmt.badgeCls(v.status),
          when: fmt.dt(v.scheduled_start) })),
        loaded: true,
      });
    } catch (e) { api.toastErr(e); }
  },
  onTab(e) { this.setData({ tab: e.currentTarget.dataset.v }); this.load(); },
  goVisit(e) { wx.navigateTo({ url: '/pages/visit/visit?id=' + e.currentTarget.dataset.id }); },
  goBook() { wx.navigateTo({ url: '/pages/book/book' }); },
});
