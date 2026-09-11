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

# 打印错误日志尾部
print_error_logs() {
  echo ""
  echo -e "${RED}=== 错误日志（最近 20 行）===${NC}"
  docker compose -f "$COMPOSE_FILE" logs --tail=20 app 2>&1 || true
  echo -e "${RED}===============================${NC}"
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
  docker compose -f "$COMPOSE_FILE" build app
elif [ "$CMD" = "pull" ]; then
  docker compose -f "$COMPOSE_FILE" pull app || print_warn "拉取镜像失败，将使用本地镜像"
fi

print_success "镜像准备完成"

# ---------- Step 4: 停止旧容器并启动新容器 ----------
print_step 4 5 "启动服务..."

# 先尝试优雅停止旧容器（如存在）
if docker compose -f "$COMPOSE_FILE" ps -q app 2>/dev/null | grep -q .; then
  echo "  停止旧容器..."
  docker compose -f "$COMPOSE_FILE" stop app -t 10
fi

# 启动全部服务
docker compose -f "$COMPOSE_FILE" up -d

print_success "服务已启动"

# ---------- Step 5: 等待健康检查 ----------
print_step 5 5 "健康检查..."

if ! wait_for_health; then
  print_error "服务启动失败"
  print_error_logs
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
