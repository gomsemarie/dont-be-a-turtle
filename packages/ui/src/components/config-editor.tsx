import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import {
  Settings2,
  Save,
  RotateCcw,
  ChevronDown,
  Palette,
  Trophy,
  Zap,
  Loader2,
} from "lucide-react";
import { useRankConfig, useUpdateRankConfig } from "@/hooks/use-api";
import type { RankConfig } from "@/hooks/use-api";
import { toast } from "sonner";

/** Admin config editor — edit rank definitions and scoring rules */
export const ConfigEditor: React.FC = () => {
  const { data: config, isLoading } = useRankConfig();
  const updateConfig = useUpdateRankConfig();

  const [localRanks, setLocalRanks] = useState<RankConfig["ranks"]>([]);
  const [localRules, setLocalRules] = useState<RankConfig["scoring_rules"] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [ranksOpen, setRanksOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    if (config) {
      setLocalRanks(config.ranks);
      setLocalRules(config.scoring_rules);
      setDirty(false);
    }
  }, [config]);

  const handleRankChange = (level: number, field: string, value: string | number) => {
    setLocalRanks((prev) =>
      prev.map((r) => (r.level === level ? { ...r, [field]: value } : r))
    );
    setDirty(true);
  };

  const handleRuleChange = (section: string, field: string, value: number) => {
    if (!localRules) return;
    setLocalRules((prev) => {
      if (!prev) return prev;
      const sec = prev[section] as Record<string, any>;
      return { ...prev, [section]: { ...sec, [field]: value } };
    });
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      await updateConfig.mutateAsync({
        ranks: localRanks,
        scoring_rules: localRules ?? undefined,
      });
      toast.success("설정이 저장되었습니다");
      setDirty(false);
    } catch {
      toast.error("저장 실패");
    }
  };

  const handleReset = () => {
    if (config) {
      setLocalRanks(config.ranks);
      setLocalRules(config.scoring_rules);
      setDirty(false);
    }
  };

  if (isLoading || !localRules) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground mt-2">설정 로딩 중...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Save bar */}
      {dirty && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-orange-500/30 bg-orange-500/10">
          <span className="text-xs text-orange-400 flex-1">변경사항이 있습니다</span>
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={handleReset}>
            <RotateCcw className="h-3 w-3 mr-1" />
            되돌리기
          </Button>
          <Button
            size="sm"
            className="h-6 text-[10px]"
            onClick={handleSave}
            disabled={updateConfig.isPending}
          >
            <Save className="h-3 w-3 mr-1" />
            저장
          </Button>
        </div>
      )}

      {/* ── Scoring Rules ── */}
      <Card>
        <button
          onClick={() => setRulesOpen(!rulesOpen)}
          className="w-full flex items-center justify-between px-3 py-3 text-left"
        >
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-yellow-400" />
            포인트 규칙
          </CardTitle>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${rulesOpen ? "rotate-180" : ""}`}
          />
        </button>
        {rulesOpen && (
          <CardContent className="px-3 pb-3 pt-0 space-y-4">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground">나쁜 자세 포인트</p>
              <Slider
                label="주의 (1단계)"
                value={Math.abs(localRules.penalty.level_1_base)}
                min={0}
                max={20}
                step={1}
                unit="pt"
                onChange={(v) => handleRuleChange("penalty", "level_1_base", -v)}
              />
              <Slider
                label="경고 (2단계)"
                value={Math.abs(localRules.penalty.level_2_base)}
                min={0}
                max={30}
                step={1}
                unit="pt"
                onChange={(v) => handleRuleChange("penalty", "level_2_base", -v)}
              />
              <Slider
                label="위험 (3단계)"
                value={Math.abs(localRules.penalty.level_3_base)}
                min={0}
                max={50}
                step={1}
                unit="pt"
                onChange={(v) => handleRuleChange("penalty", "level_3_base", -v)}
              />
              <Slider
                label="지속 시간 배수"
                value={Math.abs(localRules.penalty.duration_multiplier)}
                min={0}
                max={1}
                step={0.05}
                unit="pt/초"
                onChange={(v) => handleRuleChange("penalty", "duration_multiplier", -v)}
              />
            </div>
            <div className="h-px bg-border" />
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground">좋은 자세 포인트</p>
              <Slider
                label="분당 보상"
                value={localRules.reward.good_posture_per_min}
                min={0}
                max={20}
                step={1}
                unit="pt/분"
                onChange={(v) => handleRuleChange("reward", "good_posture_per_min", v)}
              />
              <Slider
                label="무경고 하루 보너스"
                value={localRules.daily_bonus.zero_warning_day}
                min={0}
                max={100}
                step={5}
                unit="pt"
                onChange={(v) => handleRuleChange("daily_bonus", "zero_warning_day", v)}
              />
            </div>
            <div className="h-px bg-border" />
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground">감소율</p>
              <Slider
                label="일일 자연 감소"
                value={localRules.decay.daily_decay_rate * 100}
                min={0}
                max={20}
                step={1}
                unit="%"
                onChange={(v) => handleRuleChange("decay", "daily_decay_rate", v / 100)}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Rank Definitions ── */}
      <Card>
        <button
          onClick={() => setRanksOpen(!ranksOpen)}
          className="w-full flex items-center justify-between px-3 py-3 text-left"
        >
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            칭호 정의
          </CardTitle>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${ranksOpen ? "rotate-180" : ""}`}
          />
        </button>
        {ranksOpen && (
          <CardContent className="px-3 pb-3 pt-0 space-y-2">
            {localRanks.map((rank) => (
              <div
                key={rank.level}
                className="rounded-lg border border-border/50 p-2.5 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{rank.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: rank.color + "20", color: rank.color }}
                      >
                        {rank.step_label ?? rank.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        +{Math.abs(rank.min_score)}pts
                      </span>
                    </div>
                    <p className="text-xs font-bold mt-0.5" style={{ color: rank.color }}>
                      {rank.name}
                    </p>
                  </div>
                  <div
                    className="w-5 h-5 rounded-full border border-border/50 shrink-0"
                    style={{ backgroundColor: rank.color }}
                  />
                </div>

                {/* Editable fields */}
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">칭호 이름</span>
                    <input
                      type="text"
                      value={rank.name}
                      onChange={(e) => handleRankChange(rank.level, "name", e.target.value)}
                      className="w-full h-7 px-2 text-xs rounded-md border bg-background"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">평가 단계</span>
                    <input
                      type="text"
                      value={rank.step_label ?? ""}
                      onChange={(e) => handleRankChange(rank.level, "step_label", e.target.value)}
                      className="w-full h-7 px-2 text-xs rounded-md border bg-background"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">이모지</span>
                    <input
                      type="text"
                      value={rank.emoji}
                      onChange={(e) => handleRankChange(rank.level, "emoji", e.target.value)}
                      className="w-full h-7 px-2 text-xs rounded-md border bg-background"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">필요 점수</span>
                    <input
                      type="number"
                      value={rank.min_score}
                      onChange={(e) => handleRankChange(rank.level, "min_score", Number(e.target.value))}
                      className="w-full h-7 px-2 text-xs rounded-md border bg-background font-mono"
                    />
                  </label>
                  <label className="col-span-2 space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">설명</span>
                    <input
                      type="text"
                      value={rank.description}
                      onChange={(e) => handleRankChange(rank.level, "description", e.target.value)}
                      className="w-full h-7 px-2 text-xs rounded-md border bg-background"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">색상</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="color"
                        value={rank.color}
                        onChange={(e) => handleRankChange(rank.level, "color", e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0"
                      />
                      <input
                        type="text"
                        value={rank.color}
                        onChange={(e) => handleRankChange(rank.level, "color", e.target.value)}
                        className="flex-1 h-7 px-2 text-xs rounded-md border bg-background font-mono"
                      />
                    </div>
                  </label>
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
};
