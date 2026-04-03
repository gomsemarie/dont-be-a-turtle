/**
 * 거북이 키우기 Electron Main Process
 */

import { app, BrowserWindow, ipcMain, screen, Notification, shell } from "electron";
import path from "path";
import fs from "fs";
import http from "http";
import { IncomingMessage } from "http";
import { startBackend, stopBackend, BACKEND_PORT } from "./python-manager";
import { createTray, updateTrayState, updateTrayMonitoring, destroyTray } from "./tray";
import { showWarning, hideWarning, showBreakReminder, showPostureAlert, showFaceLostTimer, showCelebration, setWarningMessages, destroyOverlay } from "./overlay";

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let monitoringActive = false;
let lastNotifiedLevel = 0;
let lastNotificationTime = 0;
let autoBreakShown = false;
let breakReminderShown = false;

const isDev = !app.isPackaged;

const DEFAULT_WARNING_MESSAGES: Record<number, { title: string; body: string }> = {
  1: { title: "💡 거북이 키우기 - 주의", body: "화면에 조금 가까워요. 적정 거리를 유지해주세요." },
  2: { title: "⚠️ 거북이 키우기 - 경고", body: "화면에 너무 가까워요! 뒤로 물러나주세요." },
  3: { title: "🚨 거북이 키우기 - 위험", body: "화면에 매우 가까워요! 즉시 거리를 두세요." },
};

// Settings synced from backend
let customWarningMessages: string[] = [];
let notificationEnabled = true;
let breakChaosLevel = 3;

// Current rank data (for break reminder)
let currentRankData: { emoji: string; image?: string; name: string; color: string } | null = null;

// ─── Settings sync ────────────────────────────────────────────

async function syncSettings(): Promise<void> {
  try {
    const data = await httpGet(`http://127.0.0.1:${BACKEND_PORT}/api/settings`);
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed.warning_messages)) {
      customWarningMessages = parsed.warning_messages;
      // Push to overlay so it can display them
      setWarningMessages(customWarningMessages);
    }
    notificationEnabled = parsed.notification_enabled !== false;
    breakChaosLevel = parsed.break_chaos_level ?? 3;
  } catch {
    // keep current values
  }
  // Also sync current rank data
  try {
    const rankData = await httpGet(`http://127.0.0.1:${BACKEND_PORT}/api/rank`);
    const rank = JSON.parse(rankData);
    const monthly = rank?.monthly?.current;
    if (monthly) {
      currentRankData = {
        emoji: monthly.emoji || "🐢",
        image: monthly.image,
        name: monthly.name || "거북이",
        color: monthly.color || "#22c55e",
      };
    }
  } catch {
    // keep current values
  }
}

// ─── Notifications ────────────────────────────────────────────

function getWarningMessage(level: number): { title: string; body: string } {
  const titles: Record<number, string> = {
    1: "💡 거북이 키우기 - 주의",
    2: "⚠️ 거북이 키우기 - 경고",
    3: "🚨 거북이 키우기 - 위험",
  };
  const customBody = customWarningMessages[level - 1];
  const defaultMsg = DEFAULT_WARNING_MESSAGES[level];
  return {
    title: titles[level] || "거북이 키우기",
    body: customBody || defaultMsg?.body || "경고",
  };
}

function sendOSNotification(level: number): void {
  if (!notificationEnabled) return;

  const now = Date.now();
  if (level <= lastNotifiedLevel || now - lastNotificationTime < 10000) return;

  const msg = getWarningMessage(level);
  lastNotifiedLevel = level;
  lastNotificationTime = now;

  if (Notification.isSupported()) {
    try {
      const notif = new Notification({ title: msg.title, body: msg.body, silent: false });
      notif.on("click", () => { mainWindow?.show(); mainWindow?.focus(); });
      notif.show();
    } catch {
      // ignore
    }
  }
}

function resetNotificationState(): void {
  lastNotifiedLevel = 0;
  lastNotificationTime = 0;
}

// ─── Splash ──────────────────────────────────────────────────

function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 320,
    height: 280,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  // Load rank-10 image as base64 for splash
  let imgSrc = "";
  try {
    const imgPath = isDev
      ? path.join(__dirname, "..", "..", "..", "packages", "ui", "public", "ranks", "rank-10.png")
      : path.join(__dirname, "..", "ui", "ranks", "rank-10.png");
    const buf = fs.readFileSync(imgPath);
    imgSrc = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    // fallback: no image
  }

  const imgTag = imgSrc
    ? `<img src="${imgSrc}" class="logo" />`
    : `<div class="emoji">🐢</div>`;

  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html>
<head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; background: rgba(9,9,11,0.92); border-radius: 16px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #e4e4e7;
    -webkit-app-region: drag;
  }
  .logo { width: 96px; height: 96px; object-fit: contain; image-rendering: pixelated; margin-bottom: 14px; animation: bounce 1.2s infinite; }
  .emoji { font-size: 52px; margin-bottom: 14px; animation: bounce 1.2s infinite; }
  .title { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
  .sub { font-size: 11px; color: #71717a; }
  .dots::after { content: ''; animation: dots 1.5s steps(4) infinite; }
  @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  @keyframes dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
</style></head>
<body>
  ${imgTag}
  <div class="title">거북이 키우기</div>
  <div class="sub">로딩 중<span class="dots"></span></div>
</body>
</html>
  `)}`);

  splash.center();
  return splash;
}

// ─── Window ───────────────────────────────────────────────────

function getAppIconPath(): string {
  if (isDev) {
    return path.join(__dirname, "..", "..", "resources", "icon.png");
  }
  return path.join(process.resourcesPath, "..", "resources", "icon.png");
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 740,
    minWidth: 480,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: -100, y: -100 },
    backgroundColor: "#09090b",
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  if (isDev) {
    win.loadURL("http://localhost:5199");
  } else {
    win.loadFile(path.join(__dirname, "..", "ui", "index.html"));
  }

  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });

  win.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

// ─── SSE Client ───────────────────────────────────────────────

function createSSEClient(
  url: string,
  onEvent: (eventName: string, data: string) => void,
  onError?: () => void,
): { close: () => void } {
  let req: http.ClientRequest | null = null;
  let closed = false;

  const connect = () => {
    if (closed) return;

    req = http.get(url, (res: IncomingMessage) => {
      if (res.statusCode !== 200) {
        res.resume();
        if (!closed) setTimeout(connect, 2000);
        return;
      }

      let buffer = "";

      res.on("data", (chunk: Buffer) => {
        // Normalize \r\n to \n (sse_starlette uses \r\n)
        buffer += chunk.toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          let eventName = "message";
          let eventData = "";

          for (const line of part.split("\n")) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              eventData = line.slice(5).trim();
            }
          }

          if (eventData) {
            onEvent(eventName, eventData);
          }
        }
      });

      res.on("end", () => {
        if (!closed) setTimeout(connect, 1000);
      });
    });

    req.on("error", () => {
      if (!closed) {
        onError?.();
        setTimeout(connect, 2000);
      }
    });
  };

  connect();

  return {
    close: () => {
      closed = true;
      req?.destroy();
      req = null;
    },
  };
}

// ─── Types & Parsing ──────────────────────────────────────────

interface DistanceEvent {
  face_detected: boolean;
  distance_cm: number;
  warning_level: number;
  raw_warning_level: number;
  grace_remaining: number;
  posture_alert: boolean;
  posture_message: string;
  posture_warning_level: number;
  elapsed_min: number;
  needs_break: boolean;
  auto_break_active: boolean;
  face_lost_elapsed_sec: number;
  auto_break_remaining_sec: number;
  rank_event?: any;
}

function parseDistanceEvent(data: string): DistanceEvent | null {
  try {
    const parsed = JSON.parse(data);
    return {
      face_detected: parsed.face_detected ?? false,
      distance_cm: parsed.distance_cm ?? 0,
      warning_level: parsed.warning_level ?? 0,
      raw_warning_level: parsed.raw_warning_level ?? 0,
      grace_remaining: parsed.grace_remaining ?? 0,
      posture_alert: parsed.posture_alert ?? false,
      posture_message: parsed.posture_message ?? "",
      posture_warning_level: parsed.posture_warning_level ?? 0,
      elapsed_min: parsed.elapsed_min ?? 0,
      needs_break: parsed.needs_break ?? false,
      auto_break_active: parsed.auto_break_active ?? false,
      face_lost_elapsed_sec: parsed.face_lost_elapsed_sec ?? 0,
      auto_break_remaining_sec: parsed.auto_break_remaining_sec ?? 0,
      rank_event: parsed.rank_event,
    };
  } catch {
    return null;
  }
}

// ─── Monitoring ───────────────────────────────────────────────

async function startMonitoringLoop(): Promise<void> {
  if ((global as any).__monitoringSSE) return;

  monitoringActive = true;
  updateTrayMonitoring(true);
  await syncSettings();

  const url = `http://127.0.0.1:${BACKEND_PORT}/api/stream/distance`;
  // Periodic settings refresh (every 10s) so toggling notification mid-session works
  const settingsRefreshInterval = setInterval(() => {
    if (monitoringActive) syncSettings();
    else clearInterval(settingsRefreshInterval);
  }, 10000);

  const client = createSSEClient(
    url,
    (eventName, data) => {
      if (eventName === "distance") {
        const ev = parseDistanceEvent(data);
        if (!ev) return;

        // Update tray
        const states = ["safe", "caution", "warning", "danger"] as const;
        updateTrayState(states[ev.warning_level] || "safe");

        // Overlay
        showWarning(ev.warning_level);

        // OS notification
        if (ev.warning_level > 0) {
          sendOSNotification(ev.warning_level);
        } else {
          resetNotificationState();
        }

        // IPC to renderer: level, dist, msg, grace, rawLevel, posture, breakInfo
        const warningMsg = ev.warning_level > 0 ? (customWarningMessages[ev.warning_level - 1] || "") : "";

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("warning-level-changed", ev.warning_level, ev.distance_cm, warningMsg, ev.grace_remaining, ev.raw_warning_level, ev.posture_alert, ev.posture_message, ev.posture_warning_level);
          mainWindow.webContents.send("break-status", ev.elapsed_min, ev.needs_break, ev.auto_break_active);
          mainWindow.webContents.send("face-lost-timer", ev.face_lost_elapsed_sec, ev.auto_break_remaining_sec);
        }

        // Show face-lost countdown on overlay when face is undetected
        if (ev.face_lost_elapsed_sec > 0 && ev.auto_break_remaining_sec > 0) {
          showFaceLostTimer(ev.auto_break_remaining_sec, ev.face_lost_elapsed_sec);
        } else {
          showFaceLostTimer(0, 0);
        }

        // Auto-break: show break reminder overlay when rest mode activates (once)
        if (ev.auto_break_active && !autoBreakShown) {
          autoBreakShown = true;
          showBreakReminder(currentRankData || undefined, breakChaosLevel);
        } else if (!ev.auto_break_active) {
          autoBreakShown = false;
        }

        // Rank change event from backend
        if (ev.rank_event) {
          const re = ev.rank_event;
          const celebrationData = {
            direction: re.direction,
            emoji: re.rank.emoji,
            image: re.rank.image,
            name: re.rank.name,
            level: re.rank.level,
            step_label: re.rank.step_label,
            description: re.rank.description,
            color: re.rank.color,
          };
          // Show full-screen overlay celebration
          showCelebration(celebrationData);
          // Also notify renderer for in-app celebration
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("rank-changed", celebrationData);
          }
        }

        // Overlay break/posture (guard: only show once per break cycle)
        if (ev.needs_break && !breakReminderShown) {
          breakReminderShown = true;
          showBreakReminder(currentRankData || undefined, breakChaosLevel);
        } else if (!ev.needs_break) {
          breakReminderShown = false;
        }
        if (ev.posture_alert) showPostureAlert(ev.posture_message, ev.posture_warning_level);
      } else if (eventName === "stopped") {
        client.close();
        (global as any).__monitoringSSE = null;
        clearInterval(settingsRefreshInterval);
        hideWarning();
        updateTrayState("idle");
        monitoringActive = false;
      }
    },
    () => { /* retry handled internally */ },
  );

  (global as any).__monitoringSSE = client;
  startFallbackPolling();
}

function startFallbackPolling(): void {
  if ((global as any).__fallbackPoller) return;

  const poller = setInterval(async () => {
    if (!monitoringActive) {
      clearInterval(poller);
      (global as any).__fallbackPoller = null;
      return;
    }
    try {
      const data = await httpGet(`http://127.0.0.1:${BACKEND_PORT}/api/monitor/status`);
      const status = JSON.parse(data);
      if (!status.active) stopMonitoringLoop();
    } catch {
      // ignore
    }
  }, 5000);

  (global as any).__fallbackPoller = poller;
}

function stopMonitoringLoop(): void {
  monitoringActive = false;
  updateTrayMonitoring(false);
  const client = (global as any).__monitoringSSE;
  if (client) { client.close(); (global as any).__monitoringSSE = null; }
  const poller = (global as any).__fallbackPoller;
  if (poller) { clearInterval(poller); (global as any).__fallbackPoller = null; }
  hideWarning();
  updateTrayState("idle");
  resetNotificationState();
  // Clear in-app warning overlay in renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("warning-level-changed", 0, 0, "", 0, 0, false);
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

function httpPost(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: "POST",
        headers: { "Content-Length": "0" },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// ─── App Lifecycle ────────────────────────────────────────────

app.whenReady().then(async () => {
  const splash = createSplashWindow();

  const backendReady = await startBackend();
  if (!backendReady) {
    splash.destroy();
    console.error("Failed to start backend. Exiting.");
    app.quit();
    return;
  }

  mainWindow = createMainWindow();
  mainWindow.once("ready-to-show", () => splash.destroy());

  createTray({
    onShowWindow: () => { mainWindow?.show(); mainWindow?.focus(); },
    onStartMonitoring: async () => {
      try {
        await httpPost(`http://127.0.0.1:${BACKEND_PORT}/api/monitor/start`);
        startMonitoringLoop();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("monitoring-state-changed", true);
        }
      } catch {}
    },
    onStopMonitoring: async () => {
      try {
        await httpPost(`http://127.0.0.1:${BACKEND_PORT}/api/monitor/stop`);
        stopMonitoringLoop();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("monitoring-state-changed", false);
        }
      } catch {}
    },
    onQuit: () => { isQuitting = true; app.quit(); },
  });

  ipcMain.on("minimize-to-tray", () => mainWindow?.hide());
  ipcMain.on("close-app", () => { isQuitting = true; app.quit(); });
  ipcMain.on("monitoring-started", () => {
    setTimeout(() => startMonitoringLoop(), 500);
  });
  ipcMain.on("monitoring-stopped", () => stopMonitoringLoop());
  ipcMain.on("show-celebration", (_event: any, data: any) => {
    showCelebration(data);
  });
  ipcMain.on("open-external-url", (_event: any, url: string) => {
    // Only allow https GitHub URLs for safety
    if (url && typeof url === "string" && url.startsWith("https://github.com/")) {
      shell.openExternal(url);
    }
  });
  ipcMain.on("trigger-break", async () => {
    // Must sync first to get latest rank data (image) + chaos level from backend
    await syncSettings();
    console.log("[Main] Manual break triggered, chaosLevel:", breakChaosLevel, "rankData:", JSON.stringify(currentRankData));
    showBreakReminder(currentRankData || undefined, breakChaosLevel);
  });
});

app.on("window-all-closed", () => { /* keep running for tray */ });
app.on("activate", () => { mainWindow?.show(); mainWindow?.focus(); });
app.on("before-quit", () => {
  isQuitting = true;
  stopMonitoringLoop();
  destroyOverlay();
  destroyTray();
  stopBackend();
});
