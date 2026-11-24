# -*- coding: utf-8 -*-
"""ADC 安德鲁牙科连锁管理系统 — 数据库结构（设计文档第 11 章 25 张逻辑表）与演示数据。
字段名与《ADC拟开发项目与业务需求说明》第 11 章保持一致；SQLite 类型映射：
BIGINT→INTEGER, VARCHAR→TEXT, TIMESTAMP/DATE→TEXT(ISO), BOOLEAN→INTEGER(0/1), DECIMAL→REAL。
金额在应用中统一按两位小数四舍五入后再入库。
"""
import sqlite3
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'adc.db')

SCHEMA = [
    # ---- 11.1 患者与预约 ----
    """CREATE TABLE IF NOT EXISTS patients (
        patient_id INTEGER PRIMARY KEY, account_no TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        birth_date TEXT NOT NULL, billing_address TEXT NOT NULL, phone TEXT NOT NULL,
        email TEXT, emergency_contact_name TEXT NOT NULL, emergency_contact_phone TEXT NOT NULL,
        allergy_inquiry_status TEXT NOT NULL DEFAULT '未询问', row_version INTEGER NOT NULL DEFAULT 0)""",
    """CREATE TABLE IF NOT EXISTS allergy_types (
        allergy_type_id INTEGER PRIMARY KEY, allergy_name TEXT NOT NULL UNIQUE, description TEXT)""",
    """CREATE TABLE IF NOT EXISTS patient_allergies (
        patient_allergy_id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
        allergy_type_id INTEGER NOT NULL REFERENCES allergy_types(allergy_type_id),
        status TEXT NOT NULL DEFAULT '待核实', note TEXT, recorded_at TEXT NOT NULL,
        verified_by INTEGER REFERENCES dentists(dentist_id),
        UNIQUE(patient_id, allergy_type_id))""",
    """CREATE TABLE IF NOT EXISTS visits (
        visit_id INTEGER PRIMARY KEY, visit_no TEXT NOT NULL UNIQUE,
        patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
        dentist_id INTEGER NOT NULL REFERENCES dentists(dentist_id),
        clinic_id INTEGER NOT NULL REFERENCES clinics(clinic_id),
        scheduled_start TEXT NOT NULL, scheduled_end TEXT NOT NULL,
        requested_treatments TEXT, special_needs TEXT,
        attended INTEGER NOT NULL DEFAULT 0, arrived_at TEXT,
        status TEXT NOT NULL DEFAULT '待到诊',
        previous_visit_id INTEGER REFERENCES visits(visit_id),
        cancelled_at TEXT, cancel_initiator TEXT, reason TEXT,
        created_by INTEGER REFERENCES user_accounts(user_id),
        row_version INTEGER NOT NULL DEFAULT 0,
        CHECK(scheduled_start < scheduled_end))""",
    # ---- 11.2 人员诊所与资质 ----
    """CREATE TABLE IF NOT EXISTS dentists (
        dentist_id INTEGER PRIMARY KEY, employee_no TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        birth_date TEXT NOT NULL, home_address TEXT NOT NULL, phone TEXT NOT NULL,
        email TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)""",
    """CREATE TABLE IF NOT EXISTS clinics (
        clinic_id INTEGER PRIMARY KEY, clinic_code TEXT NOT NULL UNIQUE,
        postal_address TEXT NOT NULL, manager_name TEXT NOT NULL, phone TEXT NOT NULL,
        email TEXT NOT NULL, area_m2 REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1)""",
    """CREATE TABLE IF NOT EXISTS qualifications (
        qualification_id INTEGER PRIMARY KEY, qualification_name TEXT NOT NULL UNIQUE,
        active INTEGER NOT NULL DEFAULT 1)""",
    """CREATE TABLE IF NOT EXISTS dentist_qualifications (
        dentist_qualification_id INTEGER PRIMARY KEY,
        dentist_id INTEGER NOT NULL REFERENCES dentists(dentist_id),
        qualification_id INTEGER NOT NULL REFERENCES qualifications(qualification_id),
        certificate_no TEXT, valid_from TEXT NOT NULL, valid_until TEXT,
        verification_status TEXT NOT NULL DEFAULT '未核实',
        UNIQUE(dentist_id, qualification_id, valid_from))""",
    # ---- 11.3 出诊与实际治疗 ----
    """CREATE TABLE IF NOT EXISTS dentist_schedules (
        schedule_id INTEGER PRIMARY KEY, dentist_id INTEGER NOT NULL REFERENCES dentists(dentist_id),
        clinic_id INTEGER NOT NULL REFERENCES clinics(clinic_id),
        start_at TEXT NOT NULL, end_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT '有效',
        CHECK(start_at < end_at))""",
    """CREATE TABLE IF NOT EXISTS treatment_types (
        treatment_type_id INTEGER PRIMARY KEY, treatment_code TEXT NOT NULL UNIQUE,
        treatment_name TEXT NOT NULL, unit_name TEXT NOT NULL,
        default_unit_price REAL NOT NULL, allows_fraction INTEGER NOT NULL DEFAULT 0,
        qualification_match_mode TEXT NOT NULL DEFAULT 'ANY', active INTEGER NOT NULL DEFAULT 1)""",
    """CREATE TABLE IF NOT EXISTS treatment_qualification_requirements (
        treatment_type_id INTEGER NOT NULL REFERENCES treatment_types(treatment_type_id),
        qualification_id INTEGER NOT NULL REFERENCES qualifications(qualification_id),
        requirement_note TEXT, PRIMARY KEY(treatment_type_id, qualification_id))""",
    """CREATE TABLE IF NOT EXISTS performed_treatments (
        treatment_id INTEGER PRIMARY KEY, visit_id INTEGER NOT NULL REFERENCES visits(visit_id),
        treatment_type_id INTEGER NOT NULL REFERENCES treatment_types(treatment_type_id),
        created_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS treatment_revisions (
        treatment_id INTEGER NOT NULL REFERENCES performed_treatments(treatment_id),
        version_no INTEGER NOT NULL,
        performer_dentist_id INTEGER NOT NULL REFERENCES dentists(dentist_id),
        units REAL NOT NULL, unit_price REAL NOT NULL,
        performed_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT '草稿',
        is_current INTEGER NOT NULL DEFAULT 1,
        confirmed_by INTEGER REFERENCES dentists(dentist_id), confirmed_at TEXT,
        note TEXT, PRIMARY KEY(treatment_id, version_no))""",
    # ---- 11.4 结算单与费用来源 ----
    """CREATE TABLE IF NOT EXISTS invoices (
        invoice_id INTEGER PRIMARY KEY, invoice_no TEXT NOT NULL UNIQUE,
        visit_id INTEGER NOT NULL UNIQUE REFERENCES visits(visit_id),
        created_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS invoice_revisions (
        invoice_revision_id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(invoice_id),
        revision_no INTEGER NOT NULL, status TEXT NOT NULL DEFAULT '草稿',
        is_current INTEGER NOT NULL DEFAULT 1, total_amount REAL NOT NULL DEFAULT 0,
        issued_at TEXT, approved_by INTEGER REFERENCES user_accounts(user_id),
        UNIQUE(invoice_id, revision_no))""",
    """CREATE TABLE IF NOT EXISTS invoice_items (
        invoice_item_id INTEGER PRIMARY KEY, invoice_revision_id INTEGER NOT NULL REFERENCES invoice_revisions(invoice_revision_id),
        treatment_id INTEGER NOT NULL, version_no INTEGER NOT NULL,
        name_snapshot TEXT NOT NULL, units_snapshot REAL NOT NULL, unit_price_snapshot REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY(treatment_id, version_no) REFERENCES treatment_revisions(treatment_id, version_no),
        UNIQUE(invoice_revision_id, treatment_id))""",
    """CREATE TABLE IF NOT EXISTS cost_entries (
        cost_entry_id INTEGER PRIMARY KEY, document_no TEXT NOT NULL, line_no INTEGER NOT NULL,
        cost_kind TEXT NOT NULL, incurred_at TEXT NOT NULL, amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT '待分摊', adjusts_cost_id INTEGER REFERENCES cost_entries(cost_entry_id),
        recorded_by INTEGER NOT NULL REFERENCES user_accounts(user_id),
        allocation_rule_version TEXT, UNIQUE(document_no, line_no),
        CHECK(amount > 0))""",
    # ---- 11.5 费用归属与季度结果 ----
    """CREATE TABLE IF NOT EXISTS cost_allocations (
        cost_allocation_id INTEGER PRIMARY KEY, cost_entry_id INTEGER NOT NULL REFERENCES cost_entries(cost_entry_id),
        dentist_id INTEGER NOT NULL REFERENCES dentists(dentist_id),
        treatment_id INTEGER, version_no INTEGER,
        allocated_amount REAL NOT NULL, status TEXT NOT NULL DEFAULT '待确认',
        FOREIGN KEY(treatment_id, version_no) REFERENCES treatment_revisions(treatment_id, version_no),
        CHECK((treatment_id IS NULL) = (version_no IS NULL)))""",
    """CREATE TABLE IF NOT EXISTS quarter_closes (
        quarter_close_id INTEGER PRIMARY KEY, year INTEGER NOT NULL, quarter_no INTEGER NOT NULL,
        version_no INTEGER NOT NULL, cutoff_at TEXT NOT NULL, policy_version TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT '草稿', net_profit REAL NOT NULL DEFAULT 0,
        pool_amount REAL, approved_by INTEGER REFERENCES user_accounts(user_id), approved_at TEXT,
        created_by INTEGER REFERENCES user_accounts(user_id), created_at TEXT NOT NULL,
        UNIQUE(year, quarter_no, version_no))""",
    """CREATE TABLE IF NOT EXISTS dentist_quarter_results (
        result_id INTEGER PRIMARY KEY, quarter_close_id INTEGER NOT NULL REFERENCES quarter_closes(quarter_close_id),
        dentist_id INTEGER NOT NULL REFERENCES dentists(dentist_id),
        revenue REAL NOT NULL DEFAULT 0, material_cost REAL NOT NULL DEFAULT 0,
        operating_expense REAL NOT NULL DEFAULT 0, net_profit REAL NOT NULL DEFAULT 0,
        UNIQUE(quarter_close_id, dentist_id))""",
    """CREATE TABLE IF NOT EXISTS quarter_result_sources (
        source_id INTEGER PRIMARY KEY, result_id INTEGER NOT NULL REFERENCES dentist_quarter_results(result_id),
        source_kind TEXT NOT NULL, invoice_item_id INTEGER REFERENCES invoice_items(invoice_item_id),
        cost_allocation_id INTEGER REFERENCES cost_allocations(cost_allocation_id),
        amount_snapshot REAL NOT NULL,
        CHECK((invoice_item_id IS NULL) != (cost_allocation_id IS NULL)))""",
    # ---- 11.6 权限与审计 ----
    """CREATE TABLE IF NOT EXISTS user_accounts (
        user_id INTEGER PRIMARY KEY, login_name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
        dentist_id INTEGER UNIQUE REFERENCES dentists(dentist_id),
        credential_ref TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)""",
    """CREATE TABLE IF NOT EXISTS roles (
        role_id INTEGER PRIMARY KEY, role_code TEXT NOT NULL UNIQUE, role_name TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS user_roles (
        user_id INTEGER NOT NULL REFERENCES user_accounts(user_id),
        role_id INTEGER NOT NULL REFERENCES roles(role_id), PRIMARY KEY(user_id, role_id))""",
    """CREATE TABLE IF NOT EXISTS audit_logs (
        audit_id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES user_accounts(user_id),
        entity_type TEXT NOT NULL, entity_key TEXT NOT NULL, action TEXT NOT NULL,
        happened_at TEXT NOT NULL, reason TEXT, before_value TEXT, after_value TEXT)""",
    # ---- 患者自助端（课程要求的扩展；患者账号独立于员工账号，不并入 25 张业务表） ----
    """CREATE TABLE IF NOT EXISTS patient_accounts (
        account_id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL UNIQUE REFERENCES patients(patient_id),
        login_name TEXT NOT NULL UNIQUE, credential_ref TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)""",
]

# 全部表名（按依赖顺序，供重置时逆序删除）
TABLES = ['patient_allergies', 'patient_accounts', 'visits', 'dentist_qualifications', 'dentist_schedules',
          'treatment_qualification_requirements', 'performed_treatments', 'treatment_revisions',
          'invoices', 'invoice_revisions', 'invoice_items', 'cost_entries', 'cost_allocations',
          'quarter_closes', 'dentist_quarter_results', 'quarter_result_sources',
          'user_accounts', 'user_roles', 'audit_logs',
          'patients', 'allergy_types', 'dentists', 'clinics', 'qualifications',
          'treatment_types', 'roles']

# 常用索引（设计文档 10.7）
INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id)",
    "CREATE INDEX IF NOT EXISTS idx_visits_dentist_start ON visits(dentist_id, scheduled_start)",
    "CREATE INDEX IF NOT EXISTS idx_visits_clinic_status ON visits(clinic_id, status, scheduled_start)",
    "CREATE INDEX IF NOT EXISTS idx_pa_patient ON patient_allergies(patient_id)",
    "CREATE INDEX IF NOT EXISTS idx_tr_current ON treatment_revisions(treatment_id, is_current)",
    "CREATE INDEX IF NOT EXISTS idx_ii_rev ON invoice_items(invoice_revision_id)",
    "CREATE INDEX IF NOT EXISTS idx_ii_treatment ON invoice_items(treatment_id, version_no)",
    "CREATE INDEX IF NOT EXISTS idx_ca_entry ON cost_allocations(cost_entry_id)",
    "CREATE INDEX IF NOT EXISTS idx_ca_dentist ON cost_allocations(dentist_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_qrs_result ON quarter_result_sources(result_id)",
    "CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_key)",
]

TODAY = datetime(2026, 11, 23)  # 演示数据基准日期


def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _insert(conn, table, **fields):
    cols = ', '.join(fields.keys())
    marks = ', '.join('?' * len(fields))
    cur = conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", list(fields.values()))
    return cur.lastrowid


def _dt(d):
    return d.strftime('%Y-%m-%d %H:%M:%S') if isinstance(d, datetime) else str(d)


def _d(d):
    return d.strftime('%Y-%m-%d') if isinstance(d, datetime) else str(d)


def seed(conn):
    """写入演示数据：与设计文档第 2 章场景、第 6 章核算演示一致（虚拟数据，不含真实患者资料）。"""
    from logic import split_amount, generate_invoice, close_quarter, submit_quarter, approve_quarter, audit
    from werkzeug.security import generate_password_hash

    # ---- 角色 ----
    roles = {'reception': '前台', 'dentist': '牙医', 'finance': '财务', 'ops': '运营经理', 'hq': '总部经理'}
    role_ids = {code: _insert(conn, 'roles', role_code=code, role_name=name) for code, name in roles.items()}

    # ---- 用户 ----
    def user(login, name, dentist_id=None, role_codes=()):
        uid = _insert(conn, 'user_accounts', login_name=login, display_name=name,
                      dentist_id=dentist_id, credential_ref=generate_password_hash('123456'))
        for c in role_codes:
            _insert(conn, 'user_roles', user_id=uid, role_id=role_ids[c])
        return uid

    hq = user('H-6001', '赵德柱', role_codes=('hq',))
    ops = user('O-5001', '吴建国', role_codes=('ops',))
    fin = user('C-4001', '郑晓东', role_codes=('finance',))
    rec1 = user('F-1001', '周小燕', role_codes=('reception',))
    rec2 = user('F-1002', '林芳', role_codes=('reception',))
    _ = rec2
    # 牙医账号先占位（登录名 = 员工工号），dentist_id 在牙医记录创建后回填
    acc_d1 = _insert(conn, 'user_accounts', login_name='D-3012', display_name='李铭',
                     credential_ref=generate_password_hash('123456'))
    acc_d2 = _insert(conn, 'user_accounts', login_name='D-3015', display_name='王雅',
                     credential_ref=generate_password_hash('123456'))

    # ---- 诊所 ----
    c_a = _insert(conn, 'clinics', clinic_code='C-A01', postal_address='城东区人民路88号安德鲁大厦2层',
                  manager_name='吴建国', phone='0571-88001001', email='center@adc-dental.com', area_m2=420)
    c_b = _insert(conn, 'clinics', clinic_code='C-B02', postal_address='滨江区江南大道466号3层',
                  manager_name='周小燕', phone='0571-88001002', email='binjiang@adc-dental.com', area_m2=360)

    # ---- 资质 ----
    qual = {}
    for q in ['口腔放射学', '牙髓病学', '口腔修复', '口腔种植', '正畸', '儿科口腔']:
        qual[q] = _insert(conn, 'qualifications', qualification_name=q)

    # ---- 牙医 ----
    d1 = _insert(conn, 'dentists', employee_no='D-3012', name='李铭', birth_date='1986-04-12',
                 home_address='城东区学院路23号', phone='13700003012', email='liming@adc-dental.com')
    d2 = _insert(conn, 'dentists', employee_no='D-3015', name='王雅', birth_date='1991-09-25',
                 home_address='滨江区文苑路77号', phone='13700003015', email='wangya@adc-dental.com')
    conn.execute("UPDATE user_accounts SET dentist_id=? WHERE user_id=?", (d1, acc_d1))
    conn.execute("UPDATE user_accounts SET dentist_id=? WHERE user_id=?", (d2, acc_d2))
    _insert(conn, 'user_roles', user_id=acc_d1, role_id=role_ids['dentist'])
    _insert(conn, 'user_roles', user_id=acc_d2, role_id=role_ids['dentist'])
    for dentist, qs in [(d1, ['口腔放射学', '口腔修复', '口腔种植']),
                        (d2, ['牙髓病学', '正畸', '儿科口腔'])]:
        for qn in qs:
            _insert(conn, 'dentist_qualifications', dentist_id=dentist, qualification_id=qual[qn],
                    certificate_no=f'ZC-{qn}-{dentist}', valid_from='2023-01-01',
                    verification_status='已核实')

    # ---- 过敏类型 ----
    at = {}
    for name in ['乳胶', '麻醉剂', '金属', '树脂']:
        at[name] = _insert(conn, 'allergy_types', allergy_name=name)

    # ---- 治疗项目目录 ----
    tts = {}
    for code, name, unit, price, frac, qs in [
        ('CLEAN', '洗牙', '次', 180.0, 0, []),
        ('XRAY', '全景影像', '次', 150.0, 0, ['口腔放射学']),
        ('POLISH', '抛光', '次', 100.0, 0, []),
        ('FILL', '修复充填', '颗', 300.0, 0, ['口腔修复']),
        ('RCT', '根管治疗', '次', 800.0, 0, ['牙髓病学']),
        ('IMPLANT', '种植牙', '颗', 9000.0, 0, ['口腔种植']),
        ('ORTHO', '正畸', '疗程', 12000.0, 0, ['正畸']),
        ('PEDO', '儿童涂氟', '次', 120.0, 0, ['儿科口腔']),
    ]:
        tid = _insert(conn, 'treatment_types', treatment_code=code, treatment_name=name,
                      unit_name=unit, default_unit_price=price, allows_fraction=frac,
                      qualification_match_mode='ANY')
        tts[code] = tid
        for qn in qs:
            _insert(conn, 'treatment_qualification_requirements',
                    treatment_type_id=tid, qualification_id=qual[qn])

    # ---- 患者（第 2 章场景演示） ----
    def patient(no, name, birth, phone, addr, em, ecn, ecp, inquiry, allergies=()):
        pid = _insert(conn, 'patients', account_no=no, name=name, birth_date=birth,
                      billing_address=addr, phone=phone, email=em,
                      emergency_contact_name=ecn, emergency_contact_phone=ecp,
                      allergy_inquiry_status=inquiry)
        for a, status, note in allergies:
            _insert(conn, 'patient_allergies', patient_id=pid, allergy_type_id=at[a],
                    status=status, note=note, recorded_at=_dt(TODAY - timedelta(days=200)),
                    verified_by=d1 if status == '已确认' else None)
        return pid

    p1 = patient('P-1001', '陈雨桐', '1992-03-14', '13800001001', '城东区幸福路12号', None,
                 '陈建国', '13900001001', '已报告',
                 [('乳胶', '已确认', '接触乳胶手套出现皮疹'), ('树脂', '已确认', None)])
    p2 = patient('P-1002', '刘明轩', '1988-07-02', '13800001002', '滨江区春晓路9号', None,
                 '刘桂芳', '13900001002', '已报告',
                 [('麻醉剂', '待核实', '患者自述对麻醉剂过敏，尚未经牙医核实')])
    p3 = patient('P-1003', '王淑芬', '1975-11-20', '13800001003', '城东区望江路3号', 'wsf@example.com',
                 '王志强', '13900001003', '未询问')
    p4 = patient('P-1004', '张伟', '1995-01-08', '13800001004', '滨江区滨和路156号', None,
                 '张丽', '13900001004', '未询问')
    p5 = patient('P-1005', '李静', '1990-05-16', '13800001005', '城东区文一西路88号', 'lijing@example.com',
                 '李国强', '13900001005', '未询问')
    p6 = patient('P-1006', '赵一鸣', '2001-09-30', '13800001006', '滨江区江陵路200号', None,
                 '赵海', '13900001006', '已报告', [('金属', '待核实', '金属牙冠佩戴后不适')])

    # ---- 预约/就诊（第 2 章场景） ----
    def visit(no, pid, did, cid, start, end, status, requested, special=None,
              attended=0, arrived=None, prev=None, cancelled=None, initiator=None, reason=None):
        return _insert(conn, 'visits', visit_no=no, patient_id=pid, dentist_id=did, clinic_id=cid,
                       scheduled_start=_dt(start), scheduled_end=_dt(end),
                       requested_treatments=requested, special_needs=special, attended=attended,
                       arrived_at=_dt(arrived) if arrived else None, status=status,
                       previous_visit_id=prev, cancelled_at=_dt(cancelled) if cancelled else None,
                       cancel_initiator=initiator, reason=reason, created_by=rec1)

    visit('V-20261123-0001', p1, d1, c_b, datetime(2026, 11, 23, 14, 0), datetime(2026, 11, 23, 14, 40),
          '待到诊', '洗牙', '换店就诊：核对过敏档案（乳胶、树脂）')          # 场景A：老患者换店
    visit('V-20261123-0002', p2, d2, c_a, datetime(2026, 11, 23, 15, 0), datetime(2026, 11, 23, 15, 40),
          '待到诊', '医生评估', '半年前心脏手术史，请医生评估后安排治疗')      # 场景D：新患者首次建档
    visit('V-20261122-0001', p3, d1, c_a, datetime(2026, 11, 22, 10, 0), datetime(2026, 11, 22, 10, 40),
          '患者取消', '修复充填', reason='家中有事，改日再来',
          cancelled=datetime(2026, 11, 22, 9, 12), initiator='患者')
    visit('V-20261121-0001', p4, d2, c_a, datetime(2026, 11, 21, 9, 30), datetime(2026, 11, 21, 10, 10),
          '未到诊', '洗牙', reason='已电话联系，确认爽约')
    v_old = visit('V-20261118-0001', p5, d1, c_a, datetime(2026, 11, 18, 9, 0), datetime(2026, 11, 18, 9, 40),
                  '已改约', '抛光', reason='患者要求改到下周')                  # 改约链：原预约
    visit('V-20261125-0001', p5, d1, c_b, datetime(2026, 11, 25, 9, 0), datetime(2026, 11, 25, 9, 40),
          '待到诊', '抛光', prev=v_old)                                       # 改约链：新预约
    visit('V-20261128-0001', p6, d2, c_b, datetime(2026, 11, 28, 16, 0), datetime(2026, 11, 28, 16, 40),
          '待到诊', '根管治疗')

    # ---- 出诊安排（支持本周预约） ----
    def sched(did, cid, start, end):
        _insert(conn, 'dentist_schedules', dentist_id=did, clinic_id=cid,
                start_at=_dt(start), end_at=_dt(end), status='有效')

    sched(d1, c_b, datetime(2026, 11, 23, 9, 0), datetime(2026, 11, 23, 18, 0))
    sched(d1, c_b, datetime(2026, 11, 25, 9, 0), datetime(2026, 11, 25, 18, 0))
    sched(d1, c_a, datetime(2026, 11, 22, 9, 0), datetime(2026, 11, 22, 18, 0))
    sched(d2, c_a, datetime(2026, 11, 21, 9, 0), datetime(2026, 11, 21, 18, 0))
    sched(d2, c_a, datetime(2026, 11, 23, 9, 0), datetime(2026, 11, 23, 18, 0))
    sched(d2, c_b, datetime(2026, 11, 28, 9, 0), datetime(2026, 11, 28, 18, 0))

    # ---- 2026 年 Q3 历史数据（对应第 6 章核算演示：D-3012 收入 135000、D-3015 收入 96000） ----
    # D-3012：15 次种植牙 9000×15=135000；D-3015：8 次正畸 12000×8=96000
    q3_visits = []
    for i, d in enumerate([datetime(2026, 7, 1) + timedelta(days=6 * k) for k in range(15)]):
        vd = d + timedelta(hours=9)
        v = visit(f'V-{d:%Y%m%d}-0001', _insert(conn, 'patients', account_no=f'P-9{i + 1:04d}',
                  name=f'演示患者9{i + 1:04d}', birth_date='1985-01-01', billing_address='演示地址',
                  phone=f'13900009{i + 1:04d}', emergency_contact_name='演示', emergency_contact_phone='13900000000',
                  allergy_inquiry_status='未询问'),
                  d1, c_a, vd, vd + timedelta(minutes=40), '治疗完成', '种植牙', attended=1, arrived=vd - timedelta(minutes=5))
        q3_visits.append(v)
    for i, d in enumerate([datetime(2026, 7, 3) + timedelta(days=12 * k) for k in range(8)]):
        vd = d + timedelta(hours=10)
        v = visit(f'V-{d:%Y%m%d}-0002', _insert(conn, 'patients', account_no=f'P-9{i + 16:04d}',
                  name=f'演示患者9{i + 16:04d}', birth_date='1986-02-02', billing_address='演示地址',
                  phone=f'13900009{i + 16:04d}', emergency_contact_name='演示', emergency_contact_phone='13900000000',
                  allergy_inquiry_status='未询问'),
                  d2, c_b, vd, vd + timedelta(minutes=40), '治疗完成', '正畸', attended=1, arrived=vd - timedelta(minutes=5))
        q3_visits.append(v)

    # 为 Q3 就诊建立已确认治疗并开结算单（走真实业务函数，验证逻辑）
    q3_treatments = {}
    for v in q3_visits:
        row = conn.execute("SELECT * FROM visits WHERE visit_id=?", (v,)).fetchone()
        code = 'IMPLANT' if row['dentist_id'] == d1 else 'ORTHO'
        tid = _insert(conn, 'performed_treatments', visit_id=v, treatment_type_id=tts[code],
                      created_at=_dt(datetime.now()))
        _insert(conn, 'treatment_revisions', treatment_id=tid, version_no=1,
                performer_dentist_id=row['dentist_id'], units=1,
                unit_price=9000.0 if code == 'IMPLANT' else 12000.0,
                performed_at=row['scheduled_start'], status='已确认', is_current=1,
                confirmed_by=row['dentist_id'], confirmed_at=row['scheduled_start'])
        q3_treatments[tid] = row['dentist_id']
        generate_invoice(conn, v, rec1, now=row['scheduled_start'])

    # ---- Q3 费用来源（合计与第 6 章一致：耗材 56000、运营费 53000） ----
    def cost(doc, line, kind, day, amount, dentist, alloc_parts, tids=None, status='已确认'):
        eid = _insert(conn, 'cost_entries', document_no=doc, line_no=line, cost_kind=kind,
                      incurred_at=_d(datetime(2026, 9, day)), amount=amount, status=status,
                      recorded_by=fin)
        parts = split_amount(amount, len(alloc_parts))
        for (dd, amt_ref), part in zip(alloc_parts, parts):
            tid = tids.pop(0) if tids else None
            _insert(conn, 'cost_allocations', cost_entry_id=eid, dentist_id=dd,
                    treatment_id=tid, version_no=1 if tid else None,
                    allocated_amount=part, status='已确认' if status == '已确认' else '待确认')
        return eid

    d1_tids = [t for t, dd in q3_treatments.items() if dd == d1]
    d2_tids = [t for t, dd in q3_treatments.items() if dd == d2]
    # D-3012 耗材 4×8000=32000，分摊到 15 个治疗
    for k in range(4):
        cost(f'MAT-202609-0{k + 1}', 1, '耗材', 30, 8000.0, d1, [(d1, 0)] * (4 if k < 3 else 3),
             tids=[d1_tids.pop(0) for _ in range(4 if k < 3 else 3)])
    # D-3015 耗材 3×8000=24000
    for k in range(3):
        cost(f'MAT-202609-1{k + 1}', 1, '耗材', 30, 8000.0, d2, [(d2, 0)] * (3 if k < 2 else 2),
             tids=[d2_tids.pop(0) for _ in range(3 if k < 2 else 2)])
    # 运营费：D-3012 5×5000=25000；D-3015 4×7000=28000
    for k in range(5):
        cost(f'OPEX-202609-0{k + 1}', 1, '运营费', 30, 5000.0, d1, [(d1, 0)])
    for k in range(4):
        cost(f'OPEX-202609-1{k + 1}', 1, '运营费', 30, 7000.0, d2, [(d2, 0)])

    # ---- Q3 季度核算（走真实业务函数；结果须等于文档 122000/12200） ----
    qc = close_quarter(conn, 2026, 3, fin, cutoff=datetime(2026, 9, 30, 23, 59, 59))
    submit_quarter(conn, qc, fin)
    approve_quarter(conn, qc, hq)
    row = conn.execute("SELECT * FROM quarter_closes WHERE quarter_close_id=?", (qc,)).fetchone()
    assert round(row['net_profit'], 2) == 122000.00, f"Q3 净利润应 122000，实际 {row['net_profit']}"
    assert round(row['pool_amount'], 2) == 12200.00, f"Q3 基金应 12200，实际 {row['pool_amount']}"
    for did, want in [(d1, (135000.0, 32000.0, 25000.0, 78000.0)), (d2, (96000.0, 24000.0, 28000.0, 44000.0))]:
        r = conn.execute("SELECT * FROM dentist_quarter_results WHERE quarter_close_id=? AND dentist_id=?",
                         (qc, did)).fetchone()
        got = (round(r['revenue'], 2), round(r['material_cost'], 2),
               round(r['operating_expense'], 2), round(r['net_profit'], 2))
        assert got == want, f"牙医 {did} Q3 结果应为 {want}，实际 {got}"
    audit(conn, fin, 'quarter_closes', f'{2026}-Q{3}', '初始化已批准季度核算',
          '演示数据初始化：与设计文档第 6 章核算演示一致')

    # ---- 患者自助端账号（小程序患者端登录；默认密码 123456，登录名 = 账号或手机号） ----
    for row in conn.execute("SELECT patient_id, account_no FROM patients").fetchall():
        _insert(conn, 'patient_accounts', patient_id=row['patient_id'], login_name=row['account_no'],
                credential_ref=generate_password_hash('123456'), created_at=_dt(TODAY))

    conn.commit()
    print(f"[seed] 演示数据完成：诊所 {conn.execute('SELECT COUNT(*) c FROM clinics').fetchone()['c']} 家、"
          f"牙医 {conn.execute('SELECT COUNT(*) c FROM dentists').fetchone()['c']} 人、"
          f"患者 {conn.execute('SELECT COUNT(*) c FROM patients').fetchone()['c']} 人、"
          f"预约 {conn.execute('SELECT COUNT(*) c FROM visits').fetchone()['c']} 条、"
          f"结算单 {conn.execute('SELECT COUNT(*) c FROM invoices').fetchone()['c']} 张；"
          f"Q3 核算 122000 元 / 基金 12200 元 [OK]")


def init_db(reset=False):
    conn = get_conn()
    if reset:
        conn.execute("PRAGMA foreign_keys = OFF")
        for t in TABLES:
            conn.execute(f"DROP TABLE IF EXISTS {t}")
        conn.execute("PRAGMA foreign_keys = ON")
    for sql in SCHEMA:
        conn.execute(sql)
    for sql in INDEXES:
        conn.execute(sql)
    if conn.execute("SELECT COUNT(*) c FROM user_accounts").fetchone()['c'] == 0:
        seed(conn)
    conn.commit()
    return conn


if __name__ == '__main__':
    init_db(reset=True)
    print("数据库已初始化:", DB_PATH)
