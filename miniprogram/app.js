// ADC 安德鲁牙科连锁管理系统 — 小程序入口
App({
  globalData: {
    baseUrl: 'http://127.0.0.1:8000', // 本地开发后端地址
    user: null,
  },
  onLaunch() {
    // 初始化云开发（微信云托管环境：无需配置 request 合法域名）
    if (wx.cloud) {
      try {
        wx.cloud.init({ env: 'prod-d3gyx49ypd96d0cf0', traceUser: false });
      } catch (e) { /* 云环境不可用时自动回退本地/离线模式 */ }
    }
    const user = wx.getStorageSync('adc_user');
    if (user) this.globalData.user = user;
  },
});
