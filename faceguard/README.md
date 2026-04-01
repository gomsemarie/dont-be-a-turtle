# 🐢 거북이 키우기

> 모니터에 너무 가까이 가면 거북이가 자란다

모니터와 얼굴 사이 거리를 실시간으로 감지하여, 너무 가까워지면 시각적으로 경고해주는 데스크톱 앱입니다.
경고를 많이 받을수록 거북이 칭호가 올라가는 게이미피케이션 시스템으로 자세 교정 습관을 만들어줍니다.

## 주요 기능

**거리 감지 & 경고**
- MediaPipe Face Mesh 기반 실시간 얼굴 거리 측정
- 3단계 경고: 주의(노랑) → 경고(주황) → 위험(빨강)
- 전체 화면 오버레이 경고 + 경고음

**거북이 칭호 시스템**
- 경고 포인트 누적 → 10단계 칭호 승급 (자세 깡패 ~ 화석 예약 완료)
- 오늘 / 이번 주 / 이번 달 기간별 통계 & 랭크
- 무경고일 보너스, 일일 자연 감소 등 점수 밸런싱
- 포인트 배율 설정 (0.5x ~ 10x)
- 승급/강등 시 토스트 알림 + 전체 화면 이펙트

**편의 기능**
- 시스템 트레이 상주 (백그라운드 모니터링)
- 사용자 캘리브레이션 (정확한 거리 보정)
- 자세 감지 (고개 기울임 알림)
- 휴식 알림 (장시간 사용 시)
- 기록 초기화, 통계 새로고침

## 칭호 & 점수

| Lv | 칭호 | 필요 점수 | 설명 |
|----|------|-----------|------|
| 1 | 자세 깡패 😏 | 0 | 자세 실화? 당신 혹시 군인? |
| 2 | 어 슬슬? 🤨 | 50 | 거북이가 슬금슬금 다가오는 소리 |
| 3 | ㅋㅋ 시작이네 🫠 | 150 | 거북목 세계에 오신 것을 환영합니다 |
| 4 | 목 어디감? 🫣 | 350 | 목이 모니터한테 뽀뽀하고 싶은가 봄 |
| 5 | 거북목 본캐 🐢 | 600 | 축하합니다 이제 거북이가 직업입니다 |
| 6 | ㄹㅇ 자라됨 🦕 | 1,000 | 거북이 아니고 자라인 듯? |
| 7 | 목 가출함 💀 | 1,500 | 목이 몸에서 퇴사함 |
| 8 | 기럭지 미쳤네 🦒 | 2,500 | 기린이랑 목 길이 대결 가능 |
| 9 | 척추과 단골 🏥 | 4,000 | 정형외과 의사가 눈물 흘림 |
| 10 | 화석 예약 완료 🪦 | 6,000 | 국립중앙박물관에서 전시 섭외 연락 옴 |

**점수 규칙**: 1단계 경고 1pt, 2단계 3pt, 3단계 8pt + 경고 유지 시간 보너스. 무경고일 -5pt, 매일 2% 자연 감소.

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Zustand |
| Desktop | Electron 33 |
| Backend | Python 3.11+, FastAPI, uvicorn |
| AI/CV | MediaPipe Face Mesh, OpenCV |
| 통신 | SSE (Server-Sent Events) + REST API |
| 패키징 | PyInstaller + electron-builder |

## 프로젝트 구조

```
faceguard/
├── apps/
│   ├── backend/                # Python 백엔드 (FastAPI + MediaPipe)
│   │   ├── main.py             # API 서버 + SSE 스트림
│   │   ├── detector.py         # 얼굴 감지 & 거리 계산
│   │   ├── camera.py           # 웹캠 관리
│   │   ├── config.py           # 설정 관리
│   │   ├── history.py          # 경고 기록
│   │   ├── turtle_rank.py      # 칭호 & 점수 시스템
│   │   ├── turtle_ranks.json   # 칭호 정의
│   │   └── scoring_rules.json  # 점수 규칙
│   └── desktop/                # Electron 메인 프로세스
│       ├── src/
│       │   ├── main.ts         # Electron 진입점
│       │   ├── tray.ts         # 시스템 트레이
│       │   ├── overlay.ts      # 경고 오버레이
│       │   ├── python-manager.ts  # Python 프로세스 관리
│       │   └── preload.ts      # IPC 브릿지
│       └── overlay.html        # 경고 오버레이 UI
├── packages/
│   └── ui/                     # React UI (Vite SPA)
│       └── src/
│           ├── app.tsx
│           ├── components/     # UI 컴포넌트
│           ├── hooks/          # API 훅 (TanStack Query)
│           └── stores/         # Zustand 상태 관리
├── scripts/
│   ├── build.js                # 전체 빌드 스크립트
│   └── build-backend.js        # 백엔드 빌드
├── resources/                  # 아이콘
├── setup.sh                    # 설치 & 실행 (macOS/Linux)
├── setup.bat                   # 설치 & 실행 (Windows)
└── run.sh                      # 개발 모드 실행
```

## 시작하기

### 사전 요구사항

- Node.js 18+
- pnpm 8+
- Python 3.11+
- 웹캠

### 간편 설치 & 실행

```bash
# macOS / Linux
chmod +x setup.sh
./setup.sh

# Windows
setup.bat
```

`setup.sh`가 Python 패키지, Node 패키지 설치부터 Electron 실행까지 자동으로 처리합니다.

### 수동 설치

```bash
# 1. Node 패키지
pnpm install

# 2. Python 패키지
cd apps/backend
pip3 install -r requirements.txt
cd ../..

# 3. Electron TypeScript 빌드
cd apps/desktop
pnpm build
cd ../..
```

### 개발 모드

```bash
# 한 번에 실행 (권장)
./run.sh

# 또는 터미널 3개로 분리 실행
pnpm dev:backend    # 터미널 1: Python 백엔드 (포트 18765)
pnpm dev:ui         # 터미널 2: Vite dev server (포트 5199)
pnpm dev            # 터미널 3: Electron
```

## 빌드 (배포용 실행파일)

```bash
pnpm build
```

4단계 자동 빌드:
1. PyInstaller로 Python 백엔드 → 단일 실행파일
2. Vite로 React UI → 정적 번들
3. TypeScript → Electron 메인 프로세스 컴파일
4. electron-builder → 플랫폼별 설치파일

빌드 결과물은 `release/` 디렉토리:
- **Windows**: `.exe` NSIS 설치파일
- **macOS**: `.dmg` (Universal: Intel + Apple Silicon)
- **Linux**: `.AppImage`

## 경고 단계

| 단계 | 기본 거리 | 표시 |
|------|-----------|------|
| 1단계 주의 | ≤ 45cm | 화면 상하단 노란색 경고 바 |
| 2단계 경고 | ≤ 35cm | 화면 테두리 주황색 글로우 |
| 3단계 위험 | ≤ 25cm | 전체 화면 빨간색 오버레이 |

모든 거리 임계값은 설정에서 조절 가능합니다.

## API

백엔드 서버 (기본 `http://127.0.0.1:18765`):

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/health` | 헬스 체크 |
| GET | `/api/settings` | 설정 조회 |
| PUT | `/api/settings` | 설정 수정 |
| GET | `/api/rank` | 현재 칭호 & 점수 |
| GET | `/api/history/stats?days=N` | 기간별 통계 |
| GET | `/api/history?days=N` | 경고 이벤트 목록 |
| POST | `/api/history/reset` | 기록 & 점수 초기화 |
| GET | `/api/stream` | SSE 실시간 거리 스트림 |
| POST | `/api/calibrate/start` | 캘리브레이션 시작 |

## 라이선스

MIT
