// ADC — 格式化与状态徽章映射
function money(x) { return '¥' + (Number(x) || 0).toFixed(2); }
function dt(s) { return (s || '').slice(0, 16); }
function d(s) { return (s || '').slice(0, 10); }

const BADGE_CLS = {
  待到诊: 'b-blue', 已到诊: 'b-green', 治疗完成: 'b-teal', 患者取消: 'b-orange',
  诊所撤销: 'b-gray', 待核实: 'b-purple', 未到诊: 'b-red', 已改约: 'b-gray',
  已确认: 'b-green', 草稿: 'b-yellow', 已签发: 'b-green',
  待分摊: 'b-purple', 待确认: 'b-orange', 已批准: 'b-green', 待审批: 'b-orange',
  已核实: 'b-green', 未核实: 'b-gray', 已失效: 'b-red', 已撤回: 'b-gray', 有效: 'b-green',
};
function badgeCls(status) { return BADGE_CLS[status] || 'b-gray'; }

module.exports = { money, dt, d, badgeCls };
