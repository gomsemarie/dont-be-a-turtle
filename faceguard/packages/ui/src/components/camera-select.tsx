import React from "react";
import { Camera, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { useCameras, useSelectCamera, useRefreshCameras } from "@/hooks/use-api";

interface CameraSelectProps {
  selectedIndex: number;
  disabled?: boolean;
}

export const CameraSelect: React.FC<CameraSelectProps> = ({
  selectedIndex,
  disabled = false,
}) => {
  const { data, isLoading } = useCameras();
  const selectCamera = useSelectCamera();
  const refreshCameras = useRefreshCameras();

  const cameras = data?.cameras ?? [];
  const refreshing = isLoading || refreshCameras.isPending;

  const handleSelect = (index: number) => {
    selectCamera.mutate(index);
  };

  return (
    <div className="flex items-center gap-2">
      {cameras.length === 0 ? (
        <p className="text-xs text-muted-foreground flex-1">
          {refreshing ? "카메라 검색 중..." : "카메라 없음"}
        </p>
      ) : (
        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
          {cameras.map((cam) => (
            <button
              key={cam.index}
              onClick={() => handleSelect(cam.index)}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs whitespace-nowrap transition-colors ${
                selectedIndex === cam.index
                  ? "border-primary bg-primary/10 text-primary"
                  : disabled
                  ? "opacity-40 cursor-not-allowed border-border text-muted-foreground"
                  : "border-border hover:bg-accent text-muted-foreground"
              }`}
              title={`${cam.name} (${cam.resolution})`}
            >
              <Camera className={`h-3.5 w-3.5 shrink-0 ${
                selectedIndex === cam.index ? "text-primary" : "text-muted-foreground"
              }`} />
              <span className="truncate max-w-[120px]">{cam.name.replace(/FaceTime|HD Camera|Webcam/gi, "").trim() || cam.name}</span>
            </button>
          ))}
        </div>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => refreshCameras.mutate()}
        disabled={refreshing}
        title="카메라 목록 새로고침"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
};
