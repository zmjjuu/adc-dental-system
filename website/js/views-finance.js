/* ADC — 财务视图：费用登记与分摊（UC09）、季度核算与激励基金（UC10）、结算核对 */
W.costTab = '';

async function viewCosts() {
  page('费用登记 · 耗材关联治疗 / 运营费关联牙医 / 无规则先待分摊（UC09）', `
    <div class="tabs">
      <button class="tab ${W.costTab === '' ? 'active' : ''}" onclick="W.costTabSet('')">全部</button>
      <button class="tab ${W.costTab === '待分摊' ? 'active' : ''}" onclick="W.costTabSet('待分摊')">待分摊</button>
      <button class="tab ${W.costTab === '待确认' ? 'active' : ''}" onclick="W.costTabSet('待确认')">待确认</button>
      <button class="tab ${W.costTab === '已确认' ? 'active' : ''}" onclick="W.costTabSet('已确认')">已确认</button>
    </div>
    <div class="card">
      <div class="btn-row" style="margin-bottom:12px">
        <button class="btn btn-primary" onclick="W.costCreateModal()">＋ 登记费用</button>
      </div>
      <div class="tbl-wrap"><table class="tbl" id="cost-table"></table></div>
    </div>`);
  W.costRender();
}

W.costTabSet = function (t) { W.costTab = t; viewCosts(); };

W.costRender = async function () {
  await safe(async () => {
    const q = W.costTab ? '?status=' + encodeURIComponent(W.costTab) : '';
    const list = await API.get('/costs' + q);
    document.getElementById('cost-table').innerHTML = `
      <tr><th>凭证号</th><th>行</th><th>类别</th><th>发生日期</th><th>金额</th><th>分摊</th><th>状态</th><th></th></tr>
      ${list.map(c => `<tr>
        <td class="mono">${esc(c.document_no)}</td><td>${c.line_no}</td>
        <td>${esc(c.cost_kind)}</td><td>${d(c.incurred_at)}</td><td class="num">${money(c.amount)}</td>
        <td class="muted">${c.allocations.map(a => `${esc(a.dentist_name)} ${money(a.allocated_amount)}`).join('、') || '—'}</td>
        <td>${badge(c.status)}</td>
        <td>${c.status !== '已确认' ? `<button class="btn btn-sm btn-primary" onclick="W.costConfirm(${c.cost_entry_id})">确认</button>` : ''}</td>
      </tr>`).join('') || `<tr><td colspan="8">${empty('暂无费用记录')}</td></tr>`}`;
  });
};

W.costConfirm = function (id) {
  safe(async () => { await API.post(`/costs/${id}/confirm`); toast('费用已确认，进入季度归集'); W.costRender(); });
};

W.costAllocs = [];

W.costCreateModal = async function () {
  const m = await meta();
  W.costAllocs = [{ dentist_id: m.dentists[0]?.dentist_id, amount: '', treatment_id: '' }];
  const md = modal(`
    <div class="form-row cols-3">
      <label>凭证号<b>*</b><input id="co-doc" placeholder="如 MAT-202612-01"></label>
      <label>行号<b>*</b><input id="co-line" type="number" value="1"></label>
      <label>发生日期<b>*</b><input type="date" id="co-date" value="2026-11-23"></label>
    </div>
    <div class="form-row cols-2">
      <label>类别<b>*</b><select id="co-kind" onchange="W.costKindChange()">
        <option value="耗材">耗材（须关联实际治疗）</option><option value="运营费">运营费（关联牙医与期间）</option></select></label>
      <label>金额<b>*</b><input id="co-amount" type="number" step="0.01" min="0.01"></label>
    </div>
    <div class="section-title">分摊明细（合计必须等于来源金额；无规则先挂「待分摊」）</div>
    <div id="co-allocs"></div>
    <div class="btn-row">
      <button class="btn btn-sm btn-ghost" onclick="W.costAllocAdd()">＋ 加一行分摊</button>
      <button class="btn btn-sm btn-ghost" onclick="W.costSave(false)">仅保存（挂待分摊）</button>
    </div>
    <p class="hint">确认时校验：分配合计=来源金额；同一凭证行防重；耗材必须追溯到实际治疗版本；已确认费用不直接改金额（差额以调整单更正）。</p>`);
  md.setTitle('登记成本 / 运营费用');
  md.setFoot(`<button class="btn btn-ghost" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="W.costSave(true)">保存并待确认</button>`);
  W.costAllocRender();
};

W.costKindChange = function () { W.costAllocRender(); };

W.costAllocRender = async function () {
  const m = await meta();
  const kind = document.getElementById('co-kind').value;
  const box = document.getElementById('co-allocs');
  box.innerHTML = W.costAllocs.map((a, i) => `
    <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">
      <select data-k="dentist_id" data-i="${i}" style="padding:6px 8px;border:1px solid var(--line);border-radius:6px;flex:1">
        ${m.dentists.map(d => `<option value="${d.dentist_id}" ${d.dentist_id == a.dentist_id ? 'selected' : ''}>${esc(d.employee_no)} ${esc(d.name)}</option>`).join('')}
      </select>
      ${kind === '耗材' ? `<select data-k="treatment_id" data-i="${i}" style="padding:6px 8px;border:1px solid var(--line);border-radius:6px;flex:2">
        <option value="">选择实际治疗…</option></select>` : ''}
      <input data-k="amount" data-i="${i}" type="number" step="0.01" min="0.01" placeholder="金额"
        style="padding:6px 8px;border:1px solid var(--line);border-radius:6px;width:120px">
      <button class="btn btn-sm btn-danger" onclick="W.costAllocDel(${i})">删</button>
    </div>`).join('');
  if (kind === '耗材') {
    for (const row of box.querySelectorAll('select[data-k=dentist_id]')) {
      const i = row.dataset.i;
      await safe(async () => {
        const list = await API.get('/treatments/confirmed?dentist_id=' + row.value);
        const sel = box.querySelector(`select[data-k=treatment_id][data-i="${i}"]`);
        if (!sel) return;
        const cur = W.costAllocs[i].treatment_id;
        sel.innerHTML = `<option value="">选择实际治疗…</option>` + list.map(t =>
          `<option value="${t.treatment_id}" ${cur == t.treatment_id ? 'selected' : ''}>${esc(t.visit_no)} ${esc(t.treatment_name)} ×${t.units}（${esc(t.dentist_name)}）</option>`).join('');
      });
    }
  }
  box.querySelectorAll('[data-k]').forEach(el => el.addEventListener('change', () => {
    W.costAllocs[Number(el.dataset.i)][el.dataset.k] = el.value;
    if (el.dataset.k === 'dentist_id' && kind === '耗材') W.costAllocRender();
  }));
};

W.costAllocAdd = function () {
  W.costAllocs.push({ dentist_id: '', amount: '', treatment_id: '' });
  W.costAllocRender();
};
W.costAllocDel = function (i) {
  W.costAllocs.splice(i, 1);
  if (!W.costAllocs.length) W.costAllocs.push({ dentist_id: '', amount: '', treatment_id: '' });
  W.costAllocRender();
};

W.costSave = async function (withAllocs) {
  const v = id => document.getElementById(id).value.trim();
  const kind = document.getElementById('co-kind').value;
  let allocations = null;
  if (withAllocs) {
    allocations = W.costAllocs.map(a => ({
      dentist_id: Number(a.dentist_id),
      amount: Number(a.amount),
      treatment_id: a.treatment_id ? Number(a.treatment_id) : null,
      version_no: 1,
    }));
    if (allocations.some(a => !a.dentist_id || !(a.amount > 0) || (kind === '耗材' && !a.treatment_id)))
      return toast('请完整填写每行分摊（牙医、金额' + (kind === '耗材' ? '、治疗' : '') + '）', 'err');
  }
  await safe(async () => {
    await API.post('/costs', {
      document_no: v('co-doc'), line_no: Number(v('co-line')), cost_kind: kind,
      incurred_at: v('co-date'), amount: Number(v('co-amount')), allocations,
    });
    closeModal(); toast('费用已登记'); W.costRender();
  });
};

/* ================= 季度核算 ================= */
async function viewQuarters() {
  page('季度核算 · 净利润 = 收入 − 耗材 − 运营费；正利润的 10% 为激励基金（UC10）', `
    <div class="card">
      <div class="btn-row" style="margin-bottom:12px">
        <select id="q-year" style="padding:8px;border:1px solid var(--line);border-radius:8px">
          <option>2026</option><option>2025</option></select>
        <select id="q-no" style="padding:8px;border:1px solid var(--line);border-radius:8px">
          <option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option>
          <option value="4" selected>Q4</option></select>
        <button class="btn btn-primary" onclick="W.quarterCreate()">生成季度核算</button>
      </div>
      <div class="tbl-wrap"><table class="tbl" id="q-table"></table></div>
    </div>`);
  W.quarterRender();
}

W.quarterRender = async function () {
  await safe(async () => {
    const list = await API.get('/quarters');
    document.getElementById('q-table').innerHTML = `
      <tr><th>年度</th><th>季度</th><th>版本</th><th>净利润</th><th>激励基金</th><th>状态</th><th>待确认费用</th><th></th></tr>
      ${list.map(q => `<tr>
        <td>${q.year}</td><td>Q${q.quarter_no}</td><td>v${q.version_no}</td>
        <td class="num"><b>${money(q.net_profit)}</b></td>
        <td class="num">${q.pool_amount != null ? money(q.pool_amount) : '<span class="muted">待政策确认</span>'}</td>
        <td>${badge(q.status)}</td>
        <td>${q.pending_count ? `<span class="badge b-待分摊">${q.pending_count} 笔</span>` : '—'}</td>
        <td><button class="btn btn-sm btn-ghost" onclick="W.quarterDetail(${q.quarter_close_id})">查看</button></td>
      </tr>`).join('') || `<tr><td colspan="8">${empty('暂无核算版本，点击「生成季度核算」')}</td></tr>`}`;
  });
};

W.quarterCreate = async function () {
  await safe(async () => {
    const r = await API.post('/quarters', {
      year: Number(document.getElementById('q-year').value),
      quarter_no: Number(document.getElementById('q-no').value),
    });
    toast('核算草稿已生成（收入按已签发结算、费用按已确认分摊归集）');
    W.quarterDetail(r.quarter_close_id);
  });
};

W.quarterDetail = async function (qid) {
  await safe(async () => {
    const q = await API.get('/quarters/' + qid);
    const md = modal(`
      <div class="kv">
        <dt>核算版本</dt><dd>${q.year} Q${q.quarter_no} v${q.version_no}（政策 ${esc(q.policy_version)}）${badge(q.status)}</dd>
        <dt>统计截止</dt><dd>${dt(q.cutoff_at)}</dd>
        <dt>公司净利润</dt><dd><b style="font-size:18px;color:var(--red)">${money(q.net_profit)}</b></dd>
        <dt>激励基金（净利润 10%）</dt><dd>${q.pool_amount != null ? `<b>${money(q.pool_amount)}</b>` : '待政策确认（净利润不为正或未批准）'}</dd>
        ${q.approved_at ? `<dt>批准</dt><dd>${dt(q.approved_at)}</dd>` : ''}
      </div>
      <div class="section-title">👨‍⚕️ 牙医贡献（可下钻至结算明细与费用凭证）</div>
      <div class="tbl-wrap"><table class="tbl">
        <tr><th>牙医</th><th>收入</th><th>医疗用品成本</th><th>运营费用</th><th>净利润</th><th>来源数</th></tr>
        ${q.results.map(r => `<tr>
          <td>${esc(r.dentist_name)}<br><span class="muted">${esc(r.dentist_no)}</span></td>
          <td class="num">${money(r.revenue)}</td><td class="num">${money(r.material_cost)}</td>
          <td class="num">${money(r.operating_expense)}</td>
          <td class="num"><b>${money(r.net_profit)}</b></td><td class="num">${r.sources}</td>
        </tr>`).join('')}</table></div>
      <p class="hint">基金是公司净利润的 10%，不自动计算个人奖金——分配方式需总部另行批准。</p>
      ${q.pending.length ? `<div class="section-title">⚠️ 待确认费用（不把空值当 0）</div>
        <div class="tbl-wrap"><table class="tbl"><tr><th>凭证</th><th>类别</th><th>金额</th><th>状态</th></tr>
        ${q.pending.map(p => `<tr><td class="mono">${esc(p.document_no)}#${p.line_no}</td><td>${esc(p.cost_kind)}</td>
          <td class="num">${money(p.amount)}</td><td>${badge(p.status)}</td></tr>`).join('')}</table></div>` : ''}`, { wide: true });
    md.setTitle(`季度核算 ${q.year} Q${q.quarter_no} v${q.version_no}`);
    md.setFoot(`<button class="btn btn-ghost" onclick="closeModal()">关闭</button>
      ${q.status === '草稿' && API.hasRole('finance') ? `<button class="btn btn-primary" onclick="W.quarterSubmit(${qid})">提交审批</button>` : ''}
      ${q.status === '待审批' && API.hasRole('hq') ? `<button class="btn btn-primary" onclick="W.quarterApprove(${qid})">批准核算</button>` : ''}`);
  });
};

W.quarterSubmit = function (qid) {
  safe(async () => { await API.post(`/quarters/${qid}/submit`); toast('已提交审批'); closeModal(); W.quarterRender(); });
};
W.quarterApprove = function (qid) {
  safe(async () => { await API.post(`/quarters/${qid}/approve`); toast('核算已批准，基金按政策比例入账'); closeModal(); W.quarterRender(); });
};

/* ================= 结算单核对 ================= */
async function viewInvoices() {
  page('结算单核对 · 一就诊一张有效结算单，明细逐行追溯治疗（UC06）', `
    <div class="card"><div class="tbl-wrap"><table class="tbl" id="inv-table"></table></div></div>`);
  await safe(async () => {
    const list = await API.get('/visits?status=' + encodeURIComponent('治疗完成'));
    document.getElementById('inv-table').innerHTML = `
      <tr><th>就诊号</th><th>患者</th><th>诊所</th><th>牙医</th><th>时间</th><th></th></tr>
      ${list.map(v => `<tr>
        <td class="mono">${esc(v.visit_no)}</td><td>${esc(v.patient_name)}（${esc(v.patient_account)}）</td>
        <td>${esc(v.clinic_code)}</td><td>${esc(v.dentist_name)}</td><td>${dt(v.scheduled_start)}</td>
        <td><button class="btn btn-sm btn-primary" onclick="W.visitDetail(${v.visit_id},true)">查看结算单</button></td>
      </tr>`).join('') || `<tr><td colspan="6">${empty('暂无已开单就诊')}</td></tr>`}`;
  });
}
