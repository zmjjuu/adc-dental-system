/* ADC — 牙医视图：我的接诊（诊前核对 UC04）、治疗记录与签署（UC05） */
W.dentTab = '已到诊';

async function viewMyVisits() {
  page('我的接诊 · 过敏复核 / 实际治疗记录与签署（UC04、UC05）', `
    <div class="tabs">
      <button class="tab ${W.dentTab === '已到诊' ? 'active' : ''}" onclick="W.dentTabSet('已到诊')">已到诊</button>
      <button class="tab ${W.dentTab === '治疗完成' ? 'active' : ''}" onclick="W.dentTabSet('治疗完成')">治疗完成</button>
      <button class="tab ${W.dentTab === '' ? 'active' : ''}" onclick="W.dentTabSet('')">全部</button>
    </div>
    <div class="card"><div class="tbl-wrap"><table class="tbl" id="dent-table"></table></div></div>`);
  W.dentRender();
}

W.dentTabSet = function (t) { W.dentTab = t; viewMyVisits(); };

W.dentRender = async function () {
  await safe(async () => {
    const me = API.user.dentist_id;
    const q = new URLSearchParams({ dentist_id: me });
    if (W.dentTab) q.set('status', W.dentTab);
    const list = await API.get('/visits?' + q.toString());
    document.getElementById('dent-table').innerHTML = `
      <tr><th>就诊号</th><th>患者</th><th>诊所</th><th>时间</th><th>状态</th><th>期望治疗</th><th></th></tr>
      ${list.map(v => `<tr>
        <td class="mono">${esc(v.visit_no)}</td>
        <td>${esc(v.patient_name)}<br><span class="muted">${esc(v.patient_account)}</span></td>
        <td>${esc(v.clinic_code)}</td><td>${dt(v.scheduled_start)}</td>
        <td>${badge(v.status)}</td><td class="muted">${esc(v.requested_treatments || '—')}</td>
        <td><button class="btn btn-sm btn-primary" onclick="W.treatOpen(${v.visit_id})">接诊</button></td>
      </tr>`).join('') || `<tr><td colspan="7">${empty('暂无接诊任务')}</td></tr>`}`;
  });
};

W.treatOpen = async function (vid) {
  window._treatVid = vid;
  await safe(async () => {
    const v = await API.get('/visits/' + vid);
    const m = await meta();
    const md = modal(`
      <div class="kv">
        <dt>就诊号</dt><dd class="mono">${esc(v.visit_no)}</dd>
        <dt>患者</dt><dd>${esc(v.patient.name)}（${esc(v.patient.account_no)}）· ${esc(v.patient.phone)}</dd>
        <dt>诊所</dt><dd>${esc(v.clinic_code)} · ${dt(v.scheduled_start)}</dd>
        <dt>期望治疗</dt><dd>${esc(v.requested_treatments || '—')}（只记录不计费）</dd>
        ${v.special_needs ? `<dt>特殊需求</dt><dd><b style="color:var(--red)">${esc(v.special_needs)}</b></dd>` : ''}
      </div>
      <div class="section-title">🧾 诊前核对：过敏逐项复核</div>
      ${v.allergies.length ? `<ul class="allergy-list">${v.allergies.map(a => `
        <li><b style="min-width:70px">${esc(a.allergy_name)}</b> ${badge(a.status)}
          <span class="muted" style="flex:1">${esc(a.note || '')}</span>
          ${a.status !== '已确认' ? `<button class="btn btn-sm btn-ghost" onclick="W.allergyConfirm(${v.patient.patient_id},${a.allergy_type_id})">已复核，确认</button>` : ''}
        </li>`).join('')}</ul>` : `<p class="hint">无已记录过敏（${esc(v.patient.allergy_inquiry_status)}）· 本次问诊结果按项记录</p>`}
      <div class="section-title">🩺 实际治疗（签署确认后进入结算）</div>
      <div class="tbl-wrap"><table class="tbl"><tr><th>项目</th><th>单位数</th><th>单价</th><th>小计</th><th>执行</th><th>状态</th><th>操作</th></tr>
        ${v.treatments.map(t => `<tr>
          <td>${esc(t.treatment_name)}${t.note ? `<br><span class="muted">${esc(t.note)}</span>` : ''}</td>
          <td class="num">${t.units} ${esc(t.unit_name)}</td><td class="num">${money(t.unit_price)}</td>
          <td class="num">${money(t.units * t.unit_price)}</td><td>${esc(t.performer_name)}</td>
          <td>${badge(t.status)}${t.version_no > 1 ? `<br><span class="muted">版本 v${t.version_no}</span>` : ''}</td>
          <td><div class="btn-row">
            ${t.status === '草稿' ? `<button class="btn btn-sm btn-primary" onclick="W.treatConfirm(${t.treatment_id})">签署确认</button>` : ''}
            ${t.status === '已确认' ? `<button class="btn btn-sm btn-ghost" onclick="W.treatReviseModal(${t.treatment_id})">更正</button>` : ''}
          </div></td></tr>`).join('')}</table></div>
      ${v.status === '已到诊' ? `
      <div class="section-title">➕ 记录实际治疗（预约之外的新增项目单独一行）</div>
      <div class="form-row cols-3">
        <label>项目<select id="tr-type">${m.treatment_types.map(t =>
          `<option value="${t.treatment_type_id}" data-price="${t.default_unit_price}" data-unit="${esc(t.unit_name)}" data-frac="${t.allows_fraction}">${esc(t.treatment_name)}（¥${t.default_unit_price}/${esc(t.unit_name)}）</option>`).join('')}</select></label>
        <label>标准单位数<input id="tr-units" type="number" step="0.01" min="0.01" value="1"></label>
        <label>单位价格（快照）<input id="tr-price" type="number" step="0.01" min="0"></label>
      </div>
      <div class="form-row"><label>备注<textarea id="tr-note" rows="1"></textarea></label>
        <div class="btn-row"><button class="btn btn-primary" onclick="W.treatAdd(${vid})">添加治疗行</button></div></div>
      <p class="hint">单位数、单价与执行牙医逐项保存；确认后的修改进入更正流程并保留原版本，不无痕覆盖。</p>` : ''}
      <div class="section-title">🧮 结算单</div>
      ${v.invoice ? invoiceHtml(v.invoice) : '<p class="hint">尚未开单，由前台/财务按已签署治疗生成。</p>'}`, { wide: true });
    md.setTitle(`接诊 ${v.visit_no} · ${v.patient.name}`);
    md.setFoot(`<button class="btn btn-ghost" onclick="closeModal()">关闭</button>
      <button class="btn btn-primary" onclick="closeModal();W.dentRender()">完成，刷新列表</button>`);
  });
};

W.allergyConfirm = async function (pid, allergy_type_id) {
  await safe(async () => {
    await API.post(`/patients/${pid}/allergies`, { allergy_type_id, status: '已确认' });
    toast('过敏已由牙医复核确认'); closeModal(); W.dentRender();
  });
};

W.treatAdd = async function (vid) {
  await safe(async () => {
    const sel = document.getElementById('tr-type').selectedOptions[0];
    await API.post(`/visits/${vid}/treatments`, {
      treatment_type_id: Number(sel.value),
      units: Number(document.getElementById('tr-units').value),
      unit_price: document.getElementById('tr-price').value ? Number(document.getElementById('tr-price').value) : null,
      note: document.getElementById('tr-note').value.trim(),
    });
    toast('治疗行已记录（草稿，待签署）'); closeModal();
    const v = await API.get('/visits/' + vid);
    W.treatOpen(vid);
  });
};

W.treatConfirm = async function (tid) {
  await safe(async () => {
    await API.post(`/treatments/${tid}/confirm`);
    toast('已签署确认，进入结算');
    const v = await API.get('/visits/' + window._treatVid);
    W.treatOpen(window._treatVid);
  });
};

W.treatReviseModal = function (tid) {
  modal(`<div class="form-row cols-2">
      <label>更正后单位数<input id="rv-units" type="number" step="0.01" min="0.01"></label>
      <label>更正后单价<input id="rv-price" type="number" step="0.01" min="0"></label>
    </div>
    <div class="form-row"><label>更正原因<textarea id="rv-note" rows="2"></textarea></label></div>
    <p class="hint">更正将新建治疗版本；已开单的结算单会生成同单新版本，历史版本全部保留。</p>`, {
    onMount: m => { m.setTitle('治疗更正（保留原版本）'); m.setFoot(`
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-danger" onclick="W.treatReviseDo(${tid})">提交更正</button>`); },
  });
};
W.treatReviseDo = function (tid) {
  safe(async () => {
    await API.post(`/treatments/${tid}/revise`, {
      units: document.getElementById('rv-units').value ? Number(document.getElementById('rv-units').value) : null,
      unit_price: document.getElementById('rv-price').value ? Number(document.getElementById('rv-price').value) : null,
      note: document.getElementById('rv-note').value.trim(),
    });
    closeModal(); toast('更正已生成新版本（草稿），请再次签署确认');
    W.treatOpen(window._treatVid);
  });
};
