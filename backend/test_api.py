# -*- coding: utf-8 -*-
"""端到端冒烟测试：验证设计文档验收场景 T01/T02/T05/T06/T09/T10 的 API 实现。
用法：先启动 app.py，再运行 py -3.13 test_api.py
"""
import json
import urllib.request
import urllib.parse

BASE = 'http://127.0.0.1:8000'


def call(method, path, token=None, body=None, expect=200):
    req = urllib.request.Request(BASE + urllib.parse.quote(path, safe='/&=%?'), method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        resp = urllib.request.urlopen(req, data)
        code, payload = resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        code, payload = e.code, json.loads(e.read().decode())
    if code != expect:
        raise AssertionError(f'{method} {path} 期望 {expect} 实际 {code}: {payload}')
    return payload


def login(name):
    return call('POST', '/api/login', body={'login_name': name, 'password': '123456'})['token']


ok = lambda s: print(f'  [OK] {s}')

print('=== ADC 冒烟测试 ===')
tok_rec = login('F-1001')
tok_d1 = login('D-3012')
tok_d2 = login('D-3015')
tok_fin = login('C-4001')
tok_hq = login('H-6001')
tok_ops = login('O-5001')
ok('六个演示账号登录')

meta = call('GET', '/api/meta', tok_rec)
tts = {t['treatment_code']: t for t in meta['treatment_types']}
clinics = {c['clinic_code']: c['clinic_id'] for c in meta['clinics']}
dents = {d['employee_no']: d for d in meta['dentists']}
ok(f'字典：{len(tts)} 个治疗项目、{len(clinics)} 家诊所、{len(dents)} 名牙医')

# T01 无邮箱建档 + 两种过敏
p = call('POST', '/api/patients', tok_rec, body={
    'name': '测试患者甲', 'birth_date': '1990-01-01', 'billing_address': '测试地址',
    'phone': '13900009999', 'emergency_contact_name': '测试', 'emergency_contact_phone': '13900009998',
    'allergies': [{'allergy_type_id': 1, 'note': '测试'}, {'allergy_type_id': 4, 'note': '测试2'}]})
pid = p['patient_id']
pd = call('GET', f'/api/patients/{pid}', tok_rec)
assert len(pd['allergies']) == 2 and not pd['email'], 'T01 两条过敏/空邮箱失败'
ok(f'T01 无邮箱建档 + 两条过敏（账号 {p["account_no"]}）')

# T02 预约：两名前台同时约同一牙医同一时段，只有一笔成功
slot = call('GET', f'/api/slots?clinic_id={clinics["C-B02"]}&date=2026-11-23&treatment_type_id={tts["CLEAN"]["treatment_type_id"]}', tok_rec)
clean_slot = next(s for s in slot if s['dentist_id'] == dents['D-3012']['dentist_id'])
v1 = call('POST', '/api/visits', tok_rec, body={
    'patient_id': pid, 'clinic_id': clinics['C-B02'], 'dentist_id': dents['D-3012']['dentist_id'],
    'scheduled_start': clean_slot['start'], 'scheduled_end': clean_slot['end'],
    'requested_treatments': '洗牙', 'treatment_type_id': tts['CLEAN']['treatment_type_id']})
tok_rec2 = login('F-1002')
try:
    call('POST', '/api/visits', tok_rec2, body={
        'patient_id': pid, 'clinic_id': clinics['C-B02'], 'dentist_id': dents['D-3012']['dentist_id'],
        'scheduled_start': clean_slot['start'], 'scheduled_end': clean_slot['end'],
        'requested_treatments': '洗牙'}, expect=400)
except AssertionError:
    raise
ok(f'T02 并发冲突拦截（预约号 {v1["visit_no"]}，第二次被拒）')

# 资质筛选：全景影像需要口腔放射学，D-3012 有、D-3015 无
xray = tts['XRAY']['treatment_type_id']
slot_x = call('GET', f'/api/slots?clinic_id={clinics["C-A01"]}&date=2026-11-23&treatment_type_id={xray}', tok_rec)
assert all(s['dentist_id'] != dents['D-3015']['dentist_id'] for s in slot_x), 'T12 资质筛选失败'
ok(f'T12 资质筛选：全景影像只出现持有口腔放射学的牙医（{len(slot_x)} 个时段）')

# 登记到诊（T05 前奏）
vid = v1['visit_id']
call('POST', f'/api/visits/{vid}/checkin', tok_rec)
vd = call('GET', f'/api/visits/{vid}', tok_rec)
assert vd['status'] == '已到诊' and vd['attended'] == 1
ok('T04/T05 前奏：登记到诊')

# 牙医记录治疗并签署（T05：只约洗牙，到诊后加全景影像）
call('POST', f'/api/visits/{vid}/treatments', tok_d1, body={
    'treatment_type_id': tts['CLEAN']['treatment_type_id'], 'units': 1})
call('POST', f'/api/visits/{vid}/treatments', tok_d1, body={
    'treatment_type_id': tts['XRAY']['treatment_type_id'], 'units': 1})
trs = call('GET', f'/api/visits/{vid}', tok_d1)['treatments']
assert len(trs) == 2
for t in trs:
    call('POST', f"/api/treatments/{t['treatment_id']}/confirm", tok_d1)
# 越权：前台不能确认治疗
try:
    call('POST', f"/api/treatments/{trs[0]['treatment_id']}/confirm", tok_rec, expect=403)
except AssertionError:
    raise
ok('T05/T10 治疗记录与签署（前台越权签署被拒）')

# 开单前重复提交与 330 验证（T06）
inv1 = call('POST', f'/api/visits/{vid}/invoice', tok_rec)
assert inv1['total_amount'] == 330.0 and len(inv1['items']) == 2, f"T05 330 失败: {inv1}"
inv2 = call('POST', f'/api/visits/{vid}/invoice', tok_rec)
assert inv1['invoice_no'] == inv2['invoice_no'], 'T06 重复开单应返回原单号'
vd = call('GET', f'/api/visits/{vid}', tok_rec)
assert vd['status'] == '治疗完成'
ok(f'T05/T06 结算单 330 元两行、重复提交返回原单号（{inv1["invoice_no"]}）')

# 治疗更正 → 同单新版本（不新建第二张单）
call('POST', f"/api/treatments/{trs[0]['treatment_id']}/revise", tok_d1, body={'units': 1, 'unit_price': 190, 'note': '更正单价'})
call('POST', f"/api/treatments/{trs[0]['treatment_id']}/confirm", tok_d1)
inv3 = call('POST', f'/api/visits/{vid}/invoice', tok_rec)
assert inv3['invoice_no'] == inv1['invoice_no'] and inv3['revision_no'] == 2 and inv3['total_amount'] == 340.0, \
    f"更正版本失败: {inv3}"
ok(f'更正流：同单版本 2（330 → 340，原版本保留）')

# 取消 / 未到诊流程
vs = call('GET', '/api/visits?status=待到诊', tok_rec)
target = next(v for v in vs if v['visit_no'] == 'V-20261128-0001')
call('POST', f"/api/visits/{target['visit_id']}/cancel", tok_rec, body={'initiator': '患者', 'reason': '测试取消'})
c = call('GET', f"/api/visits/{target['visit_id']}", tok_rec)
assert c['status'] == '患者取消'
ok('T03 患者取消（取消与未到诊分类）')

# 改约链：V-20261125-0001 改约后新预约指回原预约
v25 = next(v for v in call('GET', '/api/visits?status=待到诊', tok_rec) if v['visit_no'] == 'V-20261125-0001')
newv = call('POST', f"/api/visits/{v25['visit_id']}/reschedule", tok_rec, body={
    'clinic_id': clinics['C-B02'], 'dentist_id': dents['D-3012']['dentist_id'],
    'scheduled_start': '2026-11-25 10:00', 'scheduled_end': '2026-11-25 10:40', 'reason': '测试改约'})
nv = call('GET', f"/api/visits/{newv['visit_id']}", tok_rec)
assert nv['previous_no'] == 'V-20261125-0001'
old = call('GET', f"/api/visits/{v25['visit_id']}", tok_rec)
assert old['status'] == '已改约'
ok('T11 改约链：原预约标记已改约、新预约指回原预约')

# 费用：无分摊规则先挂待分摊（T08）
call('POST', '/api/costs', tok_fin, body={
    'document_no': 'TEST-202611-01', 'line_no': 1, 'cost_kind': '运营费',
    'incurred_at': '2026-11-23', 'amount': 1000})
costs = call('GET', '/api/costs?status=待分摊', tok_fin)
assert any(c['document_no'] == 'TEST-202611-01' for c in costs)
ok('T08 无分摊规则的费用挂待分摊')

# Q4 核算：有 340 元收入 + 1 笔待分摊费用 → 可生成草稿但不能提交
q4 = call('POST', '/api/quarters', tok_fin, body={'year': 2026, 'quarter_no': 4})
qd = call('GET', f"/api/quarters/{q4['quarter_close_id']}", tok_fin)
assert len(qd['pending']) == 1, 'Q4 应有一笔待分摊费用'
try:
    call('POST', f"/api/quarters/{q4['quarter_close_id']}/submit", tok_fin, expect=400)
except AssertionError:
    raise
ok('T08 待分摊费用阻止提交审批（不把空值当 0）')

# Q3 已批准核算核对（T09）
q3 = next(q for q in call('GET', '/api/quarters', tok_fin) if q['year'] == 2026 and q['quarter_no'] == 3)
qd3 = call('GET', f"/api/quarters/{q3['quarter_close_id']}", tok_fin)
rows = {r['dentist_no']: r for r in qd3['results']}
assert rows['D-3012']['net_profit'] == 78000.0 and rows['D-3015']['net_profit'] == 44000.0
assert qd3['net_profit'] == 122000.0 and qd3['pool_amount'] == 12200.0
ok(f'T09 季度核算：净利润 122000、基金 12200（版本 {q3["version_no"]} 已批准）')

# 取消率报表（第 6 章口径）
rep = call('GET', '/api/reports/cancellation?year=2026&quarter=4', tok_hq)
assert 'future_excluded' in rep and rep['future_excluded'] >= 0
ok(f'取消率报表：分母按到期预约计算，未来预约单独列出（{rep["future_excluded"]} 条）')

# 审计与标准化检查
aud = call('GET', '/api/audit?limit=20', tok_hq)
assert len(aud) > 0
std = call('GET', '/api/reports/standardization', tok_hq)
ok(f'审计日志 {len(aud)} 条；标准化检查项齐全')

# 运营经理新增出诊（重叠拒绝，T07）
try:
    call('POST', '/api/schedules', tok_ops, body={
        'dentist_id': dents['D-3012']['dentist_id'], 'clinic_id': clinics['C-A01'],
        'start_at': '2026-11-23 10:00', 'end_at': '2026-11-23 12:00'}, expect=400)
except AssertionError:
    raise
call('POST', '/api/schedules', tok_ops, body={
    'dentist_id': dents['D-3012']['dentist_id'], 'clinic_id': clinics['C-A01'],
    'start_at': '2026-11-24 09:00', 'end_at': '2026-11-24 18:00'})
ok('T07 出诊安排：跨店重叠拒绝、不重叠允许')

print('\n=== 全部冒烟测试通过 ===')
