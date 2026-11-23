// ADC — 离线演示引擎（体验版免服务器方案）
// 与后端 logic.py 同规则的演示引擎：内置演示数据 + 全部业务规则，数据存手机本地。
// 作用：微信体验版在手机上无法连接本地后端、又未配置白名单域名时，
//       小程序自动切换到本引擎，老师扫码即可完整体验全部功能（无需服务器/域名/备案）。
// 真后端（backend/）逻辑不变，本地开发者工具中仍走真实 API。
const KEY = 'adc_offline_db';
const OFFLINE_KEY = 'adc_offline';

let _mem = null;      // Node 测试用内存存储
let currentUser = null;

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function m2(x) { return Math.round((Number(x) + 1e-9) * 100) / 100; }
function nowStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function todayStr() { return nowStr().slice(0, 10); }
function dtOf(s) { return new Date(String(s).replace(' ', 'T')); }

function loadDB() {
  if (_mem) return _mem;
  let db = wx.getStorageSync(KEY);
  if (!db) { db = seed(); saveDB(db); }
  return db;
}
function saveDB(db) {
  if (_mem) { _mem = db; return; }
  wx.setStorageSync(KEY, db);
}

// ---------------- 演示数据种子（与 backend/db.py 一致） ----------------
function seed() {
  const db = {
    seq: { visit: 30, invoice: 23, patient: 1029, treatment: 0, invoice_item: 0, cost: 0, cost_alloc: 0, quarter: 1, result: 2 },
    allergy_types: [
      { allergy_type_id: 1, allergy_name: '乳胶' }, { allergy_type_id: 2, allergy_name: '麻醉剂' },
      { allergy_type_id: 3, allergy_name: '金属' }, { allergy_type_id: 4, allergy_name: '树脂' },
    ],
    qualifications: [
      { qualification_id: 1, qualification_name: '口腔放射学' }, { qualification_id: 2, qualification_name: '牙髓病学' },
      { qualification_id: 3, qualification_name: '口腔修复' }, { qualification_id: 4, qualification_name: '口腔种植' },
      { qualification_id: 5, qualification_name: '正畸' }, { qualification_id: 6, qualification_name: '儿科口腔' },
    ],
    clinics: [
      { clinic_id: 1, clinic_code: 'C-A01', postal_address: '城东区人民路88号安德鲁大厦2层', manager_name: '吴建国',
        phone: '0571-88001001', email: 'center@adc-dental.com', area_m2: 420, active: 1 },
      { clinic_id: 2, clinic_code: 'C-B02', postal_address: '滨江区江南大道466号3层', manager_name: '周小燕',
        phone: '0571-88001002', email: 'binjiang@adc-dental.com', area_m2: 360, active: 1 },
    ],
    dentists: [
      { dentist_id: 1, employee_no: 'D-3012', name: '李铭', birth_date: '1986-04-12', home_address: '城东区学院路23号',
        phone: '13700003012', email: 'liming@adc-dental.com', active: 1,
        qualifications: [
          { dentist_qualification_id: 1, qualification_id: 1, qualification_name: '口腔放射学', certificate_no: 'ZC-1', verification_status: '已核实' },
          { dentist_qualification_id: 2, qualification_id: 3, qualification_name: '口腔修复', certificate_no: 'ZC-2', verification_status: '已核实' },
          { dentist_qualification_id: 3, qualification_id: 4, qualification_name: '口腔种植', certificate_no: 'ZC-3', verification_status: '已核实' },
        ] },
      { dentist_id: 2, employee_no: 'D-3015', name: '王雅', birth_date: '1991-09-25', home_address: '滨江区文苑路77号',
        phone: '13700003015', email: 'wangya@adc-dental.com', active: 1,
        qualifications: [
          { dentist_qualification_id: 4, qualification_id: 2, qualification_name: '牙髓病学', certificate_no: 'ZC-4', verification_status: '已核实' },
          { dentist_qualification_id: 5, qualification_id: 5, qualification_name: '正畸', certificate_no: 'ZC-5', verification_status: '已核实' },
          { dentist_qualification_id: 6, qualification_id: 6, qualification_name: '儿科口腔', certificate_no: 'ZC-6', verification_status: '已核实' },
        ] },
    ],
    treatment_types: [
      { treatment_type_id: 1, treatment_code: 'CLEAN', treatment_name: '洗牙', unit_name: '次', default_unit_price: 180, allows_fraction: 0, qualification_match_mode: 'ANY', active: 1, requirement_names: [] },
      { treatment_type_id: 2, treatment_code: 'XRAY', treatment_name: '全景影像', unit_name: '次', default_unit_price: 150, allows_fraction: 0, qualification_match_mode: 'ANY', active: 1, requirement_names: ['口腔放射学'] },
      { treatment_type_id: 3, treatment_code: 'POLISH', treatment_name: '抛光', unit_name: '次', default_unit_price: 100, allows_fraction: 0, qualification_match_mode: 'ANY', active: 1, requirement_names: [] },
      { treatment_type_id: 4, treatment_code: 'FILL', treatment_name: '修复充填', unit_name: '颗', default_unit_price: 300, allows_fraction: 0, qualification_match_mode: 'ANY', active: 1, requirement_names: ['口腔修复'] },
      { treatment_type_id: 5, treatment_code: 'RCT', treatment_name: '根管治疗', unit_name: '次', default_unit_price: 800, allows_fraction: 0, qualification_match_mode: 'ANY', active: 1, requirement_names: ['牙髓病学'] },
      { treatment_type_id: 6, treatment_code: 'IMPLANT', treatment_name: '种植牙', unit_name: '颗', default_unit_price: 9000, allows_fraction: 0, qualification_match_mode: 'ANY', active: 1, requirement_names: ['口腔种植'] },
      { treatment_type_id: 7, treatment_code: 'ORTHO', treatment_name: '正畸', unit_name: '疗程', default_unit_price: 12000, allows_fraction: 0, qualification_match_mode: 'ANY', active: 1, requirement_names: ['正畸'] },
      { treatment_type_id: 8, treatment_code: 'PEDO', treatment_name: '儿童涂氟', unit_name: '次', default_unit_price: 120, allows_fraction: 0, qualification_match_mode: 'ANY', active: 1, requirement_names: ['儿科口腔'] },
    ],
    schedules: [
      { schedule_id: 1, dentist_id: 1, clinic_id: 2, start_at: '2026-11-23 09:00', end_at: '2026-11-23 18:00', status: '有效' },
      { schedule_id: 2, dentist_id: 1, clinic_id: 2, start_at: '2026-11-25 09:00', end_at: '2026-11-25 18:00', status: '有效' },
      { schedule_id: 3, dentist_id: 1, clinic_id: 1, start_at: '2026-11-22 09:00', end_at: '2026-11-22 18:00', status: '有效' },
      { schedule_id: 4, dentist_id: 2, clinic_id: 1, start_at: '2026-11-21 09:00', end_at: '2026-11-21 18:00', status: '有效' },
      { schedule_id: 5, dentist_id: 2, clinic_id: 1, start_at: '2026-11-23 09:00', end_at: '2026-11-23 18:00', status: '有效' },
      { schedule_id: 6, dentist_id: 2, clinic_id: 2, start_at: '2026-11-28 09:00', end_at: '2026-11-28 18:00', status: '有效' },
    ],
    patients: [
      { patient_id: 1, account_no: 'P-1001', name: '陈雨桐', birth_date: '1992-03-14', billing_address: '城东区幸福路12号',
        phone: '13800001001', email: null, emergency_contact_name: '陈建国', emergency_contact_phone: '13900001001',
        allergy_inquiry_status: '已报告',
        allergies: [
          { patient_allergy_id: 1, allergy_type_id: 1, allergy_name: '乳胶', status: '已确认', note: '接触乳胶手套出现皮疹' },
          { patient_allergy_id: 2, allergy_type_id: 4, allergy_name: '树脂', status: '已确认', note: '' },
        ] },
      { patient_id: 2, account_no: 'P-1002', name: '刘明轩', birth_date: '1988-07-02', billing_address: '滨江区春晓路9号',
        phone: '13800001002', email: null, emergency_contact_name: '刘桂芳', emergency_contact_phone: '13900001002',
        allergy_inquiry_status: '已报告',
        allergies: [
          { patient_allergy_id: 3, allergy_type_id: 2, allergy_name: '麻醉剂', status: '待核实', note: '患者自述对麻醉剂过敏，尚未经牙医核实' },
        ] },
      { patient_id: 3, account_no: 'P-1003', name: '王淑芬', birth_date: '1975-11-20', billing_address: '城东区望江路3号',
        phone: '13800001003', email: 'wsf@example.com', emergency_contact_name: '王志强', emergency_contact_phone: '13900001003',
        allergy_inquiry_status: '未询问', allergies: [] },
      { patient_id: 4, account_no: 'P-1004', name: '张伟', birth_date: '1995-01-08', billing_address: '滨江区滨和路156号',
        phone: '13800001004', email: null, emergency_contact_name: '张丽', emergency_contact_phone: '13900001004',
        allergy_inquiry_status: '未询问', allergies: [] },
      { patient_id: 5, account_no: 'P-1005', name: '李静', birth_date: '1990-05-16', billing_address: '城东区文一西路88号',
        phone: '13800001005', email: 'lijing@example.com', emergency_contact_name: '李国强', emergency_contact_phone: '13900001005',
        allergy_inquiry_status: '未询问', allergies: [] },
      { patient_id: 6, account_no: 'P-1006', name: '赵一鸣', birth_date: '2001-09-30', billing_address: '滨江区江陵路200号',
        phone: '13800001006', email: null, emergency_contact_name: '赵海', emergency_contact_phone: '13900001006',
        allergy_inquiry_status: '已报告',
        allergies: [
          { patient_allergy_id: 4, allergy_type_id: 3, allergy_name: '金属', status: '待核实', note: '金属牙冠佩戴后不适' },
        ] },
    ],
    visits: [
      { visit_id: 1, visit_no: 'V-20261123-0001', patient_id: 1, dentist_id: 1, clinic_id: 2,
        scheduled_start: '2026-11-23 14:00:00', scheduled_end: '2026-11-23 14:40:00',
        requested_treatments: '洗牙', special_needs: '换店就诊：核对过敏档案（乳胶、树脂）',
        attended: 0, arrived_at: null, status: '待到诊', previous_visit_id: null,
        cancelled_at: null, cancel_initiator: null, reason: null, created_by: 3 },
      { visit_id: 2, visit_no: 'V-20261123-0002', patient_id: 2, dentist_id: 2, clinic_id: 1,
        scheduled_start: '2026-11-23 15:00:00', scheduled_end: '2026-11-23 15:40:00',
        requested_treatments: '医生评估', special_needs: '半年前心脏手术史，请医生评估后安排治疗',
        attended: 0, arrived_at: null, status: '待到诊', previous_visit_id: null,
        cancelled_at: null, cancel_initiator: null, reason: null, created_by: 3 },
      { visit_id: 3, visit_no: 'V-20261122-0001', patient_id: 3, dentist_id: 1, clinic_id: 1,
        scheduled_start: '2026-11-22 10:00:00', scheduled_end: '2026-11-22 10:40:00',
        requested_treatments: '修复充填', special_needs: null, attended: 0, arrived_at: null,
        status: '患者取消', previous_visit_id: null, cancelled_at: '2026-11-22 09:12:00',
        cancel_initiator: '患者', reason: '家中有事，改日再来', created_by: 3 },
      { visit_id: 4, visit_no: 'V-20261121-0001', patient_id: 4, dentist_id: 2, clinic_id: 1,
        scheduled_start: '2026-11-21 09:30:00', scheduled_end: '2026-11-21 10:10:00',
        requested_treatments: '洗牙', special_needs: null, attended: 0, arrived_at: null,
        status: '未到诊', previous_visit_id: null, cancelled_at: null, cancel_initiator: null,
        reason: '已电话联系，确认爽约', created_by: 3 },
      { visit_id: 5, visit_no: 'V-20261118-0001', patient_id: 5, dentist_id: 1, clinic_id: 1,
        scheduled_start: '2026-11-18 09:00:00', scheduled_end: '2026-11-18 09:40:00',
        requested_treatments: '抛光', special_needs: null, attended: 0, arrived_at: null,
        status: '已改约', previous_visit_id: null, cancelled_at: null, cancel_initiator: null,
        reason: '患者要求改到下周', created_by: 3 },
      { visit_id: 6, visit_no: 'V-20261125-0001', patient_id: 5, dentist_id: 1, clinic_id: 2,
        scheduled_start: '2026-11-25 09:00:00', scheduled_end: '2026-11-25 09:40:00',
        requested_treatments: '抛光', special_needs: null, attended: 0, arrived_at: null,
        status: '待到诊', previous_visit_id: 5, cancelled_at: null, cancel_initiator: null, reason: null, created_by: 3 },
      { visit_id: 7, visit_no: 'V-20261128-0001', patient_id: 6, dentist_id: 2, clinic_id: 2,
        scheduled_start: '2026-11-28 16:00:00', scheduled_end: '2026-11-28 16:40:00',
        requested_treatments: '根管治疗', special_needs: null, attended: 0, arrived_at: null,
        status: '待到诊', previous_visit_id: null, cancelled_at: null, cancel_initiator: null, reason: null, created_by: 3 },
    ],
    treatments: [],
    invoices: [],
    costs: [],
    quarters: [{
      quarter_close_id: 1, year: 2026, quarter_no: 3, version_no: 1,
      cutoff_at: '2026-09-30 23:59:59', policy_version: 'P-2026-01', status: '已批准',
      net_profit: 122000, pool_amount: 12200, approved_by: 1, approved_at: '2026-10-08 10:00:00',
      created_by: 4, created_at: '2026-10-08 09:30:00',
      results: [
        { result_id: 1, dentist_id: 1, dentist_no: 'D-3012', dentist_name: '李铭',
          revenue: 135000, material_cost: 32000, operating_expense: 25000, net_profit: 78000, sources: 25 },
        { result_id: 2, dentist_id: 2, dentist_no: 'D-3015', dentist_name: '王雅',
          revenue: 96000, material_cost: 24000, operating_expense: 28000, net_profit: 44000, sources: 14 },
      ],
    }],
    users: [
      { user_id: 1, login_name: 'hq01', display_name: '赵德柱', password: '123456', dentist_id: null, active: 1,
        roles: [{ role_code: 'hq', role_name: '总部经理' }] },
      { user_id: 2, login_name: 'ops01', display_name: '吴建国', password: '123456', dentist_id: null, active: 1,
        roles: [{ role_code: 'ops', role_name: '运营经理' }] },
      { user_id: 3, login_name: 'reception01', display_name: '周小燕', password: '123456', dentist_id: null, active: 1,
        roles: [{ role_code: 'reception', role_name: '前台' }] },
      { user_id: 4, login_name: 'finance01', display_name: '郑晓东', password: '123456', dentist_id: null, active: 1,
        roles: [{ role_code: 'finance', role_name: '财务' }] },
      { user_id: 5, login_name: 'dentist01', display_name: '李铭', password: '123456', dentist_id: 1, active: 1,
        roles: [{ role_code: 'dentist', role_name: '牙医' }] },
      { user_id: 6, login_name: 'dentist02', display_name: '王雅', password: '123456', dentist_id: 2, active: 1,
        roles: [{ role_code: 'dentist', role_name: '牙医' }] },
      { user_id: 7, login_name: 'reception02', display_name: '林芳', password: '123456', dentist_id: null, active: 1,
        roles: [{ role_code: 'reception', role_name: '前台' }] },
    ],
  };
  return db;
}

// ---------------- 工具 ----------------
function biz(msg) { const e = new Error(msg); e.biz = true; return e; }
function reqErr(msg, status) { const e = new Error(msg); e.status = status || 400; return e; }

function visitListItem(db, v) {
  const p = db.patients.find(x => x.patient_id === v.patient_id);
  const d = db.dentists.find(x => x.dentist_id === v.dentist_id);
  const c = db.clinics.find(x => x.clinic_id === v.clinic_id);
  const prev = db.visits.find(x => x.visit_id === v.previous_visit_id);
  return { ...clone(v), patient_name: p.name, patient_account: p.account_no, patient_phone: p.phone,
    dentist_name: d.name, dentist_no: d.employee_no, clinic_code: c.clinic_code,
    previous_no: prev ? prev.visit_no : null };
}

function currentTreatments(db, visitId) {
  return db.treatments.filter(t => t.visit_id === visitId).map(t => {
    const ver = t.versions.find(x => x.is_current);
    const tt = db.treatment_types.find(x => x.treatment_type_id === t.treatment_type_id);
    const d = db.dentists.find(x => x.dentist_id === ver.performer_dentist_id);
    return { treatment_id: t.treatment_id, treatment_type_id: t.treatment_type_id,
      treatment_name: tt.treatment_name, unit_name: tt.unit_name, version_no: ver.version_no,
      units: ver.units, unit_price: ver.unit_price, status: ver.status, is_current: 1,
      performed_at: ver.performed_at, confirmed_at: ver.confirmed_at, note: ver.note,
      performer_name: d.name, performer_no: d.employee_no };
  });
}

function currentInvoice(db, visitId) {
  const inv = db.invoices.find(x => x.visit_id === visitId);
  if (!inv) return null;
  const rev = inv.revisions.find(r => r.is_current);
  return { ...clone(inv), ...clone(rev), rev_status: rev.status, invoice_revision_id: rev.invoice_revision_id,
    items: rev.items.map(i => {
      const ver = db.treatments.find(t => t.treatment_id === i.treatment_id)
        .versions.find(x => x.version_no === i.version_no);
      const d = db.dentists.find(x => x.dentist_id === ver.performer_dentist_id);
      return { ...clone(i), performer_name: d.name, performer_dentist_id: ver.performer_dentist_id,
        performed_at: ver.performed_at };
    }) };
}

function quarterPending(db, year, qno) {
  const [s, e] = quarterRange(year, qno);
  return db.costs.filter(c => c.incurred_at >= s && c.incurred_at < e && ['待分摊', '待确认'].includes(c.status));
}

function quarterRange(year, qno) {
  const qStart = `${year}-${String((qno - 1) * 3 + 1).padStart(2, '0')}-01`;
  const qEnd = qno < 4 ? `${year}-${String(qno * 3 + 1).padStart(2, '0')}-01` : `${year + 1}-01-01`;
  return [qStart, qEnd];
}

function hasRole(db, codes) {
  if (!currentUser) return false;
  const u = db.users.find(x => x.user_id === currentUser.user_id);
  return u && u.roles.some(r => codes.flat().includes(r.role_code));
}
function requireRole(db, ...codes) {
  if (!hasRole(db, codes)) throw reqErr('越权操作：当前岗位没有此权限', 403);
}

// ---------------- 路由分发 ----------------
const ROUTES = [];
function route(re, handler) { ROUTES.push([re, handler]); }

function dispatch(method, path, body) {
  const db = loadDB();
  const [p0, qs] = path.split('?');
  const p = decodeURIComponent(p0);
  const params = {};
  if (qs) qs.split('&').forEach(kv => {
    const [k, v] = kv.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  for (const [re, h] of ROUTES) {
    const m = p.match(re);
    if (m) return h(db, method, m, Object.assign({}, params, body || {}));
  }
  return null; // 未匹配 → 上层回退真实请求
}

// ---------------- 登录与字典 ----------------
route(/^\/login$/, (db, method, m, b) => {
  const u = db.users.find(x => x.login_name === (b.login_name || ''));
  if (!u || u.password !== (b.password || '')) throw reqErr('登录名或密码不正确', 401);
  if (!u.active) throw reqErr('账号已停用', 403);
  currentUser = { user_id: u.user_id };
  return { token: 'offline-token', user: publicUser(u) };
});
route(/^\/logout$/, (db, method) => { currentUser = null; return { ok: true }; });
route(/^\/me$/, (db, method) => {
  const u = currentUser && db.users.find(x => x.user_id === currentUser.user_id);
  if (!u) throw reqErr('未登录或登录已失效，请重新登录', 401);
  return publicUser(u);
});
function publicUser(u) {
  return { user_id: u.user_id, login_name: u.login_name, display_name: u.display_name,
    dentist_id: u.dentist_id, active: u.active, roles: clone(u.roles) };
}

route(/^\/meta$/, (db) => ({
  clinics: db.clinics.filter(c => c.active).map(c => ({ clinic_id: c.clinic_id, clinic_code: c.clinic_code,
    postal_address: c.postal_address, manager_name: c.manager_name, phone: c.phone, email: c.email,
    area_m2: c.area_m2, active: c.active })),
  dentists: db.dentists.map(d => ({ dentist_id: d.dentist_id, employee_no: d.employee_no, name: d.name,
    birth_date: d.birth_date, home_address: d.home_address, phone: d.phone, email: d.email, active: d.active,
    qualifications: clone(d.qualifications) })),
  treatment_types: db.treatment_types.filter(t => t.active),
  allergy_types: db.allergy_types,
  qualifications: db.qualifications,
}));

// ---------------- 患者 ----------------
route(/^\/patients$/, (db, method, m, b) => {
  if (method === 'POST') {
    for (const f of ['name', 'birth_date', 'billing_address', 'phone', 'emergency_contact_name', 'emergency_contact_phone'])
      if (!b[f]) throw biz(`必填字段缺失：${f}（邮箱可以不填）`);
    requireRole(db, 'reception');
    db.seq.patient += 1;
    const p = { patient_id: db.seq.patient, account_no: `P-${db.seq.patient}`, name: b.name,
      birth_date: b.birth_date, billing_address: b.billing_address, phone: b.phone,
      email: b.email || null, emergency_contact_name: b.emergency_contact_name,
      emergency_contact_phone: b.emergency_contact_phone,
      allergy_inquiry_status: b.allergy_inquiry_status || '未询问', allergies: [] };
    for (const a of (b.allergies || [])) {
      const t = db.allergy_types.find(x => x.allergy_type_id === a.allergy_type_id);
      p.allergies.push({ patient_allergy_id: Date.now() + Math.random() * 1000 | 0,
        allergy_type_id: a.allergy_type_id, allergy_name: t ? t.allergy_name : '', status: '待核实', note: a.note || '' });
    }
    if (p.allergies.length && p.allergy_inquiry_status === '未询问') p.allergy_inquiry_status = '已报告';
    db.patients.push(p);
    saveDB(db);
    return clone(p);
  }
  const q = (b.q || '').trim();
  const list = db.patients.filter(p => !q || p.name.includes(q) || p.phone.includes(q) || p.account_no.includes(q));
  return list.map(p => ({ patient_id: p.patient_id, account_no: p.account_no, name: p.name,
    birth_date: p.birth_date, phone: p.phone, email: p.email,
    allergy_inquiry_status: p.allergy_inquiry_status, allergy_cnt: p.allergies.length })).slice(0, 100);
});

route(/^\/patients\/(\d+)$/, (db, method, m, b) => {
  const id = Number(m[1]);
  const p = db.patients.find(x => x.patient_id === id);
  if (!p) throw biz('患者不存在');
  if (method === 'PUT') {
    requireRole(db, 'reception');
    for (const f of ['name', 'birth_date', 'billing_address', 'phone', 'email', 'emergency_contact_name',
      'emergency_contact_phone', 'allergy_inquiry_status'])
      if (f in b) p[f] = b[f];
    saveDB(db);
    return clone(p);
  }
  const visits = db.visits.filter(v => v.patient_id === id)
    .sort((a, b2) => b2.scheduled_start.localeCompare(a.scheduled_start))
    .map(v => { const d = db.dentists.find(x => x.dentist_id === v.dentist_id);
      const c = db.clinics.find(x => x.clinic_id === v.clinic_id);
      return { visit_id: v.visit_id, visit_no: v.visit_no, scheduled_start: v.scheduled_start,
        status: v.status, attended: v.attended, clinic_code: c.clinic_code, dentist_name: d.name }; });
  return { ...clone(p), visits };
});

route(/^\/patients\/(\d+)\/allergies$/, (db, method, m, b) => {
  const pid = Number(m[1]);
  const p = db.patients.find(x => x.patient_id === pid);
  if (!p) throw biz('患者不存在');
  const status = b.status || '待核实';
  if (status === '已确认' && !hasRole(db, ['dentist'])) throw biz('只有牙医可以确认过敏信息（前台只能登记或核实资料）');
  const t = db.allergy_types.find(x => x.allergy_type_id === Number(b.allergy_type_id));
  const old = p.allergies.find(a => a.allergy_type_id === Number(b.allergy_type_id));
  if (old) { old.status = status; old.note = b.note !== undefined ? b.note : old.note; }
  else p.allergies.push({ patient_allergy_id: Date.now() + Math.random() * 1000 | 0,
    allergy_type_id: Number(b.allergy_type_id), allergy_name: t ? t.allergy_name : '',
    status, note: b.note || '' });
  p.allergy_inquiry_status = '已报告';
  saveDB(db);
  return { ok: true };
});

// ---------------- 预约与就诊 ----------------
route(/^\/visits$/, (db, method, m, b) => {
  if (method === 'POST') {
    requireRole(db, 'reception');
    const start = dtOf(b.scheduled_start), end = dtOf(b.scheduled_end);
    const d = db.dentists.find(x => x.dentist_id === Number(b.dentist_id));
    if (!db.patients.find(x => x.patient_id === Number(b.patient_id))) throw biz('患者不存在');
    if (!db.clinics.find(x => x.clinic_id === Number(b.clinic_id) && x.active)) throw biz('诊所不存在或已停用');
    if (!d) throw biz('牙医不存在');
    if (!d.active) throw biz('该牙医已停用，不能安排预约');
    if (!(start < end)) throw biz('预约开始时间必须早于结束时间');
    const covered = db.schedules.some(s => s.dentist_id === d.dentist_id &&
      s.clinic_id === Number(b.clinic_id) && s.status === '有效' &&
      dtOf(s.start_at) <= start && dtOf(s.end_at) >= end);
    if (!covered) throw biz('该牙医在所选诊所未覆盖该时段的出诊安排，请更换时段或诊所');
    const conflict = db.visits.find(v => v.dentist_id === d.dentist_id &&
      ['待到诊', '已到诊', '治疗完成'].includes(v.status) &&
      dtOf(v.scheduled_start) < end && dtOf(v.scheduled_end) > start);
    if (conflict) throw biz(`牙医 ${d.name} 该时段已有预约（${conflict.visit_no}），请选择其他时段`);
    if (b.treatment_type_id) checkQual(db, d.dentist_id, Number(b.treatment_type_id));
    db.seq.visit += 1;
    const day = todayStr().replace(/-/g, '');
    const n = db.visits.filter(v => v.visit_no.startsWith('V-' + day)).length + 1;
    const v = { visit_id: db.seq.visit, visit_no: `V-${day}-${String(n).padStart(4, '0')}`,
      patient_id: Number(b.patient_id), dentist_id: d.dentist_id, clinic_id: Number(b.clinic_id),
      scheduled_start: b.scheduled_start + (b.scheduled_start.length === 16 ? ':00' : ''),
      scheduled_end: b.scheduled_end + (b.scheduled_end.length === 16 ? ':00' : ''),
      requested_treatments: b.requested_treatments || '', special_needs: b.special_needs || null,
      attended: 0, arrived_at: null, status: '待到诊', previous_visit_id: null,
      cancelled_at: null, cancel_initiator: null, reason: null, created_by: currentUser.user_id };
    db.visits.push(v);
    saveDB(db);
    return { visit_id: v.visit_id, visit_no: v.visit_no };
  }
  const status = b.status || '', dentistId = b.dentist_id || '';
  let list = db.visits.filter(v =>
    (!status || v.status === status) && (!dentistId || v.dentist_id === Number(dentistId)));
  list = list.sort((a, b2) => b2.scheduled_start.localeCompare(a.scheduled_start)).slice(0, 300);
  return list.map(v => visitListItem(db, v));
});

route(/^\/visits\/(\d+)$/, (db, method, m) => {
  const v = db.visits.find(x => x.visit_id === Number(m[1]));
  if (!v) throw biz('预约不存在');
  const p = db.patients.find(x => x.patient_id === v.patient_id);
  const inv = currentInvoice(db, v.visit_id);
  const nextV = db.visits.find(x => x.previous_visit_id === v.visit_id);
  return { ...visitListItem(db, v), patient: clone(p),
    treatments: currentTreatments(db, v.visit_id),
    invoice: inv, next_visit: nextV ? { visit_id: nextV.visit_id, visit_no: nextV.visit_no, status: nextV.status } : null };
});

route(/^\/visits\/(\d+)\/checkin$/, (db, method, m) => {
  requireRole(db, 'reception');
  const v = db.visits.find(x => x.visit_id === Number(m[1]));
  if (!['待到诊', '待核实'].includes(v.status)) throw biz(`当前状态「${v.status}」不能登记到诊`);
  v.status = '已到诊'; v.attended = 1; v.arrived_at = nowStr();
  saveDB(db); return { ok: true };
});

route(/^\/visits\/(\d+)\/cancel$/, (db, method, m, b) => {
  requireRole(db, 'reception');
  const v = db.visits.find(x => x.visit_id === Number(m[1]));
  if (!['待到诊', '待核实'].includes(v.status)) throw biz(`当前状态「${v.status}」不能按普通取消处理`);
  if (!['患者', '诊所'].includes(b.initiator)) throw biz('取消发起方只能是患者或诊所');
  v.status = b.initiator === '患者' ? '患者取消' : '诊所撤销';
  v.cancelled_at = nowStr(); v.cancel_initiator = b.initiator; v.reason = b.reason || '';
  saveDB(db); return { ok: true };
});

route(/^\/visits\/(\d+)\/reschedule$/, (db, method, m, b) => {
  requireRole(db, 'reception');
  const v = db.visits.find(x => x.visit_id === Number(m[1]));
  if (!['待到诊', '待核实'].includes(v.status)) throw biz(`当前状态「${v.status}」不能改约`);
  const start = dtOf(b.scheduled_start), end = dtOf(b.scheduled_end);
  const d = db.dentists.find(x => x.dentist_id === Number(b.dentist_id));
  if (!db.clinics.find(x => x.clinic_id === Number(b.clinic_id) && x.active)) throw biz('诊所不存在或已停用');
  if (!d || !d.active) throw biz('牙医不存在或已停用');
  if (!(start < end)) throw biz('预约开始时间必须早于结束时间');
  const covered = db.schedules.some(s => s.dentist_id === d.dentist_id &&
    s.clinic_id === Number(b.clinic_id) && s.status === '有效' &&
    dtOf(s.start_at) <= start && dtOf(s.end_at) >= end);
  if (!covered) throw biz('该牙医在所选诊所未覆盖该时段的出诊安排，请更换时段或诊所');
  const conflict = db.visits.find(x => x.dentist_id === d.dentist_id && x.visit_id !== v.visit_id &&
    ['待到诊', '已到诊', '治疗完成'].includes(x.status) &&
    dtOf(x.scheduled_start) < end && dtOf(x.scheduled_end) > start);
  if (conflict) throw biz(`牙医 ${d.name} 该时段已有预约（${conflict.visit_no}），请选择其他时段`);
  db.seq.visit += 1;
  const day = todayStr().replace(/-/g, '');
  const n = db.visits.filter(x => x.visit_no.startsWith('V-' + day)).length + 1;
  const nv = { visit_id: db.seq.visit, visit_no: `V-${day}-${String(n).padStart(4, '0')}`,
    patient_id: v.patient_id, dentist_id: d.dentist_id, clinic_id: Number(b.clinic_id),
    scheduled_start: b.scheduled_start + (b.scheduled_start.length === 16 ? ':00' : ''),
    scheduled_end: b.scheduled_end + (b.scheduled_end.length === 16 ? ':00' : ''),
    requested_treatments: v.requested_treatments, special_needs: v.special_needs,
    attended: 0, arrived_at: null, status: '待到诊', previous_visit_id: v.visit_id,
    cancelled_at: null, cancel_initiator: null, reason: `改约原因：${b.reason || ''}`,
    created_by: currentUser.user_id };
  v.status = '已改约'; v.reason = b.reason || '';
  db.visits.push(nv);
  saveDB(db); return { visit_id: nv.visit_id };
});

route(/^\/visits\/(\d+)\/noshow$/, (db, method, m, b) => {
  requireRole(db, 'reception');
  const v = db.visits.find(x => x.visit_id === Number(m[1]));
  if (b.action === 'mark') {
    if (v.status !== '待到诊') throw biz(`当前状态「${v.status}」不能进入待核实`);
    if (!(dtOf(v.scheduled_start) < new Date())) throw biz('预约时间未到，不能标记为待核实');
    v.status = '待核实';
  } else if (b.action === 'confirm') {
    if (v.status !== '待核实') throw biz(`当前状态「${v.status}」不能确认未到诊`);
    v.status = '未到诊'; v.reason = b.reason || '';
  } else throw biz('无效的未到诊处理动作');
  saveDB(db); return { ok: true };
});

// ---------------- 可约时段 ----------------
route(/^\/slots$/, (db, method, m, b) => {
  const day = dtOf(b.date);
  const dayEnd = new Date(day.getTime() + 86400000);
  const out = [];
  for (const s of db.schedules) {
    if (s.clinic_id !== Number(b.clinic_id) || s.status !== '有效') continue;
    const d = db.dentists.find(x => x.dentist_id === s.dentist_id);
    if (!d || !d.active) continue;
    if (b.treatment_type_id) {
      try { checkQual(db, d.dentist_id, Number(b.treatment_type_id)); }
      catch (e) { continue; }
    }
    let segStart = new Date(Math.max(dtOf(s.start_at), day));
    const segEnd = new Date(Math.min(dtOf(s.end_at), dayEnd));
    const busy = db.visits.filter(v => v.dentist_id === d.dentist_id &&
      ['待到诊', '已到诊', '治疗完成'].includes(v.status) &&
      dtOf(v.scheduled_start) < segEnd && dtOf(v.scheduled_end) > segStart)
      .map(v => [dtOf(v.scheduled_start), dtOf(v.scheduled_end)]).sort((a, b2) => a[0] - b2[0]);
    const segs = [];
    let cur = segStart;
    for (const [bs, be] of busy) {
      if (bs > cur) segs.push([cur, bs]);
      if (be > cur) cur = be;
    }
    if (cur < segEnd) segs.push([cur, segEnd]);
    const fmtT = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
    for (const [a, b2] of segs) {
      let t = a;
      while (t.getTime() + 40 * 60000 <= b2.getTime()) {
        out.push({ dentist_id: d.dentist_id, dentist_name: d.name, employee_no: d.employee_no,
          start: fmtT(t), end: fmtT(new Date(t.getTime() + 40 * 60000)) });
        t = new Date(t.getTime() + 40 * 60000);
      }
    }
  }
  return out;
});

function checkQual(db, dentistId, ttId) {
  const tt = db.treatment_types.find(x => x.treatment_type_id === ttId);
  if (!tt) throw biz('治疗项目不存在');
  if (!tt.requirement_names.length) return;
  const d = db.dentists.find(x => x.dentist_id === dentistId);
  const held = new Set(d.qualifications.filter(q => q.verification_status === '已核实')
    .map(q => q.qualification_name));
  const ok = tt.qualification_match_mode === 'ALL'
    ? tt.requirement_names.every(n => held.has(n))
    : tt.requirement_names.some(n => held.has(n));
  if (!ok) throw biz(`该牙医缺少项目「${tt.treatment_name}」所需资质，请选择其他牙医`);
}

// ---------------- 实际治疗 ----------------
route(/^\/visits\/(\d+)\/treatments$/, (db, method, m, b) => {
  requireRole(db, 'dentist');
  const me = db.users.find(x => x.user_id === currentUser.user_id);
  if (!me.dentist_id) throw biz('当前账号未关联牙医档案，无法记录治疗');
  const v = db.visits.find(x => x.visit_id === Number(m[1]));
  if (!['已到诊', '治疗完成'].includes(v.status)) throw biz('只有已到诊的就诊才能记录实际治疗');
  const tt = db.treatment_types.find(x => x.treatment_type_id === Number(b.treatment_type_id) && x.active);
  if (!tt) throw biz('治疗项目不存在或已停用');
  const units = Number(b.units);
  if (!(units > 0)) throw biz('单位数必须大于 0');
  if (!tt.allows_fraction && units !== Math.floor(units)) throw biz(`项目「${tt.treatment_name}」不允许小数单位`);
  const price = m2(b.unit_price !== null && b.unit_price !== undefined && b.unit_price !== ''
    ? Number(b.unit_price) : tt.default_unit_price);
  if (price < 0) throw biz('单位价格不能为负');
  db.seq.treatment += 1;
  db.treatments.push({ treatment_id: db.seq.treatment, visit_id: v.visit_id,
    treatment_type_id: tt.treatment_type_id,
    versions: [{ version_no: 1, performer_dentist_id: me.dentist_id, units, unit_price: price,
      performed_at: nowStr(), status: '草稿', is_current: 1, confirmed_by: null, confirmed_at: null,
      note: b.note || null }] });
  saveDB(db); return { treatment_id: db.seq.treatment };
});

route(/^\/treatments\/(\d+)\/confirm$/, (db, method, m) => {
  requireRole(db, 'dentist');
  const me = db.users.find(x => x.user_id === currentUser.user_id);
  const t = db.treatments.find(x => x.treatment_id === Number(m[1]));
  if (!t) throw biz('治疗记录不存在');
  const ver = t.versions.find(x => x.is_current);
  if (ver.status !== '草稿') throw biz(`当前版本状态「${ver.status}」不能签署确认`);
  if (ver.performer_dentist_id !== me.dentist_id) throw biz('只能签署确认本人执行的治疗，不能代他人签字');
  ver.status = '已确认'; ver.confirmed_by = me.dentist_id; ver.confirmed_at = nowStr();
  saveDB(db); return { ok: true };
});

route(/^\/treatments\/(\d+)\/revise$/, (db, method, m, b) => {
  requireRole(db, 'dentist');
  const me = db.users.find(x => x.user_id === currentUser.user_id);
  const t = db.treatments.find(x => x.treatment_id === Number(m[1]));
  if (!t) throw biz('治疗记录不存在');
  const ver = t.versions.find(x => x.is_current);
  if (ver.status !== '已确认') throw biz('只有已确认的治疗才进入更正流程');
  if (ver.performer_dentist_id !== me.dentist_id) throw biz('只能更正本人执行的治疗');
  const units = b.units ? Number(b.units) : ver.units;
  const price = b.unit_price ? m2(Number(b.unit_price)) : ver.unit_price;
  if (!(units > 0) || price < 0) throw biz('单位数须大于 0，单价不能为负');
  const tt = db.treatment_types.find(x => x.treatment_type_id === t.treatment_type_id);
  if (!tt.allows_fraction && units !== Math.floor(units)) throw biz(`项目「${tt.treatment_name}」不允许小数单位`);
  ver.is_current = 0;
  t.versions.push({ version_no: ver.version_no + 1, performer_dentist_id: ver.performer_dentist_id,
    units, unit_price: price, performed_at: ver.performed_at, status: '草稿', is_current: 1,
    confirmed_by: null, confirmed_at: null, note: b.note || ver.note });
  saveDB(db); return { ok: true };
});

// ---------------- 结算单 ----------------
route(/^\/visits\/(\d+)\/invoice$/, (db, method, m) => {
  if (method === 'GET') { return { invoice: currentInvoice(db, Number(m[1])) }; }
  requireRole(db, ['reception', 'finance']);
  const v = db.visits.find(x => x.visit_id === Number(m[1]));
  const confirmed = currentTreatments(db, v.visit_id).filter(t => t.status === '已确认');
  if (!confirmed.length) throw biz('本次就诊尚无已签署确认的治疗，不能生成结算单');
  const sig = confirmed.map(t => `${t.treatment_id}#${t.version_no}`).join(',');
  const inv = db.invoices.find(x => x.visit_id === v.visit_id);
  const now = nowStr();
  if (inv) {
    const cur = inv.revisions.find(r => r.is_current);
    const curSig = cur.items.map(i => `${i.treatment_id}#${i.version_no}`).sort().join(',');
    if (curSig === sig.split(',').sort().join(',')) return currentInvoice(db, v.visit_id);
    cur.is_current = 0;
    const items = confirmed.map(t => { db.seq.invoice_item += 1;
      return { invoice_item_id: db.seq.invoice_item, treatment_id: t.treatment_id, version_no: t.version_no,
        name_snapshot: t.treatment_name, units_snapshot: t.units, unit_price_snapshot: t.unit_price,
        subtotal: m2(t.units * t.unit_price) }; });
    inv.revisions.push({ invoice_revision_id: inv.revisions.length + 100 + Math.random() * 1000 | 0,
      revision_no: cur.revision_no + 1, status: '已签发', is_current: 1,
      total_amount: m2(items.reduce((s, i) => s + i.subtotal, 0)), issued_at: now, items });
  } else {
    db.seq.invoice += 1;
    const month = now.slice(0, 7).replace('-', '');
    const items = confirmed.map(t => { db.seq.invoice_item += 1;
      return { invoice_item_id: db.seq.invoice_item, treatment_id: t.treatment_id, version_no: t.version_no,
        name_snapshot: t.treatment_name, units_snapshot: t.units, unit_price_snapshot: t.unit_price,
        subtotal: m2(t.units * t.unit_price) }; });
    db.invoices.push({ invoice_id: db.seq.invoice, invoice_no: `INV-${month}-${String(db.seq.invoice).padStart(4, '0')}`,
      visit_id: v.visit_id, created_at: now,
      revisions: [{ invoice_revision_id: 1, revision_no: 1, status: '已签发', is_current: 1,
        total_amount: m2(items.reduce((s, i) => s + i.subtotal, 0)), issued_at: now, items }] });
  }
  v.status = '治疗完成';
  saveDB(db);
  return currentInvoice(db, v.visit_id);
});

route(/^\/treatments\/confirmed$/, (db, method, m, b) => {
  const dentistId = b.dentist_id || '';
  return db.treatments.flatMap(t => {
    const ver = t.versions.find(x => x.is_current);
    if (ver.status !== '已确认' || (dentistId && ver.performer_dentist_id !== Number(dentistId))) return [];
    const tt = db.treatment_types.find(x => x.treatment_type_id === t.treatment_type_id);
    const v = db.visits.find(x => x.visit_id === t.visit_id);
    const p = db.patients.find(x => x.patient_id === v.patient_id);
    const d = db.dentists.find(x => x.dentist_id === ver.performer_dentist_id);
    return [{ treatment_id: t.treatment_id, version_no: ver.version_no, units: ver.units,
      unit_price: ver.unit_price, performed_at: ver.performed_at, treatment_name: tt.treatment_name,
      visit_no: v.visit_no, patient_name: p.name, dentist_name: d.name }];
  }).sort((a, b2) => b2.performed_at.localeCompare(a.performed_at)).slice(0, 200);
});

// ---------------- 费用 ----------------
route(/^\/costs$/, (db, method, m, b) => {
  if (method === 'POST') {
    requireRole(db, 'finance');
    if (!['耗材', '运营费'].includes(b.cost_kind)) throw biz('费用类别只能是耗材或运营费');
    const amount = Number(b.amount);
    if (!(amount > 0)) throw biz('金额必须大于 0');
    if (db.costs.find(c => c.document_no === b.document_no && c.line_no === Number(b.line_no)))
      throw biz(`凭证 ${b.document_no} 第 ${b.line_no} 行已存在（同一凭证不能重复录入）`);
    const allocs = b.allocations || [];
    if (allocs.length) {
      const total = m2(allocs.reduce((s, a) => s + Number(a.amount), 0));
      if (Math.abs(total - m2(amount)) > 0.005) throw biz(`分摊合计 ${total} 不等于来源金额 ${m2(amount)}，请重新核对`);
      for (const a of allocs) {
        if (!(Number(a.amount) > 0)) throw biz('分摊金额必须大于 0');
        if (!db.dentists.find(x => x.dentist_id === Number(a.dentist_id))) throw biz('分摊牙医不存在');
        if (b.cost_kind === '耗材') {
          if (!a.treatment_id) throw biz('耗材成本必须关联实际治疗');
          const t = db.treatments.find(x => x.treatment_id === Number(a.treatment_id));
          if (!t || !t.versions.find(x => x.is_current)) throw biz(`治疗 ${a.treatment_id} 当前版本不存在`);
        } else if (a.treatment_id) throw biz('运营费用不需要关联治疗');
      }
    }
    db.seq.cost += 1;
    const entry = { cost_entry_id: db.seq.cost, document_no: b.document_no, line_no: Number(b.line_no),
      cost_kind: b.cost_kind, incurred_at: b.incurred_at, amount: m2(amount),
      status: allocs.length ? '待确认' : '待分摊', recorded_by: currentUser.user_id, allocations: [] };
    for (const a of allocs) {
      db.seq.cost_alloc += 1;
      const d = db.dentists.find(x => x.dentist_id === Number(a.dentist_id));
      entry.allocations.push({ cost_allocation_id: db.seq.cost_alloc, dentist_id: d.dentist_id,
        dentist_name: d.name, employee_no: d.employee_no, treatment_id: a.treatment_id || null,
        version_no: a.treatment_id ? 1 : null, allocated_amount: m2(Number(a.amount)),
        status: '待确认', cost_entry_id: entry.cost_entry_id });
    }
    db.costs.push(entry);
    saveDB(db); return { cost_entry_id: entry.cost_entry_id };
  }
  const status = b.status || '';
  return db.costs.filter(c => !status || c.status === status)
    .sort((a, b2) => b2.cost_entry_id - a.cost_entry_id)
    .map(c => ({ ...clone(c), recorded_by_name: db.users.find(u => u.user_id === c.recorded_by)?.display_name || '' }))
    .slice(0, 200);
});

route(/^\/costs\/(\d+)\/confirm$/, (db, method, m) => {
  requireRole(db, 'finance');
  const c = db.costs.find(x => x.cost_entry_id === Number(m[1]));
  if (!c) throw biz('费用来源不存在');
  if (c.status === '已确认') throw biz('该费用已确认，重复确认无效');
  if (!c.allocations.length) throw biz('尚未填写分摊，不能确认（无规则的费用先挂待分摊，不能当作 0）');
  const total = m2(c.allocations.reduce((s, a) => s + a.allocated_amount, 0));
  if (Math.abs(total - m2(c.amount)) > 0.005) throw biz(`分摊合计 ${total} 不等于来源金额 ${m2(c.amount)}，不能确认`);
  c.status = '已确认';
  c.allocations.forEach(a => { a.status = '已确认'; });
  saveDB(db); return { ok: true };
});

// ---------------- 季度核算 ----------------
route(/^\/quarters$/, (db, method, m, b) => {
  if (method === 'POST') {
    requireRole(db, 'finance');
    const year = Number(b.year), qno = Number(b.quarter_no);
    if (!(qno >= 1 && qno <= 4)) throw biz('季度须为 1—4');
    return { quarter_close_id: closeQuarter(db, year, qno) };
  }
  return db.quarters.sort((a, b2) => b2.year - a.year || b2.quarter_no - a.quarter_no)
    .map(q => ({ ...clone(q), results: undefined,
      pending_count: quarterPending(db, q.year, q.quarter_no).length })).slice(0, 20);
});

route(/^\/quarters\/(\d+)$/, (db, method, m) => {
  const q = db.quarters.find(x => x.quarter_close_id === Number(m[1]));
  if (!q) throw biz('核算版本不存在');
  return { ...clone(q), pending: quarterPending(db, q.year, q.quarter_no).map(c => ({
    cost_entry_id: c.cost_entry_id, document_no: c.document_no, line_no: c.line_no,
    cost_kind: c.cost_kind, amount: c.amount, status: c.status })) };
});

route(/^\/quarters\/(\d+)\/submit$/, (db, method, m) => {
  requireRole(db, 'finance');
  const q = db.quarters.find(x => x.quarter_close_id === Number(m[1]));
  if (q.status !== '草稿') throw biz(`当前状态「${q.status}」不能提交审批`);
  const pending = quarterPending(db, q.year, q.quarter_no);
  if (pending.length) {
    const items = pending.map(p => `${p.document_no}#${p.line_no}(${p.status})`).join('、');
    throw biz(`存在未确认费用（${items}），不能提交审批；有费用尚未分摊时不能把空值当作 0`);
  }
  q.status = '待审批';
  saveDB(db); return { ok: true };
});

route(/^\/quarters\/(\d+)\/approve$/, (db, method, m) => {
  requireRole(db, 'hq');
  const q = db.quarters.find(x => x.quarter_close_id === Number(m[1]));
  if (q.status !== '待审批') throw biz(`当前状态「${q.status}」不能批准`);
  q.status = '已批准';
  q.pool_amount = q.net_profit > 0 ? m2(q.net_profit * 0.1) : null;
  q.approved_at = nowStr();
  saveDB(db); return { ok: true };
});

function closeQuarter(db, year, qno) {
  const [qStart, qEnd] = quarterRange(year, qno);
  const revenue = {};
  for (const inv of db.invoices) {
    const rev = inv.revisions.find(r => r.is_current);
    if (rev.status !== '已签发') continue;
    for (const it of rev.items) {
      const t = db.treatments.find(x => x.treatment_id === it.treatment_id);
      const ver = t.versions.find(x => x.version_no === it.version_no);
      if (ver.performed_at >= qStart && ver.performed_at < qEnd)
        revenue[ver.performer_dentist_id] = m2((revenue[ver.performer_dentist_id] || 0) + it.subtotal);
    }
  }
  const costs = {};
  for (const c of db.costs) {
    if (c.status !== '已确认' || c.incurred_at < qStart || c.incurred_at >= qEnd) continue;
    for (const a of c.allocations) {
      if (a.status !== '已确认') continue;
      costs[a.dentist_id] = costs[a.dentist_id] || { 耗材: 0, 运营费: 0 };
      costs[a.dentist_id][c.cost_kind] = m2(costs[a.dentist_id][c.cost_kind] + a.allocated_amount);
    }
  }
  const dentistIds = [...new Set([...Object.keys(revenue), ...Object.keys(costs)].map(Number))];
  let totalNet = 0;
  const results = dentistIds.map(did => {
    const d = db.dentists.find(x => x.dentist_id === did);
    const rev = m2(revenue[did] || 0), mat = m2((costs[did] || {}).耗材 || 0), op = m2((costs[did] || {}).运营费 || 0);
    const net = m2(rev - mat - op);
    totalNet = m2(totalNet + net);
    let sources = 0;
    for (const inv of db.invoices) {
      const r = inv.revisions.find(x => x.is_current);
      if (r.status !== '已签发') continue;
      for (const it of r.items) {
        const t = db.treatments.find(x => x.treatment_id === it.treatment_id);
        const ver = t.versions.find(x => x.version_no === it.version_no);
        if (ver.performer_dentist_id === did && ver.performed_at >= qStart && ver.performed_at < qEnd) sources += 1;
      }
    }
    for (const c of db.costs)
      if (c.status === '已确认' && c.incurred_at >= qStart && c.incurred_at < qEnd)
        sources += c.allocations.filter(a => a.dentist_id === did && a.status === '已确认').length;
    return { result_id: ++db.seq.result, dentist_id: did, dentist_no: d.employee_no, dentist_name: d.name,
      revenue: rev, material_cost: mat, operating_expense: op, net_profit: net, sources };
  });
  db.seq.quarter += 1;
  const ver = db.quarters.filter(q => q.year === year && q.quarter_no === qno).length + 1;
  db.quarters.push({ quarter_close_id: db.seq.quarter, year, quarter_no: qno, version_no: ver,
    cutoff_at: qEnd.replace('T', ' ') + ' 23:59:59'.slice(0, 0) || `${qEnd} 00:00:00`,
    policy_version: 'P-2026-01', status: '草稿', net_profit: totalNet,
    pool_amount: totalNet > 0 ? m2(totalNet * 0.1) : null,
    approved_by: null, approved_at: null, created_by: currentUser.user_id, created_at: nowStr(), results });
  saveDB(db);
  return db.seq.quarter;
}

// ---------------- 报表与运营维护 ----------------
route(/^\/reports\/cancellation$/, (db, method, m, b) => {
  const year = Number(b.year), qno = Number(b.quarter);
  const [qStart, qEnd] = quarterRange(year, qno);
  const cutoff = Math.min(Date.now(), dtOf(qEnd).getTime() - 1000);
  const rows = [];
  for (const c of db.clinics) {
    const set = db.visits.filter(v => v.clinic_id === c.clinic_id &&
      dtOf(v.scheduled_start) >= dtOf(qStart) && dtOf(v.scheduled_start) < dtOf(qEnd) &&
      (['已到诊', '治疗完成', '患者取消', '未到诊', '待核实'].includes(v.status) ||
        (v.status === '待到诊' && dtOf(v.scheduled_start).getTime() <= cutoff)));
    const arrived = set.filter(v => ['已到诊', '治疗完成'].includes(v.status)).length;
    const cancelled = set.filter(v => v.status === '患者取消').length;
    const noshow = set.filter(v => v.status === '未到诊').length;
    const pending = set.filter(v => v.status === '待核实').length;
    const denom = arrived + cancelled + noshow + pending;
    rows.push({ clinic_code: c.clinic_code, denominator: denom, arrived, cancelled, noshow, pending,
      cancel_rate: denom ? m2(cancelled / denom * 100) : null,
      noshow_rate: denom ? m2(noshow / denom * 100) : null });
  }
  const future = db.visits.filter(v => v.status === '待到诊' &&
    dtOf(v.scheduled_start) >= dtOf(qStart) && dtOf(v.scheduled_start) < dtOf(qEnd) &&
    dtOf(v.scheduled_start).getTime() > cutoff).length;
  const total = {
    denominator: rows.reduce((s, r) => s + r.denominator, 0),
    arrived: rows.reduce((s, r) => s + r.arrived, 0),
    cancelled: rows.reduce((s, r) => s + r.cancelled, 0),
    noshow: rows.reduce((s, r) => s + r.noshow, 0),
    pending: rows.reduce((s, r) => s + r.pending, 0),
    cancel_rate: null, noshow_rate: null,
  };
  const t = total;
  if (t.denominator) { t.cancel_rate = m2(t.cancelled / t.denominator * 100); t.noshow_rate = m2(t.noshow / t.denominator * 100); }
  return { rows, future_excluded: future, cutoff: nowStr(), total };
});

route(/^\/reports\/standardization$/, (db) => ({
  allergy_not_asked: db.patients.filter(p => p.allergy_inquiry_status === '未询问').length,
  allergy_pending: db.patients.reduce((s, p) => s + p.allergies.filter(a => a.status === '待核实').length, 0),
  draft_treatments: db.treatments.filter(t => t.versions.find(x => x.is_current).status === '草稿').length,
  arrived_no_invoice: db.visits.filter(v => ['已到诊', '治疗完成'].includes(v.status) &&
    !db.invoices.find(i => i.visit_id === v.visit_id))
    .map(v => ({ visit_id: v.visit_id, visit_no: v.visit_no,
      patient_name: db.patients.find(p => p.patient_id === v.patient_id).name,
      scheduled_start: v.scheduled_start })),
  pending_costs: db.costs.filter(c => ['待分摊', '待确认'].includes(c.status))
    .map(c => ({ cost_entry_id: c.cost_entry_id, document_no: c.document_no, line_no: c.line_no,
      cost_kind: c.cost_kind, amount: c.amount, status: c.status })),
  dentists_no_verified_qual: db.dentists.filter(d => d.active &&
    !d.qualifications.some(q => q.verification_status === '已核实'))
    .map(d => ({ dentist_id: d.dentist_id, employee_no: d.employee_no, name: d.name })),
}));

route(/^\/dentists$/, (db, method, m, b) => {
  requireRole(db, 'ops');
  if (db.dentists.find(x => x.employee_no === b.employee_no)) throw biz(`员工编号 ${b.employee_no} 已存在`);
  const qids = (b.qualifications || []).map(q => Number(q.qualification_id));
  db.dentists.push({ dentist_id: db.dentists.length + 1, employee_no: b.employee_no, name: b.name,
    birth_date: b.birth_date, home_address: b.home_address, phone: b.phone, email: b.email, active: 1,
    qualifications: qids.map((qid, i) => ({ dentist_qualification_id: Date.now() + i,
      qualification_id: qid, qualification_name: db.qualifications.find(x => x.qualification_id === qid)?.qualification_name,
      certificate_no: `ZC-${b.employee_no}-${qid}`, verification_status: '已核实' })) });
  saveDB(db);
  return { dentist_id: db.dentists.length };
});

route(/^\/dentists\/(\d+)$/, (db, method, m, b) => {
  requireRole(db, 'ops');
  const d = db.dentists.find(x => x.dentist_id === Number(m[1]));
  if (!d) throw biz('牙医不存在');
  if ('active' in b) d.active = b.active ? 1 : 0;
  for (const f of ['name', 'phone', 'email', 'home_address']) if (f in b) d[f] = b[f];
  saveDB(db); return { ok: true };
});

route(/^\/dentists\/(\d+)\/qualifications$/, (db, method, m, b) => {
  requireRole(db, 'ops');
  const d = db.dentists.find(x => x.dentist_id === Number(m[1]));
  if (!b.qualification_id) throw biz('请选择资质');
  const q = db.qualifications.find(x => x.qualification_id === Number(b.qualification_id));
  d.qualifications.push({ dentist_qualification_id: Date.now() + Math.random() * 100 | 0,
    qualification_id: q.qualification_id, qualification_name: q.qualification_name,
    certificate_no: b.certificate_no || null,
    verification_status: b.verification_status || '未核实' });
  saveDB(db); return { ok: true };
});

route(/^\/schedules$/, (db, method, m, b) => {
  if (method === 'POST') {
    requireRole(db, 'ops');
    const start = dtOf(b.start_at), end = dtOf(b.end_at);
    if (!(start < end)) throw biz('出诊开始时间必须早于结束时间');
    if (!db.dentists.find(x => x.dentist_id === Number(b.dentist_id) && x.active)) throw biz('牙医不存在或已停用');
    if (!db.clinics.find(x => x.clinic_id === Number(b.clinic_id) && x.active)) throw biz('诊所不存在或已停用');
    const overlap = db.schedules.find(s => s.dentist_id === Number(b.dentist_id) && s.status === '有效' &&
      dtOf(s.start_at) < end && dtOf(s.end_at) > start);
    if (overlap) throw biz(`与已有出诊安排重叠（${overlap.start_at} ~ ${overlap.end_at}），同一牙医不能跨店重叠出诊`);
    db.schedules.push({ schedule_id: db.schedules.length + 1, dentist_id: Number(b.dentist_id),
      clinic_id: Number(b.clinic_id), start_at: b.start_at, end_at: b.end_at, status: '有效' });
    saveDB(db); return { schedule_id: db.schedules.length };
  }
  const dentistId = b.dentist_id || '';
  return db.schedules.filter(s => !dentistId || s.dentist_id === Number(dentistId))
    .sort((a, b2) => b2.start_at.localeCompare(a.start_at)).slice(0, 200)
    .map(s => ({ ...clone(s),
      dentist_name: db.dentists.find(x => x.dentist_id === s.dentist_id).name,
      employee_no: db.dentists.find(x => x.dentist_id === s.dentist_id).employee_no,
      clinic_code: db.clinics.find(x => x.clinic_id === s.clinic_id).clinic_code }));
});

route(/^\/clinics$/, (db, method, m, b) => {
  requireRole(db, 'ops');
  if (db.clinics.find(x => x.clinic_code === b.clinic_code)) throw biz(`门店代码 ${b.clinic_code} 已存在`);
  db.clinics.push({ clinic_id: db.clinics.length + 1, clinic_code: b.clinic_code,
    postal_address: b.postal_address, manager_name: b.manager_name, phone: b.phone, email: b.email,
    area_m2: Number(b.area_m2), active: 1 });
  saveDB(db); return { clinic_id: db.clinics.length };
});

route(/^\/treatment-types$/, (db, method, m, b) => {
  requireRole(db, 'ops');
  if (db.treatment_types.find(x => x.treatment_code === b.treatment_code)) throw biz(`项目代码 ${b.treatment_code} 已存在`);
  db.treatment_types.push({ treatment_type_id: db.treatment_types.length + 1,
    treatment_code: b.treatment_code, treatment_name: b.treatment_name, unit_name: b.unit_name,
    default_unit_price: Number(b.default_unit_price),
    allows_fraction: b.allows_fraction ? 1 : 0,
    qualification_match_mode: b.qualification_match_mode || 'ANY', active: 1,
    requirement_names: (b.qualification_ids || []).map(id =>
      db.qualifications.find(x => x.qualification_id === Number(id))?.qualification_name) });
  saveDB(db); return { treatment_type_id: db.treatment_types.length };
});

// ---------------- 对外接口 ----------------
function tryRequest(method, path, data) {
  try { return dispatch(method, path, data); }
  catch (e) { if (e.biz || e.status) throw e; throw e; }
}

module.exports = {
  try: tryRequest,
  reset() {
    if (_mem) { _mem = seed(); return; }
    wx.setStorageSync(KEY, seed());
  },
  // Node 测试钩子
  _useMemory(initial) { _mem = initial || seed(); },
  _logout() { currentUser = null; },
};
