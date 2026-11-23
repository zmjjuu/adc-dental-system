/* ADC — 运营经理视图：牙医与资质（UC07）、诊所与出诊（UC08）、治疗项目目录 */

/* ================= 牙医管理 ================= */
async function viewOpsDentists() {
  page('牙医与资质 · 一人多资质 / 资质依据与核实状态（UC07）', `
    <div class="card">
      <div class="btn-row" style="margin-bottom:12px">
        <button class="btn btn-primary" onclick="W.dentistCreateModal()">＋ 新增牙医</button>
      </div>
      <div class="tbl-wrap"><table class="tbl" id="dent-mgr-table"></table></div>
    </div>`);
  W.opsDentRender();
}

W.opsDentRender = async function () {
  await safe(async () => {
    const m = await meta();
    document.getElementById('dent-mgr-table').innerHTML = `
      <tr><th>编号</th><th>姓名</th><th>电话 / 邮箱</th><th>状态</th><th>资质（多对多）</th><th></th></tr>
      ${m.dentists.map(d => `<tr>
        <td class="mono">${esc(d.employee_no)}</td><td>${esc(d.name)}<br><span class="muted">${d(d.birth_date)}</span></td>
        <td>${esc(d.phone)}<br><span class="muted">${esc(d.email)}</span></td>
        <td>${d.active ? '<span class="badge b-已确认">在职</span>' : '<span class="badge b-未到诊">已停用</span>'}</td>
        <td><div class="qual-tags">${d.qualifications.map(q =>
          `<span class="qual-tag" title="证书 ${esc(q.certificate_no || '—')}">${esc(q.qualification_name)} · ${esc(q.verification_status)}</span>`).join('') || '<span class="muted">无</span>'}</div></td>
        <td><div class="btn-row">
          <button class="btn btn-sm btn-ghost" onclick="W.dentQualModal(${d.dentist_id})">＋资质</button>
          <button class="btn btn-sm ${d.active ? 'btn-danger' : 'btn-primary'}" onclick="W.dentToggle(${d.dentist_id},${d.active ? 0 : 1})">${d.active ? '停用' : '恢复'}</button>
        </div></td>
      </tr>`).join('')}`;
  });
};

W.dentistCreateModal = async function () {
  const m = await meta();
  const md = modal(`
    <div class="form-row cols-2">
      <label>员工编号<b>*</b><input id="dn-no" placeholder="如 D-3016"></label>
      <label>姓名<b>*</b><input id="dn-name"></label>
    </div>
    <div class="form-row cols-2">
      <label>出生日期<b>*</b><input type="date" id="dn-birth"></label>
      <label>电话<b>*</b><input id="dn-phone"></label>
    </div>
    <div class="form-row cols-2">
      <label>家庭住址<b>*</b><input id="dn-addr"></label>
      <label>邮箱<b>*</b><input id="dn-email"></label>
    </div>
    <div class="section-title">持有资质（可多选，多对多关系）</div>
    ${m.qualifications.map(q => `<label style="display:inline-flex;align-items:center;gap:6px;margin:4px 12px 4px 0">
      <input type="checkbox" value="${q.qualification_id}" class="dn-qual">${esc(q.qualification_name)}</label>`).join('')}`)
  ;
  md.setTitle('新增牙医');
  md.setFoot(`<button class="btn btn-ghost" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="W.dentistCreateDo()">保存</button>`);
};

W.dentistCreateDo = async function () {
  const v = id => document.getElementById(id).value.trim();
  await safe(async () => {
    await API.post('/dentists', {
      employee_no: v('dn-no'), name: v('dn-name'), birth_date: v('dn-birth'),
      home_address: v('dn-addr'), phone: v('dn-phone'), email: v('dn-email'),
      qualifications: [...document.querySelectorAll('.dn-qual:checked')].map(c => ({
        qualification_id: Number(c.value), verification_status: '已核实',
        certificate_no: 'ZC-' + v('dn-no') + '-' + c.value, valid_from: '2025-01-01',
      })),
    });
    closeModal(); toast('牙医已建档'); _meta = null; W.opsDentRender();
  });
};

W.dentQualModal = async function (did) {
  const m = await meta();
  const held = new Set(m.dentists.find(d => d.dentist_id === did).qualifications.map(q => q.qualification_id));
  const md = modal(`
    <div class="form-row"><label>选择资质<select id="dq-id">
      ${m.qualifications.filter(q => !held.has(q.qualification_id)).map(q =>
        `<option value="${q.qualification_id}">${esc(q.qualification_name)}</option>`).join('')}
    </select></label></div>
    <div class="form-row cols-2">
      <label>证书编号<input id="dq-cert"></label>
      <label>核实状态<select id="dq-status"><option>未核实</option><option>已核实</option><option>已失效</option></select></label>
    </div>
    <div class="form-row"><label>生效日期<input type="date" id="dq-from" value="2025-01-01"></label></div>
    <p class="hint">未核实资质不会自动认定为符合新项目要求；资质撤销不删除历史治疗。</p>`);
  md.setTitle('新增牙医资质');
  md.setFoot(`<button class="btn btn-ghost" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="W.dentQualDo(${did})">保存</button>`);
};
W.dentQualDo = async function (did) {
  await safe(async () => {
    await API.post(`/dentists/${did}/qualifications`, {
      qualification_id: Number(document.getElementById('dq-id').value),
      certificate_no: document.getElementById('dq-cert').value.trim(),
      verification_status: document.getElementById('dq-status').value,
      valid_from: document.getElementById('dq-from').value,
    });
    closeModal(); toast('资质已保存'); _meta = null; W.opsDentRender();
  });
};

W.dentToggle = function (did, active) {
  safe(async () => {
    await API.put(`/dentists/${did}`, { active });
    toast(active ? '已恢复（历史就诊与绩效关联保留）' : '已停用（历史就诊与绩效关联保留）');
    _meta = null; W.opsDentRender();
  });
};

/* ================= 诊所管理 ================= */
async function viewOpsClinics() {
  page('诊所资料 · 门店主档（邮政地址、主管、面积）', `
    <div class="card">
      <div class="btn-row" style="margin-bottom:12px">
        <button class="btn btn-primary" onclick="W.clinicCreateModal()">＋ 新增诊所</button>
      </div>
      <div class="tbl-wrap"><table class="tbl" id="clinic-table"></table></div>
    </div>`);
  await safe(async () => {
    const m = await meta();
    document.getElementById('clinic-table').innerHTML = `
      <tr><th>代码</th><th>地址</th><th>主管</th><th>电话 / 邮箱</th><th>面积</th></tr>
      ${m.clinics.map(c => `<tr><td class="mono">${esc(c.clinic_code)}</td><td>${esc(c.postal_address)}</td>
        <td>${esc(c.manager_name)}</td><td>${esc(c.phone)}<br><span class="muted">${esc(c.email)}</span></td>
        <td class="num">${c.area_m2} m²</td></tr>`).join('')}`;
  });
}

W.clinicCreateModal = function () {
  const md = modal(`
    <div class="form-row cols-2">
      <label>门店代码<b>*</b><input id="cl-code" placeholder="如 C-C03"></label>
      <label>主管姓名<b>*</b><input id="cl-mgr"></label>
    </div>
    <div class="form-row"><label>邮政地址<b>*</b><input id="cl-addr"></label></div>
    <div class="form-row cols-2">
      <label>电话<b>*</b><input id="cl-phone"></label>
      <label>邮箱<b>*</b><input id="cl-email"></label>
    </div>
    <div class="form-row"><label>办公面积（m²）<b>*</b><input id="cl-area" type="number" step="0.01" min="0.01"></label></div>`);
  md.setTitle('新增诊所');
  md.setFoot(`<button class="btn btn-ghost" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="W.clinicCreateDo()">保存</button>`);
};
W.clinicCreateDo = async function () {
  const v = id => document.getElementById(id).value.trim();
  await safe(async () => {
    await API.post('/clinics', {
      clinic_code: v('cl-code'), postal_address: v('cl-addr'), manager_name: v('cl-mgr'),
      phone: v('cl-phone'), email: v('cl-email'), area_m2: Number(v('cl-area')),
    });
    closeModal(); toast('诊所已建档'); _meta = null; viewOpsClinics();
  });
};

/* ================= 出诊安排 ================= */
async function viewOpsSchedules() {
  page('跨店出诊 · 牙医在哪家诊所的哪些时段出诊（UC08）', `
    <div class="card">
      <div class="btn-row" style="margin-bottom:12px">
        <button class="btn btn-primary" onclick="W.schedCreateModal()">＋ 新增出诊安排</button>
      </div>
      <div class="tbl-wrap"><table class="tbl" id="sched-table"></table></div>
    </div>`);
  await safe(async () => {
    const list = await API.get('/schedules');
    document.getElementById('sched-table').innerHTML = `
      <tr><th>牙医</th><th>诊所</th><th>开始</th><th>结束</th><th>状态</th></tr>
      ${list.map(s => `<tr><td>${esc(s.dentist_name)}（${esc(s.employee_no)}）</td><td>${esc(s.clinic_code)}</td>
        <td>${dt(s.start_at)}</td><td>${dt(s.end_at)}</td><td>${esc(s.status)}</td></tr>`).join('')}`;
  });
}

W.schedCreateModal = async function () {
  const m = await meta();
  const md = modal(`
    <div class="form-row cols-2">
      <label>牙医<select id="sc-dentist">${m.dentists.filter(d => d.active).map(d =>
        `<option value="${d.dentist_id}">${esc(d.employee_no)} ${esc(d.name)}</option>`).join('')}</select></label>
      <label>诊所<select id="sc-clinic">${m.clinics.map(c =>
        `<option value="${c.clinic_id}">${esc(c.clinic_code)}</option>`).join('')}</select></label>
    </div>
    <div class="form-row cols-2">
      <label>开始时间<b>*</b><input type="datetime-local" id="sc-start" value="2026-11-23T09:00"></label>
      <label>结束时间<b>*</b><input type="datetime-local" id="sc-end" value="2026-11-23T18:00"></label>
    </div>
    <p class="hint">同一牙医的有效出诊时段不允许跨店重叠；跨店转场间隔需人工核实。</p>`);
  md.setTitle('新增出诊安排');
  md.setFoot(`<button class="btn btn-ghost" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="W.schedCreateDo()">保存</button>`);
};
W.schedCreateDo = async function () {
  await safe(async () => {
    await API.post('/schedules', {
      dentist_id: Number(document.getElementById('sc-dentist').value),
      clinic_id: Number(document.getElementById('sc-clinic').value),
      start_at: document.getElementById('sc-start').value,
      end_at: document.getElementById('sc-end').value,
    });
    closeModal(); toast('出诊安排已保存（重叠会被拒绝）'); viewOpsSchedules();
  });
};

/* ================= 治疗项目目录 ================= */
async function viewOpsCatalog() {
  page('治疗项目目录 · 标准单位价 / 小数单位 / 所需资质（ANY/ALL）', `
    <div class="card">
      <div class="btn-row" style="margin-bottom:12px">
        <button class="btn btn-primary" onclick="W.catalogCreateModal()">＋ 新增治疗项目</button>
      </div>
      <div class="tbl-wrap"><table class="tbl" id="catalog-table"></table></div>
    </div>`);
  await safe(async () => {
    const m = await meta();
    const quals = m.qualifications;
    document.getElementById('catalog-table').innerHTML = `
      <tr><th>代码</th><th>名称</th><th>单位</th><th>标准价</th><th>小数单位</th><th>所需资质</th></tr>
      ${m.treatment_types.map(t => `<tr>
        <td class="mono">${esc(t.treatment_code)}</td><td>${esc(t.treatment_name)}</td>
        <td>${esc(t.unit_name)}</td><td class="num">${money(t.default_unit_price)}</td>
        <td>${t.allows_fraction ? '允许' : '<span class="muted">不允许</span>'}</td>
        <td><div class="qual-tags">${(t.requirement_names || []).length ? t.requirement_names.map(n =>
          `<span class="qual-tag">${esc(n)}</span>`).join('') : '<span class="muted">无（全部牙医可做）</span>'}</div></td>
      </tr>`).join('')}`;
  });
}

W.catalogCreateModal = async function () {
  const m = await meta();
  const md = modal(`
    <div class="form-row cols-3">
      <label>项目代码<b>*</b><input id="ct-code" placeholder="如 WHITEN"></label>
      <label>项目名称<b>*</b><input id="ct-name" placeholder="如 冷光美白"></label>
      <label>单位<b>*</b><input id="ct-unit" placeholder="次/颗"></label>
    </div>
    <div class="form-row cols-2">
      <label>标准单位价<b>*</b><input id="ct-price" type="number" step="0.01" min="0"></label>
      <label>小数单位<select id="ct-frac"><option value="0">不允许</option><option value="1">允许</option></select></label>
    </div>
    <div class="section-title">所需资质（用于预约时筛选候选牙医；不选 = 全部牙医可做）</div>
    ${m.qualifications.map(q => `<label style="display:inline-flex;align-items:center;gap:6px;margin:4px 12px 4px 0">
      <input type="checkbox" value="${q.qualification_id}" class="ct-qual">${esc(q.qualification_name)}</label>`).join('')}
    <div class="form-row"><label>匹配模式<select id="ct-mode"><option value="ANY">ANY（具备其一即可）</option><option value="ALL">ALL（须全部具备）</option></select></label></div>`);
  md.setTitle('新增治疗项目');
  md.setFoot(`<button class="btn btn-ghost" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="W.catalogCreateDo()">保存</button>`);
};
W.catalogCreateDo = async function () {
  const v = id => document.getElementById(id).value.trim();
  await safe(async () => {
    await API.post('/treatment-types', {
      treatment_code: v('ct-code'), treatment_name: v('ct-name'), unit_name: v('ct-unit'),
      default_unit_price: Number(v('ct-price')),
      allows_fraction: document.getElementById('ct-frac').value === '1',
      qualification_match_mode: document.getElementById('ct-mode').value,
      qualification_ids: [...document.querySelectorAll('.ct-qual:checked')].map(c => Number(c.value)),
    });
    closeModal(); toast('治疗项目已入目录'); _meta = null; viewOpsCatalog();
  });
};
