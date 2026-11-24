# -*- coding: utf-8 -*-
"""ADC 安德鲁牙科连锁管理系统 — Flask API + 网站托管。
运行：py -3.13 app.py  →  http://127.0.0.1:8000
演示账号（密码均为 123456）：reception01 前台 / dentist01 牙医李铭 / dentist02 牙医王雅
/ finance01 财务 / ops01 运营经理 / hq01 总部经理
"""
import functools
import secrets
import os
from flask import Flask, request, jsonify, g
from werkzeug.security import check_password_hash, generate_password_hash
import db
import logic
from logic import BizError

BASE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.normpath(os.path.join(BASE, '..', 'website'))

app = Flask(__name__, static_folder=SITE, static_url_path='')
TOKENS = {}  # token -> user_id（演示环境内存保存，重启后需重新登录）


# ---------------- 工具 ----------------

def get_conn():
    return db.get_conn()


def R(row):
    return {k: row[k] for k in row.keys()}


def load_user(conn, uid):
    u = conn.execute("SELECT * FROM user_accounts WHERE user_id=?", (uid,)).fetchone()
    if not u:
        return None
    roles = [R(r) for r in conn.execute(
        "SELECT r.role_code, r.role_name FROM user_roles ur JOIN roles r ON r.role_id=ur.role_id"
        " WHERE ur.user_id=?", (uid,)).fetchall()]
    d = R(u)
    d['roles'] = roles
    return d


def require_login(f):
    @functools.wraps(f)
    def w(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '').strip() \
            or request.headers.get('X-Token', '').strip()
        uid = TOKENS.get(token)
        conn = get_conn()
        user = load_user(conn, uid) if uid else None
        if not user or not user['active']:
            conn.close()
            return jsonify({'error': '未登录或登录已失效，请重新登录'}), 401
        g.conn, g.user = conn, user
        try:
            return f(*args, **kwargs)
        finally:
            conn.close()
    return w


def require_role(*codes):
    def deco(f):
        @functools.wraps(f)
        def w(*args, **kwargs):
            held = {r['role_code'] for r in g.user['roles']}
            if not (held & set(codes)):
                return jsonify({'error': '越权操作：当前岗位没有此权限（操作已留痕）'}), 403
            return f(*args, **kwargs)
        return w
    return deco


@app.errorhandler(BizError)
def on_biz_error(e):
    return jsonify({'error': str(e)}), 400


@app.errorhandler(Exception)
def on_error(e):
    return jsonify({'error': f'服务器错误：{e}'}), 500


@app.after_request
def cors(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Token'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return resp


# ---------------- 登录 ----------------

@app.route('/api/ping')
def ping():
    return jsonify({'ok': True, 'name': '安德鲁牙科连锁管理系统 ADC'})


@app.route('/api/login', methods=['POST'])
def login():
    body = request.get_json(silent=True) or {}
    u = get_conn().execute("SELECT * FROM user_accounts WHERE login_name=?",
                           (body.get('login_name', ''),)).fetchone()
    if not u or not check_password_hash(u['credential_ref'], body.get('password', '')):
        return jsonify({'error': '登录名或密码不正确'}), 401
    if not u['active']:
        return jsonify({'error': '账号已停用'}), 403
    token = secrets.token_hex(16)
    TOKENS[token] = u['user_id']
    return jsonify({'token': token, 'user': load_user(get_conn(), u['user_id'])})


@app.route('/api/logout', methods=['POST'])
@require_login
def logout():
    token = request.headers.get('Authorization', '').replace('Bearer ', '').strip() \
        or request.headers.get('X-Token', '').strip()
    TOKENS.pop(token, None)
    return jsonify({'ok': True})


@app.route('/api/me')
@require_login
def me():
    return jsonify(g.user)


# ---------------- 基础字典（选择器） ----------------

@app.route('/api/meta')
@require_login
def meta():
    c = g.conn
    return jsonify({
        'clinics': [R(r) for r in c.execute("SELECT * FROM clinics WHERE active=1 ORDER BY clinic_code")],
        'dentists': [dict(R(r), qualifications=[R(q) for q in c.execute(
            "SELECT dq.*, ql.qualification_name FROM dentist_qualifications dq"
            " JOIN qualifications ql ON ql.qualification_id=dq.qualification_id"
            " WHERE dq.dentist_id=? ORDER BY dq.dentist_qualification_id", (r['dentist_id'],))])
            for r in c.execute("SELECT * FROM dentists ORDER BY employee_no")],
        'treatment_types': [dict(R(r), requirement_names=[q['qualification_name'] for q in c.execute(
            "SELECT ql.qualification_name FROM treatment_qualification_requirements tq"
            " JOIN qualifications ql ON ql.qualification_id=tq.qualification_id"
            " WHERE tq.treatment_type_id=?", (r['treatment_type_id'],))])
            for r in c.execute("SELECT * FROM treatment_types WHERE active=1 ORDER BY treatment_code")],
        'allergy_types': [R(r) for r in c.execute("SELECT * FROM allergy_types ORDER BY allergy_name")],
        'qualifications': [R(r) for r in c.execute(
            "SELECT * FROM qualifications WHERE active=1 ORDER BY qualification_name")],
    })


# ---------------- 患者（UC01） ----------------

@app.route('/api/patients', methods=['GET'])
@require_login
@require_role('reception', 'dentist', 'finance', 'ops', 'hq')
def list_patients():
    q = request.args.get('q', '').strip()
    sql = ("SELECT p.*, (SELECT COUNT(*) FROM patient_allergies a WHERE a.patient_id=p.patient_id) AS allergy_cnt"
           " FROM patients p")
    args = []
    if q:
        sql += " WHERE p.name LIKE ? OR p.phone LIKE ? OR p.account_no LIKE ?"
        args = [f'%{q}%'] * 3
    sql += " ORDER BY p.patient_id DESC LIMIT 100"
    return jsonify([R(r) for r in g.conn.execute(sql, args).fetchall()])


@app.route('/api/patients', methods=['POST'])
@require_login
@require_role('reception')
def create_patient():
    body = request.get_json(silent=True) or {}
    for f in ('name', 'birth_date', 'billing_address', 'phone', 'emergency_contact_name',
              'emergency_contact_phone'):
        if not body.get(f):
            raise BizError(f'必填字段缺失：{f}（邮箱可以不填）')
    n = g.conn.execute("SELECT COUNT(*) c FROM patients").fetchone()['c']
    account_no = f'P-{n + 1001:04d}'
    pid = g.conn.execute(
        "INSERT INTO patients (account_no, name, birth_date, billing_address, phone, email,"
        " emergency_contact_name, emergency_contact_phone, allergy_inquiry_status)"
        " VALUES (?,?,?,?,?,?,?,?,?)",
        (account_no, body['name'], body['birth_date'], body['billing_address'], body['phone'],
         body.get('email') or None, body['emergency_contact_name'], body['emergency_contact_phone'],
         body.get('allergy_inquiry_status', '未询问'))).lastrowid
    for a in body.get('allergies') or []:
        g.conn.execute("INSERT INTO patient_allergies (patient_id, allergy_type_id, status, note, recorded_at)"
                       " VALUES (?,?,?,?,datetime('now','localtime'))",
                       (pid, a['allergy_type_id'], '待核实', a.get('note')))
    g.conn.execute("UPDATE patients SET allergy_inquiry_status='已报告' WHERE patient_id=?"
                   " AND allergy_inquiry_status='未询问'", (pid,))
    # 同步创建患者自助端账号（默认密码 123456，登录名 = 账号或手机号）
    g.conn.execute("INSERT INTO patient_accounts (patient_id, login_name, credential_ref, active, created_at)"
                   " VALUES (?,?,?,1,datetime('now','localtime'))",
                   (pid, account_no, generate_password_hash('123456')))
    logic.audit(g.conn, g.user['user_id'], 'patients', pid, '建立患者档案',
                after={'account_no': account_no, 'name': body['name']})
    g.conn.commit()
    return jsonify(R(g.conn.execute("SELECT * FROM patients WHERE patient_id=?", (pid,)).fetchone()))


@app.route('/api/patients/<int:pid>', methods=['GET'])
@require_login
@require_role('reception', 'dentist', 'finance', 'ops', 'hq')
def get_patient(pid):
    p = g.conn.execute("SELECT * FROM patients WHERE patient_id=?", (pid,)).fetchone()
    if not p:
        raise BizError('患者不存在')
    allergies = [R(r) for r in g.conn.execute(
        "SELECT a.*, t.allergy_name FROM patient_allergies a"
        " JOIN allergy_types t ON t.allergy_type_id=a.allergy_type_id WHERE a.patient_id=?", (pid,))]
    visits = [R(r) for r in g.conn.execute(
        "SELECT v.visit_id, v.visit_no, v.scheduled_start, v.status, v.attended, c.clinic_code,"
        " d.name AS dentist_name FROM visits v JOIN clinics c ON c.clinic_id=v.clinic_id"
        " JOIN dentists d ON d.dentist_id=v.dentist_id WHERE v.patient_id=? ORDER BY v.scheduled_start DESC"
        " LIMIT 50", (pid,))]
    return jsonify(dict(R(p), allergies=allergies, visits=visits))


@app.route('/api/patients/<int:pid>', methods=['PUT'])
@require_login
@require_role('reception')
def update_patient(pid):
    p = g.conn.execute("SELECT * FROM patients WHERE patient_id=?", (pid,)).fetchone()
    if not p:
        raise BizError('患者不存在')
    body = request.get_json(silent=True) or {}
    fields = ['name', 'birth_date', 'billing_address', 'phone', 'email',
              'emergency_contact_name', 'emergency_contact_phone', 'allergy_inquiry_status']
    sets, vals = [], []
    for f in fields:
        if f in body:
            sets.append(f'{f}=?')
            vals.append(body[f] if body[f] not in ('', None) or f == 'email' else None)
    if not sets:
        raise BizError('没有需要更新的字段')
    before = {k: p[k] for k in fields}
    vals.append(pid)
    g.conn.execute(f"UPDATE patients SET {', '.join(sets)} WHERE patient_id=?", vals)
    logic.audit(g.conn, g.user['user_id'], 'patients', pid, '更新患者档案', before=before,
                after={f: body.get(f) for f in fields if f in body})
    g.conn.commit()
    return jsonify(R(g.conn.execute("SELECT * FROM patients WHERE patient_id=?", (pid,)).fetchone()))


@app.route('/api/patients/<int:pid>/allergies', methods=['POST'])
@require_login
@require_role('reception', 'dentist')
def upsert_allergy(pid):
    body = request.get_json(silent=True) or {}
    status = body.get('status', '待核实')
    if status == '已确认' and 'dentist' not in {r['role_code'] for r in g.user['roles']}:
        raise BizError('只有牙医可以确认过敏信息（前台只能登记或核实资料）')
    row = g.conn.execute("SELECT * FROM patient_allergies WHERE patient_id=? AND allergy_type_id=?",
                         (pid, body['allergy_type_id'])).fetchone()
    if row:
        g.conn.execute("UPDATE patient_allergies SET status=?, note=?, recorded_at=datetime('now','localtime'),"
                       " verified_by=? WHERE patient_allergy_id=?",
                       (status, body.get('note', row['note']),
                        g.user.get('dentist_id') if status == '已确认' else None, row['patient_allergy_id']))
        logic.audit(g.conn, g.user['user_id'], 'patient_allergies', row['patient_allergy_id'], '更新过敏记录',
                    before={'status': row['status']}, after={'status': status})
    else:
        aid = g.conn.execute("INSERT INTO patient_allergies (patient_id, allergy_type_id, status, note,"
                             " recorded_at, verified_by) VALUES (?,?,?,?,datetime('now','localtime'),?)",
                             (pid, body['allergy_type_id'], status, body.get('note'),
                              g.user.get('dentist_id') if status == '已确认' else None)).lastrowid
        logic.audit(g.conn, g.user['user_id'], 'patient_allergies', aid, '新增过敏记录',
                    after={'allergy_type_id': body['allergy_type_id'], 'status': status})
    g.conn.execute("UPDATE patients SET allergy_inquiry_status='已报告' WHERE patient_id=?", (pid,))
    g.conn.commit()
    return jsonify({'ok': True})


# ---------------- 预约与就诊（UC02/UC03/UC04） ----------------

VISIT_LIST_SQL = ("SELECT v.*, p.name AS patient_name, p.account_no AS patient_account,"
                  " p.phone AS patient_phone, d.name AS dentist_name, d.employee_no AS dentist_no,"
                  " c.clinic_code, prev.visit_no AS previous_no"
                  " FROM visits v JOIN patients p ON p.patient_id=v.patient_id"
                  " JOIN dentists d ON d.dentist_id=v.dentist_id"
                  " JOIN clinics c ON c.clinic_id=v.clinic_id"
                  " LEFT JOIN visits prev ON prev.visit_id=v.previous_visit_id")


@app.route('/api/visits', methods=['GET'])
@require_login
@require_role('reception', 'dentist', 'finance', 'ops', 'hq')
def list_visits():
    status = request.args.get('status', '').strip()
    scope = request.args.get('scope', '').strip()
    dentist_id = request.args.get('dentist_id', '').strip()
    clinic_id = request.args.get('clinic_id', '').strip()
    sql, args, where = VISIT_LIST_SQL, [], []
    if status:
        where.append("v.status=?")
        args.append(status)
    if dentist_id:
        where.append("v.dentist_id=?")
        args.append(int(dentist_id))
    if clinic_id:
        where.append("v.clinic_id=?")
        args.append(int(clinic_id))
    if scope == 'today':
        where.append("date(v.scheduled_start)=date('now','localtime')")
    elif scope == 'upcoming':
        where.append("v.scheduled_start >= datetime('now','localtime')")
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY v.scheduled_start DESC LIMIT 300"
    return jsonify([R(r) for r in g.conn.execute(sql, args).fetchall()])


@app.route('/api/visits', methods=['POST'])
@require_login
@require_role('reception')
def create_visit():
    body = request.get_json(silent=True) or {}
    for f in ('patient_id', 'clinic_id', 'dentist_id', 'scheduled_start', 'scheduled_end'):
        if body.get(f) is None:
            raise BizError(f'必填字段缺失：{f}')
    vid = logic.book_visit(g.conn, body['patient_id'], body['clinic_id'], body['dentist_id'],
                           body['scheduled_start'], body['scheduled_end'],
                           body.get('requested_treatments', ''), body.get('special_needs'),
                           body.get('treatment_type_id'), g.user['user_id'])
    return jsonify({'visit_id': vid, 'visit_no': R(g.conn.execute(
        "SELECT visit_no FROM visits WHERE visit_id=?", (vid,)).fetchone())['visit_no']})


@app.route('/api/visits/<int:vid>', methods=['GET'])
@require_login
@require_role('reception', 'dentist', 'finance', 'ops', 'hq')
def get_visit(vid):
    row = g.conn.execute(VISIT_LIST_SQL + " WHERE v.visit_id=?", (vid,)).fetchone()
    if not row:
        raise BizError('预约不存在')
    p = g.conn.execute("SELECT * FROM patients WHERE patient_id=?", (row['patient_id'],)).fetchone()
    allergies = [R(r) for r in g.conn.execute(
        "SELECT a.*, t.allergy_name FROM patient_allergies a"
        " JOIN allergy_types t ON t.allergy_type_id=a.allergy_type_id WHERE a.patient_id=?",
        (row['patient_id'],))]
    treatments = [R(r) for r in logic.get_visit_treatments(g.conn, vid)]
    inv = logic.get_invoice(g.conn, vid)
    invoice = None
    if inv:
        invoice = dict(inv[0], items=[R(i) for i in inv[1]])
    next_v = g.conn.execute("SELECT visit_id, visit_no, status FROM visits WHERE previous_visit_id=?",
                            (vid,)).fetchone()
    return jsonify(dict(R(row), patient=R(p), allergies=allergies, treatments=treatments,
                        invoice=invoice, next_visit=R(next_v) if next_v else None))


@app.route('/api/visits/<int:vid>/checkin', methods=['POST'])
@require_login
@require_role('reception')
def checkin(vid):
    logic.checkin_visit(g.conn, vid, g.user['user_id'])
    return jsonify({'ok': True})


@app.route('/api/visits/<int:vid>/cancel', methods=['POST'])
@require_login
@require_role('reception')
def cancel(vid):
    body = request.get_json(silent=True) or {}
    logic.cancel_visit(g.conn, vid, g.user['user_id'], body.get('initiator', '患者'),
                       body.get('reason', ''))
    return jsonify({'ok': True})


@app.route('/api/visits/<int:vid>/reschedule', methods=['POST'])
@require_login
@require_role('reception')
def reschedule(vid):
    body = request.get_json(silent=True) or {}
    for f in ('clinic_id', 'dentist_id', 'scheduled_start', 'scheduled_end'):
        if body.get(f) is None:
            raise BizError(f'必填字段缺失：{f}')
    new_id = logic.reschedule_visit(g.conn, vid, g.user['user_id'], body['clinic_id'],
                                    body['dentist_id'], body['scheduled_start'], body['scheduled_end'],
                                    body.get('reason', ''))
    return jsonify({'visit_id': new_id})


@app.route('/api/visits/<int:vid>/noshow', methods=['POST'])
@require_login
@require_role('reception')
def noshow(vid):
    body = request.get_json(silent=True) or {}
    logic.noshow_visit(g.conn, vid, g.user['user_id'], body.get('action', 'mark'),
                       body.get('reason'))
    return jsonify({'ok': True})


@app.route('/api/slots')
@require_login
@require_role('reception', 'ops')
def slots():
    clinic_id = request.args.get('clinic_id', type=int)
    date = request.args.get('date', '').strip()
    tt = request.args.get('treatment_type_id', type=int)
    if not clinic_id or not date:
        raise BizError('请选择诊所和日期')
    return jsonify(logic.available_slots(g.conn, clinic_id, date, tt))


# ---------------- 实际治疗（UC05） ----------------

@app.route('/api/visits/<int:vid>/treatments', methods=['POST'])
@require_login
@require_role('dentist')
def add_treatment(vid):
    body = request.get_json(silent=True) or {}
    if not g.user.get('dentist_id'):
        raise BizError('当前账号未关联牙医档案，无法记录治疗')
    for f in ('treatment_type_id', 'units'):
        if body.get(f) is None:
            raise BizError(f'必填字段缺失：{f}')
    tid = logic.add_treatment(g.conn, vid, g.user['dentist_id'], body['treatment_type_id'],
                              body['units'], body.get('unit_price'), body.get('note'))
    return jsonify({'treatment_id': tid})


@app.route('/api/treatments/<int:tid>/confirm', methods=['POST'])
@require_login
@require_role('dentist')
def confirm_treatment(tid):
    logic.confirm_treatment(g.conn, tid, g.user['dentist_id'])
    return jsonify({'ok': True})


@app.route('/api/treatments/<int:tid>/revise', methods=['POST'])
@require_login
@require_role('dentist')
def revise_treatment(tid):
    body = request.get_json(silent=True) or {}
    logic.revise_treatment(g.conn, tid, g.user['dentist_id'],
                           body.get('units'), body.get('unit_price'), body.get('note'))
    return jsonify({'ok': True})


@app.route('/api/treatments/confirmed', methods=['GET'])
@require_login
@require_role('finance', 'hq')
def list_confirmed_treatments():
    dentist_id = request.args.get('dentist_id', '').strip()
    sql = ("SELECT tr.treatment_id, tr.version_no, tr.units, tr.unit_price, tr.performed_at,"
           " tt.treatment_name, v.visit_no, p.name AS patient_name, d.name AS dentist_name"
           " FROM treatment_revisions tr"
           " JOIN performed_treatments pt ON pt.treatment_id = tr.treatment_id"
           " JOIN treatment_types tt ON tt.treatment_type_id = pt.treatment_type_id"
           " JOIN visits v ON v.visit_id = pt.visit_id"
           " JOIN patients p ON p.patient_id = v.patient_id"
           " JOIN dentists d ON d.dentist_id = tr.performer_dentist_id"
           " WHERE tr.is_current=1 AND tr.status='已确认'")
    args = []
    if dentist_id:
        sql += " AND tr.performer_dentist_id=?"
        args.append(int(dentist_id))
    sql += " ORDER BY tr.performed_at DESC LIMIT 200"
    return jsonify([R(r) for r in g.conn.execute(sql, args).fetchall()])


# ---------------- 结算单（UC06） ----------------

@app.route('/api/visits/<int:vid>/invoice', methods=['POST'])
@require_login
@require_role('reception', 'finance')
def make_invoice(vid):
    iid = logic.generate_invoice(g.conn, vid, g.user['user_id'])
    inv = logic.get_invoice(g.conn, vid)
    return jsonify(dict(inv[0], items=[R(i) for i in inv[1]], invoice_id=iid))


@app.route('/api/visits/<int:vid>/invoice', methods=['GET'])
@require_login
@require_role('reception', 'finance', 'dentist', 'hq')
def get_invoice(vid):
    inv = logic.get_invoice(g.conn, vid)
    if not inv:
        return jsonify({'invoice': None})
    return jsonify(dict(inv[0], items=[R(i) for i in inv[1]]))


# ---------------- 费用（UC09） ----------------

@app.route('/api/costs', methods=['GET'])
@require_login
@require_role('finance', 'hq')
def list_costs():
    status = request.args.get('status', '').strip()
    sql = ("SELECT e.*, u.display_name AS recorded_by_name,"
           " (SELECT GROUP_CONCAT(a.dentist_id || ':' || a.allocated_amount) FROM cost_allocations a"
           "  WHERE a.cost_entry_id=e.cost_entry_id) AS alloc_summary"
           " FROM cost_entries e JOIN user_accounts u ON u.user_id=e.recorded_by")
    args = []
    if status:
        sql += " WHERE e.status=?"
        args.append(status)
    sql += " ORDER BY e.cost_entry_id DESC LIMIT 200"
    entries = []
    for r in g.conn.execute(sql, args).fetchall():
        allocs = [R(a) for a in g.conn.execute(
            "SELECT a.*, d.name AS dentist_name, d.employee_no FROM cost_allocations a"
            " JOIN dentists d ON d.dentist_id=a.dentist_id WHERE a.cost_entry_id=?", (r['cost_entry_id'],))]
        entries.append(dict(R(r), allocations=allocs))
    return jsonify(entries)


@app.route('/api/costs', methods=['POST'])
@require_login
@require_role('finance')
def create_cost():
    body = request.get_json(silent=True) or {}
    for f in ('document_no', 'line_no', 'cost_kind', 'incurred_at', 'amount'):
        if body.get(f) is None:
            raise BizError(f'必填字段缺失：{f}')
    eid = logic.add_cost(g.conn, g.user['user_id'], body['document_no'], body['line_no'],
                         body['cost_kind'], body['incurred_at'], body['amount'],
                         body.get('allocations'))
    return jsonify({'cost_entry_id': eid})


@app.route('/api/costs/<int:eid>/confirm', methods=['POST'])
@require_login
@require_role('finance')
def confirm_cost(eid):
    logic.confirm_cost(g.conn, eid, g.user['user_id'])
    return jsonify({'ok': True})


# ---------------- 季度核算（UC10） ----------------

@app.route('/api/quarters', methods=['GET'])
@require_login
@require_role('finance', 'hq', 'ops')
def list_quarters():
    rows = []
    for r in g.conn.execute("SELECT * FROM quarter_closes ORDER BY year DESC, quarter_no DESC,"
                            " version_no DESC LIMIT 20").fetchall():
        pending = logic.quarter_pending(g.conn, *logic.quarter_range(r['year'], r['quarter_no']))
        rows.append(dict(R(r), pending_count=len(pending)))
    return jsonify(rows)


@app.route('/api/quarters', methods=['POST'])
@require_login
@require_role('finance')
def create_quarter():
    body = request.get_json(silent=True) or {}
    year, quarter = int(body.get('year')), int(body.get('quarter_no'))
    if not (1 <= quarter <= 4):
        raise BizError('季度须为 1—4')
    qid = logic.close_quarter(g.conn, year, quarter, g.user['user_id'])
    return jsonify({'quarter_close_id': qid})


@app.route('/api/quarters/<int:qid>', methods=['GET'])
@require_login
@require_role('finance', 'hq', 'ops')
def get_quarter(qid):
    q = g.conn.execute("SELECT * FROM quarter_closes WHERE quarter_close_id=?", (qid,)).fetchone()
    if not q:
        raise BizError('核算版本不存在')
    results = [dict(R(r), dentist_name=g.conn.execute(
        "SELECT name FROM dentists WHERE dentist_id=?", (r['dentist_id'],)).fetchone()['name'],
        dentist_no=g.conn.execute(
        "SELECT employee_no FROM dentists WHERE dentist_id=?", (r['dentist_id'],)).fetchone()['employee_no'],
        sources=len(g.conn.execute(
        "SELECT 1 FROM quarter_result_sources WHERE result_id=?", (r['result_id'],)).fetchall()))
        for r in g.conn.execute("SELECT * FROM dentist_quarter_results WHERE quarter_close_id=?"
                                " ORDER BY revenue DESC", (qid,)).fetchall()]
    pending = [R(r) for r in logic.quarter_pending(g.conn, *logic.quarter_range(q['year'], q['quarter_no']))]
    return jsonify(dict(R(q), results=results, pending=pending))


@app.route('/api/quarters/<int:qid>/submit', methods=['POST'])
@require_login
@require_role('finance')
def submit_quarter(qid):
    logic.submit_quarter(g.conn, qid, g.user['user_id'])
    return jsonify({'ok': True})


@app.route('/api/quarters/<int:qid>/approve', methods=['POST'])
@require_login
@require_role('hq')
def approve_quarter(qid):
    logic.approve_quarter(g.conn, qid, g.user['user_id'])
    return jsonify({'ok': True})


# ---------------- 运营报表与审计（UC11、UC12） ----------------

@app.route('/api/reports/cancellation')
@require_login
@require_role('hq', 'ops', 'reception')
def report_cancellation():
    year = int(request.args.get('year', 2026))
    quarter = int(request.args.get('quarter', 4))
    return jsonify(logic.cancellation_stats(g.conn, year, quarter))


@app.route('/api/reports/standardization')
@require_login
@require_role('hq', 'ops')
def report_standardization():
    return jsonify(logic.standardization_checks(g.conn))


@app.route('/api/audit')
@require_login
@require_role('hq')
def audit_list():
    limit = min(int(request.args.get('limit', 50)), 200)
    return jsonify([R(r) for r in g.conn.execute(
        "SELECT a.*, u.display_name AS operator_name FROM audit_logs a"
        " LEFT JOIN user_accounts u ON u.user_id=a.user_id ORDER BY a.audit_id DESC LIMIT ?", (limit,))])


# ---------------- 运营维护（UC07、UC08） ----------------

@app.route('/api/dentists', methods=['POST'])
@require_login
@require_role('ops')
def create_dentist():
    body = request.get_json(silent=True) or {}
    for f in ('employee_no', 'name', 'birth_date', 'home_address', 'phone', 'email'):
        if not body.get(f):
            raise BizError(f'必填字段缺失：{f}')
    did = logic.add_dentist(g.conn, g.user['user_id'], body['employee_no'], body['name'],
                            body['birth_date'], body['home_address'], body['phone'], body['email'],
                            body.get('qualifications'))
    return jsonify({'dentist_id': did})


@app.route('/api/dentists/<int:did>', methods=['PUT'])
@require_login
@require_role('ops')
def update_dentist(did):
    body = request.get_json(silent=True) or {}
    d = g.conn.execute("SELECT * FROM dentists WHERE dentist_id=?", (did,)).fetchone()
    if not d:
        raise BizError('牙医不存在')
    sets, vals = [], []
    for f in ('name', 'phone', 'email', 'home_address', 'active'):
        if f in body:
            sets.append(f'{f}=?')
            vals.append(body[f])
    if not sets:
        raise BizError('没有需要更新的字段')
    vals.append(did)
    g.conn.execute(f"UPDATE dentists SET {', '.join(sets)} WHERE dentist_id=?", vals)
    logic.audit(g.conn, g.user['user_id'], 'dentists', did, '更新牙医资料',
                before={k: d[k] for k in ('name', 'phone', 'email', 'active') if k in body})
    g.conn.commit()
    return jsonify({'ok': True})


@app.route('/api/dentists/<int:did>/qualifications', methods=['POST'])
@require_login
@require_role('ops')
def add_dentist_qualification(did):
    body = request.get_json(silent=True) or {}
    if not body.get('qualification_id'):
        raise BizError('请选择资质')
    g.conn.execute("INSERT INTO dentist_qualifications (dentist_id, qualification_id, certificate_no,"
                   " valid_from, valid_until, verification_status) VALUES (?,?,?,?,?,?)",
                   (did, body['qualification_id'], body.get('certificate_no'),
                    body.get('valid_from', '2025-01-01'), body.get('valid_until'),
                    body.get('verification_status', '未核实')))
    logic.audit(g.conn, g.user['user_id'], 'dentists', did, '新增牙医资质',
                after={'qualification_id': body['qualification_id']})
    g.conn.commit()
    return jsonify({'ok': True})


@app.route('/api/schedules', methods=['GET'])
@require_login
@require_role('ops', 'reception')
def list_schedules():
    dentist_id = request.args.get('dentist_id', '').strip()
    sql = ("SELECT s.*, d.name AS dentist_name, d.employee_no, c.clinic_code FROM dentist_schedules s"
           " JOIN dentists d ON d.dentist_id=s.dentist_id JOIN clinics c ON c.clinic_id=s.clinic_id")
    args = []
    if dentist_id:
        sql += " WHERE s.dentist_id=?"
        args.append(int(dentist_id))
    sql += " ORDER BY s.start_at DESC LIMIT 200"
    return jsonify([R(r) for r in g.conn.execute(sql, args).fetchall()])


@app.route('/api/schedules', methods=['POST'])
@require_login
@require_role('ops')
def create_schedule():
    body = request.get_json(silent=True) or {}
    for f in ('dentist_id', 'clinic_id', 'start_at', 'end_at'):
        if body.get(f) is None:
            raise BizError(f'必填字段缺失：{f}')
    sid = logic.add_schedule(g.conn, g.user['user_id'], body['dentist_id'], body['clinic_id'],
                             body['start_at'], body['end_at'])
    return jsonify({'schedule_id': sid})


@app.route('/api/clinics', methods=['POST'])
@require_login
@require_role('ops')
def create_clinic():
    body = request.get_json(silent=True) or {}
    for f in ('clinic_code', 'postal_address', 'manager_name', 'phone', 'email', 'area_m2'):
        if not body.get(f):
            raise BizError(f'必填字段缺失：{f}')
    if g.conn.execute("SELECT 1 FROM clinics WHERE clinic_code=?", (body['clinic_code'],)).fetchone():
        raise BizError(f'门店代码 {body["clinic_code"]} 已存在')
    cid = g.conn.execute("INSERT INTO clinics (clinic_code, postal_address, manager_name, phone, email,"
                         " area_m2) VALUES (?,?,?,?,?,?)",
                         (body['clinic_code'], body['postal_address'], body['manager_name'],
                          body['phone'], body['email'], float(body['area_m2']))).lastrowid
    logic.audit(g.conn, g.user['user_id'], 'clinics', cid, '新增诊所',
                after={'clinic_code': body['clinic_code']})
    g.conn.commit()
    return jsonify({'clinic_id': cid})


@app.route('/api/treatment-types', methods=['POST'])
@require_login
@require_role('ops')
def create_treatment_type():
    body = request.get_json(silent=True) or {}
    for f in ('treatment_code', 'treatment_name', 'unit_name', 'default_unit_price'):
        if not body.get(f):
            raise BizError(f'必填字段缺失：{f}')
    if g.conn.execute("SELECT 1 FROM treatment_types WHERE treatment_code=?",
                      (body['treatment_code'],)).fetchone():
        raise BizError(f'项目代码 {body["treatment_code"]} 已存在')
    tid = g.conn.execute("INSERT INTO treatment_types (treatment_code, treatment_name, unit_name,"
                         " default_unit_price, allows_fraction, qualification_match_mode)"
                         " VALUES (?,?,?,?,?,?)",
                         (body['treatment_code'], body['treatment_name'], body['unit_name'],
                          float(body['default_unit_price']), 1 if body.get('allows_fraction') else 0,
                          body.get('qualification_match_mode', 'ANY'))).lastrowid
    for q in body.get('qualification_ids') or []:
        g.conn.execute("INSERT INTO treatment_qualification_requirements (treatment_type_id,"
                       " qualification_id) VALUES (?,?)", (tid, q))
    logic.audit(g.conn, g.user['user_id'], 'treatment_types', tid, '新增治疗项目',
                after={'treatment_name': body['treatment_name']})
    g.conn.commit()
    return jsonify({'treatment_type_id': tid})


# ================= 患者自助端（小程序患者端；课程要求的扩展） =================
# 患者账号独立于员工账号；患者只能操作/查看自己的数据；预约、取消、改约复用同一套业务规则
PTOKENS = {}  # token -> patient_id


def load_patient(conn, pid):
    p = conn.execute("SELECT p.*, a.login_name FROM patients p"
                     " LEFT JOIN patient_accounts a ON a.patient_id = p.patient_id"
                     " WHERE p.patient_id=?", (pid,)).fetchone()
    return p


def require_patient(f):
    @functools.wraps(f)
    def w(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '').strip() \
            or request.headers.get('X-Token', '').strip()
        pid = PTOKENS.get(token)
        conn = get_conn()
        patient = load_patient(conn, pid) if pid else None
        if not patient:
            conn.close()
            return jsonify({'error': '未登录或登录已失效，请重新登录'}), 401
        g.conn, g.patient = conn, patient
        try:
            return f(*args, **kwargs)
        finally:
            conn.close()
    return w


@app.route('/api/patient/login', methods=['POST'])
def patient_login():
    body = request.get_json(silent=True) or {}
    conn = get_conn()
    login = (body.get('login_name') or '').strip()
    acc = conn.execute("SELECT * FROM patient_accounts WHERE login_name=?", (login,)).fetchone()
    if not acc:
        # 允许用手机号登录
        p = conn.execute("SELECT patient_id FROM patients WHERE phone=?", (login,)).fetchone()
        acc = conn.execute("SELECT * FROM patient_accounts WHERE patient_id=?",
                           (p['patient_id'],)).fetchone() if p else None
    if not acc or not check_password_hash(acc['credential_ref'], body.get('password', '')):
        conn.close()
        return jsonify({'error': '账号或密码不正确'}), 401
    if not acc['active']:
        conn.close()
        return jsonify({'error': '账号已停用'}), 403
    token = secrets.token_hex(16)
    PTOKENS[token] = acc['patient_id']
    patient = load_patient(conn, acc['patient_id'])
    allergies = [R(r) for r in conn.execute(
        "SELECT a.*, t.allergy_name FROM patient_allergies a"
        " JOIN allergy_types t ON t.allergy_type_id=a.allergy_type_id WHERE a.patient_id=?",
        (acc['patient_id'],))]
    conn.close()
    return jsonify({'token': token, 'patient': dict(R(patient), allergies=allergies)})


@app.route('/api/patient/logout', methods=['POST'])
@require_patient
def patient_logout():
    token = request.headers.get('Authorization', '').replace('Bearer ', '').strip() \
        or request.headers.get('X-Token', '').strip()
    PTOKENS.pop(token, None)
    return jsonify({'ok': True})


@app.route('/api/patient/me')
@require_patient
def patient_me():
    allergies = [R(r) for r in g.conn.execute(
        "SELECT a.*, t.allergy_name FROM patient_allergies a"
        " JOIN allergy_types t ON t.allergy_type_id=a.allergy_type_id WHERE a.patient_id=?",
        (g.patient['patient_id'],))]
    return jsonify(dict(R(g.patient), allergies=allergies))


@app.route('/api/patient/me', methods=['PUT'])
@require_patient
def patient_update_me():
    body = request.get_json(silent=True) or {}
    fields = ['phone', 'email', 'billing_address', 'emergency_contact_name', 'emergency_contact_phone']
    sets, vals = [], []
    for f in fields:
        if f in body:
            sets.append(f'{f}=?')
            vals.append(body[f] if body[f] not in ('', None) or f == 'email' else None)
    if not sets:
        raise BizError('没有需要更新的字段')
    vals.append(g.patient['patient_id'])
    g.conn.execute(f"UPDATE patients SET {', '.join(sets)} WHERE patient_id=?", vals)
    logic.audit(g.conn, None, 'patients', g.patient['patient_id'], '患者自助更新资料',
                after={f: body.get(f) for f in fields if f in body})
    g.conn.commit()
    return jsonify(R(load_patient(g.conn, g.patient['patient_id'])))


@app.route('/api/patient/me/allergies', methods=['POST'])
@require_patient
def patient_report_allergy():
    body = request.get_json(silent=True) or {}
    t = g.conn.execute("SELECT * FROM allergy_types WHERE allergy_type_id=?",
                       (body.get('allergy_type_id'),)).fetchone()
    if not t:
        raise BizError('过敏类型不存在')
    row = g.conn.execute("SELECT * FROM patient_allergies WHERE patient_id=? AND allergy_type_id=?",
                         (g.patient['patient_id'], body['allergy_type_id'])).fetchone()
    if row:
        # 已确认的过敏不被患者自报覆盖；仅更新备注
        g.conn.execute("UPDATE patient_allergies SET note=? WHERE patient_allergy_id=?",
                       (body.get('note', row['note']), row['patient_allergy_id']))
        logic.audit(g.conn, None, 'patient_allergies', row['patient_allergy_id'], '患者更新过敏备注')
    else:
        aid = g.conn.execute("INSERT INTO patient_allergies (patient_id, allergy_type_id, status, note,"
                             " recorded_at) VALUES (?,?, '待核实',?,datetime('now','localtime'))",
                             (g.patient['patient_id'], body['allergy_type_id'], body.get('note'))).lastrowid
        logic.audit(g.conn, None, 'patient_allergies', aid, '患者自报过敏（待牙医核实）',
                    after={'allergy_type_id': body['allergy_type_id']})
    g.conn.execute("UPDATE patients SET allergy_inquiry_status='已报告' WHERE patient_id=?",
                   (g.patient['patient_id'],))
    g.conn.commit()
    return jsonify({'ok': True})


@app.route('/api/patient/meta')
@require_patient
def patient_meta():
    c = g.conn
    return jsonify({
        'clinics': [R(r) for r in c.execute("SELECT clinic_id, clinic_code, postal_address, phone"
                                            " FROM clinics WHERE active=1 ORDER BY clinic_code")],
        'treatment_types': [R(r) for r in c.execute(
            "SELECT treatment_type_id, treatment_code, treatment_name, unit_name, default_unit_price"
            " FROM treatment_types WHERE active=1 ORDER BY treatment_code")],
        'allergy_types': [R(r) for r in c.execute("SELECT * FROM allergy_types ORDER BY allergy_name")],
    })


@app.route('/api/patient/slots')
@require_patient
def patient_slots():
    clinic_id = request.args.get('clinic_id', type=int)
    date = request.args.get('date', '').strip()
    tt = request.args.get('treatment_type_id', type=int)
    if not clinic_id or not date:
        raise BizError('请选择诊所和日期')
    return jsonify(logic.available_slots(g.conn, clinic_id, date, tt))


@app.route('/api/patient/visits', methods=['GET'])
@require_patient
def patient_visits():
    rows = [R(r) for r in g.conn.execute(
        "SELECT v.*, d.name AS dentist_name, d.employee_no AS dentist_no, c.clinic_code,"
        " c.postal_address, prev.visit_no AS previous_no"
        " FROM visits v JOIN dentists d ON d.dentist_id=v.dentist_id"
        " JOIN clinics c ON c.clinic_id=v.clinic_id"
        " LEFT JOIN visits prev ON prev.visit_id=v.previous_visit_id"
        " WHERE v.patient_id=? ORDER BY v.scheduled_start DESC", (g.patient['patient_id'],))]
    return jsonify(rows)


@app.route('/api/patient/visits', methods=['POST'])
@require_patient
def patient_book():
    body = request.get_json(silent=True) or {}
    for f in ('clinic_id', 'dentist_id', 'scheduled_start', 'scheduled_end'):
        if body.get(f) is None:
            raise BizError(f'必填字段缺失：{f}')
    vid = logic.book_visit(g.conn, g.patient['patient_id'], body['clinic_id'], body['dentist_id'],
                           body['scheduled_start'], body['scheduled_end'],
                           body.get('requested_treatments', ''), body.get('special_needs'),
                           body.get('treatment_type_id'), None)
    visit = g.conn.execute("SELECT visit_no, scheduled_start FROM visits WHERE visit_id=?",
                           (vid,)).fetchone()
    logic.audit(g.conn, None, 'visits', vid, '患者自助预约',
                after={'visit_no': visit['visit_no'], 'scheduled_start': visit['scheduled_start']})
    g.conn.commit()
    return jsonify({'visit_id': vid, 'visit_no': visit['visit_no']})


@app.route('/api/patient/visits/<int:vid>', methods=['GET'])
@require_patient
def patient_visit_detail(vid):
    v = g.conn.execute("SELECT * FROM visits WHERE visit_id=? AND patient_id=?",
                       (vid, g.patient['patient_id'])).fetchone()
    if not v:
        raise BizError('预约不存在')
    d = g.conn.execute("SELECT name, employee_no FROM dentists WHERE dentist_id=?",
                       (v['dentist_id'],)).fetchone()
    c = g.conn.execute("SELECT clinic_code, postal_address, phone FROM clinics WHERE clinic_id=?",
                       (v['clinic_id'],)).fetchone()
    treatments = [R(r) for r in logic.get_visit_treatments(g.conn, vid)]
    inv = logic.get_invoice(g.conn, vid)
    invoice = dict(inv[0], items=[R(i) for i in inv[1]]) if inv else None
    return jsonify(dict(R(v), dentist_name=d['name'], dentist_no=d['employee_no'],
                        clinic_code=c['clinic_code'], clinic_address=c['postal_address'],
                        treatments=treatments, invoice=invoice))


@app.route('/api/patient/visits/<int:vid>/cancel', methods=['POST'])
@require_patient
def patient_cancel(vid):
    v = g.conn.execute("SELECT 1 FROM visits WHERE visit_id=? AND patient_id=?",
                       (vid, g.patient['patient_id'])).fetchone()
    if not v:
        raise BizError('预约不存在')
    body = request.get_json(silent=True) or {}
    logic.cancel_visit(g.conn, vid, None, '患者', body.get('reason', '患者主动取消'))
    logic.audit(g.conn, None, 'visits', vid, '患者自助取消预约', reason=body.get('reason'))
    g.conn.commit()
    return jsonify({'ok': True})


@app.route('/api/patient/visits/<int:vid>/reschedule', methods=['POST'])
@require_patient
def patient_reschedule(vid):
    v = g.conn.execute("SELECT 1 FROM visits WHERE visit_id=? AND patient_id=?",
                       (vid, g.patient['patient_id'])).fetchone()
    if not v:
        raise BizError('预约不存在')
    body = request.get_json(silent=True) or {}
    for f in ('clinic_id', 'dentist_id', 'scheduled_start', 'scheduled_end'):
        if body.get(f) is None:
            raise BizError(f'必填字段缺失：{f}')
    new_id = logic.reschedule_visit(g.conn, vid, None, body['clinic_id'], body['dentist_id'],
                                    body['scheduled_start'], body['scheduled_end'],
                                    body.get('reason', '患者自助改约'))
    logic.audit(g.conn, None, 'visits', vid, '患者自助改约',
                reason=body.get('reason'), after={'new_visit_id': new_id})
    g.conn.commit()
    return jsonify({'visit_id': new_id})


# ---------------- 网站入口 ----------------

@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/<path:path>')
def site(path):
    full = os.path.join(SITE, path)
    if os.path.isfile(full):
        return app.send_static_file(path)
    return app.send_static_file('index.html')


if __name__ == '__main__':
    db.init_db()
    port = int(os.environ.get('PORT', 8000))  # 云平台部署时由平台注入端口
    print('=' * 60)
    print('安德鲁牙科连锁管理系统 ADC 已启动')
    print('  网站:     http://127.0.0.1:' + str(port))
    print('  小程序:   微信开发者工具导入 miniprogram 目录')
    print('            需勾选「不校验合法域名」，API 地址 http://127.0.0.1:' + str(port))
    print('  演示账号: F-1001 前台 / D-3012·D-3015 牙医 / C-4001 财务 / O-5001 运营 / H-6001 总部（密码 123456）')
    print('=' * 60)
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
