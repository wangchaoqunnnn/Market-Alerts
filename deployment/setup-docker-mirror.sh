#!/bin/bash
set -e

# ============================================
# 配置 Docker 国内镜像加速器（可选，一次性执行）
#
# 作用：让 docker pull 走国内镜像仓库，解决「拉取 Docker Hub 镜像极慢」的问题。
#       （镜像加速器只影响镜像拉取；npm 依赖加速由 deployment/.env 里的 NPM_REGISTRY 控制）
#
# 用法：
#   sudo ./setup-docker-mirror.sh            # 使用默认镜像列表
#   sudo ./setup-docker-mirror.sh --tencent  # 腾讯云 CVM 用内网加速器（免流量、最快）
#   sudo ./setup-docker-mirror.sh --huawei   # 华为云 ECS 用华为加速器
#
# 说明：
#   - 会自动备份已有 /etc/docker/daemon.json 到 daemon.json.bak.时间戳，不会破坏现有配置
#   - 合并需要 jq 或 python3；两者都没有且已存在 daemon.json 时，脚本会打印配置供手动合并
# ============================================

MIRRORS_DEFAULT='["https://docker.m.daocloud.io","https://docker.1ms.run","https://hub.rat.dev"]'
MIRRORS_TENCENT='["https://mirror.ccs.tencentyun.com","https://docker.m.daocloud.io"]'
MIRRORS_HUAWEI='["https://docker.m.daocloud.io","https://docker.1ms.run"]'

MIRRORS="$MIRRORS_DEFAULT"
case "${1:-}" in
  --tencent) MIRRORS="$MIRRORS_TENCENT" ;;
  --huawei)  MIRRORS="$MIRRORS_HUAWEI" ;;
  --help|-h)
    sed -n '2,20p' "$0"
    exit 0
    ;;
esac

DAEMON_JSON=/etc/docker/daemon.json

if [ "$(id -u)" -ne 0 ]; then
  echo "✗ 需要 root 权限运行：sudo $0 $*"
  exit 1
fi

mkdir -p /etc/docker

if [ -f "$DAEMON_JSON" ]; then
  BACKUP="${DAEMON_JSON}.bak.$(date +%s)"
  cp "$DAEMON_JSON" "$BACKUP"
  echo "✓ 已备份现有配置到 $BACKUP"
else
  echo '{}' > "$DAEMON_JSON"
fi

if command -v python3 > /dev/null 2>&1; then
  python3 - "$DAEMON_JSON" "$MIRRORS" <<'PY'
import json, sys
path, mirrors = sys.argv[1], json.loads(sys.argv[2])
with open(path) as f:
    cfg = json.load(f) or {}
cfg['registry-mirrors'] = mirrors
with open(path, 'w') as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
    f.write('\n')
PY
elif command -v jq > /dev/null 2>&1; then
  TMP="$(mktemp)"
  jq --argjson m "$MIRRORS" '. + {"registry-mirrors": $m}' "$DAEMON_JSON" > "$TMP"
  mv "$TMP" "$DAEMON_JSON"
else
  # 没有 jq/python3：仅在文件是空配置时直接写入，否则提示手动合并
  if [ "$(tr -d ' \n' < "$DAEMON_JSON")" = "{}" ]; then
    printf '{\n  "registry-mirrors": %s\n}\n' "$MIRRORS" > "$DAEMON_JSON"
  else
    echo "⚠ 未找到 jq / python3，无法自动合并已有配置。请手动把下面内容合并进 $DAEMON_JSON ："
    echo "  \"registry-mirrors\": $MIRRORS"
    exit 1
  fi
fi

echo "✓ 已写入 $DAEMON_JSON ："
cat "$DAEMON_JSON"

echo ""
echo "重启 Docker 使配置生效..."
systemctl daemon-reload
systemctl restart docker

echo ""
echo "当前生效的镜像加速器："
docker info 2>/dev/null | grep -A 5 'Registry Mirrors' || echo "（未读取到，请检查 docker 是否正常运行）"

echo ""
echo "验证拉取速度（会真的下载一个小镜像）："
time docker pull docker.m.daocloud.io/library/alpine:latest > /dev/null 2>&1 || true

echo ""
echo "✓ 完成。之后 docker pull / docker compose build 拉取基础镜像都会走加速器。"
echo "  如需回滚：cp $DAEMON_JSON.bak.<时间戳> $DAEMON_JSON && systemctl restart docker"
