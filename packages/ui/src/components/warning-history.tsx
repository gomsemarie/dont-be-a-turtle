import React, { useState, useMemo, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Ruler,
  Flame,
  Eye,
  ShieldAlert,
  Zap,
  RefreshCw,
  ChevronDown,
  Info,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRank, useHistoryStats, useHistory, queryKeys } from "@/hooks/use-api";
import type { PeriodRank, TurtleRank } from "@/stores/use-rank-store";
import { useCelebrationStore } from "@/stores/use-rank-store";
import { RankImage } from "./rank-image";

const LEVEL_LABELS: Record<number, string> = { 1: "주의", 2: "경고", 3: "위험" };
const LEVEL_VARIANTS: Record<number, "caution" | "warning" | "danger"> = {
  1: "caution",
  2: "warning",
  3: "danger",
};
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

type Period = "daily" | "weekly" | "monthly";

const PERIOD_CONFIG: Record<Period, { label: string; days: number; statsLabel: string }> = {
  daily:   { label: "오늘",    days: 1,  statsLabel: "오늘" },
  weekly:  { label: "이번 주", days: 7,  statsLabel: "이번 주" },
  monthly: { label: "이번 달", days: 30, statsLabel: "이번 달" },
};

/** Step label color based on rank level */
const stepLabelStyle = (level: number): { bg: string; text: string } => {
  if (level <= -4) return { bg: "bg-red-900/30", text: "text-red-400" };
  if (level <= -2) return { bg: "bg-red-500/20", text: "text-red-400" };
  if (level === -1) return { bg: "bg-orange-500/20", text: "text-orange-400" };
  if (level === 0) return { bg: "bg-zinc-500/20", text: "text-zinc-400" };
  if (level === 1) return { bg: "bg-blue-500/20", text: "text-blue-400" };
  if (level <= 3) return { bg: "bg-blue-500/25", text: "text-blue-400" };
  return { bg: "bg-blue-600/30", text: "text-blue-300" };
};

/** Selectable rank badge */
const RankBadge: React.FC<{
  label: string;
  period: PeriodRank;
  selected: boolean;
  onClick: () => void;
}> = ({ label, period, selected, onClick }) => {
  const r = period.current;
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border-2 p-2 text-center transition-colors ${
        selected
          ? ""
          : "opacity-60 hover:opacity-80"
      }`}
      style={{
        borderColor: selected ? r.color + "80" : "transparent",
      }}
    >
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <div className="flex justify-center mb-1">
        <RankImage rank={r} size="44px" />
      </div>
      <p className="text-[11px] font-bold truncate" style={{ color: r.color }}>{r.name}</p>
      <p className="text-[9px] font-mono text-muted-foreground">+{Math.abs(period.score).toFixed(0)}pts</p>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1 mx-1">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(period.progress_to_next, 100)}%`, backgroundColor: r.color }}
        />
      </div>
    </button>
  );
};

const WarningHistory: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("daily");
  const periodCfg = PERIOD_CONFIG[selectedPeriod];

  const { data: stats, isLoading: statsLoading } = useHistoryStats(periodCfg.days);
  const { data: historyData, isLoading: historyLoading } = useHistory(periodCfg.days);
  const { data: rank } = useRank();

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.rank }),
      queryClient.invalidateQueries({ queryKey: queryKeys.historyStats(periodCfg.days) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.history(periodCfg.days) }),
    ]);
    setTimeout(() => setRefreshing(false), 400);
  }, [queryClient, periodCfg.days]);

  const triggerCelebration = useCelebrationStore((s) => s.triggerCelebration);

  const handleRankClick = () => {
    const active = rank?.[selectedPeriod];
    if (!active) return;
    triggerCelebration("up", active.current);
  };

  const events = historyData?.events ?? [];
  // Only show full skeleton on very first load (no data yet)
  const initialLoading = (statsLoading && !stats) || (historyLoading && !historyData);

  const totalCount = stats
    ? Object.values(stats.total_warnings).reduce((a, b) => a + b, 0)
    : 0;

  const todayStr = new Date().toISOString().split("T")[0];

  // Previous period comparison for trend
  const { prevPeriodCount, prevPeriodLabel } = useMemo(() => {
    const daily = stats?.daily_counts ?? [];
    if (selectedPeriod === "daily") {
      const yesterdayStr = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; })();
      const cnt = daily.find((d) => d.date === yesterdayStr)?.count ?? 0;
      return { prevPeriodCount: cnt, prevPeriodLabel: "어제" };
    } else if (selectedPeriod === "weekly") {
      // We only have current week data from the API (7 days), so show last day of range as comparison
      // Use totalCount from a hypothetical previous week — approximate from daily_counts if available
      const cnt = daily.slice(0, Math.floor(daily.length / 2)).reduce((a, d) => a + d.count, 0);
      return { prevPeriodCount: cnt, prevPeriodLabel: "지난주 같은 기간" };
    } else {
      const cnt = daily.slice(0, Math.floor(daily.length / 2)).reduce((a, d) => a + d.count, 0);
      return { prevPeriodCount: cnt, prevPeriodLabel: "지난달 같은 기간" };
    }
  }, [stats, selectedPeriod]);

  const trendDiff = totalCount - prevPeriodCount;

  const formatTime = (sec: number) => {
    if (sec < 60) return `${Math.round(sec)}초`;
    const m = Math.floor(sec / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}시간 ${m % 60}분`;
    return `${m}분`;
  };

  const timeAgo = (ts: number) => {
    const diff = (Date.now() / 1000 - ts) | 0;
    if (diff < 60) return "방금";
    if (diff < 3600) return `${(diff / 60) | 0}분 전`;
    if (diff < 86400) return `${(diff / 3600) | 0}시간 전`;
    return `${(diff / 86400) | 0}일 전`;
  };

  const streak = useMemo(() => {
    const daily = stats?.daily_counts ?? [];
    let count = 0;
    for (let i = daily.length - 2; i >= 0; i--) {
      if (daily[i].count === 0) count++;
      else break;
    }
    return count;
  }, [stats]);

  const dailyCounts = stats?.daily_counts ?? [];
  const maxDaily = Math.max(...dailyCounts.map((d) => d.count), 1);
  const hourly = stats?.hourly_distribution ?? {};
  const maxHourly = Math.max(...Object.values(hourly), 1);

  const peakHour = useMemo(() => {
    let max = 0;
    let hour = -1;
    for (const [h, c] of Object.entries(hourly)) {
      if (c > max) { max = c; hour = Number(h); }
    }
    return hour >= 0 ? `${String(hour).padStart(2, "0")}시` : "–";
  }, [hourly]);

  const heatColor = (count: number) => {
    if (count === 0) return "bg-zinc-800/50";
    const r = count / maxHourly;
    if (r < 0.33) return "bg-yellow-500/50";
    if (r < 0.66) return "bg-orange-500/60";
    return "bg-red-500/70";
  };

  const barColor = (count: number) => {
    const r = count / maxDaily;
    if (r < 0.25) return "bg-yellow-400";
    if (r < 0.5) return "bg-yellow-500";
    if (r < 0.75) return "bg-orange-500";
    return "bg-red-500";
  };

  if (initialLoading) {
    return (
      <div className="space-y-3">
        {/* Skeleton: rank hero */}
        <div className="h-28 rounded-xl bg-card animate-pulse" />
        {/* Skeleton: period badges */}
        <div className="flex gap-2">
          {[1,2,3].map(i => <div key={i} className="flex-1 h-24 rounded-lg bg-card animate-pulse" />)}
        </div>
        {/* Skeleton: stats row */}
        <div className="grid grid-cols-4 gap-2">
          {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-lg bg-card animate-pulse" />)}
        </div>
        {/* Skeleton: chart */}
        <div className="h-36 rounded-xl bg-card animate-pulse" />
      </div>
    );
  }

  const monthly = rank?.monthly;
  const activePeriodRank = rank?.[selectedPeriod];

  return (
    <div className="space-y-3">
      {/* ── Turtle Rank Hero — selected period ── */}
      {activePeriodRank && (
        <Card
          className="overflow-hidden border-2 transition-colors cursor-pointer hover:brightness-110 active:scale-[0.98]"
          style={{ borderColor: activePeriodRank.current.color + "60" }}
          onClick={handleRankClick}
        >
          <div className={`bg-gradient-to-br ${activePeriodRank.current.bg_gradient}`}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-3">
                <RankImage rank={activePeriodRank.current} size="80px" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black" style={{ color: activePeriodRank.current.color }}>
                      {activePeriodRank.current.name}
                    </span>
                    {(() => {
                      const sl = stepLabelStyle(activePeriodRank.current.level);
                      return (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sl.bg} ${sl.text}`}>
                          {activePeriodRank.current.step_label ?? activePeriodRank.current.name}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{activePeriodRank.current.description}</p>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="font-mono font-bold" style={{ color: activePeriodRank.current.color }}>
                        +{Math.abs(activePeriodRank.score).toFixed(0)} pts ({periodCfg.statsLabel})
                      </span>
                      {activePeriodRank.next && (
                        <span className="text-muted-foreground">
                          다음: {activePeriodRank.next.name} +{Math.abs(activePeriodRank.next.min_score)}pts
                        </span>
                      )}
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(activePeriodRank.progress_to_next, 100)}%`, backgroundColor: activePeriodRank.current.color }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </div>
        </Card>
      )}

      {/* ── Period selector: Daily / Weekly / Monthly rank badges ── */}
      {rank && (
        <div className="flex gap-2">
          {(["daily", "weekly", "monthly"] as const).map((p) => (
            <RankBadge
              key={p}
              label={PERIOD_CONFIG[p].label}
              period={rank[p]}
              selected={selectedPeriod === p}
              onClick={() => setSelectedPeriod(p)}
            />
          ))}
        </div>
      )}

      {/* ── Period summary row ── */}
      <div className="flex items-center justify-between px-1">
        <div className={`flex items-center gap-1 text-xs ${
          trendDiff > 0 ? "text-red-400" : trendDiff < 0 ? "text-emerald-400" : "text-muted-foreground"
        }`}>
          {trendDiff > 0 ? <TrendingUp className="h-3.5 w-3.5" /> :
           trendDiff < 0 ? <TrendingDown className="h-3.5 w-3.5" /> :
           <Minus className="h-3.5 w-3.5" />}
          <span className="font-semibold">{periodCfg.statsLabel} {totalCount}회</span>
          <span className="text-muted-foreground">({prevPeriodLabel} {prevPeriodCount}회)</span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
          title="새로고침"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Quick Stats Row ── */}
      <div className="grid grid-cols-4 gap-2">
        <Card>
          <CardContent className="pt-3 pb-2 px-2 text-center">
            <Flame className="h-3.5 w-3.5 mx-auto mb-1 text-orange-400" />
            <p className="text-lg font-bold">{totalCount}</p>
            <p className="text-[10px] text-muted-foreground">{periodCfg.statsLabel} 총</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 px-2 text-center">
            <Ruler className="h-3.5 w-3.5 mx-auto mb-1 text-blue-400" />
            <p className="text-lg font-bold">
              {stats?.avg_distance?.toFixed(0) ?? "–"}
              <span className="text-[10px] font-normal text-muted-foreground">cm</span>
            </p>
            <p className="text-[10px] text-muted-foreground">평균 거리</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 px-2 text-center">
            <Clock className="h-3.5 w-3.5 mx-auto mb-1 text-purple-400" />
            <p className="text-lg font-bold">{formatTime(stats?.total_warning_time_sec ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground">경고 시간</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 px-2 text-center">
            <Eye className="h-3.5 w-3.5 mx-auto mb-1 text-emerald-400" />
            <p className="text-lg font-bold">{streak}</p>
            <p className="text-[10px] text-muted-foreground">연속 무경고</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Rank Ladder (collapsible card) ── */}
      {rank?.all_ranks && (
        <RankLadder allRanks={rank.all_ranks} currentLevel={activePeriodRank?.current?.level} />
      )}

      {/* ── Scoring Guide (collapsible) ── */}
      <ScoringGuide />

      {/* ── Danger Zone Breakdown ── */}
      {totalCount > 0 && (
        <Card>
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
              위험도 분석
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="space-y-2">
              {([3, 2, 1] as const).map((level) => {
                const count = stats?.total_warnings[String(level)] ?? 0;
                const pct = totalCount > 0 ? (count / totalCount) * 100 : 0;
                const colors = { 3: "bg-red-500", 2: "bg-orange-500", 1: "bg-yellow-400" };
                return (
                  <div key={level} className="flex items-center gap-2">
                    <Badge variant={LEVEL_VARIANTS[level]} className="text-[10px] w-10 justify-center">
                      {LEVEL_LABELS[level]}
                    </Badge>
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${colors[level]} transition-all duration-500`}
                        style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-mono w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Daily Bar Chart ── */}
      {dailyCounts.length > 1 && (
        <Card>
          <CardHeader className="pb-2 px-3 pt-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs">
                {periodCfg.days === 1 ? "오늘 추이" : `지난 ${periodCfg.days}일 추이`}
              </CardTitle>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Zap className="h-3 w-3 text-amber-400" />
                위험시간대 {peakHour}
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="flex items-end gap-2 h-24">
              {dailyCounts.map((d) => {
                const pct = d.count > 0 ? (d.count / maxDaily) * 100 : 4;
                const dayName = DAY_NAMES[new Date(d.date + "T00:00").getDay()];
                const isToday = d.date === todayStr;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
                    <span className="text-[10px] font-medium">{d.count || ""}</span>
                    <div
                      className={`w-full max-w-[24px] rounded-t transition-all duration-300 ${
                        d.count > 0 ? barColor(d.count) : "bg-zinc-800/50"
                      } ${isToday ? "ring-1 ring-primary ring-offset-1 ring-offset-background" : ""}`}
                      style={{ height: `${pct}%`, minHeight: 2 }}
                    />
                    <span className={`text-[10px] ${isToday ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                      {isToday ? "오늘" : dayName}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Hourly Heatmap ── */}
      <Card>
        <CardHeader className="pb-2 px-3 pt-3">
          <CardTitle className="text-xs">시간대별 패턴</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="grid grid-cols-12 gap-1">
            {Array.from({ length: 24 }, (_, h) => {
              const count = hourly[String(h)] ?? 0;
              return (
                <div
                  key={h}
                  className={`aspect-square rounded flex items-center justify-center text-[8px] font-semibold ${heatColor(
                    count
                  )} ${count > 0 ? "text-white" : "text-transparent"}`}
                  title={`${String(h).padStart(2, "0")}시 — ${count}회`}
                >
                  {count > 0 ? count : ""}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>0시</span>
            <span>6시</span>
            <span>12시</span>
            <span>18시</span>
            <span>23시</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Recent Events ── */}
      <Card>
        <CardHeader className="pb-2 px-3 pt-3">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            최근 기록
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          {events.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-3xl mb-2">🎉</div>
              <p className="text-sm text-muted-foreground">경고 기록이 없습니다</p>
              <p className="text-xs text-muted-foreground mt-0.5">좋은 자세를 유지하고 있어요!</p>
            </div>
          ) : (
            <div className="space-y-1">
              {[...events]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 15)
                .map((ev, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md border border-border/50 text-xs"
                  >
                    <span className="text-muted-foreground w-14 shrink-0">
                      {timeAgo(ev.timestamp)}
                    </span>
                    <Badge variant={LEVEL_VARIANTS[ev.warning_level] ?? "caution"} className="text-[10px]">
                      {LEVEL_LABELS[ev.warning_level] ?? `L${ev.warning_level}`}
                    </Badge>
                    <span className="w-12 text-right font-mono">
                      {ev.distance_cm.toFixed(1)}cm
                    </span>
                    <span className="text-muted-foreground w-10 text-right">
                      {ev.duration_sec < 60
                        ? `${Math.round(ev.duration_sec)}초`
                        : `${Math.floor(ev.duration_sec / 60)}분`}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

/** Collapsible scoring rules guide */
const ScoringGuide: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-3 text-left"
      >
        <CardTitle className="text-xs flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 text-blue-400" />
          포인트 기준
        </CardTitle>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <CardContent className="pt-0 pb-4 px-3 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">나쁜 자세 포인트</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {([
                { label: "주의 (1단계)", pts: "+1", color: "text-yellow-400" },
                { label: "경고 (2단계)", pts: "+3", color: "text-orange-400" },
                { label: "위험 (3단계)", pts: "+8", color: "text-red-400" },
              ] as const).map((item) => (
                <div key={item.label} className="rounded-md border border-border/50 p-2">
                  <p className={`text-lg font-bold ${item.color}`}>{item.pts}</p>
                  <p className="text-[10px] text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">좋은 자세 포인트</p>
            <div className="grid grid-cols-2 gap-2 text-center">
              {([
                { label: "좋은 자세 1분 유지", pts: "+2", color: "text-emerald-400" },
                { label: "무경고 하루 보너스", pts: "+20", color: "text-cyan-400" },
              ] as const).map((item) => (
                <div key={item.label} className="rounded-md border border-border/50 p-2">
                  <p className={`text-lg font-bold ${item.color}`}>{item.pts}</p>
                  <p className="text-[10px] text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">추가 규칙</p>
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p>• 경고 지속 10초당 <span className="text-red-400 font-medium">+1pt</span> 추가</p>
              <p>• 매일 점수의 <span className="text-foreground font-medium">5%</span>가 자연 감소</p>
              <p>• 포인트 배율 설정으로 획득량 조절 가능</p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

/** Collapsible rank ladder with detailed card design */
const RankLadder: React.FC<{
  allRanks: TurtleRank[];
  currentLevel?: number;
}> = ({ allRanks, currentLevel }) => {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-3 text-left"
      >
        <CardTitle className="text-xs flex items-center gap-1.5">
          칭호 단계도
        </CardTitle>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <CardContent className="px-3 pb-3 pt-0 space-y-2">
          {allRanks.map((r) => {
            const isCurrent = r.level === currentLevel;
            const sl = stepLabelStyle(r.level);
            return (
              <div
                key={r.level}
                className={`flex items-center gap-3 rounded-lg border p-2.5 transition-all ${
                  isCurrent
                    ? "border-2 bg-white/5"
                    : "border-border/40 opacity-60"
                }`}
                style={
                  isCurrent
                    ? { borderColor: r.color + "80", boxShadow: `0 0 12px ${r.color}25` }
                    : undefined
                }
              >
                <div className="shrink-0">
                  <RankImage rank={r} size="44px" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sl.bg} ${sl.text}`}>
                      {r.step_label ?? r.name}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
                        현재
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold mt-0.5" style={{ color: r.color }}>
                    {r.emoji} {r.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{r.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    +{Math.abs(r.min_score)}pts
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
};

export default WarningHistory;
