import React, { useEffect, useState } from "react";

const ipcRenderer = (window as any).electronAPI;

/**
 * In-app warning overlay — stacks multiple banners vertically below the title bar.
 * Each banner type (grace, distance, posture) can show simultaneously without overlap.
 */
export const WarningOverlay: React.FC = () => {
  const [level, setLevel] = useState(0);
  const [distance, setDistance] = useState(0);
  const [customMessage, setCustomMessage] = useState("");
  const [graceRemaining, setGraceRemaining] = useState(0);
  const [rawLevel, setRawLevel] = useState(0);
  const [postureAlert, setPostureAlert] = useState(false);

  useEffect(() => {
    ipcRenderer?.on(
      "warning-level-changed",
      (lvl: number, dist: number, msg?: string, grace?: number, raw?: number, posture?: boolean) => {
        setLevel(lvl);
        setDistance(dist || 0);
        setCustomMessage(msg || "");
        setGraceRemaining(grace || 0);
        setRawLevel(raw || 0);
        setPostureAlert(!!posture);
      }
    );
  }, []);

  const showGrace = rawLevel > 0 && level === 0 && graceRemaining > 0;
  const showWarning = level > 0;
  const showPosture = postureAlert;

  if (!showWarning && !showGrace && !showPosture) return null;

  const defaults: Record<number, string> = {
    1: "화면과 너무 가까워요!",
    2: "경고! 지금 당장 뒤로 물러나세요!",
    3: "위험!! 즉시 화면에서 떨어지세요!",
  };

  const displayText = customMessage || defaults[level] || "경고";

  const warningConfig = {
    1: { border: "border-yellow-500/70", bg: "bg-yellow-950/90", color: "text-yellow-300", barColor: "bg-yellow-500", icon: "⚠️" },
    2: { border: "border-orange-500/80", bg: "bg-orange-950/90", color: "text-orange-300", barColor: "bg-orange-500", icon: "🚨" },
    3: { border: "border-red-500/90", bg: "bg-red-950/90", color: "text-red-300", barColor: "bg-red-500", icon: "🔴" },
  }[level];

  return (
    <>
      {/* Stacked banners container — below title bar */}
      <div className="fixed left-2 right-2 z-40 flex flex-col gap-1 pointer-events-none" style={{ top: 38 }}>
        {/* Grace countdown */}
        {showGrace && (
          <div className="rounded-md border border-amber-500/40 bg-amber-950/80 backdrop-blur-sm px-3 py-1 flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400">⏳ 경고 유예 중...</span>
            <span className="text-[11px] font-mono text-amber-400 font-bold">{graceRemaining.toFixed(1)}초</span>
          </div>
        )}

        {/* Distance warning */}
        {showWarning && warningConfig && (
          <div
            className={`rounded-md border-2 ${warningConfig.border} ${warningConfig.bg} backdrop-blur-sm px-3 py-1.5 flex items-center justify-between`}
            style={{ animation: "pulse 1.2s ease-in-out infinite" }}
          >
            <span className={`text-sm font-extrabold ${warningConfig.color}`}>
              {warningConfig.icon} {displayText}
            </span>
            {distance > 0 && (
              <span className={`text-[11px] font-mono ${warningConfig.color}`}>{distance.toFixed(0)}cm</span>
            )}
          </div>
        )}

        {/* Posture alert */}
        {showPosture && (
          <div className="rounded-md border border-purple-500/50 bg-purple-950/80 backdrop-blur-sm px-3 py-1 flex items-center">
            <span className="text-xs font-bold text-purple-400">🧘 자세를 바르게 해주세요</span>
          </div>
        )}
      </div>

      {/* Bottom bar (distance warning only) */}
      {showWarning && warningConfig && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-40 pointer-events-none ${warningConfig.barColor} animate-pulse`}
          style={{ height: level >= 3 ? "6px" : level >= 2 ? "5px" : "4px" }}
        />
      )}
    </>
  );
};
