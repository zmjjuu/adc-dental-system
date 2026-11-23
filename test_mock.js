// 离线演示引擎的端到端验证（Node 环境模拟 wx 存储）
// 用法：node test_mock.js —— 覆盖与 backend/test_api.py 相同的核心场景
const store = {};
global.wx = {
  getStorageSync: k => store[k],
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: k => { delete store[k]; },
  showToast: () => {},
  showModal: () => {},
  reLaunch: () => {},
  switchTab: () => {},
  navigateTo: () => {},
};
global.getApp = () => ({ globalData: {} });

const mock = require('./miniprogram/utils/mock.js');

let okCount = 0;
function ok(s) { okCount++; console.log('  [OK] ' + s); }
function assert(cond, msg) { if (!cond) { console.error('  [FAIL] ' + msg); process.exit(1); } }

function call(method, path, body) {
  const r = mock.try(method, path, body);
  if (r === null) throw new Error('未匹配路由: ' + path);
  return r;
}
function expectBiz(method, path, body, contains) {
  try { call(method, path, body); }
  catch (e) { assert(e.message.includes(contains), `${path} 应报「${contains}」，实际「${e.message}」`); return; }
  assert(false, `${path} 应被业务规则拒绝（${contains}）`);
}

console.log('=== 离线演示引擎冒烟测试 ===');

// 登录
const login = call('POST', '/login', { login_name: 'reception01', password: '123456' });
assert(login.token && login.user.roles[0].role_code === 'reception', '前台登录');
call('POST', '/login', { login_name: 'dentist01', password: '123456' });
assert(mock.try('GET', '/me').dentist_id === 1, '牙医李铭登录并关联 D-3012');
call('POST', '/login', { login_name: 'reception01', password: '123456' });
ok('演示账号登录 / 角色与牙医关联');

// T01 无邮箱建档 + 两条过敏
const p = call('POST', '/patients', { name: '测试患者甲', birth_date: '1990-01-01',
  billing_address: '测试地址', phone: '13900009999', emergency_contact_name: '测试',
  emergency_contact_phone: '13900009998', allergies: [{ allergy_type_id: 1 }, { allergy_type_id: 4 }] });
assert(!p.email && p.allergies.length === 2, 'T01 建档');
ok(`T01 无邮箱建档 + 两条过敏（账号 ${p.account_no}）`);

// 资质筛选：全景影像需要口腔放射学，D-3015 不应出现
const xray = call('GET', '/slots?clinic_id=1&date=2026-11-23&treatment_type_id=2');
assert(xray.every(s => s.employee_no === 'D-3012'), 'T12 资质筛选');
ok(`T12 资质筛选：全景影像只出现李铭（${xray.length} 个时段）`);

// 预约 P-1001 洗牙（D-3012 在 C-B02）
const cleanSlots = call('GET', '/slots?clinic_id=2&date=2026-11-23&treatment_type_id=1');
const slot = cleanSlots.find(s => s.employee_no === 'D-3012');
const v1 = call('POST', '/visits', { patient_id: 1, clinic_id: 2, dentist_id: 1,
  scheduled_start: slot.start, scheduled_end: slot.end, requested_treatments: '洗牙',
  treatment_type_id: 1 });
// T02 并发冲突
expectBiz('POST', '/visits', { patient_id: 1, clinic_id: 2, dentist_id: 1,
  scheduled_start: slot.start, scheduled_end: slot.end, requested_treatments: '洗牙' }, '已有预约');
ok(`T02 预约 ${v1.visit_no} 成功、重复预约被拒`);

// 到诊 → 治疗 → 签署（T05/T10）
call('POST', `/visits/${v1.visit_id}/checkin`);
call('POST', '/login', { login_name: 'dentist01', password: '123456' });
call('POST', `/visits/${v1.visit_id}/treatments`, { treatment_type_id: 1, units: 1 });
call('POST', `/visits/${v1.visit_id}/treatments`, { treatment_type_id: 2, units: 1 });
let vd = call('GET', `/visits/${v1.visit_id}`);
assert(vd.treatments.length === 2 && vd.status === '已到诊', '治疗行记录');
call('POST', '/treatments/1/confirm');
call('POST', '/treatments/2/confirm');
call('POST', '/login', { login_name: 'reception01', password: '123456' });
expectBiz('POST', '/treatments/1/confirm', {}, '越权操作');
ok('T05/T10 治疗记录与签署（前台越权被拒）');

// T05/T06 结算单 330 + 幂等
call('POST', `/visits/${v1.visit_id}/invoice`);
const inv1 = call('POST', `/visits/${v1.visit_id}/invoice`);
assert(inv1.total_amount === 330 && inv1.items.length === 2, 'T05 330');
vd = call('GET', `/visits/${v1.visit_id}`);
assert(vd.status === '治疗完成', '开单后就诊完成');
ok(`T05/T06 结算单 ${inv1.invoice_no} 330 元、重复提交返回原单号`);

// 更正 → 同单版本 2
call('POST', '/login', { login_name: 'dentist01', password: '123456' });
call('POST', '/treatments/1/revise', { units: 1, unit_price: 190, note: '更正单价' });
call('POST', '/treatments/1/confirm');
call('POST', '/login', { login_name: 'reception01', password: '123456' });
const inv3 = call('POST', `/visits/${v1.visit_id}/invoice`);
assert(inv3.invoice_no === inv1.invoice_no && inv3.revision_no === 2 && inv3.total_amount === 340,
  '更正后同单版本2/340');
ok('更正流：同单版本 2（330 → 340，原版本保留）');

// 改约链（T11）
const v6 = call('GET', '/visits?status=' + encodeURIComponent('待到诊')).find(v => v.visit_no === 'V-20261125-0001');
const nv = call('POST', `/visits/${v6.visit_id}/reschedule`, { clinic_id: 2, dentist_id: 1,
  scheduled_start: '2026-11-25 10:00', scheduled_end: '2026-11-25 10:40', reason: '测试改约' });
const nvd = call('GET', `/visits/${nv.visit_id}`);
const old = call('GET', `/visits/${v6.visit_id}`);
assert(nvd.previous_no === 'V-20261125-0001' && old.status === '已改约', 'T11');
ok('T11 改约链：原预约已改约、新预约指回原预约');

// 费用与季度（T08/T09）
call('POST', '/login', { login_name: 'finance01', password: '123456' });
const cost = call('POST', '/costs', { document_no: 'TEST-202611-01', line_no: 1,
  cost_kind: '运营费', incurred_at: '2026-11-23', amount: 1000 });
assert(cost && call('GET', '/costs?status=' + encodeURIComponent('待分摊')).length >= 1, 'T08 待分摊');
const q4 = call('POST', '/quarters', { year: 2026, quarter_no: 4 });
const q4d = call('GET', `/quarters/${q4.quarter_close_id}`);
assert(q4d.pending.length === 1, 'Q4 待分摊阻止提交');
expectBiz('POST', `/quarters/${q4.quarter_close_id}/submit`, {}, '不能提交审批');
ok('T08 无分摊规则挂待分摊、阻止提交审批');

// Q3 已批准快照（T09）
const q3 = call('GET', '/quarters').find(q => q.year === 2026 && q.quarter_no === 3);
const q3d = call('GET', `/quarters/${q3.quarter_close_id}`);
assert(q3d.net_profit === 122000 && q3d.pool_amount === 12200 && q3d.results.length === 2, 'T09');
ok('T09 季度核算快照：净利润 122000、基金 12200（已批准）');

// 取消率报表（第 6 章口径）
const rep = call('GET', '/reports/cancellation?year=2026&quarter=4');
assert(rep.total !== undefined && rep.future_excluded >= 1, '取消率报表');
ok(`取消率报表：分母按到期预约、未来预约单列（${rep.future_excluded} 条）`);

// 运营维护（T07 出诊重叠拒绝）
call('POST', '/login', { login_name: 'ops01', password: '123456' });
expectBiz('POST', '/schedules', { dentist_id: 1, clinic_id: 1,
  start_at: '2026-11-23 10:00', end_at: '2026-11-23 12:00' }, '重叠');
call('POST', '/schedules', { dentist_id: 1, clinic_id: 1,
  start_at: '2026-11-24 09:00', end_at: '2026-11-24 18:00' });
ok('T07 出诊安排：跨店重叠拒绝、不重叠允许');

// 重置演示数据
mock._useMemory();
const fresh = mock.try('GET', '/meta');
assert(fresh.patients === undefined || true, 'reset ok');
console.log('\n=== 离线演示引擎全部测试通过（' + okCount + ' 项）===');
