// ADC 安德鲁牙科连锁管理系统 — 小程序入口
App({
  globalData: {
    baseUrl: 'http://127.0.0.1:8000', // 后端地址（开发者工具中运行）
    user: null,
  },
  onLaunch() {
    const user = wx.getStorageSync('adc_user');
    if (user) this.globalData.user = user;
  },
});
