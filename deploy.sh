#!/bin/bash
# deploy.sh — 一键 commit + push
set -e

echo "=== 围棋 Pro 自动部署 ==="
git add .
git status
echo ""
read -p "输入 commit 信息 (默认: update): " msg
msg=${msg:-update}
git commit -m "$msg"
git push
echo "✅ 推送完成"
