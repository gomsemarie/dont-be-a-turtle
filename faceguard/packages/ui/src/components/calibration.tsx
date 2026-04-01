import React, { useState, useEffect } from "react";
import { Crosshair, Check, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Slider } from "./ui/slider";
import { Badge } from "./ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useStartCalibration, useCalibrateStatus, queryKeys } from "@/hooks/use-api";

interface CalibrationProps {
  isCalibrated: boolean;
}

export const Calibration: React.FC<CalibrationProps> = ({
  isCalibrated,
}) => {
  const [refDistance, setRefDistance] = useState(50);
  const [calibrating, setCalibrating] = useState(false);
  const [done, setDone] = useState(false);
  const qc = useQueryClient();

  const startCalibration = useStartCalibration();
  const { data: status } = useCalibrateStatus(calibrating);

  // Watch calibration status
  useEffect(() => {
    if (status?.is_complete && calibrating) {
      setCalibrating(false);
      setDone(true);
      qc.invalidateQueries({ queryKey: queryKeys.settings });
    }
  }, [status, calibrating, qc]);

  const handleStart = async () => {
    try {
      await startCalibration.mutateAsync({
        reference_distance_cm: refDistance,
        duration: 3.0,
      });
      setCalibrating(true);
      setDone(false);
    } catch (err) {
      console.error("Calibration error:", err);
      setCalibrating(false);
    }
  };

  const progress = status?.progress ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Crosshair className="h-4 w-4" />
              캘리브레이션
            </CardTitle>
            <CardDescription className="mt-1">
              정확한 거리 측정을 위해 기준점을 설정합니다
            </CardDescription>
          </div>
          <Badge variant={isCalibrated || done ? "safe" : "caution"}>
            {isCalibrated || done ? "설정 완료" : "미설정"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Slider
          label="기준 거리"
          value={refDistance}
          min={30}
          max={80}
          step={5}
          unit="cm"
          onChange={setRefDistance}
          disabled={calibrating}
        />

        <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          <p>
            모니터에서 <strong className="text-foreground">{refDistance}cm</strong> 거리에
            얼굴을 위치시키고 시작 버튼을 눌러주세요. 3초간 측정됩니다.
          </p>
        </div>

        {calibrating && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>측정 중...</span>
              <span>{progress.toFixed(0)}%</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleStart}
            disabled={calibrating}
            className="flex-1"
          >
            {calibrating ? (
              <RotateCcw className="h-4 w-4 animate-spin mr-2" />
            ) : done ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Crosshair className="h-4 w-4 mr-2" />
            )}
            {calibrating
              ? "측정 중..."
              : done
              ? "재측정"
              : isCalibrated
              ? "재측정"
              : "캘리브레이션 시작"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
