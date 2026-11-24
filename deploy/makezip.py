# -*- coding: utf-8 -*-
"""生成云托管部署 zip（标准正斜杠路径）：
backend/（Flask 后端）+ website/（网站前端，公网域名直接访问）+ Dockerfile
"""
import zipfile
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_BACKEND = os.path.join(HERE, 'cloudpack2', 'backend')
SRC_WEBSITE = r'D:\系统分析与设计\adc_system\website'
DOCKERFILE = os.path.join(HERE, 'cloudpack2', 'Dockerfile')
OUT = os.path.join(HERE, 'cloud-deploy4.zip')

if os.path.exists(OUT):
    os.remove(OUT)
z = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED)

z.write(DOCKERFILE, 'Dockerfile')
for f in os.listdir(SRC_BACKEND):
    full = os.path.join(SRC_BACKEND, f)
    if os.path.isfile(full) and f != '__pycache__':
        z.write(full, 'backend/' + f)
for root, dirs, files in os.walk(SRC_WEBSITE):
    for f in files:
        full = os.path.join(root, f)
        arc = 'website/' + os.path.relpath(full, SRC_WEBSITE).replace('\\', '/')
        z.write(full, arc)
z.close()

z2 = zipfile.ZipFile(OUT)
for i in z2.infolist():
    print(i.filename)
print('条目数:', len(z2.infolist()), '| 含反斜杠:', any('\\' in i.filename for i in z2.infolist()))
print('OK:', OUT)
