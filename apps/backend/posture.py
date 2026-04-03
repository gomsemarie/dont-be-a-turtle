"""Posture analysis using MediaPipe Pose.

Detects three posture problems for seated developers:
1. Forward head posture (거북목) — ear drops below shoulder line
2. Slouching (구부정) — shoulder-hip vertical alignment breaks
3. Lateral tilt (삐뚤어짐) — left/right shoulder height imbalance

Uses a personal calibration baseline ("my good posture") so thresholds
adapt to each user's body proportions and webcam angle.
"""

import math
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import mediapipe as mp

# ─── Detect which MediaPipe API is available ────────────────────
_POSE_HAS_LEGACY = False
_POSE_USE_TASKS = False

try:
    _pose_module = mp.solutions.pose
    _POSE_HAS_LEGACY = True
except AttributeError:
    _POSE_HAS_LEGACY = False

if not _POSE_HAS_LEGACY:
    _POSE_USE_TASKS = True
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision


class _LandmarkProxy:
    """Adapts Tasks API landmark to look like legacy format (.x, .y, .visibility)."""
    __slots__ = ("x", "y", "z", "visibility")
    def __init__(self, x: float, y: float, z: float = 0.0, visibility: float = 1.0):
        self.x = x
        self.y = y
        self.z = z
        self.visibility = visibility


# ─── MediaPipe Pose landmark indices (same for both APIs) ───────
# https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
_LEFT_EAR = 7
_RIGHT_EAR = 8
_LEFT_SHOULDER = 11
_RIGHT_SHOULDER = 12
_LEFT_HIP = 23
_RIGHT_HIP = 24
_NOSE = 0


@dataclass
class PostureResult:
    """Result of a single posture analysis frame."""
    detected: bool = False

    # Raw measurements (degrees / ratio)
    forward_head_angle: float = 0.0     # ear-shoulder vertical angle (bigger = worse)
    slouch_angle: float = 0.0           # shoulder-hip forward lean angle
    lateral_tilt_deg: float = 0.0       # shoulder tilt left/right

    # Deviation from calibrated baseline (0 = perfect, >1 = threshold exceeded)
    forward_head_ratio: float = 0.0     # deviation / threshold
    slouch_ratio: float = 0.0
    lateral_tilt_ratio: float = 0.0

    # Warning flags
    forward_head_warning: bool = False
    slouch_warning: bool = False
    lateral_tilt_warning: bool = False

    # Overall posture warning level 0=good, 1=mild, 2=bad
    posture_warning_level: int = 0
    posture_message: str = ""

    # Visibility confidence (0-1) — low means landmarks are unreliable
    visibility: float = 0.0

    # Normalized landmark coordinates for visual overlay [x, y] in 0-1 range
    landmarks: Optional[dict] = None  # {l_ear, r_ear, l_sh, r_sh, nose, ...}


@dataclass
class PostureCalibration:
    """Calibrated 'good posture' baseline for a user."""
    is_calibrated: bool = False
    # Baseline measurements captured during calibration
    baseline_forward_head: float = 0.0
    baseline_slouch: float = 0.0
    baseline_lateral_tilt: float = 0.0
    # Shoulder width in pixels (for normalization)
    baseline_shoulder_width: float = 0.0
    timestamp: float = 0.0

    def to_dict(self) -> dict:
        return {
            "is_calibrated": self.is_calibrated,
            "baseline_forward_head": round(self.baseline_forward_head, 2),
            "baseline_slouch": round(self.baseline_slouch, 2),
            "baseline_lateral_tilt": round(self.baseline_lateral_tilt, 2),
            "baseline_shoulder_width": round(self.baseline_shoulder_width, 2),
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "PostureCalibration":
        return cls(
            is_calibrated=d.get("is_calibrated", False),
            baseline_forward_head=d.get("baseline_forward_head", 0.0),
            baseline_slouch=d.get("baseline_slouch", 0.0),
            baseline_lateral_tilt=d.get("baseline_lateral_tilt", 0.0),
            baseline_shoulder_width=d.get("baseline_shoulder_width", 0.0),
            timestamp=d.get("timestamp", 0.0),
        )


class PostureAnalyzer:
    """MediaPipe Pose-based posture analyzer for seated users.

    Designed to run at low frequency (every 2-3 seconds) alongside
    the existing Face Mesh detector which handles distance estimation.
    """

    def __init__(self):
        self._use_tasks = _POSE_USE_TASKS

        if self._use_tasks:
            self._init_tasks_api()
        else:
            self._init_legacy_api()

        # Calibration
        self._calibration = PostureCalibration()
        self._calibrating = False
        self._cal_start: float = 0.0
        self._cal_duration: float = 3.0
        self._cal_samples: list[tuple[float, float, float, float]] = []  # (fh_ratio, sl_ratio, lt_deg, sh_width)

        # Thresholds — how much deviation from baseline triggers warning
        # forward_head: ratio drop (ear-shoulder y-distance / shoulder width)
        # slouch: ratio drop (nose-shoulder y-distance / shoulder width)
        # lateral_tilt: degrees deviation
        self._forward_head_threshold: float = 0.06   # ratio deviation (quite sensitive)
        self._slouch_threshold: float = 0.08          # ratio deviation
        self._lateral_tilt_threshold: float = 6.0     # degrees deviation

        # Smoothing (exponential moving average)
        self._ema_alpha: float = 0.5  # slightly more responsive
        self._ema_fh: float = 0.0
        self._ema_sl: float = 0.0
        self._ema_lt: float = 0.0
        self._ema_initialized: bool = False

    def _init_legacy_api(self) -> None:
        """Initialize using mp.solutions.pose (mediapipe < 1.0)."""
        self._pose = mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=0,
            smooth_landmarks=True,
            enable_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._frame_timestamp_ms = 0

    def _init_tasks_api(self) -> None:
        """Initialize using mediapipe.tasks.vision (mediapipe >= 1.0)."""
        model_path = self._find_pose_model()
        base_options = mp_python.BaseOptions(model_asset_path=model_path)
        options = mp_vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=mp_vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._pose_landmarker = mp_vision.PoseLandmarker.create_from_options(options)
        self._frame_timestamp_ms = 0

    @staticmethod
    def _find_pose_model() -> str:
        """Locate the pose_landmarker model, download if needed."""
        import os
        import pathlib

        mp_root = pathlib.Path(mp.__file__).parent

        # Search within mediapipe package
        for task_file in mp_root.rglob("pose_landmarker*.task"):
            print(f"[Posture] Found model: {task_file}")
            return str(task_file)

        # Cache directory
        cache_dir = os.path.join(
            os.environ.get("XDG_CACHE_HOME", os.path.join(str(pathlib.Path.home()), ".cache")),
            "faceguard",
        )
        os.makedirs(cache_dir, exist_ok=True)
        model_path = os.path.join(cache_dir, "pose_landmarker_lite.task")

        if os.path.exists(model_path):
            print(f"[Posture] Using cached model: {model_path}")
            return model_path

        # Download lite model
        url = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
        print(f"[Posture] Downloading pose_landmarker_lite model...")
        try:
            import ssl
            import urllib.request
            # Try normal download first, fall back to unverified SSL (macOS Python often lacks certs)
            try:
                urllib.request.urlretrieve(url, model_path)
            except (ssl.SSLCertVerificationError, Exception):
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, context=ctx) as resp, open(model_path, "wb") as f:
                    f.write(resp.read())
            print(f"[Posture] Model saved to: {model_path}")
            return model_path
        except Exception as e:
            raise RuntimeError(
                f"pose_landmarker model을 찾거나 다운로드할 수 없습니다.\n"
                f"수동 다운로드: {url}\n"
                f"저장 위치: {model_path}\n"
                f"에러: {e}"
            )

    @property
    def calibration(self) -> PostureCalibration:
        return self._calibration

    def set_calibration(self, cal: PostureCalibration) -> None:
        """Restore calibration from saved settings."""
        self._calibration = cal

    def set_thresholds(
        self,
        forward_head: Optional[float] = None,
        slouch: Optional[float] = None,
        lateral_tilt: Optional[float] = None,
    ) -> None:
        if forward_head is not None:
            self._forward_head_threshold = forward_head
        if slouch is not None:
            self._slouch_threshold = slouch
        if lateral_tilt is not None:
            self._lateral_tilt_threshold = lateral_tilt

    # ─── Calibration ────────────────────────────────────────────

    def start_calibration(self, duration: float = 3.0) -> None:
        """Start posture calibration — user should sit in good posture."""
        self._calibrating = True
        self._cal_start = time.time()
        self._cal_duration = duration
        self._cal_samples = []
        self._ema_initialized = False

    def is_calibrating(self) -> bool:
        return self._calibrating

    def calibration_progress(self) -> float:
        if not self._calibrating:
            return 1.0 if self._calibration.is_calibrated else 0.0
        elapsed = time.time() - self._cal_start
        return min(elapsed / self._cal_duration, 1.0)

    def _finish_calibration(self) -> None:
        """Average samples and set baseline."""
        if not self._cal_samples:
            self._calibrating = False
            return

        n = len(self._cal_samples)
        avg_fh = sum(s[0] for s in self._cal_samples) / n
        avg_sl = sum(s[1] for s in self._cal_samples) / n
        avg_lt = sum(s[2] for s in self._cal_samples) / n
        avg_sw = sum(s[3] for s in self._cal_samples) / n

        self._calibration = PostureCalibration(
            is_calibrated=True,
            baseline_forward_head=avg_fh,
            baseline_slouch=avg_sl,
            baseline_lateral_tilt=avg_lt,
            baseline_shoulder_width=avg_sw,
            timestamp=time.time(),
        )
        self._calibrating = False
        self._ema_initialized = False
        print(f"[Posture] Calibration complete: fh={avg_fh:.1f}° sl={avg_sl:.1f}° lt={avg_lt:.1f}° sw={avg_sw:.0f}px")

    # ─── Landmark extraction ──────────────────────────────────────

    def _extract_landmarks(self, rgb_frame: np.ndarray):
        """Extract pose landmarks using whichever API is available.
        Returns a list of landmark-like objects with .x, .y, .visibility, or None.
        """
        if self._use_tasks:
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            self._frame_timestamp_ms += 100  # ~10fps equivalent
            result = self._pose_landmarker.detect_for_video(mp_image, self._frame_timestamp_ms)
            if not result.pose_landmarks:
                return None
            raw = result.pose_landmarks[0]
            # Tasks API landmarks have .x, .y, .z but .visibility might be missing
            return [
                _LandmarkProxy(lm.x, lm.y, lm.z, getattr(lm, "visibility", getattr(lm, "presence", 1.0)))
                for lm in raw
            ]
        else:
            pose_result = self._pose.process(rgb_frame)
            if not pose_result.pose_landmarks:
                return None
            return pose_result.pose_landmarks.landmark

    # ─── Core Analysis ──────────────────────────────────────────

    def analyze(self, frame: np.ndarray) -> PostureResult:
        """Analyze a single frame for posture.

        Should be called every 2-3 seconds, not every frame.
        """
        result = PostureResult()
        h, w, _ = frame.shape

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        lms = self._extract_landmarks(rgb)

        if lms is None:
            return result

        # Check visibility of CORE landmarks (ears + shoulders — always needed)
        core_indices = [_LEFT_EAR, _RIGHT_EAR, _LEFT_SHOULDER, _RIGHT_SHOULDER]
        core_vis = min(lms[i].visibility for i in core_indices)
        result.visibility = core_vis

        if core_vis < 0.4:
            # Core landmarks not reliable enough
            return result

        result.detected = True

        # Hip landmarks are optional (desk webcams often crop them out)
        hip_vis = min(lms[_LEFT_HIP].visibility, lms[_RIGHT_HIP].visibility)
        has_hips = hip_vis >= 0.3

        # ── Extract pixel coordinates ──
        def px(idx):
            return lms[idx].x * w, lms[idx].y * h

        l_ear_x, l_ear_y = px(_LEFT_EAR)
        r_ear_x, r_ear_y = px(_RIGHT_EAR)
        l_sh_x, l_sh_y = px(_LEFT_SHOULDER)
        r_sh_x, r_sh_y = px(_RIGHT_SHOULDER)
        if has_hips:
            l_hip_x, l_hip_y = px(_LEFT_HIP)
            r_hip_x, r_hip_y = px(_RIGHT_HIP)

        # Midpoints
        ear_mid_x = (l_ear_x + r_ear_x) / 2
        ear_mid_y = (l_ear_y + r_ear_y) / 2
        sh_mid_x = (l_sh_x + r_sh_x) / 2
        sh_mid_y = (l_sh_y + r_sh_y) / 2
        if has_hips:
            hip_mid_x = (l_hip_x + r_hip_x) / 2
            hip_mid_y = (l_hip_y + r_hip_y) / 2

        shoulder_width = math.dist((l_sh_x, l_sh_y), (r_sh_x, r_sh_y))
        if shoulder_width < 10:
            return result  # Too small to be reliable

        # ── 1. Forward Head (거북목) ──
        # Use ear-to-shoulder y-distance normalized by shoulder width.
        # When head pushes forward, ears drop closer to shoulder level.
        # Higher ratio = ears well above shoulders = good posture.
        ear_sh_y_dist = sh_mid_y - ear_mid_y  # positive = ear above shoulder
        forward_head_ratio_raw = ear_sh_y_dist / shoulder_width
        result.forward_head_angle = round(forward_head_ratio_raw, 4)

        # ── 2. Slouch (구부정) ──
        # Use nose-to-shoulder y-distance / shoulder width.
        # When slouching, nose drops lower (closer to shoulder level).
        # Also works without hips — uses nose instead.
        nose_x, nose_y = px(_NOSE)
        nose_sh_y_dist = sh_mid_y - nose_y  # positive = nose above shoulder
        slouch_ratio_raw = nose_sh_y_dist / shoulder_width
        result.slouch_angle = round(slouch_ratio_raw, 4)

        # ── 3. Lateral Tilt (기울기) ──
        # Use abs(dx) to avoid ±180° flip when shoulders swap sides in image
        dx_lt = r_sh_x - l_sh_x
        dy_lt = r_sh_y - l_sh_y
        lateral_tilt = math.degrees(math.atan2(dy_lt, abs(dx_lt) + 1e-6))
        result.lateral_tilt_deg = round(lateral_tilt, 1)

        # ── Smoothing (EMA) ──
        if not self._ema_initialized:
            self._ema_fh = forward_head_ratio_raw
            self._ema_sl = slouch_ratio_raw
            self._ema_lt = lateral_tilt
            self._ema_initialized = True
        else:
            a = self._ema_alpha
            self._ema_fh = a * forward_head_ratio_raw + (1 - a) * self._ema_fh
            self._ema_sl = a * slouch_ratio_raw + (1 - a) * self._ema_sl
            self._ema_lt = a * lateral_tilt + (1 - a) * self._ema_lt

        smooth_fh = self._ema_fh
        smooth_sl = self._ema_sl
        smooth_lt = self._ema_lt

        # ── Populate normalized landmark coordinates for visual overlay ──
        def norm(idx):
            return [round(lms[idx].x, 4), round(lms[idx].y, 4)]

        result.landmarks = {
            "l_ear": norm(_LEFT_EAR),
            "r_ear": norm(_RIGHT_EAR),
            "l_shoulder": norm(_LEFT_SHOULDER),
            "r_shoulder": norm(_RIGHT_SHOULDER),
            "nose": norm(_NOSE),
            "ear_mid": [round(ear_mid_x / w, 4), round(ear_mid_y / h, 4)],
            "sh_mid": [round(sh_mid_x / w, 4), round(sh_mid_y / h, 4)],
        }
        if has_hips:
            result.landmarks["l_hip"] = norm(_LEFT_HIP)
            result.landmarks["r_hip"] = norm(_RIGHT_HIP)
            result.landmarks["hip_mid"] = [round(hip_mid_x / w, 4), round(hip_mid_y / h, 4)]

        # ── Calibration sampling ──
        if self._calibrating:
            elapsed = time.time() - self._cal_start
            if elapsed < self._cal_duration:
                self._cal_samples.append((smooth_fh, smooth_sl, smooth_lt, shoulder_width))
            else:
                self._finish_calibration()

        # ── Deviation from baseline ──
        if self._calibration.is_calibrated:
            # Forward head & slouch: higher ratio = better, so drop = bad
            fh_dev = self._calibration.baseline_forward_head - smooth_fh  # positive = worse
            sl_dev = self._calibration.baseline_slouch - smooth_sl        # positive = worse
            lt_dev = abs(smooth_lt - self._calibration.baseline_lateral_tilt)

            fh_ratio = max(0, fh_dev) / max(self._forward_head_threshold, 0.01)
            sl_ratio = max(0, sl_dev) / max(self._slouch_threshold, 0.01)
            lt_ratio = lt_dev / max(self._lateral_tilt_threshold, 0.1)

            # Clamp ratios to sane range (prevent display bugs like 1242%)
            fh_ratio = min(fh_ratio, 5.0)
            sl_ratio = min(sl_ratio, 5.0)
            lt_ratio = min(lt_ratio, 5.0)

            result.forward_head_ratio = round(fh_ratio, 2)
            result.slouch_ratio = round(sl_ratio, 2)
            result.lateral_tilt_ratio = round(lt_ratio, 2)

            # Debug: log measurements every analysis
            print(f"[Posture] fh={smooth_fh:.3f}(base={self._calibration.baseline_forward_head:.3f} dev={fh_dev:.3f} r={fh_ratio:.1f}) "
                  f"sl={smooth_sl:.3f}(base={self._calibration.baseline_slouch:.3f} dev={sl_dev:.3f} r={sl_ratio:.1f}) "
                  f"lt={smooth_lt:.1f}°(base={self._calibration.baseline_lateral_tilt:.1f}° dev={lt_dev:.1f}° r={lt_ratio:.1f})")

            # Warning flags (ratio > 1.0 = threshold exceeded)
            result.forward_head_warning = fh_ratio >= 1.0
            result.slouch_warning = sl_ratio >= 1.0
            result.lateral_tilt_warning = lt_ratio >= 1.0

            # Overall level
            max_ratio = max(fh_ratio, sl_ratio, lt_ratio)
            if max_ratio >= 1.5:
                result.posture_warning_level = 2
            elif max_ratio >= 1.0:
                result.posture_warning_level = 1
            else:
                result.posture_warning_level = 0

            # Message
            warnings = []
            if result.forward_head_warning:
                warnings.append("고개를 뒤로 당겨주세요")
            if result.slouch_warning:
                warnings.append("허리를 펴주세요")
            if result.lateral_tilt_warning:
                warnings.append("몸을 바르게 세워주세요")
            result.posture_message = " · ".join(warnings)

        return result

    def release(self) -> None:
        """Release MediaPipe Pose resources."""
        if self._use_tasks:
            self._pose_landmarker.close()
        else:
            self._pose.close()
