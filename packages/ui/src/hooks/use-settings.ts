import { useState, useEffect, useCallback } from "react";
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

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api<Settings>("/api/settings");
      setSettings(data);
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (partial: Partial<Settings>) => {
    try {
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify(partial),
      });
      await fetchSettings();
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  }, [fetchSettings]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return { settings, loading, updateSettings, refetch: fetchSettings };
}
