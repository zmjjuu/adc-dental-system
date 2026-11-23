/* ADC — 总部经理视图：运营报表（UC11）、标准化检查、审计（UC12） */
W.repYear = 2026; W.repQ = 4;

async function viewReports() {
  page('运营报表 · 取消率 / 未到诊率 / 标准化检查（UC11）', `
    <div class="card">
      <div class="btn-row" style="margin-bottom:12px">
        <select id="rp-year" style="padding:8px;border:1px solid var(--line);border-radius:8px">
          <option>2026</option><option>2025</option></select>
        <select id="rp-q" style="padding:8px;border:1px solid var(--line);border-radius:8px">
          <option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option>
          <option value="4" selected>Q4</option></select>
        <button class="btn btn-primary" onclick="W.repLoad()">查询</button>
      </div>
      <div id="rep-body"></div>
    </div>`);
  W.repLoad();
}

W.repLoad = async function () {
  await safe(async () => {
    const year = Number(document.getElementById('rp-year').value);
    const q = Number(document.getElementById('rp-q').value);
    const rep = await API.get(`/reports/cancellation?year=${year}&quarter=${q}`);
    const t = rep.total;
    const std = API.hasRole('ops') || API.hasRole('hq') ? await API.get('/reports/standardization') : null;
    document.getElementById('rep-body').innerHTML = `
      <p class="hint">统计口径：分母 = 预约开始时间落入 ${year} Q${q} 且截至 ${dt(rep.cutoff)} 已到期的有效预约。
        排除改约原记录与诊所撤销；患者主动取消保留在分母中；未来预约不计入（当前有 <b>${rep.future_excluded}</b> 条）。</p>
      <div class="grid cols-3" style="margin:14px 0">
        <div class="stat"><b>${t.denominator}</b><span>到期预约总数（分母）</span></div>
        <div class="stat warn"><b>${t.cancel_rate != null ? t.cancel_rate + '%' : '—'}</b><span>患者取消率（${t.cancelled} 笔）</span></div>
        <div class="stat danger"><b>${t.noshow_rate != null ? t.noshow_rate + '%' : '—'}</b><span>未到诊率（${t.noshow} 笔）</span></div>
        <div class="stat"><b>${t.arrived}</b><span>已到诊</span></div>
        <div class="stat"><b>${t.pending}</b><span>待核实（单列，不算取消）</span></div>
        <div class="stat"><b>${rep.future_excluded}</b><span>未来预约（不入分母）</span></div>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <tr><th>诊所</th><th>分母</th><th>已到诊</th><th>患者取消</th><th>未到诊</th><th>待核实</th><th>取消率</th><th>未到诊率</th></tr>
        ${rep.rows.map(r => `<tr><td>${esc(r.clinic_code)}</td><td class="num">${r.denominator}</td>
          <td class="num">${r.arrived}</td><td class="num">${r.cancelled}</td><td class="num">${r.noshow}</td>
          <td class="num">${r.pending}</td>
          <td class="num">${r.cancel_rate != null ? r.cancel_rate + '%' : '<span class="muted">无适用数据</span>'}</td>
          <td class="num">${r.noshow_rate != null ? r.noshow_rate + '%' : '<span class="muted">无适用数据</span>'}</td>
        </tr>`).join('')}</table></div>
      ${std ? `
      <div class="section-title">🔍 标准化检查（记录缺项可下钻到具体记录）</div>
      <div class="grid cols-3">
        <div class="stat ${std.allergy_not_asked ? 'warn' : ''}"><b>${std.allergy_not_asked}</b><span>过敏尚未询问的患者</span></div>
        <div class="stat ${std.allergy_pending ? 'warn' : ''}"><b>${std.allergy_pending}</b><span>待核实过敏记录</span></div>
        <div class="stat ${std.draft_treatments ? 'warn' : ''}"><b>${std.draft_treatments}</b><span>未签署治疗版本</span></div>
        <div class="stat ${std.arrived_no_invoice.length ? 'warn' : ''}"><b>${std.arrived_no_invoice.length}</b><span>已到诊未开单</span></div>
        <div class="stat ${std.pending_costs.length ? 'danger' : ''}"><b>${std.pending_costs.length}</b><span>待分摊/待确认费用</span></div>
        <div class="stat ${std.dentists_no_verified_qual.length ? 'warn' : ''}"><b>${std.dentists_no_verified_qual.length}</b><span>在职牙医无已核实资质</span></div>
      </div>
      ${std.arrived_no_invoice.length ? `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl">
        <tr><th>未开单就诊</th><th>患者</th><th>时间</th></tr>
        ${std.arrived_no_invoice.map(v => `<tr><td class="mono">${esc(v.visit_no)}</td><td>${esc(v.patient_name)}</td><td>${dt(v.scheduled_start)}</td></tr>`).join('')}
      </table></div>` : ''}
      ${std.pending_costs.length ? `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl">
        <tr><th>未确认费用</th><th>类别</th><th>金额</th><th>状态</th></tr>
        ${std.pending_costs.map(c => `<tr><td class="mono">${esc(c.document_no)}#${c.line_no}</td><td>${esc(c.cost_kind)}</td>
          <td class="num">${money(c.amount)}</td><td>${badge(c.status)}</td></tr>`).join('')}
      </table></div>` : ''}` : ''}`;
  });
};

async function viewAudit() {
  page('操作记录 · 重要变更留痕：操作者、时间、原因（UC12）', `
    <div class="card">
      <div class="btn-row" style="margin-bottom:12px">
        <button class="btn btn-ghost" onclick="W.auditLoad()">刷新</button>
        <span class="hint">审计日志只追加，不提供删除入口；重要业务变更与审计同事务提交。</span>
      </div>
      <div id="audit-list"></div>
    </div>`);
  W.auditLoad();
}

W.auditLoad = async function () {
  await safe(async () => {
    const list = await API.get('/audit?limit=80');
    document.getElementById('audit-list').innerHTML = list.map(a => `
      <div class="audit-line">
        <b>${esc(a.action)}</b> · ${esc(a.entity_type)} ${esc(a.entity_key)}
        ${a.reason ? ` · <span class="muted">${esc(a.reason)}</span>` : ''}
        <span class="muted"> · ${esc(a.operator_name || '—')} · ${dt(a.happened_at)}</span>
        ${a.before_value ? `<br><span class="muted mono">改前 ${esc(a.before_value)}</span>` : ''}
        ${a.after_value ? `<br><span class="muted mono">改后 ${esc(a.after_value)}</span>` : ''}
      </div>`).join('') || empty('暂无审计记录');
  });
}
