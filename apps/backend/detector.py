"""Face detection and distance estimation using MediaPipe."""

import math
import time
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np

# MediaPipe import - support both legacy (solutions) and new (tasks) API
import mediapipe as mp

_USE_TASKS_API = False
_HAS_LEGACY = False

# Check which API is available
try:
    _face_mesh_module = mp.solutions.face_mesh
    _HAS_LEGACY = True
except AttributeError:
    _HAS_LEGACY = False

if not _HAS_LEGACY:
    _USE_TASKS_API = True
    try:
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision
    except ImportError:
        raise ImportError(
            "mediapipe가 설치되어 있지만 사용 가능한 API를 찾을 수 없습니다. "
            "pip install 'mediapipe>=0.10.9,<1.0.0' 으로 재설치해주세요."
        )


@dataclass
class DetectionResult:
    """Result of face detection and distance estimation."""
    face_detected: bool = False
    distance_cm: float = 0.0
    warning_level: int = 0  # 0=safe, 1=caution, 2=warning, 3=danger
    ied_pixels: float = 0.0
    head_tilt_deg: float = 0.0
    face_bbox: tuple = (0, 0, 0, 0)  # x, y, w, h normalized
    landmarks_drawn: bool = False
    raw_landmarks: Any = None  # Face landmark data (used by frontend for emoji overlay)


@dataclass
class CalibrationState:
    """State for calibration process."""
    is_running: bool = False
    start_time: float = 0.0
    duration: float = 3.0
    samples: list[float] = field(default_factory=list)
    reference_distance_cm: float = 50.0
    result_ied: float = 0.0
    is_complete: bool = False
    progress: float = 0.0


class _LandmarkProxy:
    """Adapts new-API landmark format to look like legacy format."""
    def __init__(self, x: float, y: float, z: float = 0.0):
        self.x = x
        self.y = y
        self.z = z


class FaceDetector:
    """MediaPipe-based face detector with distance estimation."""

    # MediaPipe Face Mesh landmark indices
    LEFT_EYE_INNER = 133
    RIGHT_EYE_INNER = 362
    LEFT_EYE_OUTER = 33
    RIGHT_EYE_OUTER = 263
    NOSE_TIP = 1
    CHIN = 152
    LEFT_EAR = 234
    RIGHT_EAR = 454

    def __init__(self):
        # Calibration
        self._calibration = CalibrationState()

        # Reference values (set after calibration)
        self._ref_distance_cm: float = 50.0
        self._ref_ied_pixels: float = 0.0
        self._is_calibrated: bool = False

        # Warning thresholds (distance in cm)
        self._warning_thresholds: list[tuple[bool, float]] = [
            (True, 45.0),
            (True, 35.0),
            (True, 25.0),
        ]

        # Face yaw threshold (degrees) - ignore detection beyond this angle
        self._face_yaw_threshold_deg: float = 45.0

        if _USE_TASKS_API:
            self._init_tasks_api()
        else:
            self._init_legacy_api()

    def _init_legacy_api(self):
        """Initialize using mp.solutions (mediapipe < 1.0)."""
        self._use_tasks = False
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def _init_tasks_api(self):
        """Initialize using mediapipe.tasks.vision (mediapipe >= 1.0)."""
        self._use_tasks = True
        base_options = mp_python.BaseOptions(
            model_asset_path=self._find_face_mesh_model(),
        )
        options = mp_vision.FaceLandmarkerOptions(
            base_options=base_options,
            running_mode=mp_vision.RunningMode.VIDEO,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        self.face_landmarker = mp_vision.FaceLandmarker.create_from_options(options)
        self._frame_timestamp_ms = 0

    @staticmethod
    def _find_face_mesh_model() -> str:
        """Locate the face_landmarker model, download if needed."""
        import pathlib
        import os
        import tempfile

        mp_root = pathlib.Path(mp.__file__).parent

        # Search known locations within the mediapipe package
        search_paths = [
            mp_root / "modules" / "face_landmarker" / "face_landmarker.task",
            mp_root / "tasks" / "testdata" / "face_landmarker.task",
            mp_root / "model_maker" / "models" / "face_landmarker" / "face_landmarker.task",
        ]

        # Also search recursively for any .task file with 'face_landmarker' in the name
        for task_file in mp_root.rglob("face_landmarker*.task"):
            search_paths.append(task_file)

        for candidate in search_paths:
            if candidate.exists():
                print(f"[거북이 키우기] Found model: {candidate}")
                return str(candidate)

        # Cache directory for downloaded model
        cache_dir = os.path.join(
            os.environ.get("XDG_CACHE_HOME", os.path.join(str(pathlib.Path.home()), ".cache")),
            "faceguard",
        )
        os.makedirs(cache_dir, exist_ok=True)
        model_path = os.path.join(cache_dir, "face_landmarker.task")

        if os.path.exists(model_path):
            print(f"[거북이 키우기] Using cached model: {model_path}")
            return model_path

        # Download from Google Storage
        url = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
        print(f"[거북이 키우기] Downloading face_landmarker model...")
        try:
            import urllib.request
            urllib.request.urlretrieve(url, model_path)
            print(f"[거북이 키우기] Model saved to: {model_path}")
            return model_path
        except Exception as e:
            raise RuntimeError(
                f"face_landmarker.task 모델을 찾거나 다운로드할 수 없습니다.\n"
                f"수동 다운로드: {url}\n"
                f"저장 위치: {model_path}\n"
                f"에러: {e}"
            )

    def set_calibration(self, ref_distance: float, ref_ied: float) -> None:
        """Set calibration data from saved settings."""
        self._ref_distance_cm = ref_distance
        self._ref_ied_pixels = ref_ied
        self._is_calibrated = ref_ied > 0

    def set_warning_thresholds(self, thresholds: list[tuple[bool, float]]) -> None:
        """Set warning level thresholds. List of (enabled, distance_cm)."""
        self._warning_thresholds = thresholds

    def set_face_yaw_threshold(self, degrees: float) -> None:
        """Set the face yaw angle threshold for ignoring detection."""
        self._face_yaw_threshold_deg = degrees

    def start_calibration(self, reference_distance_cm: float = 50.0, duration: float = 3.0) -> None:
        """Start calibration process."""
        self._calibration = CalibrationState(
            is_running=True,
            start_time=time.time(),
            duration=duration,
            reference_distance_cm=reference_distance_cm,
        )

    def get_calibration_state(self) -> CalibrationState:
        """Get current calibration state."""
        return self._calibration

    def _calculate_ied(self, landmarks, frame_width: int) -> float:
        """Calculate Inter-Eye Distance in pixels."""
        left_eye = landmarks[self.LEFT_EYE_OUTER]
        right_eye = landmarks[self.RIGHT_EYE_OUTER]

        lx, ly = left_eye.x * frame_width, left_eye.y * frame_width
        rx, ry = right_eye.x * frame_width, right_eye.y * frame_width

        return math.sqrt((rx - lx) ** 2 + (ry - ly) ** 2)

    def _calculate_head_tilt(self, landmarks) -> float:
        """Calculate head tilt angle in degrees."""
        nose = landmarks[self.NOSE_TIP]
        chin = landmarks[self.CHIN]
        left_ear = landmarks[self.LEFT_EAR]
        right_ear = landmarks[self.RIGHT_EAR]

        # Roll angle (left-right tilt)
        ear_dx = right_ear.x - left_ear.x
        ear_dy = right_ear.y - left_ear.y
        roll = math.degrees(math.atan2(ear_dy, ear_dx))

        return abs(roll)

    def _calculate_face_yaw(self, landmarks) -> float:
        """Calculate face yaw angle in degrees.

        Uses nose tip position relative to face center (defined by left/right ear landmarks).
        When nose is centered between ears, yaw ≈ 0.
        When nose shifts to one side, yaw increases.
        Returns angle in degrees (negative for right turn, positive for left turn).
        """
        nose = landmarks[self.NOSE_TIP]
        left_ear = landmarks[self.LEFT_EAR]
        right_ear = landmarks[self.RIGHT_EAR]

        # Face center in x-axis (between ears)
        face_center_x = (left_ear.x + right_ear.x) / 2.0

        # Distance of nose from face center (normalized)
        nose_offset = nose.x - face_center_x

        # Distance between ears (normalized)
        ear_distance = abs(right_ear.x - left_ear.x)

        if ear_distance <= 0:
            return 0.0

        # Calculate yaw as a proportion of ear distance
        # Assuming maximum yaw of ~90 degrees when nose reaches ear position
        yaw_radians = math.atan2(nose_offset, ear_distance / 2.0)
        yaw_degrees = math.degrees(yaw_radians)

        return yaw_degrees

    def _estimate_distance(self, ied_pixels: float) -> float:
        """Estimate distance using calibrated IED reference."""
        if not self._is_calibrated or ied_pixels <= 0:
            return 0.0

        distance = (self._ref_distance_cm * self._ref_ied_pixels) / ied_pixels
        return round(distance, 1)

    def _determine_warning_level(self, distance_cm: float) -> int:
        """Determine warning level based on distance. Returns 0-3."""
        if distance_cm <= 0:
            return 0

        # Check from highest danger (closest distance) to lowest
        for i in range(len(self._warning_thresholds) - 1, -1, -1):
            enabled, threshold = self._warning_thresholds[i]
            if enabled and distance_cm <= threshold:
                return i + 1  # 1-indexed warning level

        return 0  # Safe

    def _extract_landmarks(self, frame: np.ndarray):
        """Extract face landmarks using whichever API is available.
        Returns a list of landmark objects with .x, .y attributes, or None.
        """
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        if self._use_tasks:
            # Tasks API (mediapipe >= 1.0)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            self._frame_timestamp_ms += 33  # ~30fps
            result = self.face_landmarker.detect_for_video(mp_image, self._frame_timestamp_ms)
            if not result.face_landmarks:
                return None
            # Convert to proxy objects with .x, .y
            raw = result.face_landmarks[0]
            return [_LandmarkProxy(lm.x, lm.y, lm.z) for lm in raw]
        else:
            # Legacy solutions API
            mp_result = self.face_mesh.process(rgb_frame)
            if not mp_result.multi_face_landmarks:
                return None
            return mp_result.multi_face_landmarks[0].landmark

    def detect(self, frame: np.ndarray) -> DetectionResult:
        """Process a frame and return detection result."""
        result = DetectionResult()
        h, w, _ = frame.shape

        landmarks = self._extract_landmarks(frame)
        if landmarks is None:
            return result

        result.face_detected = True

        # Calculate IED
        ied = self._calculate_ied(landmarks, w)
        result.ied_pixels = round(ied, 2)

        # Calculate head tilt
        result.head_tilt_deg = round(self._calculate_head_tilt(landmarks), 1)

        # Calculate face yaw and compensate IED
        yaw_deg = self._calculate_face_yaw(landmarks)
        yaw_rad = math.radians(yaw_deg)

        # Check if yaw angle exceeds the configured threshold
        # Even if turned too much, keep face_detected=True and raw_landmarks
        # so the emoji mask still renders — just skip distance/warning.
        if abs(yaw_deg) > self._face_yaw_threshold_deg:
            # Face is turned too much - distance estimation unreliable
            result.distance_cm = 0.0
            result.warning_level = 0
            # Still store landmarks for emoji mask
            result.raw_landmarks = landmarks
            xs = [lm.x for lm in landmarks]
            ys = [lm.y for lm in landmarks]
            margin = 0.02
            result.face_bbox = (
                max(0, min(xs) - margin),
                max(0, min(ys) - margin),
                min(1, max(xs) + margin) - max(0, min(xs) - margin),
                min(1, max(ys) + margin) - max(0, min(ys) - margin),
            )
            return result

        # Handle calibration
        if self._calibration.is_running:
            elapsed = time.time() - self._calibration.start_time
            self._calibration.progress = min(elapsed / self._calibration.duration, 1.0)

            if elapsed < self._calibration.duration:
                self._calibration.samples.append(ied)
            else:
                # Calibration complete
                if self._calibration.samples:
                    avg_ied = sum(self._calibration.samples) / len(self._calibration.samples)
                    self._calibration.result_ied = round(avg_ied, 2)
                    self._calibration.is_complete = True
                    self._calibration.is_running = False

                    # Apply calibration
                    self._ref_ied_pixels = avg_ied
                    self._ref_distance_cm = self._calibration.reference_distance_cm
                    self._is_calibrated = True

        # Estimate distance using raw IED (no yaw compensation —
        # over-compensation made turning head trigger false warnings)
        distance = self._estimate_distance(ied)
        result.distance_cm = distance

        # Determine warning level
        result.warning_level = self._determine_warning_level(distance)

        # Store raw landmarks for emoji mask rendering
        result.raw_landmarks = landmarks

        # Calculate face bounding box (normalized)
        xs = [lm.x for lm in landmarks]
        ys = [lm.y for lm in landmarks]
        margin = 0.02
        result.face_bbox = (
            max(0, min(xs) - margin),
            max(0, min(ys) - margin),
            min(1, max(xs) + margin) - max(0, min(xs) - margin),
            min(1, max(ys) + margin) - max(0, min(ys) - margin),
        )

        return result

    def draw_landmarks(self, frame: np.ndarray, result: DetectionResult) -> np.ndarray:
        """Draw face bounding box and distance text on frame."""
        h, w, _ = frame.shape

        if not result.face_detected:
            return frame

        # Draw face bounding box
        bx, by, bw, bh = result.face_bbox
        x1, y1 = int(bx * w), int(by * h)
        x2, y2 = int((bx + bw) * w), int((by + bh) * h)

        # Color based on warning level
        colors = {
            0: (0, 200, 0),    # Green - safe
            1: (0, 220, 255),  # Yellow - caution
            2: (0, 140, 255),  # Orange - warning
            3: (0, 0, 255),    # Red - danger
        }
        color = colors.get(result.warning_level, (0, 200, 0))

        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        # Draw distance text
        if result.distance_cm > 0:
            text = f"{result.distance_cm:.1f}cm"
            cv2.putText(frame, text, (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

        return frame

    def release(self):
        """Release resources."""
        if self._use_tasks:
            self.face_landmarker.close()
        else:
            self.face_mesh.close()
