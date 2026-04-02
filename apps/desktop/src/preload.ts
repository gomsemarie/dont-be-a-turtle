/**
 * Preload script - exposes safe IPC to renderer.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  send: (channel: string, ...args: any[]) => {
    const validChannels = [
      "minimize-to-tray",
      "close-app",
      "monitoring-started",
      "monitoring-stopped",
      "test-notification",
      "show-celebration",
      "trigger-break",
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = ["warning-level-changed", "break-reminder", "break-status", "monitoring-state-changed", "rank-changed"];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
});
