# 微信云托管部署文件：监听端口 80（app.py 自动读取 PORT 环境变量）
# 部署方式：云托管控制台 → 创建服务 → 代码仓库部署 → 连接 GitHub 本仓库
FROM python:3.13-slim

ENV TZ=Asia/Shanghai
RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY website/ /website

ENV PORT=80
EXPOSE 80
CMD ["python", "app.py"]
