import { create } from "zustand";

const ipcRenderer = (window as any).electronAPI;

interface MonitorState {
  /** Break reminder: minutes elapsed since monitoring started */
  breakElapsedMin: number;
  /** Break reminder: whether it's time to take a break */
  needsBreak: boolean;
  /** Initialize IPC listeners (call once) */
  initIPC: () => void;
}

export const useMonitorStore = create<MonitorState>((set) => ({
  breakElapsedMin: 0,
  needsBreak: false,

  initIPC: () => {
    ipcRenderer?.on("break-status", (elapsed: number, needs: boolean) => {
      set({ breakElapsedMin: elapsed, needsBreak: needs });
    });
  },
}));
