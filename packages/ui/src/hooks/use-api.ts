/**
 * TanStack Query hooks for all 거북이 키우기 API calls.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/utils";
import type { Settings } from "@/stores/use-settings-store";
import type { RankInfo } from "@/stores/use-rank-store";

// ─── Query Keys ──────────────────────────────────────────────
export const queryKeys = {
  settings: ["settings"] as const,
  cameras: ["cameras"] as const,
  rank: ["rank"] as const,
  version: ["version"] as const,
  history: (days: number) => ["history", days] as const,
  historyStats: (days: number) => ["historyStats", days] as const,
  calibrateStatus: ["calibrateStatus"] as const,
};

// ─── Settings ────────────────────────────────────────────────

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api<Settings>("/api/settings"),
    refetchInterval: 2000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (partial: Partial<Settings>) =>
      api("/api/settings", {
        method: "PUT",
        body: JSON.stringify(partial),
      }),
    onMutate: async (partial) => {
      await qc.cancelQueries({ queryKey: queryKeys.settings });
      const prev = qc.getQueryData<Settings>(queryKeys.settings);
      if (prev) {
        qc.setQueryData<Settings>(queryKeys.settings, { ...prev, ...partial });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.settings, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

// ─── Cameras ─────────────────────────────────────────────────

interface CameraInfo {
  index: number;
  name: string;
  resolution: string;
}

interface CamerasResponse {
  cameras: CameraInfo[];
  selected: number;
}

export function useCameras() {
  return useQuery({
    queryKey: queryKeys.cameras,
    queryFn: () => api<CamerasResponse>("/api/cameras"),
    staleTime: 5 * 60 * 1000, // 5 minutes — avoid re-enumerating cameras on every tab switch
    gcTime: 10 * 60 * 1000,
  });
}

/** Force-refresh camera list (bypasses both client and server caches) */
export function useRefreshCameras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<CamerasResponse>("/api/cameras?refresh=true"),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.cameras, data);
    },
  });
}

export function useSelectCamera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (index: number) =>
      api("/api/cameras/select", {
        method: "POST",
        body: JSON.stringify({ index }),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.cameras });
      qc.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

// ─── Rank & Version ──────────────────────────────────────────

export function useRank() {
  return useQuery({
    queryKey: queryKeys.rank,
    queryFn: () => api<RankInfo>("/api/rank"),
    staleTime: 30000,
    refetchInterval: 30000,
  });
}

export function useVersion() {
  return useQuery({
    queryKey: queryKeys.version,
    queryFn: () => api<{ version: string }>("/api/version"),
    staleTime: 60000,
  });
}

// ─── Monitoring ──────────────────────────────────────────────

export function useStartMonitoring() {
  return useMutation({
    mutationFn: () => api("/api/monitor/start", { method: "POST" }),
  });
}

export function useStopMonitoring() {
  return useMutation({
    mutationFn: () => api("/api/monitor/stop", { method: "POST" }),
  });
}

// ─── Break ───────────────────────────────────────────────────

export function useResetBreak() {
  return useMutation({
    mutationFn: () => api("/api/break/reset", { method: "POST" }),
  });
}

export function useTriggerBreak() {
  return useMutation({
    mutationFn: () => api("/api/break/trigger", { method: "POST" }),
  });
}

// ─── Calibration ─────────────────────────────────────────────

interface CalibrateStartParams {
  reference_distance_cm: number;
  duration: number;
}

interface CalibrateStatus {
  is_running: boolean;
  progress: number;
  is_complete: boolean;
}

export function useStartCalibration() {
  return useMutation({
    mutationFn: (params: CalibrateStartParams) =>
      api("/api/calibrate/start", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  });
}

export function useCalibrateStatus(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.calibrateStatus,
    queryFn: () => api<CalibrateStatus>("/api/calibrate/status"),
    enabled,
    refetchInterval: enabled ? 200 : false,
  });
}

// ─── History ─────────────────────────────────────────────────

interface StatsResponse {
  total_warnings: Record<string, number>;
  avg_distance: number;
  total_warning_time_sec: number;
  hourly_distribution: Record<string, number>;
  daily_counts: Array<{ date: string; count: number }>;
}

interface WarningEvent {
  timestamp: number;
  distance_cm: number;
  warning_level: number;
  duration_sec: number;
}

interface HistoryResponse {
  events: WarningEvent[];
}

export type { StatsResponse, WarningEvent, HistoryResponse, CameraInfo, CamerasResponse, CalibrateStatus };

export function useHistoryStats(days: number) {
  return useQuery({
    queryKey: queryKeys.historyStats(days),
    queryFn: () => api<StatsResponse>(`/api/history/stats?days=${days}`),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });
}

export function useHistory(days: number) {
  return useQuery({
    queryKey: queryKeys.history(days),
    queryFn: () => api<HistoryResponse>(`/api/history?days=${days}`),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });
}

// ─── History Management ──────────────────────────────────────

export function useResetHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/api/history/reset", { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["historyStats"] });
      qc.invalidateQueries({ queryKey: queryKeys.rank });
    },
  });
}

export function useResetSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/api/settings/reset", { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

export function useInjectTestData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scenario: string) =>
      api("/api/history/test-data", {
        method: "POST",
        body: JSON.stringify({ scenario }),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["historyStats"] });
      qc.invalidateQueries({ queryKey: queryKeys.rank });
    },
  });
}
