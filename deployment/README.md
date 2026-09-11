# 盘中异动监控系统 - 部署文档

## 系统要求

| 组件 | 最低版本 | 说明 |
|------|----------|------|
| Docker | >= 20.0 | 容器运行时（推荐部署方式） |
| Docker Compose | >= 2.0 | 容器编排 |
| Node.js | >= 22.0.0 | 手动部署或开发时需要 |
| npm | >= 10.0.0 | 手动部署或开发时需要 |

> 💡 **推荐使用 Docker Compose 部署**，一键启动应用 + 数据库，免去环境配置烦恼。

---

## 快速开始（3 步）

```bash
# 1. 进入部署目录
cd deployment

# 2. 复制环境变量配置并按需修改
cp .env.example .env

# 3. 一键构建并启动
./deploy.sh build
```

启动成功后访问：**http://localhost:3000**

---

## 环境变量说明

所有环境变量均在 `.env` 文件中配置，首次部署请从 `.env.example` 复制。

### 基础服务配置

| 变量名 | 默认值 | 必填 | 说明 |
|--------|--------|------|------|
| `PORT` | `3000` | 否 | HTTP 服务监听端口 |
| `NODE_ENV` | `production` | 否 | 运行环境：`production` / `development` |
| `DATABASE_URL` | - | 是 | PostgreSQL 数据库连接字符串，格式：`postgresql://user:pass@db:5432/app` |

### 行情数据配置

| 变量名 | 默认值 | 必填 | 说明 |
|--------|--------|------|------|
| `MARKET_DATA_SOURCE` | `mock` | 否 | 行情数据源：`mock` / `eastmoney` / `tencent` |
| `REFRESH_INTERVAL_MS` | `1000` | 否 | 行情刷新间隔，单位毫秒 |
| `MAX_STOCKS` | `200` | 否 | 最大监控股票数量 |

### WebSocket 配置

| 变量名 | 默认值 | 必填 | 说明 |
|--------|--------|------|------|
| `ENABLE_WEBSOCKET` | `false` | 否 | 是否启用 WebSocket 实时推送（当前版本暂未支持） |

### 日志与安全配置

| 变量名 | 默认值 | 必填 | 说明 |
|--------|--------|------|------|
| `LOG_LEVEL` | `info` | 否 | 日志级别：`error` / `warn` / `info` / `debug` |
| `RATE_LIMIT_REQUESTS` | `100` | 否 | 每分钟限流请求数（按 IP） |
| `SESSION_SECRET` | - | 是 | Session 加密密钥，生产环境务必修改为长随机字符串 |
| `CORS_ORIGIN` | `*` | 否 | CORS 允许源，多个用逗号分隔 |

> 🔐 **安全提示**：生产环境务必修改 `SESSION_SECRET`，可通过 `openssl rand -hex 32` 生成。

---

## 部署方式

### Docker Compose 部署（推荐）

#### 一键部署脚本

```bash
cd deployment

# 构建并启动
./deploy.sh build

# 重启服务
./deploy.sh restart

# 查看日志
./deploy.sh logs

# 停止服务
./deploy.sh down
```

#### 手动 Docker Compose 命令

```bash
cd deployment

# 构建并后台启动
docker compose up -d --build

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f app

# 停止服务
docker compose down
```

### 手动部署（pm2）

> 适合无 Docker 环境的服务器，需要自行准备 PostgreSQL 数据库。

```bash
# 1. 安装依赖
npm ci

# 2. 构建生产包
npm run build:prod

# 3. 配置环境变量
cp deployment/.env.example .env
# 编辑 .env，填入数据库连接等信息

# 4. 使用 pm2 启动
npm install -g pm2
pm2 start dist/server/main.js --name market-anomaly-monitor --env production

# 5. 保存进程列表（开机自启）
pm2 save
pm2 startup   # 按提示执行输出的命令
```

---

## 常用命令

### Docker Compose

```bash
# 启动所有服务
docker compose up -d

# 停止并移除容器
docker compose down

# 重启服务
docker compose restart

# 查看日志
docker compose logs -f app
docker compose logs -f db

# 进入容器
docker compose exec app sh
docker compose exec db psql -U user -d app

# 查看资源占用
docker compose stats
```

### 健康检查

```bash
# 检查应用是否健康
curl http://localhost:3000/api/health

# 预期响应
# {"status":"ok","timestamp":"2024-01-01T00:00:00.000Z","uptime":123,"version":"2.3.0"}
```

---

## 服务架构

```
                    ┌─────────────────┐
                    │     Nginx       │  (可选，反向代理)
                    │   :80 / :443    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   App (Node.js) │  :3000
                    │  行情监控 + API │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  PostgreSQL 16  │  :5432
                    │   数据持久化     │
                    └─────────────────┘
```

所有服务均通过 Docker 内部网络 `app-network` 通信，数据库端口默认不暴露到宿主机（按需启用）。

---

## 数据备份

### PostgreSQL 数据备份

```bash
# 创建备份
docker compose exec db pg_dump -U user app > backup_$(date +%Y%m%d).sql

# 恢复备份
docker compose exec -T db psql -U user -d app < backup_20240101.sql
```

### 备份数据卷

```bash
# 备份数据卷到 tar 文件
docker run --rm \
  -v market-anomaly-postgres-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/pg_data_backup.tar.gz -C /data .

# 从备份恢复
docker run --rm \
  -v market-anomaly-postgres-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/pg_data_backup.tar.gz -C /data
```

> 💡 建议每日定时备份，可使用 cron 或 Docker 内置的 cron 服务。

---

## 故障排查

### 1. 端口被占用

**症状**：启动时报 `bind: address already in use`

**排查与解决**：

```bash
# 查看 3000 端口占用
lsof -i :3000
# 或
netstat -tlnp | grep 3000

# 修改端口：编辑 .env 中的 PORT 变量
# 同时修改 docker-compose.yml 的 ports 映射
```

### 2. 数据库连接失败

**症状**：应用日志报 `connection refused` 或 `timeout`

**排查步骤**：

```bash
# 确认 db 容器是否健康
docker compose ps

# 查看数据库日志
docker compose logs db

# 检查 DATABASE_URL 是否正确
docker compose exec app env | grep DATABASE_URL

# 手动测试数据库连接
docker compose exec db pg_isready -U user -d app
```

**常见原因**：
- db 服务还在初始化中（首次启动可能需要 10-30 秒）
- `DATABASE_URL` 中的 host 不是 `db`（Compose 内部服务名）
- 用户名/密码/数据库名不匹配

### 3. 应用启动失败

**症状**：健康检查不通过，容器不断重启

**排查**：

```bash
# 查看应用日志（最后 50 行）
docker compose logs --tail=50 app

# 查看容器状态
docker compose ps

# 进入容器排查
docker compose exec app sh
```

### 4. Docker 构建失败

| 错误现象 | 可能原因 | 解决方法 |
|----------|----------|----------|
| `npm install` 超时 | 网络问题 | 配置 npm 镜像源，或使用 `--network=host` 构建 |
| `node-gyp` 编译失败 | 缺少编译工具 | Dockerfile 已包含 python3/make/g++ |
| 构建速度慢 | 缓存未命中 | 确保 package.json 不变时复用缓存层 |

### 5. 行情数据不更新

**排查步骤**：

1. 检查 `MARKET_DATA_SOURCE` 配置是否正确
2. 确认服务器可访问行情数据源（东方财富/腾讯）
3. 查看应用日志中是否有请求失败信息
4. 临时切换到 `mock` 模式验证应用功能：
   ```bash
   # 修改 .env 中 MARKET_DATA_SOURCE=mock
   # 然后重启
   ./deploy.sh restart
   ```

### 6. 前端白屏 / 404

**排查步骤**：

```bash
# 检查前端构建产物是否存在
docker compose exec app ls -la dist/client/

# 查看应用日志
docker compose logs app
```

**常见原因**：
- 前端构建失败，静态资源未生成
- 路由路径与部署前缀不匹配

---

## 升级部署

### Docker Compose 升级

```bash
cd deployment

# 拉取最新代码
git pull

# 重新构建并启动
./deploy.sh build

# 确认服务正常
docker compose ps
curl http://localhost:3000/api/health
```

---

## 目录结构

```
项目根目录/
├── client/                  # 前端源码 (React + Vite)
├── server/                  # 后端源码 (NestJS)
│   └── modules/health/      # 健康检查模块
├── shared/                  # 前后端共享类型
├── dist/                    # 构建输出目录
└── deployment/              # 部署相关文件
    ├── Dockerfile           # Docker 镜像构建（多阶段构建）
    ├── .dockerignore        # Docker 构建忽略规则
    ├── .env.example         # 环境变量示例
    ├── docker-compose.yml   # Docker Compose 编排配置
    ├── deploy.sh            # 一键部署脚本
    └── README.md            # 本文档
```

---

## 安全建议

1. **不要直接暴露 3000 端口到公网**，建议前置 Nginx 或负载均衡
2. **配置 HTTPS 证书**，启用 TLS 加密传输
3. **修改默认数据库密码**，使用强密码
4. **修改 `SESSION_SECRET`** 为随机长字符串
5. **限制 `CORS_ORIGIN`**，不要使用 `*`
6. **配置防火墙**，仅开放必要端口
7. **定期更新**基础镜像和依赖包
