# -*- coding: utf-8 -*-
"""患者自助端（小程序）API 冒烟测试：患者登录/预约/取消/改约/过敏自报/结算单查看。
用法：先启动 app.py，再运行 py -3.13 test_patient_api.py
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


ok = lambda s: print(f'  [OK] {s}')

print('=== ADC 患者端冒烟测试 ===')

# 登录：账号登录 + 手机号登录
r1 = call('POST', '/api/patient/login', body={'login_name': 'P-1001', 'password': '123456'})
ptok = r1['token']
assert r1['patient']['name'] == '陈雨桐' and len(r1['patient']['allergies']) == 2
r2 = call('POST', '/api/patient/login', body={'login_name': '13800001002', 'password': '123456'})
assert r2['patient']['account_no'] == 'P-1002'
try:
    call('POST', '/api/patient/login', body={'login_name': 'P-1001', 'password': 'wrong'}, expect=401)
except AssertionError:
    raise
ok('患者登录（账号/手机号/密码错误拒绝）')

# 患者不能访问员工接口
try:
    call('GET', '/api/visits', ptok, expect=401)
except AssertionError:
    raise
ok('越权隔离：患者令牌不能访问员工接口')

me = call('GET', '/api/patient/me', ptok)
assert me['account_no'] == 'P-1001' and me['email'] is None
ok('我的档案（含过敏逐项：乳胶/树脂）')

# 自报过敏 → 待核实
call('POST', '/api/patient/me/allergies', ptok, body={'allergy_type_id': 3, 'note': '患者自报金属过敏'})
me2 = call('GET', '/api/patient/me', ptok)
metal = next(a for a in me2['allergies'] if a['allergy_name'] == '金属')
assert metal['status'] == '待核实'
ok('患者自报过敏（状态待核实，等牙医确认）')

# 预约：选诊所/日期/项目 → 可约时段（资质筛选）→ 预约
meta = call('GET', '/api/patient/meta', ptok)
clean = next(t for t in meta['treatment_types'] if t['treatment_name'] == '洗牙')
slots = call('GET', f'/api/patient/slots?clinic_id=2&date=2026-11-25&treatment_type_id={clean["treatment_type_id"]}', ptok)
assert all(s['employee_no'] == 'D-3012' for s in slots) and len(slots) > 0
slot = slots[0]
v = call('POST', '/api/patient/visits', ptok, body={
    'clinic_id': 2, 'dentist_id': slot['dentist_id'],
    'scheduled_start': slot['start'], 'scheduled_end': slot['end'],
    'requested_treatments': '洗牙', 'treatment_type_id': clean['treatment_type_id']})
ok(f'患者自助预约成功 {v["visit_no"]}（11-25 洗牙）')

# 重复预约同一时段被拒
try:
    call('POST', '/api/patient/visits', ptok, body={
        'clinic_id': 2, 'dentist_id': slot['dentist_id'],
        'scheduled_start': slot['start'], 'scheduled_end': slot['end'],
        'requested_treatments': '洗牙'}, expect=400)
except AssertionError:
    raise
ok('冲突拦截：同一时段第二次预约被拒')

# 我的预约列表
vs = call('GET', '/api/patient/visits', ptok)
assert any(x['visit_id'] == v['visit_id'] and x['clinic_code'] == 'C-B02' for x in vs)
ok('我的预约列表（含历史就诊）')

# 改约
new_slots = call('GET', '/api/patient/slots?clinic_id=2&date=2026-11-25&treatment_type_id=1', ptok)
ns = next(s for s in new_slots if s['start'] > slot['end'])
nv = call('POST', f"/api/patient/visits/{v['visit_id']}/reschedule", ptok, body={
    'clinic_id': 2, 'dentist_id': ns['dentist_id'], 'scheduled_start': ns['start'],
    'scheduled_end': ns['end'], 'reason': '时间不合适，改晚一点'})
nd = call('GET', f"/api/patient/visits/{nv['visit_id']}", ptok)
od = call('GET', f"/api/patient/visits/{v['visit_id']}", ptok)
assert nd['previous_visit_id'] == v['visit_id'] and od['status'] == '已改约'
ok('患者改约：原预约标记已改约、新预约指回原预约')

# 患者取消
call('POST', f"/api/patient/visits/{nv['visit_id']}/cancel", ptok, body={'reason': '临时有事'})
cd = call('GET', f"/api/patient/visits/{nv['visit_id']}", ptok)
assert cd['status'] == '患者取消' and cd['cancel_initiator'] == '患者'
ok('患者取消（状态：患者取消，进入取消率统计分母）')

# 结算单查看：由员工走完 到诊→治疗→签署→开单，患者查看
staff = call('POST', '/api/login', body={'login_name': 'reception01', 'password': '123456'})['token']
dent = call('POST', '/api/login', body={'login_name': 'dentist01', 'password': '123456'})['token']
slots2 = call('GET', '/api/patient/slots?clinic_id=2&date=2026-11-23&treatment_type_id=1', ptok)
s2 = slots2[0]
v2 = call('POST', '/api/patient/visits', ptok, body={
    'clinic_id': 2, 'dentist_id': s2['dentist_id'], 'scheduled_start': s2['start'],
    'scheduled_end': s2['end'], 'requested_treatments': '洗牙', 'treatment_type_id': 1})
call('POST', f"/api/visits/{v2['visit_id']}/checkin", staff)
call('POST', f"/api/visits/{v2['visit_id']}/treatments", dent, body={'treatment_type_id': 1, 'units': 1})
call('POST', f"/api/visits/{v2['visit_id']}/treatments", dent, body={'treatment_type_id': 2, 'units': 1})
trs = call('GET', f"/api/visits/{v2['visit_id']}", staff)['treatments']
for t in trs:
    call('POST', f"/api/treatments/{t['treatment_id']}/confirm", dent)
call('POST', f"/api/visits/{v2['visit_id']}/invoice", staff)
pd = call('GET', f"/api/patient/visits/{v2['visit_id']}", ptok)
assert pd['invoice'] and pd['invoice']['total_amount'] == 330.0 and len(pd['invoice']['items']) == 2
assert len(pd['treatments']) == 2
ok(f'患者查看就诊记录与结算单（330 元两行明细，单号 {pd["invoice"]["invoice_no"]}）')

# 患者不能看别人的就诊
p2tok = call('POST', '/api/patient/login', body={'login_name': 'P-1002', 'password': '123456'})['token']
try:
    call('GET', f"/api/patient/visits/{v2['visit_id']}", p2tok, expect=400)
except AssertionError:
    raise
ok('数据隔离：患者只能查看自己的就诊记录')

print('\n=== 患者端全部冒烟测试通过 ===')
