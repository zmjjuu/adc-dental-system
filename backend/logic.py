# -*- coding: utf-8 -*-
"""ADC 业务规则层。实现设计文档中的关键规则：
预约防重与冲突检查（UC02）、状态流转（UC03/UC04）、治疗版本与签署（UC05）、
一就诊一结算单与更正版本链（UC06）、费用分摊（UC09）、季度核算 10% 基金（UC10）、
取消率口径（UC11）、操作留痕（UC12）。金额按行舍入后汇总，保留两位小数。
"""
from datetime import datetime, timedelta
import json

ACTIVE_VISIT_STATUSES = ('待到诊', '已到诊', '治疗完成')  # 占用牙医时段的预约状态


class BizError(Exception):
    """业务规则拒绝，消息可直接展示给操作者。"""


def _begin(conn):
    """开始事务；若已在事务中（如初始化种子）则复用外层事务。返回是否由本函数开启。"""
    if not conn.in_transaction:
        conn.execute("BEGIN IMMEDIATE")
        return True
    return False


def _rollback(conn, started):
    if started:
        conn.rollback()


def m2(x):
    return round(float(x) + 1e-9, 2)


def split_amount(amount, n):
    """把金额按分精确拆成 n 份（最后一组拿余数），保证合计恰好等于原金额。"""
    if n <= 0:
        return []
    cents = int(round(amount * 100))
    base, rem = divmod(cents, n)
    return [(base + (1 if i >= n - rem else 0)) / 100.0 for i in range(n)]


def parse_dt(s):
    if isinstance(s, datetime):
        return s
    s = str(s).strip().replace('T', ' ')
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d'):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    raise BizError(f'时间格式不正确：{s}')


def audit(conn, user_id, entity_type, entity_key, action, reason=None, before=None, after=None):
    conn.execute("INSERT INTO audit_logs (user_id, entity_type, entity_key, action, happened_at,"
                 " reason, before_value, after_value) VALUES (?,?,?,?,?,?,?,?)",
                 (user_id, entity_type, str(entity_key), action, datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                  reason, json.dumps(before, ensure_ascii=False) if before is not None else None,
                  json.dumps(after, ensure_ascii=False) if after is not None else None))


def next_visit_no(conn, dt):
    day = dt.strftime('%Y%m%d')
    n = conn.execute("SELECT COUNT(*) c FROM visits WHERE visit_no LIKE ?", (f'V-{day}-%',)).fetchone()['c']
    return f'V-{day}-{n + 1:04d}'


def next_invoice_no(conn, dt):
    month = dt.strftime('%Y%m')
    n = conn.execute("SELECT COUNT(*) c FROM invoices WHERE invoice_no LIKE ?", (f'INV-{month}-%',)).fetchone()['c']
    return f'INV-{month}-{n + 1:04d}'


def quarter_range(year, quarter):
    q_start = datetime(year, (quarter - 1) * 3 + 1, 1)
    q_end = datetime(year, quarter * 3 + 1, 1) if quarter < 4 else datetime(year + 1, 1, 1)
    return q_start, q_end


# ---------------- 预约（UC02） ----------------

def check_schedule_cover(conn, dentist_id, clinic_id, start, end):
    row = conn.execute("SELECT 1 FROM dentist_schedules WHERE dentist_id=? AND clinic_id=? AND status='有效'"
                       " AND start_at<=? AND end_at>=?", (dentist_id, clinic_id, start, end)).fetchone()
    if not row:
        raise BizError('该牙医在所选诊所未覆盖该时段的出诊安排，请更换时段或诊所')


def find_dentist_conflicts(conn, dentist_id, start, end, exclude_visit_id=None):
    sql = ("SELECT * FROM visits WHERE dentist_id=? AND status IN ('待到诊','已到诊','治疗完成')"
           " AND scheduled_start < ? AND scheduled_end > ?")
    args = [dentist_id, end, start]
    if exclude_visit_id:
        sql += " AND visit_id != ?"
        args.append(exclude_visit_id)
    return conn.execute(sql, args).fetchall()


def check_qualification_ok(conn, dentist_id, treatment_type_id):
    """按治疗项目配置筛选牙医资质（ANY/ALL 模式，取已核实资质）。"""
    if not treatment_type_id:
        return
    tt = conn.execute("SELECT * FROM treatment_types WHERE treatment_type_id=?",
                      (treatment_type_id,)).fetchone()
    if not tt:
        raise BizError('治疗项目不存在')
    reqs = [r['qualification_id'] for r in conn.execute(
        "SELECT qualification_id FROM treatment_qualification_requirements WHERE treatment_type_id=?",
        (treatment_type_id,)).fetchall()]
    if not reqs:
        return
    held = {r['qualification_id'] for r in conn.execute(
        "SELECT qualification_id FROM dentist_qualifications WHERE dentist_id=? AND verification_status='已核实'",
        (dentist_id,)).fetchall()}
    ok = held.issuperset(reqs) if tt['qualification_match_mode'] == 'ALL' else bool(held & set(reqs))
    if not ok:
        raise BizError(f'该牙医缺少项目「{tt["treatment_name"]}」所需资质，请选择其他牙医')


def validate_booking(conn, patient_id, clinic_id, dentist_id, start, end, treatment_type_id,
                     exclude_visit_id=None):
    if not conn.execute("SELECT 1 FROM patients WHERE patient_id=?", (patient_id,)).fetchone():
        raise BizError('患者不存在')
    if not conn.execute("SELECT 1 FROM clinics WHERE clinic_id=? AND active=1", (clinic_id,)).fetchone():
        raise BizError('诊所不存在或已停用')
    d = conn.execute("SELECT * FROM dentists WHERE dentist_id=?", (dentist_id,)).fetchone()
    if not d:
        raise BizError('牙医不存在')
    if not d['active']:
        raise BizError('该牙医已停用，不能安排预约')
    if start >= end:
        raise BizError('预约开始时间必须早于结束时间')
    check_schedule_cover(conn, dentist_id, clinic_id, start, end)
    conflicts = find_dentist_conflicts(conn, dentist_id, start, end, exclude_visit_id)
    if conflicts:
        c = conflicts[0]
        raise BizError(f'牙医 {d["name"]} 该时段已有预约（{c["visit_no"]}），请选择其他时段')
    check_qualification_ok(conn, dentist_id, treatment_type_id)


def book_visit(conn, patient_id, clinic_id, dentist_id, scheduled_start, scheduled_end,
               requested_treatments='', special_needs=None, treatment_type_id=None, user_id=None, now=None):
    start, end = parse_dt(scheduled_start), parse_dt(scheduled_end)
    now = now or datetime.now()
    started = _begin(conn)  # 并发防重：同一牙医同一时段仅一笔成功
    try:
        validate_booking(conn, patient_id, clinic_id, dentist_id, start, end, treatment_type_id)
        visit_id = conn.execute(
            "INSERT INTO visits (visit_no, patient_id, dentist_id, clinic_id, scheduled_start,"
            " scheduled_end, requested_treatments, special_needs, attended, status, created_by)"
            " VALUES (?,?,?,?,?,?,?,?,0,'待到诊',?)",
            (next_visit_no(conn, now), patient_id, dentist_id, clinic_id,
             start.strftime('%Y-%m-%d %H:%M:%S'), end.strftime('%Y-%m-%d %H:%M:%S'),
             requested_treatments, special_needs, user_id)).lastrowid
        audit(conn, user_id, 'visits', visit_id, '创建预约',
              reason=requested_treatments,
              after={'clinic_id': clinic_id, 'dentist_id': dentist_id,
                     'scheduled_start': start.strftime('%Y-%m-%d %H:%M:%S')})
        conn.commit()
        return visit_id
    except BaseException:
        _rollback(conn, started)
        raise


# ---------------- 到诊 / 取消 / 改约 / 未到诊（UC03、UC04） ----------------

def _get_visit(conn, visit_id):
    v = conn.execute("SELECT * FROM visits WHERE visit_id=?", (visit_id,)).fetchone()
    if not v:
        raise BizError('预约不存在')
    return v


def checkin_visit(conn, visit_id, user_id, now=None):
    now = now or datetime.now()
    v = _get_visit(conn, visit_id)
    if v['status'] not in ('待到诊', '待核实'):
        raise BizError(f'当前状态「{v["status"]}」不能登记到诊')
    conn.execute("UPDATE visits SET status='已到诊', attended=1, arrived_at=? WHERE visit_id=?",
                 (now.strftime('%Y-%m-%d %H:%M:%S'), visit_id))
    audit(conn, user_id, 'visits', visit_id, '登记到诊',
          before={'status': v['status'], 'attended': v['attended']},
          after={'status': '已到诊', 'attended': 1})
    conn.commit()


def cancel_visit(conn, visit_id, user_id, initiator, reason, now=None):
    now = now or datetime.now()
    v = _get_visit(conn, visit_id)
    if v['status'] not in ('待到诊', '待核实'):
        raise BizError(f'当前状态「{v["status"]}」不能按普通取消处理（已到诊或已有治疗须走更正流程）')
    if initiator not in ('患者', '诊所'):
        raise BizError('取消发起方只能是患者或诊所')
    new_status = '患者取消' if initiator == '患者' else '诊所撤销'
    conn.execute("UPDATE visits SET status=?, cancelled_at=?, cancel_initiator=?, reason=?"
                 " WHERE visit_id=?",
                 (new_status, now.strftime('%Y-%m-%d %H:%M:%S'), initiator, reason, visit_id))
    audit(conn, user_id, 'visits', visit_id, '取消预约',
          reason=reason, before={'status': v['status']}, after={'status': new_status})
    conn.commit()


def reschedule_visit(conn, visit_id, user_id, clinic_id, dentist_id, scheduled_start, scheduled_end,
                     reason, now=None):
    now = now or datetime.now()
    v = _get_visit(conn, visit_id)
    if v['status'] not in ('待到诊', '待核实'):
        raise BizError(f'当前状态「{v["status"]}」不能改约')
    start, end = parse_dt(scheduled_start), parse_dt(scheduled_end)
    started = _begin(conn)
    try:
        validate_booking(conn, v['patient_id'], clinic_id, dentist_id, start, end, None,
                         exclude_visit_id=visit_id)
        new_id = conn.execute(
            "INSERT INTO visits (visit_no, patient_id, dentist_id, clinic_id, scheduled_start,"
            " scheduled_end, requested_treatments, special_needs, attended, status, previous_visit_id,"
            " reason, created_by) VALUES (?,?,?,?,?,?,?,?,0,'待到诊',?,?,?)",
            (next_visit_no(conn, now), v['patient_id'], dentist_id, clinic_id,
             start.strftime('%Y-%m-%d %H:%M:%S'), end.strftime('%Y-%m-%d %H:%M:%S'),
             v['requested_treatments'], v['special_needs'], visit_id,
             f'改约原因：{reason}', user_id)).lastrowid
        conn.execute("UPDATE visits SET status='已改约', reason=? WHERE visit_id=?", (reason, visit_id))
        audit(conn, user_id, 'visits', new_id, '改约',
              reason=reason, after={'previous_visit_id': visit_id,
                                    'scheduled_start': start.strftime('%Y-%m-%d %H:%M:%S')})
        audit(conn, user_id, 'visits', visit_id, '改约关闭原预约',
              reason=reason, after={'status': '已改约'})
        conn.commit()
        return new_id
    except BaseException:
        _rollback(conn, started)
        raise


def noshow_visit(conn, visit_id, user_id, action, reason=None, now=None):
    now = now or datetime.now()
    v = _get_visit(conn, visit_id)
    if action == 'mark':
        if v['status'] != '待到诊':
            raise BizError(f'当前状态「{v["status"]}」不能进入待核实')
        if parse_dt(v['scheduled_start']) >= now:
            raise BizError('预约时间未到，不能标记为待核实')
        conn.execute("UPDATE visits SET status='待核实' WHERE visit_id=?", (visit_id,))
        audit(conn, user_id, 'visits', visit_id, '到期未到诊进入待核实', reason=reason,
              before={'status': v['status']}, after={'status': '待核实'})
    elif action == 'confirm':
        if v['status'] != '待核实':
            raise BizError(f'当前状态「{v["status"]}」不能确认未到诊')
        conn.execute("UPDATE visits SET status='未到诊', reason=? WHERE visit_id=?", (reason, visit_id))
        audit(conn, user_id, 'visits', visit_id, '确认未到诊', reason=reason,
              before={'status': v['status']}, after={'status': '未到诊'})
    else:
        raise BizError('无效的未到诊处理动作')
    conn.commit()


# ---------------- 实际治疗（UC05） ----------------

def get_visit_treatments(conn, visit_id):
    return conn.execute(
        "SELECT pt.treatment_id, pt.treatment_type_id, tt.treatment_name, tt.unit_name,"
        " tr.version_no, tr.units, tr.unit_price, tr.status, tr.is_current, tr.performed_at,"
        " tr.confirmed_at, tr.note, d.name AS performer_name, d.employee_no AS performer_no"
        " FROM performed_treatments pt"
        " JOIN treatment_types tt ON tt.treatment_type_id = pt.treatment_type_id"
        " JOIN treatment_revisions tr ON tr.treatment_id = pt.treatment_id AND tr.is_current = 1"
        " JOIN dentists d ON d.dentist_id = tr.performer_dentist_id"
        " WHERE pt.visit_id=? ORDER BY pt.treatment_id", (visit_id,)).fetchall()


def add_treatment(conn, visit_id, user_dentist_id, treatment_type_id, units, unit_price=None,
                  note=None, now=None):
    now = now or datetime.now()
    v = _get_visit(conn, visit_id)
    if v['status'] not in ('已到诊', '治疗完成'):
        raise BizError('只有已到诊的就诊才能记录实际治疗')
    tt = conn.execute("SELECT * FROM treatment_types WHERE treatment_type_id=? AND active=1",
                      (treatment_type_id,)).fetchone()
    if not tt:
        raise BizError('治疗项目不存在或已停用')
    try:
        units = float(units)
    except (TypeError, ValueError):
        raise BizError('单位数必须是数字')
    if units <= 0:
        raise BizError('单位数必须大于 0')
    if not tt['allows_fraction'] and units != int(units):
        raise BizError(f'项目「{tt["treatment_name"]}」不允许小数单位')
    price = float(unit_price) if unit_price is not None else float(tt['default_unit_price'])
    if price < 0:
        raise BizError('单位价格不能为负')
    started = _begin(conn)
    try:
        tid = conn.execute("INSERT INTO performed_treatments (visit_id, treatment_type_id, created_at)"
                           " VALUES (?,?,?)", (visit_id, treatment_type_id,
                                               now.strftime('%Y-%m-%d %H:%M:%S'))).lastrowid
        conn.execute("INSERT INTO treatment_revisions (treatment_id, version_no, performer_dentist_id,"
                     " units, unit_price, performed_at, status, is_current, note)"
                     " VALUES (?,1,?,?,?,?,'草稿',1,?)",
                     (tid, user_dentist_id, units, m2(price),
                      now.strftime('%Y-%m-%d %H:%M:%S'), note))
        audit(conn, user_dentist_id, 'performed_treatments', tid, '记录实际治疗',
              reason=note, after={'treatment_type': tt['treatment_name'], 'units': units,
                                  'unit_price': m2(price)})
        conn.commit()
        return tid
    except BaseException:
        _rollback(conn, started)
        raise


def confirm_treatment(conn, treatment_id, user_dentist_id, now=None):
    now = now or datetime.now()
    tr = conn.execute("SELECT * FROM treatment_revisions WHERE treatment_id=? AND is_current=1",
                      (treatment_id,)).fetchone()
    if not tr:
        raise BizError('治疗记录不存在')
    if tr['status'] != '草稿':
        raise BizError(f'当前版本状态「{tr["status"]}」不能签署确认')
    if tr['performer_dentist_id'] != user_dentist_id:
        raise BizError('只能签署确认本人执行的治疗，不能代他人签字')
    conn.execute("UPDATE treatment_revisions SET status='已确认', confirmed_by=?, confirmed_at=?"
                 " WHERE treatment_id=? AND version_no=?",
                 (user_dentist_id, now.strftime('%Y-%m-%d %H:%M:%S'), treatment_id, tr['version_no']))
    audit(conn, user_dentist_id, 'performed_treatments', treatment_id, '签署确认治疗',
          before={'status': tr['status']}, after={'status': '已确认'})
    conn.commit()


def revise_treatment(conn, treatment_id, user_dentist_id, units=None, unit_price=None,
                     note=None, now=None):
    """确认后的更正：新建版本，保留原版本，不无痕覆盖（UC05 例外处理）。"""
    now = now or datetime.now()
    tr = conn.execute("SELECT * FROM treatment_revisions WHERE treatment_id=? AND is_current=1",
                      (treatment_id,)).fetchone()
    if not tr:
        raise BizError('治疗记录不存在')
    if tr['status'] != '已确认':
        raise BizError('只有已确认的治疗才进入更正流程')
    if tr['performer_dentist_id'] != user_dentist_id:
        raise BizError('只能更正本人执行的治疗')
    units = float(units) if units is not None else tr['units']
    price = float(unit_price) if unit_price is not None else tr['unit_price']
    if units <= 0 or price < 0:
        raise BizError('单位数须大于 0，单价不能为负')
    pt = conn.execute("SELECT * FROM performed_treatments WHERE treatment_id=?", (treatment_id,)).fetchone()
    tt = conn.execute("SELECT * FROM treatment_types WHERE treatment_type_id=?",
                      (pt['treatment_type_id'],)).fetchone()
    if not tt['allows_fraction'] and units != int(units):
        raise BizError(f'项目「{tt["treatment_name"]}」不允许小数单位')
    new_ver = tr['version_no'] + 1
    conn.execute("UPDATE treatment_revisions SET is_current=0 WHERE treatment_id=?", (treatment_id,))
    conn.execute("INSERT INTO treatment_revisions (treatment_id, version_no, performer_dentist_id, units,"
                 " unit_price, performed_at, status, is_current, note) VALUES (?,?,?,?,?,?,'草稿',1,?)",
                 (treatment_id, new_ver, tr['performer_dentist_id'], units, m2(price),
                  tr['performed_at'], note or tr['note']))
    audit(conn, user_dentist_id, 'performed_treatments', treatment_id, '治疗更正新建版本',
          reason=note, before={'version': tr['version_no'], 'units': tr['units'], 'unit_price': tr['unit_price']},
          after={'version': new_ver, 'units': units, 'unit_price': m2(price)})
    conn.commit()
    return new_ver


# ---------------- 结算单（UC06） ----------------

def get_invoice(conn, visit_id):
    inv = conn.execute("SELECT i.*, ir.invoice_revision_id, ir.revision_no, ir.status AS rev_status,"
                       " ir.total_amount, ir.issued_at FROM invoices i"
                       " JOIN invoice_revisions ir ON ir.invoice_id = i.invoice_id AND ir.is_current = 1"
                       " WHERE i.visit_id=?", (visit_id,)).fetchone()
    if not inv:
        return None
    items = conn.execute(
        "SELECT ii.*, tr.performer_dentist_id, d.name AS performer_name, tr.performed_at"
        " FROM invoice_items ii"
        " JOIN treatment_revisions tr ON tr.treatment_id = ii.treatment_id AND tr.version_no = ii.version_no"
        " JOIN dentists d ON d.dentist_id = tr.performer_dentist_id"
        " WHERE ii.invoice_revision_id=? ORDER BY ii.invoice_item_id",
        (inv['invoice_revision_id'],)).fetchall()
    return inv, items


def generate_invoice(conn, visit_id, user_id, now=None):
    """按就诊号读取已签署治疗生成结算单；重复提交返回原单号；
    开单后治疗有更正则生成同单新版本（一就诊一张有效结算单）。"""
    now = parse_dt(now) if now else datetime.now()
    v = _get_visit(conn, visit_id)
    confirmed = conn.execute(
        "SELECT tr.treatment_id, tr.version_no, tr.units, tr.unit_price, tt.treatment_name"
        " FROM treatment_revisions tr"
        " JOIN performed_treatments pt ON pt.treatment_id = tr.treatment_id"
        " JOIN treatment_types tt ON tt.treatment_type_id = pt.treatment_type_id"
        " WHERE pt.visit_id=? AND tr.is_current=1 AND tr.status='已确认'"
        " ORDER BY tr.treatment_id", (visit_id,)).fetchall()
    if not confirmed:
        raise BizError('本次就诊尚无已签署确认的治疗，不能生成结算单')
    started = _begin(conn)
    try:
        inv = conn.execute("SELECT * FROM invoices WHERE visit_id=?", (visit_id,)).fetchone()
        item_sig = [(t['treatment_id'], t['version_no']) for t in confirmed]
        if inv:
            cur = conn.execute("SELECT * FROM invoice_revisions WHERE invoice_id=? AND is_current=1",
                               (inv['invoice_id'],)).fetchone()
            cur_sig = [tuple(r) for r in conn.execute(
                "SELECT treatment_id, version_no FROM invoice_items WHERE invoice_revision_id=?"
                " ORDER BY treatment_id", (cur['invoice_revision_id'],)).fetchall()]
            if cur_sig == item_sig:  # 重复提交返回已有单号
                conn.commit()
                return inv['invoice_id']
            new_no = cur['revision_no'] + 1  # 更正：同单新版本，原版本保留
            conn.execute("UPDATE invoice_revisions SET is_current=0 WHERE invoice_revision_id=?",
                         (cur['invoice_revision_id'],))
            rev_id = conn.execute(
                "INSERT INTO invoice_revisions (invoice_id, revision_no, status, is_current, total_amount,"
                " issued_at, approved_by) VALUES (?,?, '已签发',1,0,?,?)",
                (inv['invoice_id'], new_no, now.strftime('%Y-%m-%d %H:%M:%S'), user_id)).lastrowid
            audit(conn, user_id, 'invoices', inv['invoice_id'], '结算单更正新版本',
                  before={'revision_no': cur['revision_no']}, after={'revision_no': new_no})
        else:
            inv_id = conn.execute(
                "INSERT INTO invoices (invoice_no, visit_id, created_at) VALUES (?,?,?)",
                (next_invoice_no(conn, now), visit_id, now.strftime('%Y-%m-%d %H:%M:%S'))).lastrowid
            rev_id = conn.execute(
                "INSERT INTO invoice_revisions (invoice_id, revision_no, status, is_current, total_amount,"
                " issued_at, approved_by) VALUES (?,1,'已签发',1,0,?,?)",
                (inv_id, now.strftime('%Y-%m-%d %H:%M:%S'), user_id)).lastrowid
            audit(conn, user_id, 'invoices', inv_id, '生成结算单', after={'visit_id': visit_id})
        total = 0.0
        for t in confirmed:
            sub = m2(t['units'] * t['unit_price'])
            total = m2(total + sub)
            conn.execute("INSERT INTO invoice_items (invoice_revision_id, treatment_id, version_no,"
                         " name_snapshot, units_snapshot, unit_price_snapshot, subtotal)"
                         " VALUES (?,?,?,?,?,?,?)",
                         (rev_id, t['treatment_id'], t['version_no'], t['treatment_name'],
                          t['units'], t['unit_price'], sub))
        conn.execute("UPDATE invoice_revisions SET total_amount=? WHERE invoice_revision_id=?",
                     (total, rev_id))
        conn.execute("UPDATE visits SET status='治疗完成' WHERE visit_id=?", (visit_id,))
        conn.commit()
        return inv['invoice_id'] if inv else conn.execute(
            "SELECT invoice_id FROM invoices WHERE visit_id=?", (visit_id,)).fetchone()['invoice_id']
    except BaseException:
        _rollback(conn, started)
        raise


# ---------------- 费用（UC09） ----------------

def add_cost(conn, user_id, document_no, line_no, cost_kind, incurred_at, amount, allocations):
    if cost_kind not in ('耗材', '运营费'):
        raise BizError('费用类别只能是耗材或运营费')
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        raise BizError('金额必须是数字')
    if amount <= 0:
        raise BizError('金额必须大于 0')
    if conn.execute("SELECT 1 FROM cost_entries WHERE document_no=? AND line_no=?",
                    (document_no, line_no)).fetchone():
        raise BizError(f'凭证 {document_no} 第 {line_no} 行已存在（同一凭证不能重复录入）')
    allocs = list(allocations or [])
    if allocs:
        total = m2(sum(float(a['amount']) for a in allocs))
        if abs(total - m2(amount)) > 0.005:
            raise BizError(f'分摊合计 {total} 不等于来源金额 {m2(amount)}，请重新核对')
        for a in allocs:
            if a.get('amount', 0) <= 0:
                raise BizError('分摊金额必须大于 0')
            if not conn.execute("SELECT 1 FROM dentists WHERE dentist_id=?", (a['dentist_id'],)).fetchone():
                raise BizError('分摊牙医不存在')
            if cost_kind == '耗材':
                if not a.get('treatment_id'):
                    raise BizError('耗材成本必须关联实际治疗')
                if not conn.execute("SELECT 1 FROM treatment_revisions WHERE treatment_id=? AND version_no=?"
                                    " AND is_current=1", (a['treatment_id'], a.get('version_no'))).fetchone():
                    raise BizError(f'治疗 {a["treatment_id"]} 当前版本不存在')
            elif a.get('treatment_id'):
                raise BizError('运营费用不需要关联治疗')
    started = _begin(conn)
    try:
        eid = conn.execute("INSERT INTO cost_entries (document_no, line_no, cost_kind, incurred_at,"
                           " amount, status, recorded_by) VALUES (?,?,?,?,?,?,?)",
                           (document_no, int(line_no), cost_kind, parse_dt(incurred_at).strftime('%Y-%m-%d'),
                            m2(amount), '待确认' if allocs else '待分摊', user_id)).lastrowid
        for a in allocs:
            conn.execute("INSERT INTO cost_allocations (cost_entry_id, dentist_id, treatment_id,"
                         " version_no, allocated_amount, status) VALUES (?,?,?,?,?,'待确认')",
                         (eid, a['dentist_id'], a.get('treatment_id'), a.get('version_no'),
                          m2(a['amount'])))
        audit(conn, user_id, 'cost_entries', eid, '登记费用',
              after={'document_no': document_no, 'cost_kind': cost_kind, 'amount': m2(amount)})
        conn.commit()
        return eid
    except BaseException:
        _rollback(conn, started)
        raise


def confirm_cost(conn, entry_id, user_id):
    e = conn.execute("SELECT * FROM cost_entries WHERE cost_entry_id=?", (entry_id,)).fetchone()
    if not e:
        raise BizError('费用来源不存在')
    if e['status'] == '已确认':
        raise BizError('该费用已确认，重复确认无效')
    allocs = conn.execute("SELECT * FROM cost_allocations WHERE cost_entry_id=?", (entry_id,)).fetchall()
    if not allocs:
        raise BizError('尚未填写分摊，不能确认（无规则的费用先挂待分摊，不能当作 0）')
    total = m2(sum(a['allocated_amount'] for a in allocs))
    if abs(total - m2(e['amount'])) > 0.005:
        raise BizError(f'分摊合计 {total} 不等于来源金额 {m2(e["amount"])}，不能确认')
    conn.execute("UPDATE cost_entries SET status='已确认' WHERE cost_entry_id=?", (entry_id,))
    conn.execute("UPDATE cost_allocations SET status='已确认' WHERE cost_entry_id=?", (entry_id,))
    audit(conn, user_id, 'cost_entries', entry_id, '确认费用',
          before={'status': e['status']}, after={'status': '已确认'})
    conn.commit()


# ---------------- 季度核算（UC10） ----------------

def _quarter_revenue(conn, q_start, q_end):
    return conn.execute(
        "SELECT tr.performer_dentist_id AS dentist_id, SUM(ii.subtotal) AS total FROM invoice_items ii"
        " JOIN invoice_revisions ir ON ir.invoice_revision_id = ii.invoice_revision_id"
        "   AND ir.is_current = 1 AND ir.status = '已签发'"
        " JOIN treatment_revisions tr ON tr.treatment_id = ii.treatment_id AND tr.version_no = ii.version_no"
        " WHERE tr.performed_at >= ? AND tr.performed_at < ?"
        " GROUP BY tr.performer_dentist_id", (q_start, q_end)).fetchall()


def _quarter_costs(conn, q_start, q_end):
    return conn.execute(
        "SELECT a.dentist_id, e.cost_kind, SUM(a.allocated_amount) AS total FROM cost_allocations a"
        " JOIN cost_entries e ON e.cost_entry_id = a.cost_entry_id AND e.status='已确认'"
        " WHERE a.status='已确认' AND e.incurred_at >= ? AND e.incurred_at < ?"
        " GROUP BY a.dentist_id, e.cost_kind", (q_start, q_end)).fetchall()


def quarter_pending(conn, q_start, q_end):
    return conn.execute(
        "SELECT cost_entry_id, document_no, line_no, cost_kind, amount, status FROM cost_entries"
        " WHERE incurred_at >= ? AND incurred_at < ? AND status IN ('待分摊','待确认')"
        " ORDER BY incurred_at, cost_entry_id", (q_start, q_end)).fetchall()


def close_quarter(conn, year, quarter_no, user_id, cutoff=None, policy_version='P-2026-01'):
    q_start, q_end = quarter_range(year, quarter_no)
    cutoff = cutoff or (q_end - timedelta(seconds=1))
    ver = conn.execute("SELECT COALESCE(MAX(version_no),0) m FROM quarter_closes WHERE year=? AND quarter_no=?",
                       (year, quarter_no)).fetchone()['m'] + 1
    rev = {r['dentist_id']: r['total'] for r in _quarter_revenue(conn, q_start, q_end)}
    costs = {}
    for r in _quarter_costs(conn, q_start, q_end):
        costs.setdefault(r['dentist_id'], {})[r['cost_kind']] = r['total']
    dentists = sorted(set(rev) | set(costs))
    started = _begin(conn)
    try:
        qid = conn.execute(
            "INSERT INTO quarter_closes (year, quarter_no, version_no, cutoff_at, policy_version,"
            " status, net_profit, created_by, created_at) VALUES (?,?,?,?,?,'草稿',0,?,?)",
            (year, quarter_no, ver, cutoff.strftime('%Y-%m-%d %H:%M:%S'), policy_version, user_id,
             datetime.now().strftime('%Y-%m-%d %H:%M:%S'))).lastrowid
        total_net = 0.0
        for did in dentists:
            revenue = m2(rev.get(did, 0))
            material = m2(costs.get(did, {}).get('耗材', 0))
            op = m2(costs.get(did, {}).get('运营费', 0))
            net = m2(revenue - material - op)
            total_net = m2(total_net + net)
            rid = conn.execute(
                "INSERT INTO dentist_quarter_results (quarter_close_id, dentist_id, revenue,"
                " material_cost, operating_expense, net_profit) VALUES (?,?,?,?,?,?)",
                (qid, did, revenue, material, op, net)).lastrowid
            for row in conn.execute(
                    "SELECT ii.invoice_item_id AS src, ii.subtotal AS amount FROM invoice_items ii"
                    " JOIN invoice_revisions ir ON ir.invoice_revision_id = ii.invoice_revision_id"
                    "   AND ir.is_current=1 AND ir.status='已签发'"
                    " JOIN treatment_revisions tr ON tr.treatment_id = ii.treatment_id"
                    "   AND tr.version_no = ii.version_no"
                    " WHERE tr.performer_dentist_id=? AND tr.performed_at >= ? AND tr.performed_at < ?",
                    (did, q_start, q_end)).fetchall():
                conn.execute("INSERT INTO quarter_result_sources (result_id, source_kind, invoice_item_id,"
                             " amount_snapshot) VALUES (?,'收入',?,?)", (rid, row['src'], row['amount']))
            for row in conn.execute(
                    "SELECT a.cost_allocation_id AS src, a.allocated_amount AS amount, e.cost_kind"
                    " FROM cost_allocations a JOIN cost_entries e ON e.cost_entry_id=a.cost_entry_id"
                    " AND e.status='已确认' WHERE a.status='已确认' AND a.dentist_id=?"
                    " AND e.incurred_at >= ? AND e.incurred_at < ?", (did, q_start, q_end)).fetchall():
                conn.execute("INSERT INTO quarter_result_sources (result_id, source_kind, cost_allocation_id,"
                             " amount_snapshot) VALUES (?,?,?,?)",
                             (rid, row['cost_kind'], row['src'], row['amount']))
        pool = m2(total_net * 0.10) if total_net > 0 else None
        conn.execute("UPDATE quarter_closes SET net_profit=?, pool_amount=? WHERE quarter_close_id=?",
                     (total_net, pool, qid))
        audit(conn, user_id, 'quarter_closes', qid, '生成季度核算',
              after={'year': year, 'quarter': quarter_no, 'net_profit': total_net})
        conn.commit()
        return qid
    except BaseException:
        _rollback(conn, started)
        raise


def submit_quarter(conn, qid, user_id):
    q = conn.execute("SELECT * FROM quarter_closes WHERE quarter_close_id=?", (qid,)).fetchone()
    if not q:
        raise BizError('核算版本不存在')
    if q['status'] != '草稿':
        raise BizError(f'当前状态「{q["status"]}」不能提交审批')
    q_start, q_end = quarter_range(q['year'], q['quarter_no'])
    pending = quarter_pending(conn, q_start, q_end)
    if pending:
        items = '、'.join(f'{p["document_no"]}#{p["line_no"]}({p["status"]})' for p in pending)
        raise BizError(f'存在未确认费用（{items}），不能提交审批；有费用尚未分摊时不能把空值当作 0')
    conn.execute("UPDATE quarter_closes SET status='待审批' WHERE quarter_close_id=?", (qid,))
    audit(conn, user_id, 'quarter_closes', qid, '提交季度核算审批',
          before={'status': q['status']}, after={'status': '待审批'})
    conn.commit()


def approve_quarter(conn, qid, user_id):
    q = conn.execute("SELECT * FROM quarter_closes WHERE quarter_close_id=?", (qid,)).fetchone()
    if not q:
        raise BizError('核算版本不存在')
    if q['status'] != '待审批':
        raise BizError(f'当前状态「{q["status"]}」不能批准')
    pool = m2(q['net_profit'] * 0.10) if q['net_profit'] > 0 else None
    conn.execute("UPDATE quarter_closes SET status='已批准', pool_amount=?, approved_by=?, approved_at=?"
                 " WHERE quarter_close_id=?",
                 (pool, user_id, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), qid))
    audit(conn, user_id, 'quarter_closes', qid, '批准季度核算',
          before={'status': q['status']}, after={'status': '已批准', 'pool_amount': pool})
    conn.commit()


# ---------------- 运营报表（UC11） ----------------

def cancellation_stats(conn, year, quarter, cutoff=None):
    q_start, q_end = quarter_range(year, quarter)
    cutoff = cutoff or min(datetime.now(), q_end - timedelta(seconds=1))
    denom = conn.execute(
        "SELECT clinic_id,"
        " SUM(CASE WHEN status IN ('已到诊','治疗完成') THEN 1 ELSE 0 END) AS arrived,"
        " SUM(CASE WHEN status='患者取消' THEN 1 ELSE 0 END) AS cancelled,"
        " SUM(CASE WHEN status='未到诊' THEN 1 ELSE 0 END) AS noshow,"
        " SUM(CASE WHEN status='待核实' THEN 1 ELSE 0 END) AS pending"
        " FROM visits WHERE scheduled_start >= ? AND scheduled_start < ?"
        " AND (status IN ('已到诊','治疗完成','患者取消','未到诊','待核实')"
        "      OR (status='待到诊' AND scheduled_start <= ?))"
        " GROUP BY clinic_id", (q_start, q_end, cutoff)).fetchall()
    future = conn.execute("SELECT COUNT(*) c FROM visits WHERE scheduled_start >= ? AND scheduled_start < ?"
                          " AND status='待到诊' AND scheduled_start > ?",
                          (q_start, q_end, cutoff)).fetchone()['c']
    rows = []
    for r in denom:
        d = r['arrived'] + r['cancelled'] + r['noshow'] + r['pending']
        clinic = conn.execute("SELECT clinic_code FROM clinics WHERE clinic_id=?",
                              (r['clinic_id'],)).fetchone()['clinic_code']
        rows.append({'clinic_code': clinic, 'denominator': d, 'arrived': r['arrived'],
                     'cancelled': r['cancelled'], 'noshow': r['noshow'], 'pending': r['pending'],
                     'cancel_rate': m2(r['cancelled'] / d * 100) if d else None,
                     'noshow_rate': m2(r['noshow'] / d * 100) if d else None})
    total_denom = sum(r['denominator'] for r in rows)
    return {'rows': rows, 'future_excluded': future, 'cutoff': cutoff.strftime('%Y-%m-%d %H:%M:%S'),
            'total': {'denominator': total_denom,
                      'arrived': sum(r['arrived'] for r in rows),
                      'cancelled': sum(r['cancelled'] for r in rows),
                      'noshow': sum(r['noshow'] for r in rows),
                      'pending': sum(r['pending'] for r in rows),
                      'cancel_rate': m2(sum(r['cancelled'] for r in rows) / total_denom * 100)
                      if total_denom else None,
                      'noshow_rate': m2(sum(r['noshow'] for r in rows) / total_denom * 100)
                      if total_denom else None}}


def standardization_checks(conn):
    return {
        'allergy_not_asked': conn.execute(
            "SELECT COUNT(*) c FROM patients WHERE allergy_inquiry_status='未询问'").fetchone()['c'],
        'allergy_pending': conn.execute(
            "SELECT COUNT(*) c FROM patient_allergies WHERE status='待核实'").fetchone()['c'],
        'draft_treatments': conn.execute(
            "SELECT COUNT(*) c FROM treatment_revisions WHERE is_current=1 AND status='草稿'").fetchone()['c'],
        'arrived_no_invoice': [dict(r) for r in conn.execute(
            "SELECT v.visit_id, v.visit_no, p.name AS patient_name, v.scheduled_start FROM visits v"
            " JOIN patients p ON p.patient_id=v.patient_id"
            " WHERE v.status IN ('已到诊','治疗完成') AND NOT EXISTS"
            " (SELECT 1 FROM invoices i WHERE i.visit_id=v.visit_id) ORDER BY v.scheduled_start").fetchall()],
        'pending_costs': [dict(r) for r in conn.execute(
            "SELECT cost_entry_id, document_no, line_no, cost_kind, amount, status FROM cost_entries"
            " WHERE status IN ('待分摊','待确认') ORDER BY incurred_at").fetchall()],
        'dentists_no_verified_qual': [dict(r) for r in conn.execute(
            "SELECT d.dentist_id, d.employee_no, d.name FROM dentists d WHERE d.active=1 AND NOT EXISTS"
            " (SELECT 1 FROM dentist_qualifications dq WHERE dq.dentist_id=d.dentist_id"
            "  AND dq.verification_status='已核实')").fetchall()],
    }


# ---------------- 可约时段（供预约工作台 UC02） ----------------

def available_slots(conn, clinic_id, date_str, treatment_type_id=None, slot_minutes=40):
    day = parse_dt(date_str)
    day_end = day + timedelta(days=1)
    scheds = conn.execute(
        "SELECT s.schedule_id, s.dentist_id, s.start_at, s.end_at, d.name, d.employee_no, d.active"
        " FROM dentist_schedules s JOIN dentists d ON d.dentist_id=s.dentist_id"
        " WHERE s.clinic_id=? AND s.status='有效' AND s.start_at < ? AND s.end_at >= ?"
        " ORDER BY d.employee_no", (clinic_id, day_end, day)).fetchall()
    out = []
    for s in scheds:
        if not s['active']:
            continue
        if treatment_type_id:
            tt = conn.execute("SELECT * FROM treatment_types WHERE treatment_type_id=?",
                              (treatment_type_id,)).fetchone()
            if tt:
                reqs = [r['qualification_id'] for r in conn.execute(
                    "SELECT qualification_id FROM treatment_qualification_requirements"
                    " WHERE treatment_type_id=?", (treatment_type_id,)).fetchall()]
                if reqs:
                    held = {r['qualification_id'] for r in conn.execute(
                        "SELECT qualification_id FROM dentist_qualifications WHERE dentist_id=?"
                        " AND verification_status='已核实'", (s['dentist_id'],)).fetchall()}
                    ok = held.issuperset(reqs) if tt['qualification_match_mode'] == 'ALL' \
                        else bool(held & set(reqs))
                    if not ok:
                        continue
        seg_start = max(parse_dt(s['start_at']), day)
        seg_end = min(parse_dt(s['end_at']), day_end)
        busy = [(parse_dt(v['scheduled_start']), parse_dt(v['scheduled_end'])) for v in conn.execute(
            "SELECT scheduled_start, scheduled_end FROM visits WHERE dentist_id=?"
            " AND status IN ('待到诊','已到诊','治疗完成') AND scheduled_start < ? AND scheduled_end > ?",
            (s['dentist_id'], seg_end, seg_start)).fetchall()]
        segs = []
        cur = seg_start
        for b_start, b_end in sorted(busy):
            if b_start > cur:
                segs.append((cur, b_start))
            cur = max(cur, b_end)
        if cur < seg_end:
            segs.append((cur, seg_end))
        for a, b in segs:
            t = a
            while t + timedelta(minutes=slot_minutes) <= b:
                out.append({'dentist_id': s['dentist_id'], 'dentist_name': s['name'],
                            'employee_no': s['employee_no'],
                            'start': t.strftime('%Y-%m-%d %H:%M'),
                            'end': (t + timedelta(minutes=slot_minutes)).strftime('%Y-%m-%d %H:%M')})
                t += timedelta(minutes=slot_minutes)
    return out


# ---------------- 运营维护（UC07、UC08） ----------------

def add_dentist(conn, user_id, employee_no, name, birth_date, home_address, phone, email,
                qualifications=None):
    if conn.execute("SELECT 1 FROM dentists WHERE employee_no=?", (employee_no,)).fetchone():
        raise BizError(f'员工编号 {employee_no} 已存在')
    did = conn.execute("INSERT INTO dentists (employee_no, name, birth_date, home_address, phone, email)"
                       " VALUES (?,?,?,?,?,?)",
                       (employee_no, name, birth_date, home_address, phone, email)).lastrowid
    for q in (qualifications or []):
        conn.execute("INSERT INTO dentist_qualifications (dentist_id, qualification_id, certificate_no,"
                     " valid_from, valid_until, verification_status) VALUES (?,?,?,?,?,?)",
                     (did, q['qualification_id'], q.get('certificate_no'), q.get('valid_from', '2025-01-01'),
                      q.get('valid_until'), q.get('verification_status', '未核实')))
    audit(conn, user_id, 'dentists', did, '新增牙医', after={'employee_no': employee_no, 'name': name})
    conn.commit()
    return did


def add_schedule(conn, user_id, dentist_id, clinic_id, start_at, end_at):
    start, end = parse_dt(start_at), parse_dt(end_at)
    if start >= end:
        raise BizError('出诊开始时间必须早于结束时间')
    if not conn.execute("SELECT 1 FROM dentists WHERE dentist_id=? AND active=1", (dentist_id,)).fetchone():
        raise BizError('牙医不存在或已停用')
    if not conn.execute("SELECT 1 FROM clinics WHERE clinic_id=? AND active=1", (clinic_id,)).fetchone():
        raise BizError('诊所不存在或已停用')
    overlap = conn.execute(
        "SELECT * FROM dentist_schedules WHERE dentist_id=? AND status='有效' AND start_at < ? AND end_at > ?",
        (dentist_id, end, start)).fetchall()
    if overlap:
        raise BizError(f'与已有出诊安排重叠（{overlap[0]["start_at"]} ~ {overlap[0]["end_at"]}），'
                       f'同一牙医不能跨店重叠出诊')
    sid = conn.execute("INSERT INTO dentist_schedules (dentist_id, clinic_id, start_at, end_at, status)"
                       " VALUES (?,?,?,?,'有效')",
                       (dentist_id, clinic_id, start.strftime('%Y-%m-%d %H:%M:%S'),
                        end.strftime('%Y-%m-%d %H:%M:%S'))).lastrowid
    audit(conn, user_id, 'dentist_schedules', sid, '新增出诊安排',
          after={'dentist_id': dentist_id, 'clinic_id': clinic_id,
                 'start_at': start.strftime('%Y-%m-%d %H:%M:%S')})
    conn.commit()
    return sid
