import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCelebrationStore } from "@/stores/use-rank-store";
import { RankImage } from "./rank-image";
import type { TurtleRank } from "@/stores/use-rank-store";

/**
 * Listens for rank changes and shows a sonner toast notification.
 * No full-screen overlay — just a compact card at the bottom.
 */
export const RankCelebration: React.FC = () => {
  const { celebration, clearCelebration } = useCelebrationStore();
  const lastShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!celebration) return;

    // Deduplicate: don't show same celebration twice
    const key = `${celebration.direction}-${celebration.rank.level}`;
    if (lastShownRef.current === key) return;
    lastShownRef.current = key;

    const { direction, rank } = celebration;
    const isUp = direction === "up";

    toast.custom(
      (id: string | number) => (
        <RankToastCard
          rank={rank}
          isUp={isUp}
          onDismiss={() => toast.dismiss(id)}
        />
      ),
      {
        duration: 5000,
        position: "bottom-center",
      }
    );

    clearCelebration();
  }, [celebration, clearCelebration]);

  return null;
};

/** The actual toast card content */
function RankToastCard({
  rank,
  isUp,
  onDismiss,
}: {
  rank: TurtleRank;
  isUp: boolean;
  onDismiss: () => void;
}) {
  return (
    <button
      onClick={onDismiss}
      className="w-[340px] rounded-xl border-2 bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer"
      style={{ borderColor: rank.color + "60" }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Rank image */}
        <div
          className="shrink-0"
          style={{
            animation: "toastBounce 0.5s ease-out",
          }}
        >
          <RankImage rank={rank} size="56px" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-bold" style={{ color: rank.color }}>
              {isUp ? "⬆️ 칭호 승급!" : "⬇️ 칭호 변경"}
            </span>
            <span
              className="text-[9px] font-mono px-1.5 py-px rounded-full"
              style={{
                backgroundColor: rank.color + "20",
                color: rank.color,
              }}
            >
              Lv.{rank.level}
            </span>
          </div>
          <p className="text-sm font-black truncate" style={{ color: rank.color }}>
            {rank.name}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {rank.description}
          </p>
        </div>

        {/* Emoji accent */}
        <span className="text-2xl shrink-0 opacity-60">{rank.emoji}</span>
      </div>

      {/* Colored bottom accent bar */}
      <div className="h-1" style={{ backgroundColor: rank.color + "40" }} />

      <style>{`
        @keyframes toastBounce {
          0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
          60% { transform: scale(1.15) rotate(3deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
      `}</style>
    </button>
  );
}
