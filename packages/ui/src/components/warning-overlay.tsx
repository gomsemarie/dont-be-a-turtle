import React from "react";
import { useNotificationStore } from "../stores/use-notification-store";

/**
 * WarningOverlay — unified footer bar at the bottom of the app window.
 * Combines distance warning, grace countdown, and posture alert into one strip.
 */
export const WarningOverlay: React.FC = () => {
  const {
    warningLevel: level,
    distance,
    warningMessage: customMessage,
    graceRemaining,
    rawWarningLevel: rawLevel,
    postureAlert,
    postureMessage,
    postureLevel,
  } = useNotificationStore();

  const showGrace = rawLevel > 0 && level === 0 && graceRemaining > 0;
  const showWarning = level > 0;
  const showPosture = postureAlert;
  const hasAny = showWarning || showGrace || showPosture;

  if (!hasAny) return null;

  const defaults: Record<number, string> = {
    1: "화면과 너무 가까워요!",
    2: "경고! 뒤로 물러나세요!",
    3: "위험!! 즉시 떨어지세요!",
  };
  const distText = customMessage || defaults[level] || "";

  // Pick the most urgent color for the footer border-top
  const urgency =
    level >= 3 ? "border-red-500 bg-red-950/95" :
    level >= 2 ? "border-orange-500 bg-orange-950/95" :
    level >= 1 ? "border-yellow-500 bg-yellow-950/95" :
    postureLevel >= 2 ? "border-red-500 bg-red-950/95" :
    showPosture ? "border-purple-500 bg-purple-950/95" :
    "border-amber-500 bg-amber-950/95";  // grace only

  return (
    <div
      className={`border-t-2 ${urgency} backdrop-blur-sm px-3 py-1.5 flex items-center gap-3 text-xs font-bold shrink-0`}
    >
      {/* Distance warning */}
      {showWarning && (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={level >= 3 ? "text-red-400" : level >= 2 ? "text-orange-400" : "text-yellow-400"}>
            {level >= 3 ? "🔴" : level >= 2 ? "🚨" : "⚠️"} {distText}
          </span>
          {distance > 0 && (
            <span className="text-[10px] font-mono opacity-70">{distance.toFixed(0)}cm</span>
          )}
        </div>
      )}

      {/* Grace countdown */}
      {showGrace && !showWarning && (
        <div className="flex items-center gap-1.5">
          <span className="text-amber-400">⏳ 경고 유예 중</span>
          <span className="text-[10px] font-mono text-amber-400">{graceRemaining.toFixed(1)}초</span>
        </div>
      )}

      {/* Separator when both distance + posture */}
      {(showWarning || showGrace) && showPosture && (
        <div className="w-px h-3 bg-white/20 shrink-0" />
      )}

      {/* Posture alert */}
      {showPosture && (
        <span className={postureLevel >= 2 ? "text-red-400" : "text-purple-400"}>
          🧘 {postureMessage || "자세를 바르게 해주세요"}
        </span>
      )}
    </div>
  );
};
