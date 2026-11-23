const api = require('../../utils/api.js');
const fmt = require('../../utils/fmt.js');

const TABS = [['', '全部'], ['待到诊', '待到诊'], ['已到诊', '已到诊'], ['治疗完成', '治疗完成'],
  ['患者取消', '患者取消'], ['未到诊', '未到诊'], ['待核实', '待核实'], ['已改约', '已改约']];

Page({
  data: { tabs: TABS, tab: '待到诊', list: [], mine: false, loaded: false },
  onLoad(q) {
    if (q.mine === '1') { this.setData({ mine: true, tab: '已到诊' }); }
  },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    if (!api.getUser()) return;
    try {
      const q = [];
      if (this.data.tab) q.push('status=' + encodeURIComponent(this.data.tab));
      if (this.data.mine) q.push('dentist_id=' + api.getUser().dentist_id);
      const list = await api.get('/visits' + (q.length ? '?' + q.join('&') : ''));
      this.setData({
        list: list.map(v => ({ ...v, st_cls: fmt.badgeCls(v.status),
          when: fmt.dt(v.scheduled_start) })),
        loaded: true,
      });
    } catch (e) { api.toastErr(e); }
  },
  onTab(e) { this.setData({ tab: e.currentTarget.dataset.v }); this.load(); },
  goVisit(e) { wx.navigateTo({ url: '/pages/visit/visit?id=' + e.currentTarget.dataset.id }); },
});
