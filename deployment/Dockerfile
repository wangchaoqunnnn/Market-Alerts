# ============================================
# Stage 1: Builder
# 构建阶段：安装全部依赖并编译前后端
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# 安装构建所需的系统依赖（部分 native 包需要编译）
RUN apk add --no-cache python3 make g++

# 先复制包管理文件，利用 Docker 缓存
# 只要 package.json 不变，这一层就不会重建
COPY package.json package-lock.json* ./

# 移除模板脚手架残留的 postinstall 钩子（fullstack-cli 在容器内不存在，会导致 npm install 失败）
RUN npm pkg delete scripts.postinstall || true

# 安装所有依赖（含 devDependencies，用于构建）
RUN npm install --production=false

# 复制源代码
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY nest-cli.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./

# 执行生产构建
RUN npm run build:prod

# ============================================
# Stage 2: Runner
# 运行阶段：仅保留生产依赖和编译产物
# ============================================
FROM node:22-alpine AS production

WORKDIR /app

# 安装健康检查所需的 curl
RUN apk add --no-cache curl

# 设置生产环境
ENV NODE_ENV=production

# 创建非 root 用户，提升安全性
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 先复制包管理文件（缓存层）
COPY package.json package-lock.json* ./

# 移除 postinstall 钩子，避免 fullstack-cli 不存在导致安装失败
RUN npm pkg delete scripts.postinstall || true

# 仅安装生产依赖，并清理 npm 缓存减小镜像体积
RUN npm install --production=true && npm cache clean --force

# 从构建阶段复制编译产物
COPY --from=builder /app/dist ./dist

# 切换到非 root 用户
USER appuser

# 暴露端口
EXPOSE 3000

# 健康检查：轮询 /api/health 端点
# 间隔 30 秒，超时 5 秒，重试 3 次后标记为 unhealthy
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD curl -f http://localhost:3000/api/health || exit 1

# 启动命令：直接用 node 启动，减少 npm 中间进程
CMD ["node", "dist/server/main.js"]
