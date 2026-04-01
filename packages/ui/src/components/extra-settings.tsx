import React, { useState } from "react";
import { Timer, Armchair, Gauge, Smile, RotateCcw, Hourglass, Bell, Database, Trash2, FlaskConical, Zap, ChevronDown, Info } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { useResetHistory, useResetSettings, useInjectTestData } from "@/hooks/use-api";

interface ExtraSettingsProps {
  breakEnabled: boolean;
  breakInterval: number;
  postureEnabled: boolean;
  tiltThreshold: number;
  frameRate: number;
  emojiMaskEnabled: boolean;
  emojiMaskType: string;
  faceYawThreshold: number;
  warningGraceSec: number;
  notificationEnabled: boolean;
  historyRetentionDays: number;
  historyMaxEvents: number;
  scoreMultiplier: number;
  onScoreMultiplierChange: (v: number) => void;
  onNotificationEnabledChange: (v: boolean) => void;
  onBreakEnabledChange: (v: boolean) => void;
  onBreakIntervalChange: (v: number) => void;
  onPostureEnabledChange: (v: boolean) => void;
  onTiltThresholdChange: (v: number) => void;
  onFrameRateChange: (v: number) => void;
  onEmojiMaskChange: (v: boolean) => void;
  onEmojiMaskTypeChange: (type: string) => void;
  onFaceYawThresholdChange: (v: number) => void;
  onWarningGraceSecChange: (v: number) => void;
  onHistoryRetentionDaysChange: (v: number) => void;
  onHistoryMaxEventsChange: (v: number) => void;
}

const EMOJI_MASK_OPTIONS = [
  { emoji: "\u{1F60A}", label: "Smile", key: "emoji_smile" },
  { emoji: "\u{1F929}", label: "Star Eyes", key: "emoji_star_eyes" },
  { emoji: "\u{1F60E}", label: "Sunglasses", key: "emoji_sunglasses" },
  { emoji: "\u{1F63A}", label: "Cat", key: "emoji_cat" },
  { emoji: "\u{1F436}", label: "Dog", key: "emoji_dog" },
  { emoji: "\u{1F47D}", label: "Alien", key: "emoji_alien" },
];

export const ExtraSettings: React.FC<ExtraSettingsProps> = ({
  breakEnabled,
  breakInterval,
  postureEnabled,
  tiltThreshold,
  frameRate,
  emojiMaskEnabled,
  emojiMaskType,
  faceYawThreshold,
  warningGraceSec,
  notificationEnabled,
  historyRetentionDays,
  historyMaxEvents,
  scoreMultiplier,
  onScoreMultiplierChange,
  onNotificationEnabledChange,
  onBreakEnabledChange,
  onBreakIntervalChange,
  onPostureEnabledChange,
  onTiltThresholdChange,
  onFrameRateChange,
  onEmojiMaskChange,
  onEmojiMaskTypeChange,
  onFaceYawThresholdChange,
  onWarningGraceSecChange,
  onHistoryRetentionDaysChange,
  onHistoryMaxEventsChange,
}) => {
  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">추가 설정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Warning Grace Period */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium">경고 유예 시간</span>
          </div>
          <Slider
            label="유예 시간"
            value={warningGraceSec}
            min={0}
            max={10}
            step={1}
            unit="초"
            onChange={onWarningGraceSecChange}
          />
          <p className="text-xs text-muted-foreground">
            경고 구간에 진입한 후 이 시간이 지나야 알림을 보냅니다. 잠깐 가까이 갔다가 바로 돌아오면 알림이 울리지 않습니다.
          </p>
        </div>

        <div className="h-px bg-border" />

        {/* OS Notification Toggle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-rose-500" />
              <span className="text-sm font-medium">OS 알림</span>
            </div>
            <Switch
              checked={notificationEnabled}
              onCheckedChange={onNotificationEnabledChange}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            경고 시 macOS/Windows 시스템 알림을 보냅니다.
          </p>
        </div>

        <div className="h-px bg-border" />

        {/* Break Reminder */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">휴식 알림</span>
            </div>
            <Switch
              checked={breakEnabled}
              onCheckedChange={onBreakEnabledChange}
            />
          </div>
          {breakEnabled && (
            <Slider
              label="알림 간격"
              value={breakInterval}
              min={10}
              max={120}
              step={5}
              unit="분"
              onChange={onBreakIntervalChange}
            />
          )}
        </div>

        <div className="h-px bg-border" />

        {/* Posture Detection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Armchair className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">자세 감지</span>
            </div>
            <Switch
              checked={postureEnabled}
              onCheckedChange={onPostureEnabledChange}
            />
          </div>
          {postureEnabled && (
            <Slider
              label="기울기 임계값"
              value={tiltThreshold}
              min={5}
              max={30}
              step={1}
              unit="°"
              onChange={onTiltThresholdChange}
            />
          )}
        </div>

        <div className="h-px bg-border" />

        {/* Face Yaw Threshold */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-medium">고개 돌림 허용 범위</span>
          </div>
          <Slider
            label="최대 허용 각도"
            value={faceYawThreshold}
            min={15}
            max={75}
            step={5}
            unit="°"
            onChange={onFaceYawThresholdChange}
          />
          <p className="text-xs text-muted-foreground">
            고개를 이 각도 이상 돌리면 거리 감지를 일시 중단합니다. 값이 작을수록 민감합니다.
          </p>
        </div>

        <div className="h-px bg-border" />

        {/* Emoji Mask */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smile className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">이모지 마스크</span>
            </div>
            <Switch
              checked={emojiMaskEnabled}
              onCheckedChange={onEmojiMaskChange}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            미리보기에서 얼굴 위에 이모지를 씌웁니다. 얼굴 외곽선은 유지되어 캘리브레이션에 영향을 주지 않습니다.
          </p>
          {emojiMaskEnabled && (
            <div className="flex flex-wrap gap-3 pt-2">
              {EMOJI_MASK_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => onEmojiMaskTypeChange(option.key)}
                  className={`flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all ${
                    emojiMaskType === option.key
                      ? "ring-2 ring-blue-500 ring-offset-2 scale-110"
                      : "hover:scale-105"
                  }`}
                  title={option.label}
                >
                  <span className="text-2xl">{option.emoji}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-px bg-border" />

        {/* Frame Rate */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium">성능</span>
          </div>
          <Slider
            label="프레임 레이트"
            value={frameRate}
            min={5}
            max={30}
            step={1}
            unit="fps"
            onChange={onFrameRateChange}
          />
        </div>

        <div className="h-px bg-border" />

        {/* Score Multiplier */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-medium">포인트 배율</span>
          </div>
          <Slider
            label="배율"
            value={scoreMultiplier}
            min={0.5}
            max={10.0}
            step={0.1}
            unit="배"
            onChange={onScoreMultiplierChange}
          />
          <p className="text-xs text-muted-foreground">
            경고 포인트에 적용되는 배율입니다. 1.0이 기본이며, 높을수록 칭호가 빠르게 올라갑니다.
          </p>
        </div>

        <div className="h-px bg-border" />

        {/* History Data Management */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-cyan-500" />
            <span className="text-sm font-medium">데이터 관리</span>
          </div>
          <Slider
            label="보관 기간"
            value={historyRetentionDays}
            min={1}
            max={365}
            step={1}
            unit="일"
            onChange={onHistoryRetentionDaysChange}
          />
          <Slider
            label="최대 저장 건수"
            value={historyMaxEvents}
            min={100}
            max={10000}
            step={100}
            unit="건"
            onChange={onHistoryMaxEventsChange}
          />
          <p className="text-xs text-muted-foreground">
            보관 기간이 지나거나 최대 건수를 초과하면 오래된 데이터부터 자동 삭제됩니다.
          </p>
          <HistoryActions />
        </div>
      </CardContent>
    </Card>
    <ScoringGuide />
    </>
  );
};

/** Collapsible scoring rules guide */
function ScoringGuide() {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium">포인트 & 칭호 기준</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <CardContent className="pt-0 pb-4 px-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">경고 레벨별 기본 포인트</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {([
                { label: "주의 (Lv.1)", pts: "1pt", color: "text-yellow-400" },
                { label: "경고 (Lv.2)", pts: "3pt", color: "text-orange-400" },
                { label: "위험 (Lv.3)", pts: "8pt", color: "text-red-400" },
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
              <p>• 경고 지속시간 10초당 <span className="text-foreground font-medium">+1pt</span> 추가</p>
              <p>• 무경고 하루 달성 시 <span className="text-emerald-400 font-medium">-5pt</span> 감소</p>
              <p>• 매일 누적 포인트의 <span className="text-foreground font-medium">2%</span>가 자연 감소</p>
              <p>• 포인트 배율 설정으로 획득량 조절 가능</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">칭호 승급 기준</p>
            <div className="text-[11px] space-y-0.5">
              {([
                { lv: 1, name: "자세 깡패", pts: 0, color: "#22c55e" },
                { lv: 2, name: "어 슬슬?", pts: 50, color: "#4ade80" },
                { lv: 3, name: "ㅋㅋ 시작이네", pts: 150, color: "#a3e635" },
                { lv: 4, name: "목 어디감?", pts: 350, color: "#facc15" },
                { lv: 5, name: "거북목 본캐", pts: 600, color: "#fb923c" },
                { lv: 6, name: "ㄹㅇ 자라됨", pts: 1000, color: "#f97316" },
                { lv: 7, name: "목 가출함", pts: 1500, color: "#ef4444" },
                { lv: 8, name: "기럭지 미쳤네", pts: 2500, color: "#dc2626" },
                { lv: 9, name: "척추과 단골", pts: 4000, color: "#b91c1c" },
                { lv: 10, name: "화석 예약 완료", pts: 6000, color: "#7f1d1d" },
              ] as const).map((r) => (
                <div key={r.lv} className="flex items-center justify-between py-0.5">
                  <span style={{ color: r.color }}>
                    <span className="font-mono text-[10px] mr-1">Lv.{r.lv}</span>
                    <span className="font-medium">{r.name}</span>
                  </span>
                  <span className="font-mono text-muted-foreground">{r.pts.toLocaleString()}pts</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/** History reset, settings reset & test data buttons (self-contained) */
function HistoryActions() {
  const resetHistory = useResetHistory();
  const resetSettings = useResetSettings();
  const injectTestData = useInjectTestData();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSettingsReset, setConfirmSettingsReset] = useState(false);

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    resetHistory.mutate(undefined, { onSuccess: () => setConfirmReset(false) });
  };

  const handleSettingsReset = () => {
    if (!confirmSettingsReset) {
      setConfirmSettingsReset(true);
      setTimeout(() => setConfirmSettingsReset(false), 3000);
      return;
    }
    resetSettings.mutate(undefined, { onSuccess: () => setConfirmSettingsReset(false) });
  };

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <Button
        variant={confirmReset ? "destructive" : "outline"}
        size="sm"
        className="h-7 text-xs"
        onClick={handleReset}
        disabled={resetHistory.isPending}
      >
        <Trash2 className="h-3 w-3 mr-1" />
        {confirmReset ? "정말 삭제?" : "기록 초기화"}
      </Button>
      <Button
        variant={confirmSettingsReset ? "destructive" : "outline"}
        size="sm"
        className="h-7 text-xs"
        onClick={handleSettingsReset}
        disabled={resetSettings.isPending}
      >
        <RotateCcw className="h-3 w-3 mr-1" />
        {confirmSettingsReset ? "정말 초기화?" : "설정 초기화"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => injectTestData.mutate("rank_up")}
        disabled={injectTestData.isPending}
      >
        <FlaskConical className="h-3 w-3 mr-1" />
        테스트 데이터
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => injectTestData.mutate("heavy")}
        disabled={injectTestData.isPending}
      >
        <FlaskConical className="h-3 w-3 mr-1" />
        대량 테스트
      </Button>
    </div>
  );
}
