import React, { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Play,
  Square,
  Minus,
  X,
  Settings as SettingsIcon,
  Monitor,
  BarChart3,
  Coffee,
  Paintbrush,
  ShieldCheck,
  Settings2,
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
import { PixelEditor } from "./components/pixel-editor";
import { ConfigEditor } from "./components/config-editor";
import { StatusFooter } from "./components/status-footer";
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
  useUpdateCheck,
  queryKeys,
} from "./hooks/use-api";
import { useQueryClient } from "@tanstack/react-query";
import { useNotificationStore } from "./stores/use-notification-store";
import { useCelebrationStore } from "./stores/use-rank-store";

type Tab = "dashboard" | "settings" | "history" | "editor" | "config";

const ipcRenderer = (window as any).electronAPI;

// ── Posture sensitivity ↔ threshold conversion ──
// Sensitivity 1 (least) → high threshold, 10 (most) → low threshold
// Linear interpolation: threshold = high - (sens - 1) / 9 * (high - low)
const lerp = (sens: number, high: number, low: number) => high - (Math.max(1, Math.min(10, sens)) - 1) / 9 * (high - low);
const unlerp = (thr: number, high: number, low: number) => Math.round(1 + (high - thr) / (high - low) * 9);

// Forward head: sens 1→0.15 (loose), sens 10→0.02 (strict)
const fhSensToThreshold = (s: number) => Math.round(lerp(s, 0.15, 0.02) * 1000) / 1000;
const fhThresholdToSens = (t: number) => Math.max(1, Math.min(10, unlerp(t, 0.15, 0.02)));

// Slouch: sens 1→0.20, sens 10→0.03
const slSensToThreshold = (s: number) => Math.round(lerp(s, 0.20, 0.03) * 1000) / 1000;
const slThresholdToSens = (t: number) => Math.max(1, Math.min(10, unlerp(t, 0.20, 0.03)));

// Lateral tilt: sens 1→12°, sens 10→2°
const ltSensToThreshold = (s: number) => Math.round(lerp(s, 12, 2) * 10) / 10;
const ltThresholdToSens = (t: number) => Math.max(1, Math.min(10, unlerp(t, 12, 2)));

function App() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: versionData } = useVersion();
  const { data: updateData } = useUpdateCheck();
  const startMonitoring = useStartMonitoring();
  const stopMonitoring = useStopMonitoring();
  const resetBreak = useResetBreak();

  const queryClient = useQueryClient();
  const { data: rankData } = useRank();
  const { breakElapsedMin, needsBreak, autoBreakActive, faceLostElapsedSec, autoBreakRemainingSec, initIPC } = useNotificationStore();
  const triggerCelebration = useCelebrationStore((s) => s.triggerCelebration);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [postureCalibrating, setPostureCalibrating] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  // monitoring state comes from backend (single source of truth)
  const monitoring = settings?.monitoring_active ?? false;

  const version = versionData?.version ?? "";
  const hasUpdate = updateData?.has_update && !updateDismissed;

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
          <img src="/app-icon.png" className="h-10 w-10 mx-auto mb-3 animate-pulse" style={{ imageRendering: "pixelated" }} alt="" />
          <p className="text-xs text-muted-foreground">거북이 키우기 로딩 중...</p>
        </div>
      </div>
    );
  }

  const breakInterval = settings.break_reminder_interval_min;
  const breakRemainingMin = Math.max(0, Math.ceil(breakInterval - breakElapsedMin));

  return (
    <div className="flex flex-col h-screen">
      <RankCelebration />
      <Toaster />

      {/* Title Bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b bg-card/50 backdrop-blur"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="flex items-center gap-1.5">
          <img src="/app-icon.png" className="h-3.5 w-3.5" style={{ imageRendering: "pixelated" }} alt="" />
          <span className="text-xs font-semibold">거북이 키우기</span>
          {version && <span className="text-[9px] text-muted-foreground font-mono">v{version}</span>}
          {hasUpdate && (
            <button
              onClick={() => setActiveTab("settings")}
              className="text-[9px] px-1.5 py-0 rounded-full bg-orange-500/20 text-orange-500 font-medium animate-pulse hover:bg-orange-500/30 transition-colors"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              title={`새 버전 v${updateData?.latest_version} 사용 가능`}
            >
              업데이트
            </button>
          )}
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

      {/* Admin Mode Tabs — separate row below title bar */}
      {settings.admin_mode && (
        <div
          className="flex items-center gap-1 px-3 py-1 border-b bg-indigo-500/5"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <ShieldCheck className="h-3 w-3 text-indigo-400" />
          <span className="text-[10px] text-indigo-400 font-medium mr-1">관리자</span>
          <div className="flex gap-0.5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {[
              { tab: "editor" as Tab, icon: Paintbrush, label: "에디터" },
              { tab: "config" as Tab, icon: Settings2, label: "설정 편집" },
            ].map(({ tab, icon: Icon, label }) => (
              <Button
                key={tab}
                variant={activeTab === tab ? "secondary" : "ghost"}
                size="sm"
                className="h-5 px-2 text-[10px]"
                onClick={() => setActiveTab(tab)}
              >
                <Icon className="h-3 w-3 mr-0.5" />
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

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
                postureEnabled={settings.posture_detection_enabled}
                postureCalibrated={!!(settings.posture_calibration && (settings.posture_calibration as Record<string, unknown>).is_calibrated)}
              />
              <Calibration
                isCalibrated={settings.calibration.is_calibrated}
              />
            </div>
          </div>

          {activeTab === "history" && <WarningHistory />}

          {activeTab === "editor" && <PixelEditor ranks={rankData?.all_ranks} />}

          {activeTab === "config" && <ConfigEditor />}

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
                postureForwardHeadThreshold={fhThresholdToSens(settings.posture_forward_head_threshold ?? 0.06)}
                onPostureForwardHeadThresholdChange={(sens) => handleUpdateSettings({ posture_forward_head_threshold: fhSensToThreshold(sens) })}
                postureSlouchThreshold={slThresholdToSens(settings.posture_slouch_threshold ?? 0.08)}
                onPostureSlouchThresholdChange={(sens) => handleUpdateSettings({ posture_slouch_threshold: slSensToThreshold(sens) })}
                postureLateralTiltThreshold={ltThresholdToSens(settings.posture_lateral_tilt_threshold ?? 6)}
                onPostureLateralTiltThresholdChange={(sens) => handleUpdateSettings({ posture_lateral_tilt_threshold: ltSensToThreshold(sens) })}
                postureCheckInterval={settings.posture_check_interval_sec ?? 1}
                onPostureCheckIntervalChange={(v) => handleUpdateSettings({ posture_check_interval_sec: v })}
                postureCalibrated={!!(settings.posture_calibration && (settings.posture_calibration as Record<string, unknown>).is_calibrated)}
                postureCalibrating={postureCalibrating}
                onPostureCalibrate={async () => {
                  try {
                    setPostureCalibrating(true);
                    const res = await fetch("http://127.0.0.1:18765/api/posture/calibrate", { method: "POST" });
                    const data = await res.json();
                    if (!res.ok) {
                      toast.error(data.detail || "캘리브레이션 실패");
                      setPostureCalibrating(false);
                      return;
                    }
                    if (data.success === false) {
                      toast.warning(data.message || "이미 진행 중입니다");
                      setPostureCalibrating(false);
                      return;
                    }
                    toast.info("🧘 바른 자세를 유지하세요... (3초)");
                    // Poll for completion
                    const poll = setInterval(async () => {
                      try {
                        const r = await fetch("http://127.0.0.1:18765/api/posture/calibration");
                        const s = await r.json();
                        if (!s.is_calibrating) {
                          clearInterval(poll);
                          setPostureCalibrating(false);
                          if (s.is_calibrated) {
                            toast.success("캘리브레이션 완료!");
                            queryClient.invalidateQueries({ queryKey: queryKeys.settings });
                          } else {
                            toast.error("캘리브레이션 실패 — 자세가 감지되지 않았습니다");
                          }
                        }
                      } catch {
                        clearInterval(poll);
                        setPostureCalibrating(false);
                      }
                    }, 500);
                    // Safety: stop polling after 10s
                    setTimeout(() => { clearInterval(poll); setPostureCalibrating(false); }, 10000);
                  } catch (e) {
                    toast.error("백엔드 연결 실패");
                    setPostureCalibrating(false);
                  }
                }}
                autoBreakEnabled={settings.auto_break_enabled ?? true}
                autoBreakMinutes={settings.auto_break_minutes ?? 3}
                onAutoBreakEnabledChange={(v) => handleUpdateSettings({ auto_break_enabled: v })}
                onAutoBreakMinutesChange={(v) => handleUpdateSettings({ auto_break_minutes: v })}
                adminMode={settings.admin_mode ?? false}
                onAdminModeChange={(v) => {
                  handleUpdateSettings({ admin_mode: v });
                  // If editor is disabled and currently on editor tab, switch to dashboard
                  if (!v && ((activeTab as string) === "editor" || (activeTab as string) === "config")) setActiveTab("dashboard");
                }}
              />

              {/* Update check card */}
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">앱 버전</span>
                  <span className="text-xs font-mono text-muted-foreground">v{version}</span>
                </div>
                {updateData?.has_update ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-orange-500/10 border border-orange-500/20">
                      <span className="text-orange-500 text-lg">🎉</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">새 버전 v{updateData.latest_version} 사용 가능</p>
                        {updateData.published_at && (
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(updateData.published_at).toLocaleDateString("ko-KR")} 릴리스
                          </p>
                        )}
                      </div>
                    </div>
                    {updateData.release_notes && (
                      <p className="text-[11px] text-muted-foreground whitespace-pre-line line-clamp-3">
                        {updateData.release_notes}
                      </p>
                    )}
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        onClick={() => {
                          if (updateData.release_url) {
                            ipcRenderer?.send("open-external-url", updateData.release_url);
                          }
                        }}
                      >
                        다운로드 페이지 열기
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setUpdateDismissed(true)}
                      >
                        닫기
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {updateData?.error ? `업데이트 확인 실패: ${updateData.error}` : "최신 버전입니다."}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Status footer — always visible status bar */}
      <StatusFooter
        monitoring={monitoring}
        breakRemainingMin={breakRemainingMin}
        breakEnabled={settings.break_reminder_enabled}
        postureEnabled={settings.posture_detection_enabled}
        postureCalibrated={!!(settings.posture_calibration && (settings.posture_calibration as Record<string, unknown>).is_calibrated)}
      />
    </div>
  );
}

export default App;
