/* ADC — 前台视图：预约工作台（UC01/UC02）、就诊管理（UC03/UC04）、患者管理、结算单（UC06） */
const W = window.W = {};

/* ================= 预约工作台 ================= */
W.book = { patient: null, slot: null };

async function viewBookings() {
  const m = await meta();
  page('预约工作台 · 电话预约 → 到诊 → 结算 的第一站', `
    <div class="grid cols-2">
      <div class="card">
        <h3>① 患者身份核对</h3>
        <div class="searchbar">
          <input id="bk-query" placeholder="输入账号 / 姓名 / 电话（如 P-1001、陈雨桐）">
          <button class="btn btn-primary" onclick="W.bookSearch()">检索</button>
          <button class="btn btn-ghost" onclick="W.patientCreateModal()">＋ 新建患者</button>
        </div>
        <div id="bk-patient-result">${empty('先检索患者，或用电话、姓名和出生日期核对已有账号')}</div>
      </div>
      <div class="card">
        <h3>② 预约安排</h3>
        <div class="form-row cols-2">
          <label>诊所
            <select id="bk-clinic">${m.clinics.map(c => `<option value="${c.clinic_id}">${esc(c.clinic_code)} · ${esc(c.postal_address)}</option>`).join('')}</select>
          </label>
          <label>就诊日期 <input type="date" id="bk-date" value="2026-11-23"></label>
        </div>
        <div class="form-row cols-2">
          <label>治疗项目（用于按资质筛选牙医）
            <select id="bk-tt" onchange="W.bookLoadSlots()">
              <option value="">不限（显示全部出诊牙医）</option>
              ${m.treatment_types.map(t => `<option value="${t.treatment_type_id}">${esc(t.treatment_name)}（¥${t.default_unit_price}/${esc(t.unit_name)}）</option>`).join('')}
            </select>
          </label>
          <label>期望治疗（只记录，不计费）
            <input id="bk-want" placeholder="如：洗牙"></label>
        </div>
        <div class="form-row">
          <label>本次特殊需求（随就诊记录，供牙医诊前核对）
            <textarea id="bk-needs" rows="2" placeholder="如：换店就诊核对过敏档案"></textarea></label>
        </div>
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="W.bookLoadSlots()">查询可约时段</button>
          <button class="btn btn-primary" onclick="W.bookSubmit()">确认预约</button>
        </div>
        <p class="hint" style="margin-top:8px">保存预约时系统会再次校验：牙医出诊覆盖、时段冲突、所需资质。两名前台同时约同一时段仅一笔成功。</p>
      </div>
    </div>
    <div class="card">
      <h3>③ 可约时段（按 牙医—资质—门店—时段）</h3>
      <div id="bk-slots">${empty('选择诊所和日期后查询可约时段')}</div>
    </div>`);
  document.getElementById('bk-query').addEventListener('keydown', e => { if (e.key === 'Enter') W.bookSearch(); });
}

W.bookSearch = async function () {
  const q = document.getElementById('bk-query').value.trim();
  if (!q) return toast('请输入检索内容', 'err');
  await safe(async () => {
    const list = await API.get('/patients?q=' + encodeURIComponent(q));
    const box = document.getElementById('bk-patient-result');
    if (!list.length) { box.innerHTML = `<p class="hint">没有匹配的患者，可「新建患者」建档。</p>`; return; }
    box.innerHTML = `<div class="tbl-wrap"><table class="tbl">
      <tr><th>账号</th><th>姓名</th><th>出生日期</th><th>电话</th><th>过敏</th><th></th></tr>
      ${list.map(p => `<tr>
        <td class="mono">${esc(p.account_no)}</td><td>${esc(p.name)}</td><td>${d(p.birth_date)}</td>
        <td>${esc(p.phone)}${p.email ? '' : ' <span class="badge b-已改约">邮箱未填</span>'}</td>
        <td>${p.allergy_cnt ? `<span class="badge b-待核实">${p.allergy_cnt} 项</span>` : '—'}</td>
        <td><button class="btn btn-sm btn-primary" onclick="W.bookPick(${p.patient_id})">选择</button></td>
      </tr>`).join('')}</table></div>`;
  });
};

W.bookPick = async function (pid) {
  await safe(async () => {
    const p = await API.get('/patients/' + pid);
    W.book.patient = p;
    const box = document.getElementById('bk-patient-result');
    box.innerHTML = `<div class="kv">
      <dt>已选患者</dt><dd><b>${esc(p.name)}</b>（${esc(p.account_no)}）</dd>
      <dt>电话</dt><dd>${esc(p.phone)} ${p.email ? '· ' + esc(p.email) : ''}</dd>
      <dt>过敏档案</dt><dd>${p.allergies.length ? p.allergies.map(a =>
        `<span class="badge ${a.status === '已确认' ? 'b-已确认' : 'b-待核实'}">${esc(a.allergy_name)}（${esc(a.status)}）</span>`).join(' ')
        : `— ${p.allergy_inquiry_status}`}</dd>
    </div>`;
  });
};

W.bookLoadSlots = async function () {
  const clinic = document.getElementById('bk-clinic').value;
  const date = document.getElementById('bk-date').value;
  const tt = document.getElementById('bk-tt').value;
  document.getElementById('bk-want').value = document.getElementById('bk-tt').selectedOptions[0]
    ? document.getElementById('bk-tt').selectedOptions[0].text.split('（')[0] : '';
  if (!date) return toast('请选择日期', 'err');
  await safe(async () => {
    const slots = await API.get(`/slots?clinic_id=${clinic}&date=${date}${tt ? '&treatment_type_id=' + tt : ''}`);
    const box = document.getElementById('bk-slots');
    if (!slots.length) { box.innerHTML = empty('该诊所当日没有可约时段（出诊未覆盖、时段被占用或资质不符）'); return; }
    W.book.slot = null;
    const by = {};
    slots.forEach(s => (by[s.dentist_name] = by[s.dentist_name] || []).push(s));
    box.innerHTML = `<div class="slot-grid">${Object.entries(by).map(([name, list]) => `
      <div class="slot-group"><b>${esc(name)}（${esc(list[0].employee_no)}）</b>
        <div class="slot-btns">${list.map((s, i) =>
          `<button class="slot-btn" data-i="${s.dentist_id}|${i}" onclick="W.bookPickSlot('${name}','${s.dentist_id}|${i}')">${dt(s.start).slice(11)}–${dt(s.end).slice(11)}</button>`).join('')}
        </div></div>`).join('')}</div>`;
    box._slots = slots;
    box._byName = by;
  });
};

W.bookPickSlot = function (name, key) {
  const box = document.getElementById('bk-slots');
  box.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('sel'));
  box.querySelector(`[data-i="${key}"]`).classList.add('sel');
  const [did, i] = key.split('|');
  W.book.slot = box._slots.find(s => s.dentist_id == did && box._byName[name][i] === s);
};

W.bookSubmit = async function () {
  if (!W.book.patient) return toast('请先选择患者（①区）', 'err');
  if (!W.book.slot) return toast('请先选择可约时段（③区）', 'err');
  await safe(async () => {
    const s = W.book.slot;
    const r = await API.post('/visits', {
      patient_id: W.book.patient.patient_id,
      clinic_id: Number(document.getElementById('bk-clinic').value),
      dentist_id: s.dentist_id,
      scheduled_start: s.start, scheduled_end: s.end,
      requested_treatments: document.getElementById('bk-want').value.trim(),
      special_needs: document.getElementById('bk-needs').value.trim(),
      treatment_type_id: document.getElementById('bk-tt').value || null,
    });
    toast(`预约成功：${r.visit_no}（${s.dentist_name} ${s.start}）`);
    W.bookLoadSlots();
  });
};

/* ================= 就诊管理 ================= */
const VISIT_TABS = [
  ['', '全部'], ['待到诊', '待到诊'], ['已到诊', '已到诊'], ['治疗完成', '治疗完成'],
  ['患者取消', '患者取消'], ['未到诊', '未到诊'], ['待核实', '待核实'], ['已改约', '已改约'],
];
W.visitTab = '待到诊';

async function viewVisits() {
  page('就诊管理 · 到诊登记 / 取消 / 改约 / 未到诊分类（UC03、UC04）', `
    <div class="tabs">${VISIT_TABS.map(([v, t]) =>
      `<button class="tab ${W.visitTab === v ? 'active' : ''}" onclick="W.visitTabSet('${v}')">${t}</button>`).join('')}</div>
    <div class="card"><div class="tbl-wrap"><table class="tbl" id="visit-table"></table></div></div>`);
  W.visitRender();
}

W.visitTabSet = function (v) { W.visitTab = v; viewVisits(); };

W.visitRender = async function () {
  await safe(async () => {
    const q = W.visitTab ? '?status=' + encodeURIComponent(W.visitTab) : '';
    const list = await API.get('/visits' + q);
    document.getElementById('visit-table').innerHTML = `
      <tr><th>就诊号</th><th>患者</th><th>诊所</th><th>牙医</th><th>预约时间</th><th>状态</th><th>期望治疗</th><th>操作</th></tr>
      ${list.map(v => `<tr>
        <td class="mono">${esc(v.visit_no)}</td>
        <td>${esc(v.patient_name)}<br><span class="muted">${esc(v.patient_account)} · ${esc(v.patient_phone)}</span></td>
        <td>${esc(v.clinic_code)}</td><td>${esc(v.dentist_name)}</td>
        <td>${dt(v.scheduled_start)}</td>
        <td>${badge(v.status)}${v.status === '待核实' ? '<br><span class="muted">到期未处理</span>' : ''}</td>
        <td class="muted">${esc(v.requested_treatments || '—')}</td>
        <td><div class="btn-row">${visitActions(v).join('')}</div></td>
      </tr>`).join('') || `<tr><td colspan="8">${empty('该状态下没有预约')}</td></tr>`}`;
  });
};

function visitActions(v) {
  const a = [];
  a.push(`<button class="btn btn-sm btn-ghost" onclick="W.visitDetail(${v.visit_id})">详情</button>`);
  if (v.status === '待到诊' || v.status === '待核实')
    a.push(`<button class="btn btn-sm btn-primary" onclick="W.visitCheckin(${v.visit_id})">登记到诊</button>`);
  if (v.status === '待到诊' || v.status === '待核实') {
    a.push(`<button class="btn btn-sm btn-danger" onclick="W.visitCancelModal(${v.visit_id})">取消</button>`);
    a.push(`<button class="btn btn-sm btn-ghost" onclick="W.visitReschedModal(${v.visit_id})">改约</button>`);
  }
  if (v.status === '待到诊' && new Date(String(v.scheduled_start).replace(' ', 'T')) < new Date())
    a.push(`<button class="btn btn-sm btn-ghost" onclick="W.visitNoshow(${v.visit_id},'mark')">待核实</button>`);
  if (v.status === '待核实')
    a.push(`<button class="btn btn-sm btn-danger" onclick="W.visitNoshow(${v.visit_id},'confirm')">确认未到诊</button>`);
  if (v.status === '已到诊')
    a.push(`<button class="btn btn-sm btn-blue" onclick="W.visitInvoice(${v.visit_id})">开结算单</button>`);
  if (v.status === '治疗完成')
    a.push(`<button class="btn btn-sm btn-blue" onclick="W.visitDetail(${v.visit_id},true)">结算单</button>`);
  return a;
}

W.visitCheckin = function (id) {
  safe(async () => { await API.post(`/visits/${id}/checkin`); toast('已登记到诊'); W.visitRender(); });
};

W.visitNoshow = function (id, action) {
  if (action === 'confirm') {
    modal(`<div class="form-row"><label>确认原因<textarea id="nw-reason" rows="2" placeholder="如：已电话联系确认爽约"></textarea></label></div>`, {
      onMount: m => { m.setTitle('确认未到诊'); m.setFoot(`
        <button class="btn btn-ghost" onclick="closeModal()">取消</button>
        <button class="btn btn-danger" onclick="W.visitNoshowDo(${id})">确认未到诊</button>`); },
    });
  } else {
    safe(async () => { await API.post(`/visits/${id}/noshow`, { action: 'mark' }); toast('已进入待核实清单'); W.visitRender(); });
  }
};
W.visitNoshowDo = function (id) {
  safe(async () => {
    await API.post(`/visits/${id}/noshow`, { action: 'confirm', reason: document.getElementById('nw-reason').value });
    closeModal(); toast('已登记未到诊'); W.visitRender();
  });
};

W.visitCancelModal = function (id) {
  modal(`<div class="form-row cols-2">
      <label>发起方<select id="cx-who"><option value="患者">患者</option><option value="诊所">诊所</option></select></label>
      <label>取消原因<input id="cx-why" placeholder="如：家中有事"></label>
    </div><p class="hint">患者主动取消与诊所原因撤销将分别统计，取消率只计患者取消。</p>`, {
    onMount: m => { m.setTitle('取消预约'); m.setFoot(`
      <button class="btn btn-ghost" onclick="closeModal()">返回</button>
      <button class="btn btn-danger" onclick="W.visitCancelDo(${id})">确认取消</button>`); },
  });
};
W.visitCancelDo = function (id) {
  safe(async () => {
    await API.post(`/visits/${id}/cancel`, {
      initiator: document.getElementById('cx-who').value,
      reason: document.getElementById('cx-why').value,
    });
    closeModal(); toast('已取消'); W.visitRender();
  });
};

W.resched = { slot: null };
W.visitReschedModal = async function (id) {
  const m = await meta();
  const md = modal(`<div class="form-row cols-3">
      <label>诊所<select id="rs-clinic">${m.clinics.map(c => `<option value="${c.clinic_id}">${esc(c.clinic_code)}</option>`).join('')}</select></label>
      <label>日期<input type="date" id="rs-date" value="2026-11-23"></label>
      <label>治疗项目<select id="rs-tt"><option value="">不限</option>
        ${m.treatment_types.map(t => `<option value="${t.treatment_type_id}">${esc(t.treatment_name)}</option>`).join('')}</select></label>
    </div>
    <div class="btn-row"><button class="btn btn-ghost" onclick="W.reschedSlots()">查询新时段</button></div>
    <div id="rs-slots" class="slot-grid" style="margin-top:10px"></div>
    <div class="form-row"><label>改约原因<textarea id="rs-why" rows="2"></textarea></label></div>
    <p class="hint">改约成功后原预约标记「已改约」并保留，新预约指回原预约；统计只计一次。</p>`, { wide: true });
  md.setTitle('改约（保留原安排与变更原因）');
  md.setFoot(`<button class="btn btn-ghost" onclick="closeModal()">返回</button>
    <button class="btn btn-primary" onclick="W.visitReschedDo(${id})">确认改约</button>`);
};

W.reschedSlots = async function () {
  await safe(async () => {
    const clinic = document.getElementById('rs-clinic').value;
    const date = document.getElementById('rs-date').value;
    const tt = document.getElementById('rs-tt').value;
    const slots = await API.get(`/slots?clinic_id=${clinic}&date=${date}${tt ? '&treatment_type_id=' + tt : ''}`);
    const box = document.getElementById('rs-slots');
    if (!slots.length) { box.innerHTML = empty('该诊所当日没有可约时段'); return; }
    W.resched.slot = null;
    const by = {};
    slots.forEach(s => (by[s.dentist_name] = by[s.dentist_name] || []).push(s));
    box.innerHTML = Object.entries(by).map(([name, list]) => `<div class="slot-group"><b>${esc(name)}</b>
      <div class="slot-btns">${list.map((s, i) => `<button class="slot-btn" data-k="${s.dentist_id}|${i}"
        onclick="W.reschedPick('${name}','${s.dentist_id}|${i}')">${dt(s.start).slice(11)}–${dt(s.end).slice(11)}</button>`).join('')}</div></div>`).join('');
    box._s = slots; box._b = by;
  });
};
W.reschedPick = function (name, key) {
  const box = document.getElementById('rs-slots');
  box.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('sel'));
  box.querySelector(`[data-k="${key}"]`).classList.add('sel');
  const [did, i] = key.split('|');
  W.resched.slot = box._s.find(s => s.dentist_id == did && box._b[name][i] === s);
};
W.visitReschedDo = function (id) {
  if (!W.resched.slot) return toast('请先选择新时段', 'err');
  safe(async () => {
    await API.post(`/visits/${id}/reschedule`, {
      clinic_id: Number(document.getElementById('rs-clinic').value),
      dentist_id: W.resched.slot.dentist_id,
      scheduled_start: W.resched.slot.start, scheduled_end: W.resched.slot.end,
      reason: document.getElementById('rs-why').value || '患者要求改约',
    });
    closeModal(); toast('改约成功'); W.visitRender();
  });
};

/* 就诊详情弹窗 */
W.visitDetail = async function (id, invoiceOnly = false) {
  await safe(async () => {
    const v = await API.get('/visits/' + id);
    const md = modal(`
      <div class="kv">
        <dt>就诊号</dt><dd class="mono">${esc(v.visit_no)} ${badge(v.status)}</dd>
        <dt>患者</dt><dd>${esc(v.patient.name)}（${esc(v.patient.account_no)}）· ${esc(v.patient.phone)}${v.patient.email ? ' · ' + esc(v.patient.email) : ' · <span class="muted">邮箱未填</span>'}</dd>
        <dt>诊所 / 牙医</dt><dd>${esc(v.clinic_code)} · ${esc(v.dentist_name)}（${esc(v.dentist_no)}）</dd>
        <dt>预约时间</dt><dd>${dt(v.scheduled_start)} ~ ${dt(v.scheduled_end)}</dd>
        ${v.arrived_at ? `<dt>实际到诊</dt><dd>${dt(v.arrived_at)}</dd>` : ''}
        ${v.cancelled_at ? `<dt>取消时间</dt><dd>${dt(v.cancelled_at)}（${esc(v.cancel_initiator)}）</dd>` : ''}
        ${v.reason ? `<dt>原因</dt><dd>${esc(v.reason)}</dd>` : ''}
        ${v.requested_treatments ? `<dt>期望治疗</dt><dd>${esc(v.requested_treatments)}（只记录不计费）</dd>` : ''}
        ${v.special_needs ? `<dt>特殊需求</dt><dd>${esc(v.special_needs)}</dd>` : ''}
        ${v.previous_no ? `<dt>改约链</dt><dd>由 ${esc(v.previous_no)} 改约而来</dd>` : ''}
        ${v.next_visit ? `<dt>改约链</dt><dd>已改约至 ${esc(v.next_visit.visit_no)}（${esc(v.next_visit.status)}）</dd>` : ''}
      </div>
      <div class="section-title">🧾 过敏档案（${v.patient.allergy_inquiry_status}）</div>
      ${v.allergies.length ? `<ul class="allergy-list">${v.allergies.map(a =>
        `<li>${esc(a.allergy_name)} ${badge(a.status)} <span class="muted">${esc(a.note || '')}</span></li>`).join('')}</ul>`
        : '<p class="hint">无已记录过敏，诊前由牙医复核。</p>'}
      <div class="section-title">🩺 实际治疗（已签署确认后进入结算）</div>
      ${v.treatments.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th>项目</th><th>单位数</th><th>单价</th><th>小计</th><th>执行牙医</th><th>状态</th></tr>
        ${v.treatments.map(t => `<tr><td>${esc(t.treatment_name)}</td><td class="num">${t.units} ${esc(t.unit_name)}</td>
          <td class="num">${money(t.unit_price)}</td><td class="num">${money(t.units * t.unit_price)}</td>
          <td>${esc(t.performer_name)}</td><td>${badge(t.status)}</td></tr>`).join('')}</table></div>`
        : '<p class="hint">暂无治疗记录。</p>'}
      <div class="section-title">🧮 结算单</div>
      ${v.invoice ? invoiceHtml(v.invoice) : `<p class="hint">尚未开单。${v.status === '已到诊' ? '治疗签署确认后可生成。' : ''}</p>`}`, { wide: true });
    md.setTitle(`就诊详情 ${v.visit_no}${invoiceOnly ? ' · 结算单' : ''}`);
    md.setFoot(`<button class="btn btn-ghost" onclick="closeModal()">关闭</button>
      ${v.status === '已到诊' && API.hasRole('reception') ? `<button class="btn btn-blue" onclick="W.visitInvoice(${id})">开结算单</button>` : ''}
      ${v.status === '待到诊' && API.hasRole('reception') ? `<button class="btn btn-primary" onclick="closeModal();W.visitCheckin(${id})">登记到诊</button>` : ''}`);
  });
};

function invoiceHtml(inv) {
  return `<div class="tbl-wrap"><table class="tbl">
    <tr><th>单号</th><td class="mono">${esc(inv.invoice_no)}</td><th>版本</th><td>v${inv.revision_no}（更正保留版本链）</td></tr>
    <tr><th>状态</th><td>${badge(inv.rev_status, { 已签发: 'b-已确认' })}</td><th>签发时间</th><td>${dt(inv.issued_at)}</td></tr></table></div>
    <div class="tbl-wrap" style="margin-top:8px"><table class="tbl">
      <tr><th>项目</th><th>单位数</th><th>单价</th><th>小计</th><th>执行牙医</th><th>实施时间</th></tr>
      ${inv.items.map(i => `<tr><td>${esc(i.name_snapshot)}</td><td class="num">${i.units_snapshot}</td>
        <td class="num">${money(i.unit_price_snapshot)}</td><td class="num">${money(i.subtotal)}</td>
        <td>${esc(i.performer_name)}</td><td>${dt(i.performed_at)}</td></tr>`).join('')}
    </table></div>
    <div class="total-line">合计 <b>${money(inv.total_amount)}</b></div>`;
}

W.visitInvoice = async function (id) {
  await safe(async () => {
    const inv = await API.post(`/visits/${id}/invoice`);
    toast(`结算单 ${inv.invoice_no}（合计 ${money(inv.total_amount)}）`);
    W.visitDetail(id, true);
    if (W.visitTab) W.visitRender();
  });
};

/* ================= 患者管理 ================= */
async function viewPatients() {
  page('患者管理 · 跨店统一档案 / 逐项过敏（UC01）', `
    <div class="card">
      <div class="searchbar">
        <input id="pt-query" placeholder="输入账号 / 姓名 / 电话">
        <button class="btn btn-primary" onclick="W.patientSearch()">检索</button>
        <button class="btn btn-ghost" onclick="W.patientCreateModal()">＋ 新建患者</button>
      </div>
      <div class="tbl-wrap"><table class="tbl" id="pt-table"></table></div>
    </div>`);
  document.getElementById('pt-query').addEventListener('keydown', e => { if (e.key === 'Enter') W.patientSearch(); });
  W.patientSearch();
}

W.patientSearch = async function () {
  await safe(async () => {
    const q = document.getElementById('pt-query').value.trim();
    const list = await API.get('/patients?q=' + encodeURIComponent(q));
    document.getElementById('pt-table').innerHTML = `
      <tr><th>账号</th><th>姓名</th><th>出生日期</th><th>电话</th><th>邮箱</th><th>过敏询问状态</th><th>过敏项</th><th></th></tr>
      ${list.map(p => `<tr>
        <td class="mono">${esc(p.account_no)}</td><td>${esc(p.name)}</td><td>${d(p.birth_date)}</td>
        <td>${esc(p.phone)}</td><td>${p.email ? esc(p.email) : '<span class="muted">未填（允许）</span>'}</td>
        <td>${esc(p.allergy_inquiry_status)}</td>
        <td>${p.allergy_cnt ? `<span class="badge b-待核实">${p.allergy_cnt} 项</span>` : '—'}</td>
        <td><button class="btn btn-sm btn-ghost" onclick="W.patientDetail(${p.patient_id})">查看 / 维护</button></td>
      </tr>`).join('')}`;
  });
};

W.patientCreateModal = async function () {
  const m = await meta();
  const md = modal(`
    <div class="form-row cols-2">
      <label>姓名<b>*</b><input id="pc-name"></label>
      <label>出生日期<b>*</b><input type="date" id="pc-birth"></label>
    </div>
    <div class="form-row cols-2">
      <label>电话<b>*</b><input id="pc-phone"></label>
      <label>邮箱（可不填）<input id="pc-email"></label>
    </div>
    <div class="form-row"><label>账单地址<b>*</b><input id="pc-addr"></label></div>
    <div class="form-row cols-2">
      <label>紧急联系人<b>*</b><input id="pc-ecn"></label>
      <label>紧急联系人电话<b>*</b><input id="pc-ecp"></label>
    </div>
    <div class="section-title">🧾 已知过敏（逐项保存，多条不互相覆盖）</div>
    ${m.allergy_types.map(a => `<label style="display:inline-flex;align-items:center;gap:6px;margin:4px 12px 4px 0">
      <input type="checkbox" value="${a.allergy_type_id}" class="pc-allergy">${esc(a.allergy_name)}</label>`).join('')}
    <div class="form-row"><label>过敏备注<textarea id="pc-anote" rows="2" placeholder="如：接触乳胶手套出现皮疹"></textarea></label></div>
    <p class="hint">过敏信息初始状态为「待核实」，由接诊牙医诊前核对确认；邮箱留空允许保存。</p>`);
  md.setTitle('新建患者档案');
  md.setFoot(`<button class="btn btn-ghost" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="W.patientCreateDo()">保存档案</button>`);
};

W.patientCreateDo = async function () {
  const v = id => document.getElementById(id).value.trim();
  const allergies = [...document.querySelectorAll('.pc-allergy:checked')].map(c => ({
    allergy_type_id: Number(c.value), note: v('pc-anote'),
  }));
  await safe(async () => {
    const p = await API.post('/patients', {
      name: v('pc-name'), birth_date: v('pc-birth'), billing_address: v('pc-addr'),
      phone: v('pc-phone'), email: v('pc-email') || null,
      emergency_contact_name: v('pc-ecn'), emergency_contact_phone: v('pc-ecp'),
      allergies,
    });
    closeModal(); toast(`建档成功：${p.account_no}（邮箱可空）`);
    if (document.getElementById('pt-table')) W.patientSearch(); else W.bookSearch();
  });
};

W.patientDetail = async function (pid) {
  await safe(async () => {
    const p = await API.get('/patients/' + pid);
    const md = modal(`
      <div class="kv">
        <dt>账号</dt><dd class="mono">${esc(p.account_no)}</dd>
        <dt>姓名</dt><dd>${esc(p.name)}（${d(p.birth_date)}）</dd>
        <dt>账单地址</dt><dd>${esc(p.billing_address)}</dd>
        <dt>电话 / 邮箱</dt><dd>${esc(p.phone)}${p.email ? ' · ' + esc(p.email) : ' · <span class="muted">未填</span>'}</dd>
        <dt>紧急联系人</dt><dd>${esc(p.emergency_contact_name)} · ${esc(p.emergency_contact_phone)}</dd>
        <dt>过敏询问状态</dt><dd>${esc(p.allergy_inquiry_status)}</dd>
      </div>
      <div class="section-title">🧾 过敏记录（逐项）</div>
      <div id="pa-list">${p.allergies.map(a => `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px dashed var(--line)">
        <b style="min-width:70px">${esc(a.allergy_name)}</b>
        <select data-aid="${a.patient_allergy_id}" class="pa-status" style="padding:4px 8px;border:1px solid var(--line);border-radius:6px">
          <option ${a.status === '待核实' ? 'selected' : ''}>待核实</option>
          <option ${a.status === '已确认' ? 'selected' : ''}>已确认</option>
          <option ${a.status === '已撤回' ? 'selected' : ''}>已撤回</option>
        </select>
        <input class="pa-note" value="${esc(a.note || '')}" placeholder="备注" style="flex:1;padding:4px 8px;border:1px solid var(--line);border-radius:6px">
        <button class="btn btn-sm btn-ghost" onclick="W.allergySave(${pid},${a.patient_allergy_id})">保存</button>
      </div>`).join('') || '<p class="hint">暂无过敏记录。</p>'}</div>
      <div class="form-row" style="margin-top:10px">
        <label>新增过敏<input list="pa-types" id="pa-new-type" placeholder="输入或选择过敏类型">
        <datalist id="pa-types">${(await meta()).allergy_types.map(a => `<option value="${esc(a.allergy_name)}" data-id="${a.allergy_type_id}">`).join('')}</datalist></label>
        <div class="btn-row"><button class="btn btn-sm btn-ghost" onclick="W.allergyAdd(${pid})">添加过敏项</button></div>
      </div>
      <div class="section-title">📅 就诊记录（跨店统一账号）</div>
      ${p.visits.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th>就诊号</th><th>时间</th><th>诊所</th><th>牙医</th><th>状态</th></tr>
        ${p.visits.map(v => `<tr><td class="mono">${esc(v.visit_no)}</td><td>${dt(v.scheduled_start)}</td>
          <td>${esc(v.clinic_code)}</td><td>${esc(v.dentist_name)}</td><td>${badge(v.status)}</td></tr>`).join('')}</table></div>`
        : '<p class="hint">暂无就诊记录。</p>'}`);
    md.setTitle(`患者档案 ${p.account_no} · ${p.name}`);
    md.setFoot(`<button class="btn btn-ghost" onclick="closeModal()">关闭</button>`);
  });
};

W.allergySave = async function (pid, aid) {
  const row = document.querySelector(`[data-aid="${aid}"]`).closest('div');
  const status = row.querySelector('.pa-status').value;
  const note = row.querySelector('.pa-note').value;
  await safe(async () => {
    const ats = (await meta()).allergy_types;
    const an = row.querySelector('b').textContent;
    const t = ats.find(a => a.allergy_name === an);
    await API.post(`/patients/${pid}/allergies`, { allergy_type_id: t.allergy_type_id, status, note });
    toast('过敏记录已保存（逐项保存，留痕可查）');
  });
};

W.allergyAdd = async function (pid) {
  const input = document.getElementById('pa-new-type');
  const name = input.value.trim();
  if (!name) return toast('请输入过敏类型', 'err');
  await safe(async () => {
    const ats = (await meta()).allergy_types;
    const t = ats.find(a => a.allergy_name === name);
    if (!t) return toast('过敏类型需从字典中选择', 'err');
    await API.post(`/patients/${pid}/allergies`, { allergy_type_id: t.allergy_type_id, note: '' });
    toast('已添加过敏项（待核实）'); closeModal(); W.patientDetail(pid);
  });
};
