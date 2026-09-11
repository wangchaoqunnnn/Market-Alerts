# ============================================
# 盘中异动监控系统 - 生产镜像（多阶段构建）
#
# 针对「npm install ETIMEDOUT / 构建 30 分钟仍失败」的加固点：
#   1. npm ci 严格按 package-lock.json 安装 —— 不做版本解析，请求数量与版本完全确定；
#   2. npm 缓存挂载为 BuildKit cache —— 构建失败重试/重复构建不再重新下载 1500+ 个 tarball；
#   3. 全程只联网安装一次 —— production 阶段直接复用构建阶段裁剪后的 node_modules；
#   4. 镜像源可用 --build-arg 覆盖（云厂商内网源免流量更快），主源失败自动回退备用源；
#   5. 强制 IPv4 优先 —— 云服务器 IPv6 不通时 npm 会一直等到超时（典型 ETIMEDOUT）；
#   6. 全程不调用 apk —— Alpine 官方软件源在境内极慢且会 TLS 报错（实测卡 26 分钟失败），
#      依赖均有预编译产物、健康检查用 busybox 自带 wget，因此不需要任何系统包。
#
# 注意：RUN --mount 需要 BuildKit（Docker 23+ 默认开启，docker compose 也默认走 BuildKit）。
# ============================================

# ============================================
# Stage 1: Builder —— 安装依赖并编译前后端
# ============================================

# 基础镜像可换成国内镜像仓库前缀（境内拉取 Docker Hub 很慢时用）：
#   已实测可用：docker.m.daocloud.io / docker.1ms.run / hub.rat.dev
#   云厂商内网：ccr.ccs.tencentyun.com（腾讯云）、swr.cn-north-4.myhuaweicloud.com（华为云）
# 用法：--build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine
#   或在 deployment/.env 里写 NODE_IMAGE=...，compose 会自动读取
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS builder

# 镜像源（国内服务器建议换成云厂商内网源，免流量且更稳）：
#   腾讯云：https://mirrors.cloud.tencent.com/npm/
#   华为云：https://repo.huaweicloud.com/repository/npm/
#   阿里云：https://registry.npmmirror.com
# 用法：docker compose build --build-arg NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG NPM_FALLBACK_REGISTRY=https://registry.npmjs.org
# 并发连接数：公网镜像源默认 6（避免被限流/重置）；
# 走云厂商内网源时链路稳定，可调到 16-32 显著提速（--build-arg NPM_MAXSOCKETS=24）
ARG NPM_MAXSOCKETS=6

# npm 行为统一在这里配置：
#   replace_registry_host=always  lockfile 中写死了 npmmirror 的 tarball 地址，
#                                 换源时必须允许重写 host，否则 --registry 不起作用
#   maxsockets=6                  npmmirror 对高并发连接会限流/重置，降低并发反而更稳
#   fetch_timeout=180000          原来的 10 分钟太长：卡住的连接会白等 10 分钟才重试
#   fetch_retries=8               快速失败+重试，配合缓存挂载重试代价很低
#   prefer_offline=true           已下载过的一律走缓存，显著减少网络请求
ENV npm_config_registry=$NPM_REGISTRY \
    npm_config_replace_registry_host=always \
    npm_config_maxsockets=$NPM_MAXSOCKETS \
    npm_config_fetch_timeout=180000 \
    npm_config_fetch_retries=8 \
    npm_config_fetch_retry_mintimeout=5000 \
    npm_config_fetch_retry_maxtimeout=60000 \
    npm_config_prefer_offline=true \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_update_notifier=false

# 云服务器/容器若 IPv6 不通，Node 会先连 IPv6 并一直等到超时（典型 ETIMEDOUT），强制优先 IPv4
ENV NODE_OPTIONS=--dns-result-order=ipv4first

WORKDIR /app

# 说明：依赖全部带预编译产物（package-lock 中不存在 gypfile / node-gyp / prebuild-install），
# 因此不再安装 python3 / make / g++，也就不依赖 Alpine 官方软件源
# —— 该源在境内极慢且会 TLS 报错（实测 apk 卡 26 分钟最终失败），是上一轮构建失败的原因。
# 若将来引入需要源码编译的依赖，放开下面注释（并建议换成国内源）：
# ARG APK_MIRROR=mirrors.aliyun.com
# RUN sed -i "s#dl-cdn.alpinelinux.org#${APK_MIRROR}#g" /etc/apk/repositories \
#     && apk add --no-cache python3 make g++

# 先复制包管理文件，利用 Docker 层缓存（package.json 不变则这一层及安装层可复用）
COPY package.json package-lock.json ./

# 移除模板脚手架残留的 postinstall 钩子（容器内没有 fullstack-cli，会导致 npm install 失败）
RUN npm pkg delete scripts.postinstall || true

# 安装依赖（含 devDependencies，构建需要）
# --mount=type=cache：npm 缓存跨构建复用，失败重试时已下载的包不会重新下载
RUN --mount=type=cache,id=npm-cache,target=/root/.npm,sharing=locked \
    sh -c 'FALLBACK="${NPM_FALLBACK_REGISTRY:-https://registry.npmjs.org}"; \
      npm ci --include=dev --no-audit --no-fund \
      || { echo ">>> 【警告】$npm_config_registry 安装失败，自动切换备用源 $FALLBACK 重试"; \
           npm ci --include=dev --no-audit --no-fund --registry="$FALLBACK" \
           || npm install --include=dev --no-audit --no-fund --registry="$FALLBACK"; }'

# 复制源码与构建配置
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY nest-cli.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./

# 执行生产构建（nest build + vite build）
RUN npm run build:prod

# 规范化前端 HTML 位置 + 清理 sourcemap：
# 1) 平台构建（MIAODA_APP_TYPE=3）时 vite 插件会把 HTML 挪到 dist/client/index.html；
#    自建构建下产物落在 dist/client/client/index.html，而 server 的视图目录固定为
#    <cwd>/dist/client（server/main.ts: setBaseViewsDir），缺 index.html 时首页返回 500。
#    此处兜底拷贝一次，并在缺失时直接让构建失败（好过部署后才发现首页打不开）。
# 2) 删除 *.map（约 13MB）：本镜像同源直出 dist/client，留着等于把前端源码对外暴露。
#    若生产环境需要 sourcemap 排查问题，删掉下面这行 find 即可。
RUN set -eux; \
    if [ ! -f dist/client/index.html ]; then \
      src="$(find dist/client -maxdepth 3 -name index.html -type f | head -n 1)"; \
      if [ -n "$src" ]; then cp "$src" dist/client/index.html; echo "normalized view: $src -> dist/client/index.html"; fi; \
    fi; \
    test -f dist/client/index.html; \
    find dist/client -type f -name '*.map' -exec rm -f {} + || true

# 就地裁剪 devDependencies（不再联网装第二遍），失败只告警，不影响启动
RUN --mount=type=cache,id=npm-cache,target=/root/.npm,sharing=locked \
    npm prune --omit=dev || echo ">>> 【警告】npm prune 失败，镜像内将保留 devDependencies（不影响运行）"

# ============================================
# Stage 2: Runner —— 仅保留生产依赖与编译产物
# ============================================
FROM ${NODE_IMAGE} AS production

WORKDIR /app

# SERVER_HOST 必须为 0.0.0.0：代码默认值是 localhost，只绑定 127.0.0.1，
# 容器外的端口映射会连不上（宿主机/浏览器无法访问，deploy.sh 健康检查也会失败）
ENV NODE_ENV=production \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=3000
# 行情数据源多为国内公网接口，同样强制 IPv4 优先，避免 IPv6 黑洞导致请求超时
ENV NODE_OPTIONS=--dns-result-order=ipv4first

# 健康检查改用 busybox 自带的 wget，无需再安装 curl
# （不装任何 apk 包 = 运行阶段完全不依赖 Alpine 软件源，镜像更小、构建更稳）

# 创建非 root 用户（提升安全性）
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 从构建阶段复制裁剪后的生产依赖与编译产物（不再联网安装）
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# 预留日志目录权限（应用若配置 LOG_DIR=./logs 时可写）
RUN mkdir -p /app/logs && chown -R appuser:appgroup /app/logs

# 切换到非 root 用户
USER appuser

# 暴露端口
EXPOSE 3000

# 健康检查：轮询 /api/health 端点（busybox wget，HTTP 错误码会返回非 0）
# 间隔 30 秒，超时 5 秒，重试 3 次后标记为 unhealthy
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

# 启动命令：直接用 node 启动，减少 npm 中间进程
CMD ["node", "dist/server/main.js"]
