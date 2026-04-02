/**
 * System tray management.
 */

import { Tray, Menu, nativeImage, app } from "electron";
import path from "path";

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
 * Create a tray icon.
 * macOS: uses a template image (monochrome, system handles dark/light).
 * Others: colored circle with "F" text.
 */
/**
 * Create a 22×22 (44×44 @2x) PNG tray icon as raw RGBA pixels.
 * macOS template images must be black + alpha only.
 * Draws a cute turtle silhouette.
 */
function createMacTemplateIcon(): Electron.NativeImage {
  const s = 44;
  const buf = Buffer.alloc(s * s * 4, 0);

  const setPixel = (x: number, y: number, a: number) => {
    if (x < 0 || x >= s || y < 0 || y >= s) return;
    const i = (y * s + x) * 4;
    buf[i] = 0;
    buf[i + 1] = 0;
    buf[i + 2] = 0;
    buf[i + 3] = a;
  };

  const fillCircle = (cx: number, cy: number, r: number, a: number) => {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= r) {
          const edge = Math.max(0, Math.min(1, r - dist + 0.5));
          setPixel(Math.round(x), Math.round(y), Math.round(a * edge));
        }
      }
    }
  };

  const fillEllipse = (cx: number, cy: number, rx: number, ry: number, a: number) => {
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 1) {
          const edge = Math.max(0, Math.min(1, (1 - dist) * rx * 0.5 + 0.5));
          setPixel(Math.round(x), Math.round(y), Math.round(a * Math.min(edge, 1)));
        }
      }
    }
  };

  // Turtle shell (main body ellipse)
  fillEllipse(22, 22, 14, 11, 200);
  // Shell highlight (lighter inner ellipse for dome look)
  fillEllipse(22, 20, 10, 7, 130);
  // Head (circle poking out right)
  fillCircle(36, 18, 5, 220);
  // Eye dot
  fillCircle(38, 17, 1.2, 0); // cut-out eye (transparent)
  // Front legs
  fillEllipse(13, 31, 3, 4, 200);
  fillEllipse(31, 31, 3, 4, 200);
  // Back legs
  fillEllipse(11, 16, 3, 3, 180);
  fillEllipse(33, 28, 2.5, 3.5, 180);
  // Tiny tail
  fillCircle(7, 24, 2, 180);

  const img = nativeImage.createFromBuffer(buf, { width: s, height: s, scaleFactor: 2.0 });
  img.setTemplateImage(true);
  return img;
}

function getTrayIconPath(): string {
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.join(__dirname, "..", "..", "resources", "tray-icon.png");
  }
  // Production: resources are in the app's resource path
  return path.join(process.resourcesPath, "..", "resources", "tray-icon.png");
}

function createTrayIcon(color: "green" | "yellow" | "orange" | "red" | "gray"): Electron.NativeImage {
  if (IS_MAC) {
    return createMacTemplateIcon();
  }

  // Windows / Linux — use rank-10 PNG icon (always visible on any tray background)
  try {
    const iconPath = getTrayIconPath();
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      return icon.resize({ width: 16, height: 16 });
    }
  } catch {
    // fallback to SVG
  }

  // Fallback: colored SVG icon
  const size = 16;
  const colors: Record<string, string> = {
    green: "#22c55e",
    yellow: "#eab308",
    orange: "#f97316",
    red: "#ef4444",
    gray: "#6b7280",
  };

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="8" cy="8" r="7" fill="${colors[color]}" />
      <ellipse cx="7.5" cy="8.2" rx="4" ry="3" fill="white" opacity="0.9"/>
      <circle cx="11" cy="6.5" r="1.8" fill="white" opacity="0.9"/>
      <circle cx="11.8" cy="6.2" r="0.5" fill="${colors[color]}"/>
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
  const icon = createTrayIcon("gray");
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

  const iconMap: Record<string, "green" | "yellow" | "orange" | "red" | "gray"> = {
    idle: "gray",
    safe: "green",
    caution: "yellow",
    warning: "orange",
    danger: "red",
  };

  const tooltipMap: Record<string, string> = {
    idle: "거북이 키우기 - 대기 중",
    safe: "거북이 키우기 - 안전 거리",
    caution: "거북이 키우기 - 주의",
    warning: "거북이 키우기 - 경고",
    danger: "거북이 키우기 - 위험!",
  };

  // macOS: template icon doesn't change color, but update tooltip
  if (!IS_MAC) {
    tray.setImage(createTrayIcon(iconMap[state] || "gray"));
  }
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
