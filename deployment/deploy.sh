#!/bin/bash
set -e

# ============================================
# 盘中异动监控系统 - Docker Compose 一键部署脚本
# 用法：./deploy.sh [build|pull|restart|logs|down]
#   build   - 重新构建镜像并启动（默认）
#   pull    - 拉取最新镜像并启动（使用镜像仓库时）
#   restart - 重启现有容器
#   logs    - 查看服务日志
#   down    - 停止并移除所有容器
# ============================================

# ---------- 颜色定义 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ---------- 配置 ----------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${SCRIPT_DIR}/.env"
HEALTH_URL="http://localhost:3000/api/health"
HEALTH_TIMEOUT=60  # 健康检查最大等待秒数

# 切换到脚本所在目录（docker-compose 需要相对路径）
cd "$SCRIPT_DIR"

# ---------- 工具函数 ----------
print_banner() {
  echo -e "${BLUE}============================================${NC}"
  echo -e "${BLUE}  盘中异动监控系统 - 一键部署${NC}"
  echo -e "${BLUE}============================================${NC}"
  echo ""
}

print_success() {
  echo -e "${GREEN}  ✓ $1${NC}"
}

print_error() {
  echo -e "${RED}  ✗ $1${NC}"
}

print_warn() {
  echo -e "${YELLOW}  ⚠ $1${NC}"
}

print_step() {
  echo -e "${YELLOW}[${1}/${2}] ${3}${NC}"
}

# 检查 .env 文件，不存在则从 .env.example 复制
ensure_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    print_warn "未找到 .env 文件，正在从 .env.example 创建..."
    if [ -f "${SCRIPT_DIR}/.env.example" ]; then
      cp "${SCRIPT_DIR}/.env.example" "$ENV_FILE"
      print_success "已创建 .env，请根据需要修改配置"
    else
      print_error "未找到 .env.example，无法自动创建 .env"
      exit 1
    fi
  fi
}

# 健康检查请求（宿主机可能只装了 wget，做兼容处理）
http_health_ok() {
  if command -v curl > /dev/null 2>&1; then
    curl -sf "$HEALTH_URL" > /dev/null 2>&1
  elif command -v wget > /dev/null 2>&1; then
    wget -q -O /dev/null "$HEALTH_URL" > /dev/null 2>&1
  else
    return 1
  fi
}

# 等待健康检查通过
wait_for_health() {
  echo ""
  echo -e "${YELLOW}等待服务健康检查通过...${NC}"
  local count=0
  local interval=3

  while [ "$count" -lt "$HEALTH_TIMEOUT" ]; do
    if http_health_ok; then
      print_success "服务健康检查通过"
      return 0
    fi
    sleep "$interval"
    count=$((count + interval))
    echo -n "  等待中... ${count}s / ${HEALTH_TIMEOUT}s"$'\r'
  done

  echo ""
  print_error "健康检查超时（${HEALTH_TIMEOUT}s）"
  return 1
}

# 预检基础镜像：缺失时先拉取（限时 5 分钟），避免构建长期卡在 registry 元数据解析上
# 典型症状：docker compose build 长时间只显示转圈，最后报
#           DeadlineExceeded: context deadline exceeded
ensure_base_image() {
  local image="$1"
  if docker image inspect "$image" > /dev/null 2>&1; then
    print_success "基础镜像已存在：${image}"
    return 0
  fi

  print_warn "本地缺少基础镜像 ${image}，尝试拉取（最长等待 5 分钟）..."
  if timeout 300 docker pull "$image"; then
    print_success "基础镜像拉取完成：${image}"
    return 0
  fi

  print_error "基础镜像拉取失败或超时：${image}"
  echo ""
  echo "  原因：境内访问 Docker Hub（registry-1.docker.io）经常超时，"
  echo "        构建会一直卡在拉取基础镜像/解析镜像元数据这一步。"
  echo ""
  echo "  解决方式（任选其一）："
  echo "   A. 配置镜像加速器（推荐，一次配置长期生效）："
  echo "      sudo ${SCRIPT_DIR}/setup-docker-mirror.sh            # 公共加速器"
  echo "      sudo ${SCRIPT_DIR}/setup-docker-mirror.sh --tencent  # 腾讯云 CVM"
  echo "   B. 在 ${ENV_FILE} 里把基础镜像换成国内仓库前缀："
  echo "      NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine"
  echo "      POSTGRES_IMAGE=docker.m.daocloud.io/library/postgres:16-alpine"
  echo "   C. 手动验证网络：docker pull ${image}"
  echo ""
  return 1
}

# 打印错误日志尾部
print_error_logs() {
  echo ""
  echo -e "${RED}=== 错误日志（最近 20 行）===${NC}"
  docker compose -f "$COMPOSE_FILE" logs --tail=20 app 2>&1 || true
  echo -e "${RED}===============================${NC}"
}

# 从 .env 读取变量（不存在时用默认值）
read_env_var() {
  local key="$1" default="$2" value=""
  if [ -f "$ENV_FILE" ]; then
    value="$(grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
  fi
  if [ -z "$value" ]; then
    echo "$default"
  else
    echo "$value"
  fi
}

# 预检：.env 中的数据库账号密码能否真正登录
# 背景：PostgreSQL 的 POSTGRES_PASSWORD 只在数据卷「首次初始化」时生效，
#       之后改 .env 不会同步修改库内密码，会出现 28P01 password authentication failed。
# 注意：官方镜像的 pg_hba.conf 对回环地址（local / 127.0.0.1）是 trust，
#       只有非回环连接才走 scram-sha-256，所以必须用 db 容器自身 IP 才能验证密码。
check_db_credentials() {
  local db_user db_pass db_name db_host
  db_user="$(read_env_var DB_USER user)"
  db_pass="$(read_env_var DB_PASSWORD pass)"
  db_name="$(read_env_var DB_NAME app)"

  db_host="$(docker compose -f "$COMPOSE_FILE" exec -T db hostname -i 2>/dev/null | tr -d ' \r' | awk '{print $1}')"
  if [ -z "$db_host" ]; then
    print_warn "无法获取 db 容器 IP，跳过数据库账号密码预检"
    return 0
  fi

  # 用 PGPASSWORD 传密码，避免密码含 @ : / 等字符时连接串解析出错
  if docker compose -f "$COMPOSE_FILE" exec -T -e PGPASSWORD="$db_pass" db \
      psql -h "$db_host" -p 5432 -U "$db_user" -d "$db_name" -tAc 'select 1' > /dev/null 2>&1; then
    print_success "数据库账号密码校验通过（${db_user}@${db_name}）"
    return 0
  fi

  print_error "数据库账号密码校验失败：无法用 ${db_user} 登录 ${db_name}"
  echo ""
  echo -e "${YELLOW}  常见原因：POSTGRES_PASSWORD 只在数据卷「首次初始化」时生效。"
  echo -e "  若之前用旧密码启动过数据库，改 .env 里的 DB_PASSWORD 不会修改库内已有密码。${NC}"
  echo ""
  echo "  三种解决方式（任选其一）："
  echo "   A. 把 .env 里的 DB_PASSWORD 改回首次使用的旧密码（同时同步 DATABASE_URL）"
  echo "   B. 用旧密码登录数据库后修改库内密码："
  echo "      docker compose -f ${COMPOSE_FILE} exec db psql -U ${db_user} -d ${db_name} \\"
  echo "        -c \"ALTER USER \\\"${db_user}\\\" WITH PASSWORD '新密码';\""
  echo "   C. 删除数据卷重建（⚠️ 会清空自选股 / 策略 / 报告历史）："
  echo "      docker compose -f ${COMPOSE_FILE} down -v && ${0} build"
  echo ""
  echo "   另请确认 DATABASE_URL 中的密码与 DB_PASSWORD 完全一致；"
  echo "   密码含 @ : / 等特殊字符时需写成 URL 编码（如 @ → %40）。"
  echo ""
  return 1
}

# 健康检查失败时，按日志内容给出针对性定位
print_failure_hint() {
  local logs
  logs="$(docker compose -f "$COMPOSE_FILE" logs --tail=80 app 2>&1 || true)"
  if echo "$logs" | grep -q '28P01\|password authentication failed'; then
    echo ""
    print_error "定位：数据库密码认证失败（28P01）"
    echo "  .env 的 DB_PASSWORD 必须与 DATABASE_URL 中的密码一致；"
    echo "  且 POSTGRES_PASSWORD 只在数据卷首次初始化时生效（详见 ${0} 运行时的提示）。"
  elif echo "$logs" | grep -q 'ECONNREFUSED'; then
    echo ""
    print_error "定位：数据库连接被拒绝"
    echo "  检查 db 容器：docker compose -f ${COMPOSE_FILE} ps ；docker compose -f ${COMPOSE_FILE} logs db"
  elif echo "$logs" | grep -q '缺少 DATABASE_URL'; then
    echo ""
    print_error "定位：缺少 DATABASE_URL 环境变量"
    echo "  请对照 .env.example 补全 ${ENV_FILE} 后再执行 ${0} build"
  fi
}

# ---------- 命令处理 ----------
CMD="${1:-build}"

case "$CMD" in
  build)
    ACTION="构建并启动"
    ;;
  pull)
    ACTION="拉取并启动"
    ;;
  restart)
    ACTION="重启"
    ;;
  logs)
    ACTION="查看日志"
    ;;
  down)
    ACTION="停止服务"
    ;;
  *)
    echo -e "${RED}未知命令: $CMD${NC}"
    echo ""
    echo "用法: ./deploy.sh [build|pull|restart|logs|down]"
    echo "  build   - 重新构建镜像并启动（默认）"
    echo "  pull    - 拉取最新镜像并启动"
    echo "  restart - 重启现有容器"
    echo "  logs    - 查看服务日志"
    echo "  down    - 停止并移除所有容器"
    exit 1
    ;;
esac

print_banner

# ---------- Step 1: 检查 Docker ----------
print_step 1 5 "检查 Docker 环境..."

if ! command -v docker &> /dev/null; then
  print_error "未检测到 Docker，请先安装 Docker >= 20.0.0"
  exit 1
fi
print_success "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '已安装')"

if ! docker compose version &> /dev/null; then
  print_error "未检测到 Docker Compose v2，请先安装 Docker Compose >= 2.0"
  exit 1
fi
print_success "Docker Compose $(docker compose version --short 2>/dev/null || echo '已安装')"

# ---------- Step 2: 准备配置 ----------
print_step 2 5 "准备环境配置..."

ensure_env_file
print_success "环境配置就绪"

# ---------- 特殊命令：down ----------
if [ "$CMD" = "down" ]; then
  print_step 3 5 "停止服务..."
  docker compose -f "$COMPOSE_FILE" down
  print_success "服务已停止"
  echo ""
  echo -e "${GREEN}============================================${NC}"
  echo -e "${GREEN}  盘中异动监控系统 已停止${NC}"
  echo -e "${GREEN}============================================${NC}"
  exit 0
fi

# ---------- 特殊命令：logs ----------
if [ "$CMD" = "logs" ]; then
  docker compose -f "$COMPOSE_FILE" logs -f --tail=100 app
  exit 0
fi

# ---------- Step 3: 构建/拉取镜像 ----------
print_step 3 5 "${ACTION}镜像..."

if [ "$CMD" = "build" ]; then
  BASE_IMAGE="$(read_env_var NODE_IMAGE node:22-alpine)"
  ensure_base_image "$BASE_IMAGE" || exit 1

  # 直接用 docker build（不再走 compose/bake）：
  #   1) bake 路径在卡住时只显示转圈，无法定位；docker build 支持 --progress=plain，
  #      每一步（COPY / RUN npm ci / vite build）都会实时打印；
  #   2) 构建参数从 .env 读取，与 docker-compose.yml 的 build.args 保持一致。
  print_warn "开始构建镜像（plain 进度输出；首次构建需下载 1500+ 个 npm 包，可能较久）..."
  BUILDKIT_PROGRESS=plain docker build \
    --progress=plain \
    -t market-anomaly-monitor:latest \
    -f "${SCRIPT_DIR}/Dockerfile" \
    --build-arg "NODE_IMAGE=${BASE_IMAGE}" \
    --build-arg "NPM_REGISTRY=$(read_env_var NPM_REGISTRY https://registry.npmmirror.com)" \
    --build-arg "NPM_FALLBACK_REGISTRY=$(read_env_var NPM_FALLBACK_REGISTRY https://registry.npmjs.org)" \
    --build-arg "NPM_MAXSOCKETS=$(read_env_var NPM_MAXSOCKETS 6)" \
    "${SCRIPT_DIR}/.." || {
      print_error "镜像构建失败：请查看上方最后一步的输出定位问题"
      echo "  卡在 npm 下载 → 检查 .env 的 NPM_REGISTRY / NPM_MAXSOCKETS（详见 README「国内源加速」）"
      echo "  卡在 apk/基础镜像 → 执行 sudo ${SCRIPT_DIR}/setup-docker-mirror.sh"
      exit 1
    }
elif [ "$CMD" = "pull" ]; then
  docker compose -f "$COMPOSE_FILE" pull app || print_warn "拉取镜像失败，将使用本地镜像"
fi

print_success "镜像准备完成"

# ---------- Step 4: 启动数据库 → 预检账号密码 → 启动应用 ----------
print_step 4 5 "启动服务..."

# 先只启动数据库，等待健康后再校验账号密码（避免应用带着错误配置反复重启）
docker compose -f "$COMPOSE_FILE" up -d db
for _ in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" ps db 2>/dev/null | grep -q 'healthy'; then
    break
  fi
  sleep 2
done

if ! check_db_credentials; then
  echo -e "${RED}=== db 容器日志（最近 20 行）===${NC}"
  docker compose -f "$COMPOSE_FILE" logs --tail=20 db 2>&1 || true
  exit 1
fi

# 先尝试优雅停止旧的应用容器（如存在）
if docker compose -f "$COMPOSE_FILE" ps -q app 2>/dev/null | grep -q .; then
  echo "  停止旧容器..."
  docker compose -f "$COMPOSE_FILE" stop app -t 10
fi

# 启动应用（数据库已就绪）
docker compose -f "$COMPOSE_FILE" up -d

print_success "服务已启动"

# ---------- Step 5: 等待健康检查 ----------
print_step 5 5 "健康检查..."

if ! wait_for_health; then
  print_error "服务启动失败"
  print_error_logs
  print_failure_hint
  exit 1
fi

# ---------- 完成 ----------
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  🚀 盘中异动监控系统 部署成功${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  访问地址: http://localhost:3000"
echo "  健康检查: ${HEALTH_URL}"
echo "  部署目录: ${SCRIPT_DIR}"
echo ""
echo -e "${BLUE}常用命令：${NC}"
echo "  查看状态:  docker compose -f ${COMPOSE_FILE} ps"
echo "  查看日志:  docker compose -f ${COMPOSE_FILE} logs -f app"
echo "  重启服务:  ${0} restart"
echo "  停止服务:  ${0} down"
echo "  重新构建:  ${0} build"
echo ""
