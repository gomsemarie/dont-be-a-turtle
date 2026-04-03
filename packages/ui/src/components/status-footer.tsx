import React from "react";
import { Activity, Eye, EyeOff, Timer, Zap } from "lucide-react";
import { useNotificationStore } from "../stores/use-notification-store";

interface StatusFooterProps {
  monitoring: boolean;
  distanceCm?: number;
  breakRemainingMin?: number;
  breakEnabled?: boolean;
  postureEnabled?: boolean;
  postureCalibrated?: boolean;
}

/**
 * StatusFooter — always-visible status bar at the bottom of the app.
 *
 * States:
 * - Idle (not monitoring):  "모니터링 대기 중"
 * - Monitoring (all ok):    distance + break timer + posture status
 * - Distance warning:       warning message with distance
 * - Posture warning:        posture message
 * - Grace countdown:        grace timer
 *
 * Multiple alerts show side by side, separated by a dot.
 */
export const StatusFooter: React.FC<StatusFooterProps> = ({
  monitoring,
  distanceCm,
  breakRemainingMin = 0,
  breakEnabled = false,
  postureEnabled = false,
  postureCalibrated = false,
}) => {
  const {
    warningLevel: level,
    distance,
    warningMessage: customMessage,
    graceRemaining,
    rawWarningLevel: rawLevel,
    postureAlert,
    postureMessage,
    postureLevel,
    autoBreakActive,
    faceLostElapsedSec,
    autoBreakRemainingSec,
  } = useNotificationStore();

  const showGrace = rawLevel > 0 && level === 0 && graceRemaining > 0;
  const showWarning = level > 0;
  const showPosture = postureAlert;
  const hasAlert = showWarning || showGrace || showPosture;

  const defaults: Record<number, string> = {
    1: "화면과 너무 가까워요!",
    2: "경고! 뒤로 물러나세요!",
    3: "위험!! 즉시 떨어지세요!",
  };
  const distText = customMessage || defaults[level] || "";

  // Border color by urgency
  const borderColor =
    level >= 3 ? "border-red-500" :
    level >= 2 ? "border-orange-500" :
    level >= 1 ? "border-yellow-500" :
    postureLevel >= 2 ? "border-red-500" :
    showPosture ? "border-purple-500" :
    showGrace ? "border-amber-500" :
    autoBreakActive ? "border-blue-500" :
    (faceLostElapsedSec > 0 && autoBreakRemainingSec > 0) ? "border-amber-500" :
    "border-border";

  // Background — subtle tint on alert, transparent otherwise
  const bgColor =
    level >= 3 ? "bg-red-950/80" :
    level >= 2 ? "bg-orange-950/80" :
    level >= 1 ? "bg-yellow-950/80" :
    showPosture && postureLevel >= 2 ? "bg-red-950/80" :
    showPosture ? "bg-purple-950/80" :
    showGrace ? "bg-amber-950/80" :
    autoBreakActive ? "bg-blue-950/80" :
    (faceLostElapsedSec > 0 && autoBreakRemainingSec > 0) ? "bg-amber-950/80" :
    "bg-card/80";

  // ── Alert segments ──
  const alerts: React.ReactNode[] = [];

  if (showWarning) {
    const c = level >= 3 ? "text-red-400" : level >= 2 ? "text-orange-400" : "text-yellow-400";
    const icon = level >= 3 ? "🔴" : level >= 2 ? "🚨" : "⚠️";
    alerts.push(
      <span key="dist" className={`${c} flex items-center gap-1`}>
        {icon} {distText}
        {distance > 0 && <span className="text-[10px] font-mono opacity-70">{distance.toFixed(0)}cm</span>}
      </span>
    );
  }

  if (showGrace && !showWarning) {
    alerts.push(
      <span key="grace" className="text-amber-400 flex items-center gap-1">
        <Timer className="h-3 w-3" /> 경고 유예 {graceRemaining.toFixed(1)}초
      </span>
    );
  }

  if (showPosture) {
    const c = postureLevel >= 2 ? "text-red-400" : "text-purple-400";
    alerts.push(
      <span key="posture" className={`${c} flex items-center gap-1`}>
        🧘 {postureMessage || "자세를 바르게 해주세요"}
      </span>
    );
  }

  // ── Idle / normal status segments ──
  const statuses: React.ReactNode[] = [];

  if (!monitoring) {
    statuses.push(
      <span key="idle" className="text-muted-foreground flex items-center gap-1">
        <EyeOff className="h-3 w-3" /> 모니터링 대기 중
      </span>
    );
  } else if (autoBreakActive) {
    statuses.push(
      <span key="auto-break" className="text-blue-400 flex items-center gap-1">
        😴 휴식 모드 (얼굴 미감지)
      </span>
    );
  } else if (faceLostElapsedSec > 0 && autoBreakRemainingSec > 0) {
    // Face undetected — show countdown to auto-break
    const min = Math.floor(autoBreakRemainingSec / 60);
    const sec = Math.floor(autoBreakRemainingSec % 60);
    const timeStr = min > 0 ? `${min}:${sec.toString().padStart(2, "0")}` : `${sec}초`;
    statuses.push(
      <span key="face-lost" className="text-amber-400 flex items-center gap-1">
        <EyeOff className="h-3 w-3" /> 얼굴 미감지
        <span className="font-mono text-[10px]">· 휴식모드 {timeStr} 후</span>
      </span>
    );
  } else if (!hasAlert) {
    // All good — show current stats
    if (distanceCm && distanceCm > 0) {
      statuses.push(
        <span key="dist-ok" className="text-emerald-400 flex items-center gap-1">
          <Eye className="h-3 w-3" /> {distanceCm.toFixed(0)}cm
        </span>
      );
    }
    if (postureEnabled) {
      statuses.push(
        <span key="posture-ok" className="text-emerald-400 flex items-center gap-1">
          <Activity className="h-3 w-3" /> {postureCalibrated ? "자세 양호" : "캘리브레이션 필요"}
        </span>
      );
    }
    if (breakEnabled) {
      statuses.push(
        <span key="break" className="text-muted-foreground flex items-center gap-1">
          <Timer className="h-3 w-3" /> 휴식 {breakRemainingMin}분 후
        </span>
      );
    }
    if (statuses.length === 0) {
      statuses.push(
        <span key="ok" className="text-emerald-400 flex items-center gap-1">
          <Zap className="h-3 w-3" /> 모니터링 중
        </span>
      );
    }
  }

  const items = hasAlert ? alerts : statuses;

  return (
    <div className={`border-t ${borderColor} ${bgColor} backdrop-blur-sm px-3 py-1 flex items-center gap-2 text-[11px] font-semibold shrink-0 min-h-[28px] transition-colors duration-300`}>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-white/20">·</span>}
          {item}
        </React.Fragment>
      ))}
    </div>
  );
};
