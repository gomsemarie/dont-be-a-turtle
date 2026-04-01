import React from "react";
import { Video, VideoOff } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { useSSE } from "@/hooks/use-sse";

const EMOJI_MAP: Record<string, string> = {
  emoji_smile: "😊",
  emoji_star_eyes: "🤩",
  emoji_sunglasses: "😎",
  emoji_cat: "😺",
  emoji_dog: "🐶",
  emoji_alien: "👽",
};

interface PreviewData {
  image: string | null;
  face_detected: boolean;
  distance_cm?: number;
  ied_pixels?: number;
  face_bbox?: [number, number, number, number] | null; // [x, y, w, h] normalized
}

interface CameraPreviewProps {
  active: boolean;
  emojiEnabled?: boolean;
  emojiType?: string;
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  active,
  emojiEnabled = true,
  emojiType = "emoji_smile",
}) => {
  const { data, connected } = useSSE<PreviewData>(
    active ? "/api/stream/preview" : null,
    "frame"
  );

  const warningVariant = (() => {
    if (!data?.face_detected) return "secondary";
    if (!data.distance_cm || data.distance_cm <= 0) return "secondary";
    if (data.distance_cm <= 25) return "danger";
    if (data.distance_cm <= 35) return "warning";
    if (data.distance_cm <= 45) return "caution";
    return "safe";
  })();

  const emojiChar = EMOJI_MAP[emojiType] || "😊";
  const bbox = data?.face_bbox;

  return (
    <Card>
      <CardHeader className="pb-2 px-3 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {active ? (
              <Video className="h-4 w-4 text-green-500" />
            ) : (
              <VideoOff className="h-4 w-4 text-muted-foreground" />
            )}
            미리보기
          </CardTitle>
          <div className="flex items-center gap-2">
            {data?.face_detected && data.distance_cm ? (
              <Badge variant={warningVariant}>
                {data.distance_cm.toFixed(1)}cm
              </Badge>
            ) : (
              <Badge variant="secondary">
                {data?.face_detected === false ? "얼굴 미감지" : "대기 중"}
              </Badge>
            )}
            <div
              className={`h-2 w-2 rounded-full ${
                connected ? "bg-green-500" : "bg-red-500"
              }`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-black" style={{ containerType: "size" }}>
          {data?.image ? (
            <>
              <img
                src={data.image}
                alt="Camera preview"
                className="w-full h-full object-contain"
              />
              {/* Emoji mask overlay - plain text emoji positioned over face */}
              {emojiEnabled && data.face_detected && bbox && (
                <div
                  style={{
                    position: "absolute",
                    left: `${bbox[0] * 100}%`,
                    top: `${bbox[1] * 100}%`,
                    width: `${bbox[2] * 100}%`,
                    height: `${bbox[3] * 100}%`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    pointerEvents: "none",
                    transform: "translateZ(0)",
                    willChange: "transform, left, top",
                  }}
                >
                  <span
                    style={{
                      fontSize: `${bbox[3] * 75}cqh`,
                      lineHeight: 1,
                      userSelect: "none",
                      transform: "translateZ(0)",
                    }}
                  >
                    {emojiChar}
                  </span>
                </div>
              )}
              {/* Face not detected overlay - covers entire preview at 90% opacity */}
              {data.face_detected === false && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/90 rounded-lg">
                  <div className="text-center">
                    <VideoOff className="h-10 w-10 mx-auto mb-2 text-yellow-400 opacity-80" />
                    <p className="text-sm font-medium text-yellow-300">
                      얼굴이 감지되지 않습니다
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      카메라를 바라봐 주세요
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <VideoOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {active
                    ? "카메라에 연결 중..."
                    : "카메라를 선택해주세요"}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
