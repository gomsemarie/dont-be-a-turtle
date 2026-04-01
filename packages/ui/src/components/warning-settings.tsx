import React from "react";
import { AlertTriangle, ShieldAlert, ShieldOff } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import type { WarningLevel } from "@/stores/use-settings-store";

const LEVEL_CONFIG = [
  {
    icon: AlertTriangle,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    name: "1단계 · 주의",
    description: "화면 상단에 얇은 경고 바를 표시합니다",
  },
  {
    icon: ShieldAlert,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    name: "2단계 · 경고",
    description: "화면 테두리에 글로우 효과를 표시합니다",
  },
  {
    icon: ShieldOff,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    name: "3단계 · 위험",
    description: "전체 화면 반투명 오버레이를 표시합니다",
  },
];

interface WarningSettingsProps {
  levels: WarningLevel[];
  onChange: (levels: WarningLevel[]) => void;
  warningMessages: string[];
  onWarningMessagesChange: (messages: string[]) => void;
}

export const WarningSettings: React.FC<WarningSettingsProps> = ({
  levels,
  onChange,
  warningMessages,
  onWarningMessagesChange,
}) => {
  const updateLevel = (index: number, partial: Partial<WarningLevel>) => {
    const updated = levels.map((l, i) =>
      i === index ? { ...l, ...partial } : l
    );
    onChange(updated);
  };

  const updateMessage = (index: number, msg: string) => {
    const updated = [...warningMessages];
    updated[index] = msg;
    onWarningMessagesChange(updated);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">경고 단계 설정</CardTitle>
        <CardDescription>
          각 단계별 거리 임계값과 활성화 여부를 설정합니다
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {levels.map((level, i) => {
          const config = LEVEL_CONFIG[i];
          if (!config) return null;
          const Icon = config.icon;

          return (
            <div
              key={i}
              className={`rounded-lg border p-4 transition-opacity ${
                config.borderColor
              } ${config.bgColor} ${
                !level.enabled ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${config.color}`} />
                  <span className="text-sm font-medium">{config.name}</span>
                </div>
                <Switch
                  checked={level.enabled}
                  onCheckedChange={(checked) =>
                    updateLevel(i, { enabled: checked })
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {config.description}
              </p>
              <Slider
                label="거리 임계값"
                value={level.distance_cm}
                min={15}
                max={70}
                step={1}
                unit="cm"
                onChange={(v) => updateLevel(i, { distance_cm: v })}
                disabled={!level.enabled}
              />
              {/* Custom warning message */}
              <div className="mt-3">
                <label className="text-xs text-muted-foreground block mb-1">
                  경고 메시지
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  value={warningMessages[i] ?? ""}
                  onChange={(e) => updateMessage(i, e.target.value)}
                  disabled={!level.enabled}
                  placeholder="경고 메시지를 입력하세요"
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
