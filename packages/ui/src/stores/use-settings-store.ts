import { create } from "zustand";
import { api } from "@/lib/utils";

export interface WarningLevel {
  enabled: boolean;
  distance_cm: number;
  label: string;
}

export interface Settings {
  selected_camera_index: number;
  warning_levels: WarningLevel[];
  calibration: {
    reference_distance_cm: number;
    reference_ied_pixels: number;
    is_calibrated: boolean;
  };
  monitoring_active: boolean;
  frame_rate: number;
  break_reminder_enabled: boolean;
  break_reminder_interval_min: number;
  break_chaos_level: number;
  posture_detection_enabled: boolean;
  head_tilt_threshold_deg: number;
  emoji_mask_enabled: boolean;
  emoji_mask_type: string;
  face_yaw_threshold_deg: number;
  warning_grace_sec: number;
  notification_enabled: boolean;
  warning_messages: string[];
  history_retention_days: number;
  history_max_events: number;
  score_multiplier: number;
}

interface SettingsState {
  settings: Settings | null;
  loading: boolean;
  fetch: () => Promise<void>;
  update: (partial: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: true,

  fetch: async () => {
    try {
      const data = await api<Settings>("/api/settings");
      set({ settings: data, loading: false });
    } catch (err) {
      console.error("Failed to fetch settings:", err);
      set({ loading: false });
    }
  },

  update: async (partial) => {
    try {
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify(partial),
      });
      // Optimistic merge then refetch
      const prev = get().settings;
      if (prev) set({ settings: { ...prev, ...partial } as Settings });
      await get().fetch();
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  },
}));
