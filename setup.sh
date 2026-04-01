#!/bin/bash

echo ""
echo " ╔══════════════════════════════════════╗"
echo " ║       거북이 키우기 - 설치 및 실행       ║"
echo " ╚══════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[!] Node.js가 설치되어 있지 않습니다."
    echo "    https://nodejs.org 에서 설치 후 다시 실행해주세요."
    exit 1
fi

# Check Python
if command -v python3 &> /dev/null; then
    PY=python3
    PIP=pip3
elif command -v python &> /dev/null; then
    PY=python
    PIP=pip
else
    echo "[!] Python이 설치되어 있지 않습니다."
    echo "    https://python.org 에서 설치 후 다시 실행해주세요."
    exit 1
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "[*] pnpm 설치 중..."
    npm install -g pnpm
fi

echo "[1/4] Python 패키지 설치 중..."
cd apps/backend

$PIP install -r requirements.txt -q

# mediapipe 호환성 자동 진단
echo "  [*] mediapipe 호환 버전 확인 중..."
$PY check_mediapipe.py
if [ $? -ne 0 ]; then
    echo ""
    echo "  [!] mediapipe를 사용할 수 없습니다."
    exit 1
fi

# tasks API 사용 시 모델 파일 사전 다운로드
NEEDS_MODEL=$($PY -c "
try:
    import mediapipe as mp; mp.solutions.face_mesh; print('no')
except: print('yes')
" 2>/dev/null)

if [ "$NEEDS_MODEL" = "yes" ]; then
    CACHE_DIR="$HOME/.cache/faceguard"
    MODEL_PATH="$CACHE_DIR/face_landmarker.task"
    if [ ! -f "$MODEL_PATH" ]; then
        echo "  [*] face_landmarker 모델 다운로드 중..."
        mkdir -p "$CACHE_DIR"
        curl -sL "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task" -o "$MODEL_PATH"
        echo "  [✓] 모델 다운로드 완료"
    fi
fi

cd "$SCRIPT_DIR"

echo "[2/4] 기존 node_modules 정리 중..."
rm -rf node_modules
rm -rf apps/desktop/node_modules
rm -rf packages/ui/node_modules

echo "[3/4] Node 패키지 설치 중 (Electron 포함)..."
pnpm install

# Electron 바이너리 확인 및 강제 재설치
ELECTRON_PATH="node_modules/.pnpm/electron@*/node_modules/electron/dist"
if [ ! -d $ELECTRON_PATH ] 2>/dev/null; then
    echo "[*] Electron 바이너리 재설치 중..."
    cd apps/desktop
    npx electron install 2>/dev/null || true
    # fallback: 직접 postinstall 실행
    node node_modules/electron/install.js 2>/dev/null || \
    node ../../node_modules/.pnpm/electron@*/node_modules/electron/install.js 2>/dev/null || true
    cd "$SCRIPT_DIR"
fi

echo "[4/4] Electron TypeScript 빌드 중..."
cd apps/desktop
pnpm build
cd "$SCRIPT_DIR"

echo ""
echo " ✓ 설치 완료! 앱을 실행합니다..."
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "[*] 종료 중..."
    kill $BACKEND_PID $UI_PID 2>/dev/null
    wait $BACKEND_PID $UI_PID 2>/dev/null
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
pnpm dev:ui &
UI_PID=$!
sleep 3

# Start Electron
echo "[*] 거북이 키우기 실행 중..."
cd apps/desktop
pnpm dev

# When Electron closes, cleanup happens via trap
