/**
 * System tray management.
 */

import { Tray, Menu, nativeImage, app } from "electron";
import path from "path";
import fs from "fs";

let tray: Tray | null = null;
let trayActions: TrayActions | null = null;
let currentMonitoringState = false;

interface TrayActions {
  onShowWindow: () => void;
  onStartMonitoring: () => void;
  onStopMonitoring: () => void;
  onQuit: () => void;
}

const IS_MAC = process.platform === "darwin";

/**
 * Get path to a resource file, handling both dev and production.
 */
function getResourcePath(filename: string): string {
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.join(__dirname, "..", "..", "resources", filename);
  }
  return path.join(process.resourcesPath, "..", "resources", filename);
}

/**
 * Create tray icon from the app's pixel-art icon.
 *
 * macOS: Uses a black silhouette template image (tray-icon-template.png).
 *   Template images let macOS automatically handle dark/light mode coloring.
 *   The 44×44 PNG is loaded as @2x (22pt) for crisp retina display.
 *
 * Windows/Linux: Uses a colored icon with dark circle background (tray-icon.png)
 *   resized to 16×16 for the system tray.
 */
function createTrayIcon(): Electron.NativeImage {
  if (IS_MAC) {
    // macOS: prefer template image (black silhouette, macOS handles coloring)
    try {
      const templatePath = getResourcePath("tray-icon-template.png");
      if (fs.existsSync(templatePath)) {
        const buf = fs.readFileSync(templatePath);
        // Create as 22pt @2x for retina
        const img = nativeImage.createFromBuffer(buf, {
          width: 44,
          height: 44,
          scaleFactor: 2.0,
        });
        img.setTemplateImage(true);
        return img;
      }
    } catch { /* fallback */ }

    // Fallback: colored 44x44 icon (non-template)
    try {
      const coloredPath = getResourcePath("tray-icon-44.png");
      if (fs.existsSync(coloredPath)) {
        const img = nativeImage.createFromPath(coloredPath);
        if (!img.isEmpty()) {
          return img.resize({ width: 18, height: 18 });
        }
      }
    } catch { /* fallback */ }
  }

  // Windows / Linux: colored icon with dark background
  try {
    const iconPath = getResourcePath("tray-icon.png");
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      return icon.resize({ width: 16, height: 16 });
    }
  } catch { /* fallback */ }

  // Last resort fallback: simple SVG
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="7" fill="#18181c"/>
      <ellipse cx="8" cy="8" rx="5" ry="4.5" fill="white" opacity="0.9"/>
      <circle cx="9.5" cy="7" r="0.7" fill="#18181c"/>
    </svg>
  `;

  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  );
}

/**
 * Initialize the system tray.
 */
function buildContextMenu(actions: TrayActions, monitoring: boolean): Menu {
  return Menu.buildFromTemplate([
    {
      label: "거북이 키우기 열기",
      click: actions.onShowWindow,
    },
    { type: "separator" },
    {
      label: "모니터링 시작",
      id: "start",
      enabled: !monitoring,
      click: actions.onStartMonitoring,
    },
    {
      label: "모니터링 중지",
      id: "stop",
      enabled: monitoring,
      click: actions.onStopMonitoring,
    },
    { type: "separator" },
    {
      label: "종료",
      click: actions.onQuit,
    },
  ]);
}

export function createTray(actions: TrayActions): Tray {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  trayActions = actions;

  tray.setToolTip("거북이 키우기 - 대기 중");
  tray.setContextMenu(buildContextMenu(actions, false));
  tray.on("double-click", actions.onShowWindow);

  return tray;
}

/**
 * Update tray menu items to reflect monitoring state.
 */
export function updateTrayMonitoring(active: boolean): void {
  if (!tray || !trayActions || active === currentMonitoringState) return;
  currentMonitoringState = active;
  tray.setContextMenu(buildContextMenu(trayActions, active));
}

/**
 * Update tray icon based on monitoring state.
 */
export function updateTrayState(state: "idle" | "safe" | "caution" | "warning" | "danger"): void {
  if (!tray) return;

  const tooltipMap: Record<string, string> = {
    idle: "거북이 키우기 - 대기 중",
    safe: "거북이 키우기 - 안전 거리",
    caution: "거북이 키우기 - 주의",
    warning: "거북이 키우기 - 경고",
    danger: "거북이 키우기 - 위험!",
  };

  tray.setToolTip(tooltipMap[state] || "거북이 키우기");
}

/**
 * Destroy the tray.
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
