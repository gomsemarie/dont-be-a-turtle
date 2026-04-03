import { create } from "zustand";

const ipcRenderer = (window as any).electronAPI;

export interface NotificationState {
  // Distance warning
  warningLevel: number; // 0-3
  rawWarningLevel: number; // 0-3 (before grace)
  distance: number; // cm
  warningMessage: string;
  graceRemaining: number; // seconds

  // Posture
  postureAlert: boolean;
  postureMessage: string;
  postureLevel: number; // 0-2

  // Break
  breakElapsedMin: number;
  needsBreak: boolean;
  autoBreakActive: boolean;

  // Face lost
  faceLostElapsedSec: number;
  autoBreakRemainingSec: number;

  // Derived convenience getters
  hasDistanceWarning: boolean;
  hasGraceCountdown: boolean;
  hasPostureAlert: boolean;
  hasFaceLostCountdown: boolean;
  hasAnyAlert: boolean;

  // Init
  initIPC: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  // Distance warning
  warningLevel: 0,
  rawWarningLevel: 0,
  distance: 0,
  warningMessage: "",
  graceRemaining: 0,

  // Posture
  postureAlert: false,
  postureMessage: "",
  postureLevel: 0,

  // Break
  breakElapsedMin: 0,
  needsBreak: false,
  autoBreakActive: false,

  // Face lost
  faceLostElapsedSec: 0,
  autoBreakRemainingSec: 0,

  // Derived getters
  get hasDistanceWarning() {
    return get().warningLevel > 0;
  },
  get hasGraceCountdown() {
    const state = get();
    return state.rawWarningLevel > 0 && state.warningLevel === 0 && state.graceRemaining > 0;
  },
  get hasPostureAlert() {
    return get().postureAlert;
  },
  get hasFaceLostCountdown() {
    const state = get();
    return state.faceLostElapsedSec > 0 && state.autoBreakRemainingSec > 0;
  },
  get hasAnyAlert() {
    const state = get();
    return state.warningLevel > 0 || state.hasGraceCountdown || state.postureAlert;
  },

  initIPC: () => {
    // Listen for warning-level-changed IPC event
    ipcRenderer?.on(
      "warning-level-changed",
      (
        lvl: number,
        dist: number,
        msg?: string,
        grace?: number,
        raw?: number,
        posture?: boolean,
        pMsg?: string,
        pLvl?: number
      ) => {
        set({
          warningLevel: lvl,
          distance: dist || 0,
          warningMessage: msg || "",
          graceRemaining: grace || 0,
          rawWarningLevel: raw || 0,
          postureAlert: !!posture,
          postureMessage: pMsg || "",
          postureLevel: pLvl || 0,
        });
      }
    );

    // Listen for break-status IPC event
    ipcRenderer?.on(
      "break-status",
      (elapsed: number, needs: boolean, autoBrk?: boolean) => {
        set({
          breakElapsedMin: elapsed,
          needsBreak: needs,
          autoBreakActive: !!autoBrk,
        });
      }
    );

    // Listen for face-lost-timer IPC event
    ipcRenderer?.on(
      "face-lost-timer",
      (elapsedSec: number, remainingSec: number) => {
        set({
          faceLostElapsedSec: elapsedSec,
          autoBreakRemainingSec: remainingSec,
        });
      }
    );
  },
}));
