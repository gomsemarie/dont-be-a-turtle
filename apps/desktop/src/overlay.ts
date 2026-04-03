/**
 * Warning overlay window management.
 * Creates transparent, always-on-top windows for warnings.
 */

import { BrowserWindow, screen } from "electron";
import path from "path";
import fs from "fs";

let overlayWindow: BrowserWindow | null = null;
let currentLevel = 0;
let breakActive = false;
let overlayReady = false;
let pendingCommands: string[] = [];

/**
 * Create the transparent overlay window.
 */
function createOverlayWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

  console.log(`[Overlay] Creating overlay: ${width}x${height}`);

  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    hasShadow: false,
    roundedCorners: false,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Make window click-through
  win.setIgnoreMouseEvents(true, { forward: true });

  // Always on top at screen-saver level (highest)
  win.setAlwaysOnTop(true, "screen-saver", 1);

  // Visible on all workspaces/spaces
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // macOS: ensure overlay is above all windows including fullscreen
  if (process.platform === "darwin") {
    win.setWindowButtonVisibility(false);
  }

  // Load overlay HTML
  const overlayPath = path.join(__dirname, "..", "overlay.html");
  console.log("[Overlay] Loading:", overlayPath);
  win.loadFile(overlayPath);

  // Mark as ready when page finishes loading, then flush pending commands
  win.webContents.on("did-finish-load", () => {
    console.log("[Overlay] HTML loaded successfully");
    overlayReady = true;
    // Flush any queued commands
    for (const cmd of pendingCommands) {
      win.webContents.executeJavaScript(cmd).catch((e: any) =>
        console.error("[Overlay] Flush JS error:", e)
      );
    }
    pendingCommands = [];
    // Re-show window after flushing commands (may have been invisible during load)
    if (currentLevel > 0 || breakActive) {
      win.showInactive();
    }
  });

  win.webContents.on("did-fail-load", (_e: any, code: number, desc: string) => {
    console.error(`[Overlay] Failed to load: ${code} ${desc}`);
  });

  return win;
}

/**
 * Execute JS on the overlay window, queuing if not yet loaded.
 */
function executeOnOverlay(js: string): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  if (overlayReady) {
    overlayWindow.webContents
      .executeJavaScript(js)
      .catch((e: any) => console.error("[Overlay] JS error:", e));
  } else {
    pendingCommands.push(js);
  }
}

/**
 * Ensure overlay window exists and is ready.
 */
function ensureOverlay(): BrowserWindow {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    console.log("[Overlay] Creating overlay window...");
    overlayReady = false;
    pendingCommands = [];
    overlayWindow = createOverlayWindow();
  }
  return overlayWindow;
}

/**
 * Resolve rank image file to base64 data URI.
 * Tries prod path first, then dev path.
 */
function resolveRankImage(imageName: string): string | undefined {
  const prodPath = path.join(__dirname, "..", "ui", "ranks", imageName);
  const devPath = path.join(__dirname, "..", "..", "..", "packages", "ui", "public", "ranks", imageName);
  const resolved = fs.existsSync(prodPath) ? prodPath : devPath;
  try {
    const buf = fs.readFileSync(resolved);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/**
 * Update custom warning messages on the overlay.
 */
export function setWarningMessages(messages: string[]): void {
  ensureOverlay();
  const escaped = JSON.stringify(messages);
  executeOnOverlay(`window.setWarningMessages(${escaped})`);
}

/**
 * Show warning overlay at specified level.
 * Level 0 = hide, 1 = caution, 2 = warning, 3 = danger
 */
export function showWarning(level: number): void {
  const changed = level !== currentLevel;
  currentLevel = level;

  if (level === 0) {
    if (changed) hideWarning();
    return;
  }

  const win = ensureOverlay();
  if (changed) {
    console.log(`[Overlay] Warning level changed to: ${level}`);
    executeOnOverlay(`window.setWarningLevel(${level})`);
  }
  // Always ensure window is visible (it may have been hidden or not yet shown)
  if (!win.isDestroyed() && !win.isVisible()) {
    win.showInactive();
  }
}

/**
 * Hide the warning overlay.
 */
export function hideWarning(): void {
  currentLevel = 0;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    executeOnOverlay(`window.setWarningLevel(0)`);
    overlayWindow.hide();
  }
}

/**
 * Show break reminder overlay with floating rank images/emojis.
 */
export function showBreakReminder(rankData?: {
  emoji: string;
  image?: string;
  name: string;
  color: string;
}, chaosLevel: number = 3): void {
  const win = ensureOverlay();

  // Resolve rank image to base64
  if (rankData?.image) {
    const resolved = resolveRankImage(rankData.image);
    if (resolved) {
      rankData.image = resolved;
    } else {
      delete rankData.image;
    }
  }

  breakActive = true;
  console.log("[Overlay] showBreakReminder called, chaosLevel:", chaosLevel, "overlayReady:", overlayReady);

  const escaped = JSON.stringify(rankData || { emoji: "🐢", name: "거북이", color: "#22c55e" });
  executeOnOverlay(`window.showBreakReminder(${escaped}, ${chaosLevel})`);

  // Enable mouse events so the dismiss button is clickable
  win.setIgnoreMouseEvents(false);

  // Poll for dismiss from main process
  const pollDismiss = setInterval(() => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      clearInterval(pollDismiss);
      return;
    }
    overlayWindow.webContents.executeJavaScript(
      `document.getElementById('breakReminder').classList.contains('active')`
    ).then((active: boolean) => {
      if (!active) {
        clearInterval(pollDismiss);
        onBreakDismissed();
      }
    }).catch(() => clearInterval(pollDismiss));
  }, 500);

  // Show window — also schedule a delayed show to handle first-creation race
  win.showInactive();
  if (!overlayReady) {
    // Overlay HTML not loaded yet; showInactive() after load is handled by did-finish-load + breakActive flag
    console.log("[Overlay] Window not ready yet, will show after load");
  }
}

/**
 * Called from overlay when break dismiss button is clicked.
 */
export function onBreakDismissed(): void {
  breakActive = false;
  console.log("[Overlay] Break dismissed");
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    if (currentLevel === 0) {
      overlayWindow.hide();
    }
  }
}

/**
 * Show posture alert overlay with specific message and level.
 */
export function showPostureAlert(message?: string, level?: number): void {
  const win = ensureOverlay();
  const msg = JSON.stringify(message || "자세를 바르게 해주세요");
  const lvl = level || 1;
  executeOnOverlay(`window.showPostureAlert(${msg}, ${lvl})`);
  win.showInactive();
}

/**
 * Show/hide face-lost countdown timer on overlay.
 * remainingSec <= 0 means face is detected (hide timer).
 */
export function showFaceLostTimer(remainingSec: number, elapsedSec: number): void {
  const win = ensureOverlay();
  executeOnOverlay(`window.showFaceLostTimer(${remainingSec}, ${elapsedSec})`);
  if (remainingSec > 0) {
    win.showInactive();
  }
}

/**
 * Show rank celebration overlay (full screen).
 */
export function showCelebration(data: {
  direction: string;
  emoji: string;
  image?: string;
  name: string;
  level: number;
  description: string;
  color: string;
}): void {
  const win = ensureOverlay();

  // Resolve image to base64 data URI so overlay.html can display it reliably
  if (data.image) {
    const prodPath = path.join(__dirname, "..", "ui", "ranks", data.image);
    const devPath = path.join(__dirname, "..", "..", "..", "packages", "ui", "public", "ranks", data.image);
    console.log("[Overlay] Image lookup:", { prodPath, devPath, prodExists: fs.existsSync(prodPath), devExists: fs.existsSync(devPath) });
    const resolved = resolveRankImage(data.image);
    if (resolved) {
      data.image = resolved;
      console.log("[Overlay] Image loaded OK, base64 length:", data.image.length);
    } else {
      console.error("[Overlay] Failed to read rank image");
      delete data.image;
    }
  }

  const escaped = JSON.stringify(data);
  executeOnOverlay(`window.showCelebration(${escaped})`);
  win.showInactive();

  // Auto-hide after 5.5s (celebration lasts ~5.2s)
  setTimeout(() => {
    if (currentLevel === 0 && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
  }, 5500);
}

/**
 * Destroy the overlay window.
 */
export function destroyOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
  }
  overlayWindow = null;
  overlayReady = false;
  pendingCommands = [];
  currentLevel = 0;
}
