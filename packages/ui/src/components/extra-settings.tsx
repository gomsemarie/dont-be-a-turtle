import React, { useState } from "react";
import { Timer, Armchair, Gauge, Smile, RotateCcw, Hourglass, Bell, Database, Trash2, FlaskConical, Zap, Coffee, Sparkles, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { useResetHistory, useResetSettings, useInjectTestData } from "@/hooks/use-api";

interface ExtraSettingsProps {
  breakEnabled: boolean;
  breakInterval: number;
  breakChaosLevel: number;
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
  postureForwardHeadThreshold: number;
  postureSlouchThreshold: number;
  postureLateralTiltThreshold: number;
  postureCheckInterval: number;
  postureCalibrated: boolean;
  postureCalibrating?: boolean;
  onScoreMultiplierChange: (v: number) => void;
  onNotificationEnabledChange: (v: boolean) => void;
  onBreakEnabledChange: (v: boolean) => void;
  onBreakIntervalChange: (v: number) => void;
  onBreakChaosLevelChange: (v: number) => void;
  onTriggerBreak: () => void;
  onPostureEnabledChange: (v: boolean) => void;
  onTiltThresholdChange: (v: number) => void;
  onFrameRateChange: (v: number) => void;
  onEmojiMaskChange: (v: boolean) => void;
  onEmojiMaskTypeChange: (type: string) => void;
  onFaceYawThresholdChange: (v: number) => void;
  onWarningGraceSecChange: (v: number) => void;
  onHistoryRetentionDaysChange: (v: number) => void;
  onHistoryMaxEventsChange: (v: number) => void;
  onPostureForwardHeadThresholdChange: (v: number) => void;
  onPostureSlouchThresholdChange: (v: number) => void;
  onPostureLateralTiltThresholdChange: (v: number) => void;
  onPostureCheckIntervalChange: (v: number) => void;
  onPostureCalibrate: () => void;
  autoBreakEnabled: boolean;
  autoBreakMinutes: number;
  onAutoBreakEnabledChange: (v: boolean) => void;
  onAutoBreakMinutesChange: (v: number) => void;
  adminMode: boolean;
  onAdminModeChange: (v: boolean) => void;
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
  breakChaosLevel,
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
  postureForwardHeadThreshold,
  postureSlouchThreshold,
  postureLateralTiltThreshold,
  postureCheckInterval,
  postureCalibrated,
  postureCalibrating = false,
  onScoreMultiplierChange,
  onNotificationEnabledChange,
  onBreakEnabledChange,
  onBreakIntervalChange,
  onBreakChaosLevelChange,
  onTriggerBreak,
  onPostureEnabledChange,
  onTiltThresholdChange,
  onFrameRateChange,
  onEmojiMaskChange,
  onEmojiMaskTypeChange,
  onFaceYawThresholdChange,
  onWarningGraceSecChange,
  onHistoryRetentionDaysChange,
  onHistoryMaxEventsChange,
  onPostureForwardHeadThresholdChange,
  onPostureSlouchThresholdChange,
  onPostureLateralTiltThresholdChange,
  onPostureCheckIntervalChange,
  onPostureCalibrate,
  autoBreakEnabled,
  autoBreakMinutes,
  onAutoBreakEnabledChange,
  onAutoBreakMinutesChange,
  adminMode,
  onAdminModeChange,
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
            <>
              <Slider
                label="알림 간격"
                value={breakInterval}
                min={5}
                max={120}
                step={5}
                unit="분"
                onChange={onBreakIntervalChange}
              />
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-pink-500" />
                  <span className="text-xs text-muted-foreground">정신없음 레벨</span>
                </div>
                <Slider
                  label="카오스"
                  value={breakChaosLevel}
                  min={1}
                  max={10}
                  step={1}
                  unit="단계"
                  onChange={onBreakChaosLevelChange}
                />
                <p className="text-xs text-muted-foreground">
                  휴식 알림 시 화면을 떠다니는 이모지/이미지의 강도입니다. 높을수록 정신없어요!
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full text-xs"
                onClick={onTriggerBreak}
              >
                <Coffee className="h-3.5 w-3.5 mr-1.5" />
                휴식 모드
              </Button>
            </>
          )}

          {/* Auto-break: face undetected → rest mode */}
          <div className="pt-2 border-t border-border/50 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hourglass className="h-3.5 w-3.5 text-teal-500" />
                <span className="text-xs font-medium">자동 휴식 감지</span>
              </div>
              <Switch
                checked={autoBreakEnabled}
                onCheckedChange={onAutoBreakEnabledChange}
              />
            </div>
            {autoBreakEnabled && (
              <>
                <Slider
                  label="미감지 시간"
                  value={autoBreakMinutes}
                  min={1}
                  max={15}
                  step={1}
                  unit="분"
                  onChange={onAutoBreakMinutesChange}
                />
                <p className="text-xs text-muted-foreground">
                  얼굴이 감지되지 않는 상태가 설정 시간 이상 지속되면 자동으로 휴식 모드로 전환됩니다.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Posture Detection (AI) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Armchair className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">자세 감지 (AI)</span>
            </div>
            <Switch
              checked={postureEnabled}
              onCheckedChange={onPostureEnabledChange}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            MediaPipe Pose로 거북목, 구부정한 자세, 삐뚤어진 자세를 감지합니다.
          </p>
          {postureEnabled && (
            <>
              <div className="space-y-2">
                <Button
                  variant={postureCalibrated ? "outline" : "default"}
                  size="sm"
                  className="h-8 w-full text-xs"
                  onClick={onPostureCalibrate}
                  disabled={postureCalibrating}
                >
                  {postureCalibrating ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Armchair className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {postureCalibrating
                    ? "캘리브레이션 중... 바른 자세를 유지하세요"
                    : postureCalibrated
                      ? "자세 다시 캘리브레이션"
                      : "바른 자세 캘리브레이션 (필수)"}
                </Button>
                {!postureCalibrated && (
                  <p className="text-xs text-amber-400">
                    바른 자세로 앉은 상태에서 캘리브레이션을 진행해주세요.
                  </p>
                )}
              </div>
              <Slider
                label="거북목 민감도"
                value={postureForwardHeadThreshold}
                min={1}
                max={10}
                step={1}
                unit="단계"
                onChange={onPostureForwardHeadThresholdChange}
              />
              <Slider
                label="구부정 민감도"
                value={postureSlouchThreshold}
                min={1}
                max={10}
                step={1}
                unit="단계"
                onChange={onPostureSlouchThresholdChange}
              />
              <Slider
                label="좌우 기울기 민감도"
                value={postureLateralTiltThreshold}
                min={1}
                max={10}
                step={1}
                unit="단계"
                onChange={onPostureLateralTiltThresholdChange}
              />
              <Slider
                label="감지 주기"
                value={postureCheckInterval}
                min={0.5}
                max={5}
                step={0.5}
                unit="초"
                onChange={onPostureCheckIntervalChange}
              />
              <p className="text-xs text-muted-foreground">
                민감도 값이 높을수록 작은 자세 변화에도 경고합니다.
              </p>
            </>
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

        {/* Score Multiplier — admin only */}
        {adminMode && (
          <>
            <div className="h-px bg-border" />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-400" />
                <span className="text-sm font-medium">포인트 배율</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-medium">관리자</span>
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
          </>
        )}

        {/* History Data Management — admin only */}
        {adminMode && (
          <>
            <div className="h-px bg-border" />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan-500" />
                <span className="text-sm font-medium">데이터 관리</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-medium">관리자</span>
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
          </>
        )}

        <div className="h-px bg-border" />

        {/* Admin Mode Toggle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-medium">관리자 모드</span>
            </div>
            <Switch
              checked={adminMode}
              onCheckedChange={onAdminModeChange}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            도트 에디터 등 고급 기능 탭을 활성화합니다.
          </p>
        </div>
      </CardContent>
    </Card>
    </>
  );
};

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
