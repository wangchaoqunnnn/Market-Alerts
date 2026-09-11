# 盘中异动监控系统 - 部署文档

## 系统要求

| 组件 | 最低版本 | 说明 |
|------|----------|------|
| Docker | >= 23.0（推荐） | 容器运行时；Dockerfile 使用了 BuildKit 缓存挂载（`RUN --mount=type=cache`），Docker 23+ 默认开启 |
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

## 部署到云服务器（完整步骤）

> 适用：Ubuntu 20.04+ / Debian 11+ / CentOS 7+ 等 Linux 云服务器（境内机房）。
> 镜像内置真实行情数据源（东方财富 / 腾讯 / 新浪），服务器需能访问这些行情域名。

### 0. 服务器准备

```bash
# 配置建议：2 核 4G 起（构建阶段吃内存）；若用「本地构建 + 上传镜像」，1 核 2G 也能跑
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker version && docker compose version      # Docker 需 >= 23

# 时区必须是 Asia/Shanghai：A 股交易时段（09:30-11:30 / 13:00-15:00）判断依赖本地时间
timedatectl set-timezone Asia/Shanghai

# 安全组 / 防火墙：放行 3000；生产环境建议只放行 80/443，由 Nginx 转发
```

### 1. 把代码放到服务器

```bash
# 方式 A：Git（⚠️ 本地改动必须先 commit + push，否则服务器上拉到的还是旧代码）
git clone <你的仓库地址> /opt/market-alerts

# 方式 B：本地上传（不依赖 Git）
rsync -av --exclude node_modules --exclude dist --exclude .git --exclude logs \
  ./ root@<服务器IP>:/opt/market-alerts/
```

### 2. 配置环境变量（必改 2 项）

```bash
cd /opt/market-alerts/deployment
cp .env.example .env
vi .env
```

| 变量 | 说明 |
|------|------|
| `DB_PASSWORD` | 改成强密码；**同时**把 `DATABASE_URL` 里的密码改成同一个值（否则容器连不上库） |
| `SESSION_SECRET` | 会话密钥，`openssl rand -hex 32` 生成 |
| `MARKET_DATA_SOURCE` | 保持默认 `auto`（真实行情，失败自动切换备用源） |

### 3. 构建并启动（二选一）

> **境内服务器下载慢？** 先做两步加速（都是可选的，不做也能构建）：
> ```bash
> # ① 让 docker pull 走国内镜像加速器（一次配置，长期生效；自动备份原配置）
> sudo ./setup-docker-mirror.sh            # 腾讯云 CVM 加 --tencent，华为云加 --huawei
> # ② 让 npm 走云厂商内网源 + 提高并发（写进 .env，compose 自动读取）
> #    .env 中：NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/  NPM_MAXSOCKETS=24
> #    基础镜像也可换国内仓库：NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine
> ```
> 详细说明见「国内源加速」章节。

**方式 A：服务器直接构建**（简单，需要 npm 网络通畅）

```bash
cd /opt/market-alerts/deployment
NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/ NPM_MAXSOCKETS=24 ./deploy.sh build
```

> 若提示 `Permission denied`，先执行 `chmod +x deploy.sh setup-docker-mirror.sh`。
> 腾讯云用 `mirrors.cloud.tencent.com/npm/`，华为云用 `repo.huaweicloud.com/repository/npm/`，
> 阿里云 ECS 用 `mirrors.cloud.aliyuncs.com/npm/`（内网，免流量），其他可省略该变量走默认 npmmirror。
> 脚本会自动：构建镜像 → 启动 app+db → 轮询健康检查。

**方式 B：本地构建 → 上传镜像**（服务器网络差或配置低时推荐）

```bash
# ① 本地（网络正常）构建 linux/amd64 镜像
docker buildx build --platform linux/amd64 -t market-anomaly-monitor:latest -f deployment/Dockerfile .

# ② 压缩上传并导入（约 150-400MB）
docker save market-anomaly-monitor:latest | gzip -1 | ssh root@<服务器IP> 'gunzip | docker load'

# ③ 服务器：只启动，不重新构建
cd /opt/market-alerts/deployment
cp -n .env.example .env && vi .env
docker compose up -d --no-build
```

### 4. 验证部署

```bash
cd /opt/market-alerts/deployment
docker compose ps                    # app 应为 Up (healthy)，db 为 Up (healthy)
curl -s http://localhost:3000/api/health
curl -s "http://localhost:3000/api/market-data/market-coverage"   # 覆盖度：应为 5900 只左右、五大板块齐全
docker compose logs app | grep -E '行情数据源|真实行情已就绪|沪市主板|创业板|北交所' | tail -8
```

浏览器打开 **http://<服务器IP>:3000**，应能看到涨速榜/涨停/炸板等真实行情页面。

### 5. 日常运维

```bash
./deploy.sh logs                     # 实时日志
./deploy.sh restart                  # 重启
./deploy.sh down                     # 停止服务
docker compose up -d --build app     # 更新代码后重建并启动（方式 A）
docker compose logs --tail=100 app   # 排查

# 数据库备份 / 恢复（详见「数据备份」章节）
docker compose exec db pg_dump -U user app > backup_$(date +%F).sql
```

### 6. 上线检查清单

- [ ] `DB_PASSWORD` 已改，且与 `DATABASE_URL` 中的密码一致
- [ ] `SESSION_SECRET` 已改为随机值
- [ ] 5432 未对公网开放（compose 默认只绑定 `127.0.0.1`）
- [ ] 服务器可访问 `push2.eastmoney.com`、`push2ex.eastmoney.com`、`qt.gtimg.cn`、`hq.sinajs.cn`
- [ ] `/api/health` 返回 `ok`；`/api/market-data/market-coverage` 五大板块齐全
- [ ] 需要域名 / HTTPS：前置 Nginx（compose 中 nginx 服务已预留，取消注释即可）

---

## 环境变量说明

所有环境变量均在 `.env` 文件中配置，首次部署请从 `.env.example` 复制。

### 基础服务配置

| 变量名 | 默认值 | 必填 | 说明 |
|--------|--------|------|------|
| `SERVER_HOST` | `0.0.0.0` | 否 | 服务监听地址。**容器内必须为 `0.0.0.0`**，代码默认 `localhost` 只绑定 `127.0.0.1`，会导致宿主机访问不到映射端口 |
| `SERVER_PORT` | `3000` | 否 | HTTP 服务监听端口（需与 `docker-compose.yml` 的端口映射一致） |
| `PORT` | `3000` | 否 | 兼容旧配置的占位变量，**服务代码不读取**，实际以 `SERVER_PORT` 为准 |
| `LOG_DIR` | `/app/logs` | 否 | 日志目录，应用写入 `<LOG_DIR>/server.log`（镜像内已创建并授权给非 root 用户） |
| `NODE_ENV` | `production` | 否 | 运行环境：`production` / `development` |
| `DATABASE_URL` | - | 是 | PostgreSQL 数据库连接字符串，格式：`postgresql://user:pass@db:5432/app` |

### 行情数据配置

| 变量名 | 默认值 | 必填 | 说明 |
|--------|--------|------|------|
| `MARKET_DATA_SOURCE` | `auto` | 否 | 行情数据源：`auto`（东财为主、失败自动切换）/ `eastmoney` / `tencent` / `sina` / `mock`（仅离线演示） |
| `REFRESH_INTERVAL_MS` | `5000` | 否 | 行情刷新间隔，单位毫秒（真实数据源建议 ≥ 3000） |
| `FULL_SNAPSHOT_INTERVAL_MS` | `60000` | 否 | 全市场快照刷新间隔，单位毫秒（东财列表每页 100 条，需分页拉取） |
| `MAX_STOCKS` | `8000` | 否 | 最大监控股票数量（真实全 A 约 5900 只） |

> 📈 行情为**真实数据**：东方财富（全市场列表/快照/涨速、涨停池、炸板池、单只详情、概念、财务）
> 为主源，腾讯财经 / 新浪财经为备用源，日K线取自新浪；股票池覆盖沪市主板、深市主板、
> 创业板、科创板、北交所全部号段，可通过 `GET /api/market-data/market-coverage` 查看覆盖情况。
> 只有当显式设置 `MARKET_DATA_SOURCE=mock`，或所有真实源都不可用时，才会回退到模拟引擎。
> ⚠️ 服务器需能访问 `push2.eastmoney.com`、`push2ex.eastmoney.com`、`qt.gtimg.cn`、`hq.sinajs.cn`
> 等行情域名（境内云服务器正常可访问；若出网受限请放行这些域名）。

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

## 国内源加速（下载慢时必看）

构建过程有两个下载环节，分别加速：

### 1. 基础镜像（docker pull）

Docker Hub 在境内通常很慢，两种办法任选其一：

**A. 配置镜像加速器（一次配置，之后所有 pull 都生效）**

```bash
sudo ./setup-docker-mirror.sh            # 公共加速器（已实测可用）
sudo ./setup-docker-mirror.sh --tencent  # 腾讯云 CVM：走内网加速器，免流量最快
sudo ./setup-docker-mirror.sh --huawei   # 华为云 ECS
```

脚本会自动备份已有 `/etc/docker/daemon.json`、写入 `registry-mirrors`、重启 Docker 并验证。
已实测可用的公共加速器：`docker.m.daocloud.io`、`docker.1ms.run`、`hub.rat.dev`。

**B. 直接用国内仓库前缀（不改 Docker 配置，适合单机临时用）**

在 `deployment/.env` 里写：

```bash
NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine
POSTGRES_IMAGE=docker.m.daocloud.io/library/postgres:16-alpine
```

### 2. npm 依赖（1500+ 个包、约 400MB，构建耗时大头）

| 手段 | 做法 |
|------|------|
| 换云厂商内网源 | `.env`：`NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/`（腾讯）/ `https://repo.huaweicloud.com/repository/npm/`（华为）/ `https://mirrors.cloud.aliyuncs.com/npm/`（阿里 ECS 内网，免流量） |
| 提高并发 | 内网源把 `NPM_MAXSOCKETS` 从 6 调到 **16-32**；公网源保持 ≤ 8（npmmirror 会限流/重置） |
| 复用缓存 | 已内置 BuildKit 缓存挂载：**失败重试或重复构建不会重新下载已下好的包**，第一次慢属正常，后续构建会快很多 |
| 彻底绕过 | 本地构建镜像后 `docker save` 传输（见「方式 B」），服务器完全不碰 npm |

> 实测参考：本机约 0.6MB/s 链路上，各公共 npm 镜像速度相近（瓶颈在带宽而非镜像源本身）；
> 云厂商内网源通常 10MB/s 以上，是提速最明显的一项。

### 3. 已内置的其他优化（无需配置）

- **不使用任何 apk 系统包**（依赖均带预编译产物、健康检查用 busybox wget），不受 Alpine 官方源影响
- `.dockerignore` 位于仓库根目录，构建上下文约 2MB（不会把 node_modules 传给 Docker）
- `npm ci` 按 lockfile 精确安装、`--no-audit --no-fund`、`prefer-offline`
- 只联网安装一次：运行阶段复用构建阶段裁剪后的 `node_modules`

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

### 4. 构建失败 / 构建极慢（npm install ETIMEDOUT）

**症状**：

```
[+] Building 1768.7s (14/26)
=> [builder  6/15] RUN npm install --production=false        1767.6s
npm error code ETIMEDOUT
npm error network request to https://registry.npmmirror.com/yauzl/-/yauzl-3.4.0.tgz failed
failed to solve: process "/bin/sh -c npm install --production=false" did not complete successfully
```

**原因**：镜像内 npm 要从镜像源下载 1500+ 个 tarball，服务器到镜像源的网络抖动/限流会让个别包超时；
原来的写法还有 3 个放大问题：① `npm install` 会做版本解析且失败后从头再来；
② builder 与 production 两个阶段**并行**各装一遍依赖，互相抢带宽；
③ npm 缓存没有跨构建复用，重试等于全部重新下载。

**现在的 Dockerfile 已修复**：

| 加固点 | 说明 |
|--------|------|
| `npm ci` | 严格按 `package-lock.json` 安装，不做版本解析，请求数与版本完全确定 |
| BuildKit cache 挂载 | `--mount=type=cache,id=npm-cache,target=/root/.npm`，失败重试/重复构建复用已下好的包 |
| 只装一次 | production 阶段直接复用 builder 裁剪后的 `node_modules`，不再并行装第二遍 |
| 超时/重试调优 | `fetch-timeout=180s`（原 600s）、`fetch-retries=8`、`maxsockets=6`（降低并发避免被限流） |
| 强制 IPv4 | `NODE_OPTIONS=--dns-result-order=ipv4first`，规避云服务器 IPv6 黑洞导致的 ETIMEDOUT |
| 备用源自动回退 | 主源失败自动用 `NPM_FALLBACK_REGISTRY` 重试一次 |

**换源构建**（推荐用云厂商内网源，免流量且稳定）：

```bash
cd deployment

# 方式一：用环境变量覆盖（推荐，配合一键脚本）
NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/ ./deploy.sh build

# 方式二：直接给 compose 传 build-arg
docker compose build \
  --build-arg NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/ \
  --build-arg NPM_FALLBACK_REGISTRY=https://registry.npmjs.org \
  app
docker compose up -d
```

可选的镜像源：腾讯云 `https://mirrors.cloud.tencent.com/npm/`、
华为云 `https://repo.huaweicloud.com/repository/npm/`、
阿里云 `https://registry.npmmirror.com`、官方 `https://registry.npmjs.org`。

**仍然反复超时？改为「本地构建镜像 → 传到服务器」**（最稳，服务器无需访问 npm）：

```bash
# ① 本地（网络正常）构建 linux/amd64 镜像
docker buildx build --platform linux/amd64 -t market-anomaly-monitor:latest -f deployment/Dockerfile .

# ② 压缩后传到服务器并导入（约 200-400MB）
docker save market-anomaly-monitor:latest | gzip -1 | ssh root@<服务器IP> 'gunzip | docker load'

# ③ 服务器上只启动，不再构建
cd deployment && docker compose up -d --no-build
```

**其他构建错误**：

| 错误现象 | 可能原因 | 解决方法 |
|----------|----------|----------|
| `RUN --mount` 报语法错误 | Docker 过旧（< 23）/未启用 BuildKit | 升级 Docker 到 23+，或安装 buildx 后 `DOCKER_BUILDKIT=1` |
| `apk add` 卡住/报 `TLS: unspecified error` | Alpine 官方软件源在境内极慢或不稳定 | **当前 Dockerfile 已不再调用 apk**（依赖均有预编译产物、健康检查用自带 wget）。若自行新增需编译的依赖，请先换国内源：`sed -i "s#dl-cdn.alpinelinux.org#mirrors.aliyun.com#g" /etc/apk/repositories` |
| `node-gyp` 编译失败 | 引入了需要源码编译的依赖 | 默认依赖无需编译；如确需编译，请在 builder 阶段放开 Dockerfile 中注释的 `apk add python3 make g++`（并配合国内源） |
| 构建上下文异常大（几百 MB） | `.dockerignore` 失效 | 确保仓库**根目录**存在 `.dockerignore`（放在 `deployment/` 下不会被读取） |

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

**自建部署必查项（本仓库代码已适配，回退代码时注意）**：

1. **首页白屏、`/assets/*.js` 返回的是 HTML**：
   核心包 `configureApp()` 的静态中间件会跳过 `assets/` 前缀（平台部署时 hashed 产物走 CDN）。
   自建部署没有 CDN，`server/main.ts` 中追加的 `app.useStaticAssets(..., { index: false })`
   负责同源直出 `dist/client`，删除它会白屏。
2. **容器启动即退出，日志报 `Nest could not find AppLogger element`**：
   `configureApp()` 内部执行 `app.useLogger(app.get(AppLogger))`，该 provider 由
   `@lark-apaas/nestjs-logger` 的 `LoggerModule` 提供，必须出现在 `server/app.module.ts`
   的 `imports` 中。
3. **首页 500（`Failed to lookup view "index"`）**：
   视图目录固定为 `<cwd>/dist/client`，镜像内 cwd 为 `/app`，
   因此 `dist/client/index.html` 必须存在。Dockerfile 在构建后会做一次位置规范化
   （自建构建产物可能落在 `dist/client/client/index.html`）。
4. **宿主机访问不到 3000 端口**：确认 `SERVER_HOST=0.0.0.0`（见环境变量表）。

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
├── .dockerignore            # ⚠️ Docker 构建忽略规则（必须在上下文根目录，即仓库根）
├── client/                  # 前端源码 (React + Vite)
├── server/                  # 后端源码 (NestJS)
│   └── modules/health/      # 健康检查模块
├── shared/                  # 前后端共享类型
├── dist/                    # 构建输出目录
└── deployment/              # 部署相关文件
    ├── Dockerfile           # Docker 镜像构建（多阶段构建）
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
