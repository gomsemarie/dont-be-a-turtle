@echo off
chcp 65001 >nul
title 거북이 키우기 Setup & Run

echo.
echo  ╔══════════════════════════════════════╗
echo  ║       거북이 키우기 - 설치 및 실행       ║
echo  ╚══════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js가 설치되어 있지 않습니다.
    echo     https://nodejs.org 에서 설치 후 다시 실행해주세요.
    pause
    exit /b 1
)

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python이 설치되어 있지 않습니다.
    echo     https://python.org 에서 설치 후 다시 실행해주세요.
    pause
    exit /b 1
)

:: Check pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] pnpm 설치 중...
    npm install -g pnpm
)

echo [1/3] Python 패키지 설치 중...
cd apps\backend
pip install -r requirements.txt -q
cd ..\..

echo [2/3] Node 패키지 설치 중...
pnpm install

echo [3/3] Electron 빌드 중...
cd apps\desktop
call pnpm install
call pnpm build
cd ..\..

echo.
echo  ✓ 설치 완료! 앱을 실행합니다...
echo.

:: Start Python backend in background
start "거북이 키우기 Backend" /min cmd /c "cd apps\backend && python main.py"

:: Wait for backend
echo [*] 백엔드 시작 대기 중...
timeout /t 3 /nobreak >nul

:: Start React UI dev server in background
start "거북이 키우기 UI" /min cmd /c "pnpm dev:ui"

:: Wait for UI
timeout /t 3 /nobreak >nul

:: Start Electron
echo [*] 거북이 키우기 실행 중...
cd apps\desktop
pnpm dev
