/* ADC — 应用主框架：登录、路由、导航、工作台 */
const ROUTES = {
  dashboard: { title: '工作台', render: viewDashboard },
  bookings: { title: '预约工作台', render: viewBookings },
  visits: { title: '就诊管理', render: viewVisits },
  patients: { title: '患者管理', render: viewPatients },
  invoices: { title: '结算单', render: viewInvoices },
  myvisits: { title: '我的接诊', render: viewMyVisits },
  costs: { title: '费用登记', render: viewCosts },
  quarters: { title: '季度核算', render: viewQuarters },
  dentists: { title: '牙医管理', render: viewOpsDentists },
  clinics: { title: '诊所管理', render: viewOpsClinics },
  schedules: { title: '出诊安排', render: viewOpsSchedules },
  catalog: { title: '治疗项目目录', render: viewOpsCatalog },
  reports: { title: '运营报表', render: viewReports },
  audit: { title: '操作记录', render: viewAudit },
};

const NAV_BY_ROLE = [
  { roles: ['reception'], items: [
    ['dashboard', '🏠 工作台'], ['bookings', '📞 预约工作台'], ['visits', '📋 就诊管理'],
    ['patients', '👥 患者管理'], ['invoices', '🧮 结算单'],
  ]},
  { roles: ['dentist'], items: [
    ['dashboard', '🏠 工作台'], ['myvisits', '🩺 我的接诊'],
  ]},
  { roles: ['finance'], items: [
    ['dashboard', '🏠 工作台'], ['costs', '💰 费用登记'], ['quarters', '📊 季度核算'], ['invoices', '🧮 结算单'],
  ]},
  { roles: ['ops'], items: [
    ['dashboard', '🏠 工作台'], ['dentists', '👨‍⚕️ 牙医管理'], ['clinics', '🏥 诊所管理'],
    ['schedules', '🗓 出诊安排'], ['catalog', '📚 治疗项目'],
  ]},
  { roles: ['hq'], items: [
    ['dashboard', '🏠 工作台'], ['reports', '📈 运营报表'], ['quarters', '✅ 季度审批'], ['audit', '🔎 操作记录'],
  ]},
];

function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  return ROUTES[h] ? h : 'dashboard';
}

function renderNav() {
  const held = new Set(API.user.roles.map(r => r.role_code));
  const items = NAV_BY_ROLE.filter(g => g.roles.some(r => held.has(r))).flatMap(g => g.items);
  // 去重保序
  const seen = new Set();
  const menu = items.filter(([k]) => !seen.has(k) && seen.add(k));
  const active = currentRoute();
  document.getElementById('nav').innerHTML = menu.map(([k, label]) =>
    `<button class="nav-item ${k === active ? 'active' : ''}" onclick="location.hash='/${k}'">${label}</button>`).join('');
  document.getElementById('whoami').innerHTML =
    `<b>${esc(API.user.display_name)}</b><br>${esc(API.roleNames())}`;
  document.getElementById('topbar-user').textContent =
    `当前：${API.user.display_name} · ${API.roleNames()}`;
}

function showLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');
  renderNav();
  route();
}

async function route() {
  const key = currentRoute();
  renderNav();
  try {
    await ROUTES[key].render();
  } catch (e) {
    if (e.status === 401) return;
    page(ROUTES[key].title, `<div class="card"><div class="empty">加载失败：${esc(e.message)}</div></div>`);
  }
}

/* ================= 工作台 ================= */
async function viewDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const [visits, patients] = await Promise.all([
    API.get('/visits'),
    API.get('/patients?q='),
  ]);
  const cnt = st => visits.filter(v => v.status === st).length;
  const cards = [];
  if (API.hasRole('reception')) {
    cards.push(`<div class="stat"><b>${cnt('待到诊')}</b><span>待到诊预约</span></div>`);
    cards.push(`<div class="stat"><b>${cnt('已到诊')}</b><span>已到诊待治疗</span></div>`);
    cards.push(`<div class="stat warn"><b>${cnt('待核实')}</b><span>到期待核实</span></div>`);
    cards.push(`<div class="stat"><b>${patients.length}</b><span>患者档案</span></div>`);
  }
  if (API.hasRole('dentist')) {
    const mine = visits.filter(v => v.dentist_id === API.user.dentist_id);
    cards.push(`<div class="stat"><b>${mine.filter(v => v.status === '已到诊').length}</b><span>我的已到诊患者</span></div>`);
    cards.push(`<div class="stat"><b>${mine.filter(v => v.status === '待到诊').length}</b><span>我的待接诊预约</span></div>`);
  }
  if (API.hasRole('finance')) {
    const [c1, c2] = await Promise.all([
      API.get('/costs?status=' + encodeURIComponent('待分摊')),
      API.get('/costs?status=' + encodeURIComponent('待确认')),
    ]);
    cards.push(`<div class="stat warn"><b>${c1.length}</b><span>待分摊费用</span></div>`);
    cards.push(`<div class="stat warn"><b>${c2.length}</b><span>待确认费用</span></div>`);
  }
  if (API.hasRole('hq') || API.hasRole('ops')) {
    const qs = await API.get('/quarters');
    const last = qs[0];
    if (last) {
      cards.push(`<div class="stat"><b>${money(last.net_profit)}</b><span>最近核算净利润（${last.year} Q${last.quarter_no}）</span></div>`);
      cards.push(`<div class="stat"><b>${last.pool_amount != null ? money(last.pool_amount) : '—'}</b><span>激励基金（10%）</span></div>`);
    }
  }
  if (API.hasRole('reception')) {
    cards.push(`<div class="stat"><b>${cnt('患者取消')}</b><span>患者取消</span></div>`);
    cards.push(`<div class="stat"><b>${cnt('未到诊')}</b><span>未到诊</span></div>`);
  }
  const quick = [];
  if (API.hasRole('reception'))
    quick.push(`<button class="btn btn-primary" onclick="location.hash='/bookings'">📞 打开预约工作台</button>`,
      `<button class="btn btn-ghost" onclick="location.hash='/visits'">📋 就诊管理</button>`);
  if (API.hasRole('dentist'))
    quick.push(`<button class="btn btn-primary" onclick="location.hash='/myvisits'">🩺 我的接诊</button>`);
  if (API.hasRole('finance'))
    quick.push(`<button class="btn btn-primary" onclick="location.hash='/costs'">💰 费用登记</button>`,
      `<button class="btn btn-ghost" onclick="location.hash='/quarters'">📊 季度核算</button>`);
  if (API.hasRole('hq'))
    quick.push(`<button class="btn btn-primary" onclick="location.hash='/reports'">📈 运营报表</button>`,
      `<button class="btn btn-ghost" onclick="location.hash='/quarters'">✅ 季度审批</button>`);
  if (API.hasRole('ops'))
    quick.push(`<button class="btn btn-primary" onclick="location.hash='/schedules'">🗓 出诊安排</button>`);

  const recent = visits.slice(0, 8);
  page('工作台', `
    <div class="grid cols-3" style="margin-bottom:16px">${cards.join('')}</div>
    <div class="card">
      <h3>快捷办理 ${quick.length ? `<span class="btn-row" style="margin-left:auto">${quick.join('')}</span>` : ''}</h3>
      <p class="hint">业务流程：电话预约 → 登记到诊 → 牙医记录并签署实际治疗 → 生成结算单 → 季度核算。
      患者跨店使用同一账号，过敏逐项保存；结算明细取自已签署治疗；季度基金 = 净利润 × 10%。</p>
    </div>
    <div class="card">
      <h3>最近预约</h3>
      <div class="tbl-wrap"><table class="tbl">
        <tr><th>就诊号</th><th>患者</th><th>诊所</th><th>牙医</th><th>时间</th><th>状态</th></tr>
        ${recent.map(v => `<tr><td class="mono">${esc(v.visit_no)}</td><td>${esc(v.patient_name)}</td>
          <td>${esc(v.clinic_code)}</td><td>${esc(v.dentist_name)}</td><td>${dt(v.scheduled_start)}</td>
          <td>${badge(v.status)}</td></tr>`).join('')}</table></div>
    </div>`);
}

/* ================= 启动 ================= */
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const err = document.getElementById('login-error');
  err.textContent = '';
  try {
    await API.login(document.getElementById('login-name').value, document.getElementById('login-password').value);
    showApp();
    toast(`欢迎，${API.user.display_name}（${API.roleNames()}）`);
  } catch (e2) {
    err.textContent = e2.message;
  }
});

document.getElementById('btn-logout').addEventListener('click', () => {
  API.logout();
  showLogin();
});

window.addEventListener('hashchange', route);
window.addEventListener('adc:unauthorized', showLogin);

if (API.token && API.user) {
  API.get('/me').then(u => { API.user = u; showApp(); }).catch(() => showLogin());
} else {
  showLogin();
}
