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

interface PostureLandmarks {
  l_ear: [number, number];
  r_ear: [number, number];
  l_shoulder: [number, number];
  r_shoulder: [number, number];
  nose: [number, number];
  ear_mid: [number, number];
  sh_mid: [number, number];
  l_hip?: [number, number];
  r_hip?: [number, number];
  hip_mid?: [number, number];
}

interface PostureData {
  forward_head_ratio: number;
  slouch_ratio: number;
  lateral_tilt_ratio: number;
  posture_warning_level: number;
  posture_message: string;
  forward_head_warning: boolean;
  slouch_warning: boolean;
  lateral_tilt_warning: boolean;
  visibility: number;
  landmarks?: PostureLandmarks | null;
}

interface PreviewData {
  image: string | null;
  face_detected: boolean;
  distance_cm?: number;
  ied_pixels?: number;
  face_bbox?: [number, number, number, number] | null; // [x, y, w, h] normalized
  posture?: PostureData | null;
}

interface CameraPreviewProps {
  active: boolean;
  emojiEnabled?: boolean;
  emojiType?: string;
  postureEnabled?: boolean;
  postureCalibrated?: boolean;
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  active,
  emojiEnabled = true,
  emojiType = "emoji_smile",
  postureEnabled = false,
  postureCalibrated = false,
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
              {/* Posture visual overlay — lines drawn on body landmarks */}
              {postureEnabled && data.face_detected && (
                data.posture
                  ? <PostureOverlay posture={data.posture} />
                  : <PostureWaiting calibrated={postureCalibrated} />
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


/* ── Visual pose overlay — draws lines directly on the video ── */

/** Pick a color based on ratio: green → yellow → orange → red */
function ratioStroke(ratio: number, warning: boolean): string {
  if (warning) return ratio >= 1.5 ? "#ef4444" : "#f97316";
  if (ratio >= 0.6) return "#facc15";
  return "#34d399";
}

const PostureOverlay: React.FC<{ posture: PostureData }> = ({ posture }) => {
  const lm = posture.landmarks;
  const level = posture.posture_warning_level;

  // Colors per metric
  const shoulderColor = ratioStroke(posture.lateral_tilt_ratio, posture.lateral_tilt_warning);
  const neckColor = ratioStroke(posture.forward_head_ratio, posture.forward_head_warning);
  const slouchColor = ratioStroke(posture.slouch_ratio, posture.slouch_warning);

  return (
    <>
      {/* SVG overlay for pose lines */}
      {lm && (
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: "translateZ(0)" }}
        >
          {/* Shoulder line */}
          <line
            x1={lm.l_shoulder[0]} y1={lm.l_shoulder[1]}
            x2={lm.r_shoulder[0]} y2={lm.r_shoulder[1]}
            stroke={shoulderColor} strokeWidth="0.006" strokeLinecap="round"
          />
          {/* Shoulder dots */}
          <circle cx={lm.l_shoulder[0]} cy={lm.l_shoulder[1]} r="0.008" fill={shoulderColor} />
          <circle cx={lm.r_shoulder[0]} cy={lm.r_shoulder[1]} r="0.008" fill={shoulderColor} />

          {/* Neck line: ear midpoint → shoulder midpoint (forward head indicator) */}
          <line
            x1={lm.ear_mid[0]} y1={lm.ear_mid[1]}
            x2={lm.sh_mid[0]} y2={lm.sh_mid[1]}
            stroke={neckColor} strokeWidth="0.005" strokeLinecap="round"
          />
          {/* Ear dots */}
          <circle cx={lm.l_ear[0]} cy={lm.l_ear[1]} r="0.006" fill={neckColor} opacity="0.7" />
          <circle cx={lm.r_ear[0]} cy={lm.r_ear[1]} r="0.006" fill={neckColor} opacity="0.7" />
          {/* Ear line */}
          <line
            x1={lm.l_ear[0]} y1={lm.l_ear[1]}
            x2={lm.r_ear[0]} y2={lm.r_ear[1]}
            stroke={neckColor} strokeWidth="0.003" strokeLinecap="round" opacity="0.5"
          />
          {/* Nose dot */}
          <circle cx={lm.nose[0]} cy={lm.nose[1]} r="0.006" fill={neckColor} opacity="0.5" />

          {/* Spine line: shoulder mid → hip mid (slouch indicator) */}
          {lm.hip_mid && (
            <>
              <line
                x1={lm.sh_mid[0]} y1={lm.sh_mid[1]}
                x2={lm.hip_mid[0]} y2={lm.hip_mid[1]}
                stroke={slouchColor} strokeWidth="0.005" strokeLinecap="round"
              />
              {/* Hip line */}
              {lm.l_hip && lm.r_hip && (
                <>
                  <line
                    x1={lm.l_hip[0]} y1={lm.l_hip[1]}
                    x2={lm.r_hip[0]} y2={lm.r_hip[1]}
                    stroke={slouchColor} strokeWidth="0.004" strokeLinecap="round" opacity="0.6"
                  />
                  <circle cx={lm.l_hip[0]} cy={lm.l_hip[1]} r="0.006" fill={slouchColor} opacity="0.6" />
                  <circle cx={lm.r_hip[0]} cy={lm.r_hip[1]} r="0.006" fill={slouchColor} opacity="0.6" />
                </>
              )}
            </>
          )}

          {/* Left ear → left shoulder connector */}
          <line
            x1={lm.l_ear[0]} y1={lm.l_ear[1]}
            x2={lm.l_shoulder[0]} y2={lm.l_shoulder[1]}
            stroke={neckColor} strokeWidth="0.003" strokeLinecap="round" opacity="0.4"
            strokeDasharray="0.008 0.006"
          />
          {/* Right ear → right shoulder connector */}
          <line
            x1={lm.r_ear[0]} y1={lm.r_ear[1]}
            x2={lm.r_shoulder[0]} y2={lm.r_shoulder[1]}
            stroke={neckColor} strokeWidth="0.003" strokeLinecap="round" opacity="0.4"
            strokeDasharray="0.008 0.006"
          />
        </svg>
      )}
      {/* Posture text moved to app footer — SVG overlay only here */}
    </>
  );
};


/* ── Posture waiting state ── */

const PostureWaiting: React.FC<{ calibrated: boolean }> = ({ calibrated }) => (
  <div className="absolute bottom-1.5 left-1.5 right-1.5 pointer-events-none rounded-md border border-white/20 bg-black/60 backdrop-blur-sm px-2 py-1.5">
    <span className="text-[10px] text-white/60">
      {calibrated
        ? "🧘 자세 분석 대기 중..."
        : "🧘 설정에서 캘리브레이션을 먼저 완료해주세요"}
    </span>
  </div>
);
