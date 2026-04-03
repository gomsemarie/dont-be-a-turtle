import { create } from "zustand";

const ipcRenderer = (window as any).electronAPI;

export interface TurtleRank {
  level: number;
  name: string;
  step_label?: string;
  emoji: string;
  image?: string;
  description: string;
  min_score: number;
  color: string;
  bg_gradient: string;
}

export interface PeriodRank {
  current: TurtleRank;
  next: TurtleRank | null;
  score: number;
  progress_to_next: number;
}

export interface RankInfo {
  daily: PeriodRank;
  weekly: PeriodRank;
  monthly: PeriodRank;
  rank_change: "up" | "down" | null;
  all_ranks: TurtleRank[];
}

/** Send celebration data to Electron main process for full-screen overlay */
function sendCelebrationIPC(direction: "up" | "down", rank: TurtleRank): void {
  ipcRenderer?.send("show-celebration", {
    direction,
    emoji: rank.emoji,
    image: rank.image,
    name: rank.name,
    level: rank.level,
    description: rank.description,
    color: rank.color,
  });
}

interface CelebrationState {
  celebration: { direction: "up" | "down"; rank: TurtleRank } | null;
  /** Track prev levels per period to detect rank changes */
  _prevLevels: { daily: number; weekly: number; monthly: number };
  _initialized: boolean;
  /** Call this with new rank data to detect celebration triggers */
  checkCelebration: (rank: RankInfo) => void;
  /** Trigger celebration manually (e.g. click on rank card) */
  triggerCelebration: (direction: "up" | "down", rank: TurtleRank) => void;
  clearCelebration: () => void;
}

export const useCelebrationStore = create<CelebrationState>((set, get) => ({
  celebration: null,
  _prevLevels: { daily: -999, weekly: -999, monthly: -999 },
  _initialized: false,

  checkCelebration: (rankData) => {
    const prev = get()._prevLevels;
    const initialized = get()._initialized;
    const curr = {
      daily: rankData.daily?.current?.level ?? 0,
      weekly: rankData.weekly?.current?.level ?? 0,
      monthly: rankData.monthly?.current?.level ?? 0,
    };

    // First call: just store levels, no celebration
    if (!initialized) {
      set({ _prevLevels: curr, _initialized: true });
      return;
    }

    // Check each period for rank change, prioritize monthly > weekly > daily
    // "up" = moving towards positive (good), "down" = moving towards negative (bad)
    let celebration = get().celebration;
    for (const period of ["monthly", "weekly", "daily"] as const) {
      if (curr[period] !== prev[period]) {
        const dir = curr[period] > prev[period] ? "up" as const : "down" as const;
        const rank = rankData[period].current;
        celebration = { direction: dir, rank };
        sendCelebrationIPC(dir, rank);
        break; // show one celebration at a time
      }
    }
    set({ _prevLevels: curr, celebration });
  },

  triggerCelebration: (direction, rank) => {
    // Always create a new object so zustand detects the change on repeated clicks
    set({ celebration: { direction, rank: { ...rank } } });
    sendCelebrationIPC(direction, rank);
  },

  clearCelebration: () => set({ celebration: null }),
}));
