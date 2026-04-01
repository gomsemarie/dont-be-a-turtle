#!/bin/bash
# Electron 설치 문제 해결 스크립트

echo "[*] Electron 문제 해결 중..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "[1/3] 기존 설치 삭제..."
rm -rf node_modules
rm -rf apps/desktop/node_modules
rm -rf packages/ui/node_modules
rm -rf ~/.cache/electron
rm -rf ~/Library/Caches/electron

echo "[2/3] 재설치 중..."
pnpm install

echo "[3/3] Electron 바이너리 확인..."
npx electron --version && echo "[✓] Electron 정상 설치됨" || echo "[!] 여전히 문제가 있습니다"

echo ""
echo "완료! 이제 ./setup.sh 를 실행하세요."
