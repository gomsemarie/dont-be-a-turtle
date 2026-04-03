import { useNotificationStore } from "./use-notification-store";

/**
 * Deprecated: useMonitorStore is now a thin wrapper around useNotificationStore.
 * All monitor-related state has been moved to the unified notification store.
 *
 * This export is kept for backwards compatibility.
 */
export const useMonitorStore = () => {
  const store = useNotificationStore();
  return {
    breakElapsedMin: store.breakElapsedMin,
    needsBreak: store.needsBreak,
    autoBreakActive: store.autoBreakActive,
    faceLostElapsedSec: store.faceLostElapsedSec,
    autoBreakRemainingSec: store.autoBreakRemainingSec,
    initIPC: store.initIPC,
  };
};
