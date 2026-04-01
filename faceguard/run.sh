#!/bin/bash

echo ""
echo " ╔══════════════════════════════════════╗"
echo " ║        거북이 키우기 - 빠른 실행         ║"
echo " ╚══════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Check Python
if command -v python3 &> /dev/null; then
    PY=python3
elif command -v python &> /dev/null; then
    PY=python
else
    echo "[!] Python이 설치되어 있지 않습니다."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "[!] node_modules가 없습니다. setup.sh를 먼저 실행해주세요."
    exit 1
fi

# Cleanup function
cleanup() {
    echo ""
    echo "[*] 종료 중..."
    kill $BACKEND_PID $UI_PID 2>/dev/null
    wait $BACKEND_PID $UI_PID 2>/dev/null 2>&1
    echo "[✓] 종료 완료"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Start Python backend
cd "$SCRIPT_DIR/apps/backend"
$PY main.py &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

# Wait for backend to be ready
echo "[*] 백엔드 시작 대기 중..."
for i in $(seq 1 15); do
    if curl -s http://127.0.0.1:18765/api/health > /dev/null 2>&1; then
        echo "[✓] 백엔드 준비 완료"
        break
    fi
    sleep 1
done

# Start React UI dev server
pnpm dev:ui 2>/dev/null &
UI_PID=$!
sleep 3

# Start Electron (suppress SIGTERM exit code noise)
echo "[*] 거북이 키우기 실행 중..."
cd apps/desktop
pnpm dev 2>/dev/null

# When Electron closes, cleanup happens via trap
