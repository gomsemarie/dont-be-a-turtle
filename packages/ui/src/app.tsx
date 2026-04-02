import React, { useState, useCallback, useEffect } from "react";
import {
  Turtle,
  Play,
  Square,
  Minus,
  X,
  Settings as SettingsIcon,
  Monitor,
  BarChart3,
  Coffee,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { ScrollArea } from "./components/ui/scroll-area";
import { CameraSelect } from "./components/camera-select";
import { CameraPreview } from "./components/camera-preview";
import { Calibration } from "./components/calibration";
import { WarningSettings } from "./components/warning-settings";
import { ExtraSettings } from "./components/extra-settings";
import WarningHistory from "./components/warning-history";
import { WarningOverlay } from "./components/warning-overlay";
import { RankCelebration } from "./components/rank-celebration";
import { Toaster } from "./components/ui/sonner";
import {
  useSettings,
  useUpdateSettings,
  useVersion,
  useStartMonitoring,
  useStopMonitoring,
  useResetBreak,
  useRank,
  queryKeys,
} from "./hooks/use-api";
import { useQueryClient } from "@tanstack/react-query";
import { useMonitorStore } from "./stores/use-monitor-store";
import { useCelebrationStore } from "./stores/use-rank-store";

type Tab = "dashboard" | "settings" | "history";

const ipcRenderer = (window as any).electronAPI;

function App() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: versionData } = useVersion();
  const startMonitoring = useStartMonitoring();
  const stopMonitoring = useStopMonitoring();
  const resetBreak = useResetBreak();

  const queryClient = useQueryClient();
  const { data: rankData } = useRank();
  const { breakElapsedMin, needsBreak, initIPC } = useMonitorStore();
  const triggerCelebration = useCelebrationStore((s) => s.triggerCelebration);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  // monitoring state comes from backend (single source of truth)
  const monitoring = settings?.monitoring_active ?? false;

  const version = versionData?.version ?? "";

  useEffect(() => {
    initIPC();
    // Listen for rank changes from backend via SSE → main process → IPC
    ipcRenderer?.on("rank-changed", (data: any) => {
      if (data?.direction && data?.name) {
        triggerCelebration(data.direction, {
          level: data.level,
          name: data.name,
          emoji: data.emoji,
          image: data.image,
          description: data.description,
          min_score: 0,
          color: data.color,
          bg_gradient: "",
        });
        // Also refetch rank data to update UI
        queryClient.invalidateQueries({ queryKey: queryKeys.rank });
      }
    });
  }, [initIPC, triggerCelebration, queryClient]);

  const previewActive = settings ? settings.selected_camera_index >= 0 : false;

  const [calibrationWarning, setCalibrationWarning] = useState(false);

  const handleStartMonitoring = useCallback(async () => {
    if (!settings?.calibration?.is_calibrated) {
      setCalibrationWarning(true);
      setTimeout(() => setCalibrationWarning(false), 3000);
      return;
    }
    try {
      await startMonitoring.mutateAsync();
      ipcRenderer?.send("monitoring-started");
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    } catch (err) {
      console.error("Failed to start monitoring:", err);
    }
  }, [startMonitoring, settings, queryClient]);

  const handleStopMonitoring = useCallback(async () => {
    try {
      await stopMonitoring.mutateAsync();
      ipcRenderer?.send("monitoring-stopped");
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    } catch (err) {
      console.error("Failed to stop monitoring:", err);
    }
  }, [stopMonitoring, queryClient]);

  const handleResetBreak = useCallback(async () => {
    try {
      await resetBreak.mutateAsync();
    } catch {}
  }, [resetBreak]);

  const handleTriggerBreak = useCallback(() => {
    console.log("[App] Trigger break, ipcRenderer:", !!ipcRenderer);
    ipcRenderer?.send("trigger-break");
  }, []);

  const handleUpdateSettings = useCallback(
    (partial: Record<string, any>) => {
      updateSettings.mutate(partial);
    },
    [updateSettings]
  );

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Turtle className="h-10 w-10 mx-auto mb-3 text-primary animate-pulse" />
          <p className="text-xs text-muted-foreground">거북이 키우기 로딩 중...</p>
        </div>
      </div>
    );
  }

  const breakInterval = settings.break_reminder_interval_min;
  const breakRemainingMin = Math.max(0, Math.ceil(breakInterval - breakElapsedMin));

  return (
    <div className="flex flex-col h-screen">
      <WarningOverlay />
      <RankCelebration />
      <Toaster />

      {/* Title Bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b bg-card/50 backdrop-blur"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="flex items-center gap-1.5">
          <Turtle className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold">거북이 키우기</span>
          {version && <span className="text-[9px] text-muted-foreground font-mono">v{version}</span>}
          {monitoring && (
            <Badge variant="safe" className="text-[10px] px-1.5 py-0 whitespace-nowrap">
              모니터링 중
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          {[
            { tab: "dashboard" as Tab, icon: Monitor, label: "홈" },
            { tab: "history" as Tab, icon: BarChart3, label: "통계" },
            { tab: "settings" as Tab, icon: SettingsIcon, label: "설정" },
          ].map(({ tab, icon: Icon, label }) => (
            <Button
              key={tab}
              variant={activeTab === tab ? "secondary" : "ghost"}
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setActiveTab(tab)}
            >
              <Icon className="h-3 w-3 mr-0.5" />
              {label}
            </Button>
          ))}
          <div className="w-px h-3 bg-border mx-0.5" />
          <Button variant="ghost" size="icon" onClick={() => ipcRenderer?.send("minimize-to-tray")} className="h-6 w-6" title="트레이로 숨기기">
            <Minus className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { ipcRenderer?.send("close-app"); }} className="h-6 w-6 hover:bg-destructive/20 hover:text-destructive" title="종료">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Monitoring Controls — fixed above scroll, visible on dashboard tab */}
      {activeTab === "dashboard" && (
        <div className="px-3 pt-2 pb-1 border-b bg-card/50 space-y-1.5">
          {/* Camera select + monitoring button row */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <CameraSelect selectedIndex={settings.selected_camera_index} disabled={monitoring} />
            </div>
            {monitoring ? (
              <Button variant="destructive" size="sm" className="h-8 px-3 text-xs shrink-0" onClick={handleStopMonitoring}>
                <Square className="h-3 w-3 mr-1" />
                중지
              </Button>
            ) : (
              <Button size="sm" className="h-8 px-3 text-xs shrink-0" onClick={handleStartMonitoring}>
                <Play className="h-3 w-3 mr-1" />
                시작
              </Button>
            )}
          </div>
          {/* Break reminder (compact) */}
          {monitoring && settings.break_reminder_enabled && (
            <div className="flex items-center justify-between px-2 py-1 rounded-md border bg-card/80">
              <div className="flex items-center gap-1.5">
                <Coffee className={`h-3 w-3 ${needsBreak ? "text-orange-400" : "text-blue-400"}`} />
                <span className="text-[11px] font-mono">
                  {needsBreak
                    ? "휴식이 필요합니다!"
                    : `휴식까지 ${breakRemainingMin}분`}
                </span>
              </div>
              {needsBreak && (
                <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5" onClick={handleResetBreak}>
                  리셋
                </Button>
              )}
            </div>
          )}
          {calibrationWarning && (
            <p className="text-[10px] text-center text-amber-400 pb-0.5 animate-pulse">
              ⚠️ 캘리브레이션을 먼저 완료해주세요!
            </p>
          )}
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* CameraPreview — always mounted via CSS hidden, never unmounted so SSE stays alive */}
          <div style={{ display: activeTab === "dashboard" ? "block" : "none" }}>
            <div className="space-y-3">
              <CameraPreview
                active={previewActive}
                emojiEnabled={settings.emoji_mask_enabled}
                emojiType={settings.emoji_mask_type ?? "emoji_smile"}
              />
              <Calibration
                isCalibrated={settings.calibration.is_calibrated}
              />
            </div>
          </div>

          {activeTab === "history" && <WarningHistory />}

          {activeTab === "settings" && (
            <>
              <WarningSettings
                levels={settings.warning_levels}
                onChange={(levels) => handleUpdateSettings({ warning_levels: levels })}
                warningMessages={settings.warning_messages}
                onWarningMessagesChange={(messages) => handleUpdateSettings({ warning_messages: messages })}
              />

              <ExtraSettings
                breakEnabled={settings.break_reminder_enabled}
                breakInterval={settings.break_reminder_interval_min}
                breakChaosLevel={settings.break_chaos_level ?? 3}
                postureEnabled={settings.posture_detection_enabled}
                tiltThreshold={settings.head_tilt_threshold_deg}
                frameRate={settings.frame_rate}
                onBreakEnabledChange={(v) => handleUpdateSettings({ break_reminder_enabled: v })}
                onBreakIntervalChange={(v) => handleUpdateSettings({ break_reminder_interval_min: v })}
                onBreakChaosLevelChange={(v) => handleUpdateSettings({ break_chaos_level: v })}
                onTriggerBreak={handleTriggerBreak}
                onPostureEnabledChange={(v) => handleUpdateSettings({ posture_detection_enabled: v })}
                onTiltThresholdChange={(v) => handleUpdateSettings({ head_tilt_threshold_deg: v })}
                onFrameRateChange={(v) => handleUpdateSettings({ frame_rate: v })}
                emojiMaskEnabled={settings.emoji_mask_enabled}
                onEmojiMaskChange={(v) => handleUpdateSettings({ emoji_mask_enabled: v })}
                emojiMaskType={settings.emoji_mask_type ?? "emoji_smile"}
                onEmojiMaskTypeChange={(v) => handleUpdateSettings({ emoji_mask_type: v })}
                faceYawThreshold={settings.face_yaw_threshold_deg ?? 45}
                onFaceYawThresholdChange={(v) => handleUpdateSettings({ face_yaw_threshold_deg: v })}
                warningGraceSec={settings.warning_grace_sec ?? 3}
                onWarningGraceSecChange={(v) => handleUpdateSettings({ warning_grace_sec: v })}
                notificationEnabled={settings.notification_enabled ?? true}
                onNotificationEnabledChange={(v) => handleUpdateSettings({ notification_enabled: v })}
                historyRetentionDays={settings.history_retention_days ?? 30}
                onHistoryRetentionDaysChange={(v) => handleUpdateSettings({ history_retention_days: v })}
                historyMaxEvents={settings.history_max_events ?? 5000}
                onHistoryMaxEventsChange={(v) => handleUpdateSettings({ history_max_events: v })}
                scoreMultiplier={settings.score_multiplier ?? 1.0}
                onScoreMultiplierChange={(v) => handleUpdateSettings({ score_multiplier: v })}
              />
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default App;
