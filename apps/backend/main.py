"""거북이 키우기 Backend - FastAPI server for face distance monitoring."""

import asyncio
import base64
import json
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from camera import CameraManager
from config import AppSettings, CalibrationData, WarningLevel, load_settings, save_settings
from detector import FaceDetector


# ─── Load root config.json ───────────────────────────────────────
def _load_app_config() -> dict:
    """Load root config.json for app metadata (version, name, etc.)."""
    # Search: bundled (PyInstaller), parent dirs from source
    candidates = []
    if getattr(sys, 'frozen', False):
        candidates.append(Path(sys._MEIPASS) / "config.json")
    src_dir = Path(__file__).parent
    candidates.extend([
        src_dir / "config.json",
        src_dir.parent.parent / "config.json",  # repo root
    ])
    for p in candidates:
        if p.exists():
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
    return {}

_APP_CONFIG = _load_app_config()
APP_VERSION = _APP_CONFIG.get("app", {}).get("version", "1.2.0")
APP_NAME = _APP_CONFIG.get("app", {}).get("name", "거북이 키우기")
from history import WarningHistory
from posture import PostureAnalyzer, PostureCalibration
from turtle_rank import get_full_rank_info, load_ranks, load_scoring_rules, reset_score_state, add_good_posture_time


# ─── Version migration: clear data on version change ─────────
def _check_version_migration():
    """If the app version changed since last run, wipe user data so fresh defaults apply."""
    from config import get_config_dir
    data_dir = get_config_dir()
    version_file = data_dir / ".app_version"

    prev_version = ""
    if version_file.exists():
        try:
            prev_version = version_file.read_text(encoding="utf-8").strip()
        except Exception:
            pass

    if prev_version != APP_VERSION:
        print(f"[Migration] 버전 변경 감지: {prev_version or '(없음)'} → {APP_VERSION}, 데이터 초기화")
        # Remove user data files (settings, history, scores, rank/scoring overrides)
        for fname in [
            "settings.json",
            "warning_history.json",
            "turtle_score.json",
            "turtle_ranks.json",
            "scoring_rules.json",
        ]:
            target = data_dir / fname
            if target.exists():
                try:
                    target.unlink()
                    print(f"  삭제: {fname}")
                except Exception as e:
                    print(f"  삭제 실패: {fname} ({e})")
        # Write current version
        try:
            version_file.write_text(APP_VERSION, encoding="utf-8")
        except Exception:
            pass

_check_version_migration()


# Global instances
camera_manager = CameraManager()
face_detector = FaceDetector()
try:
    posture_analyzer = PostureAnalyzer()
except Exception as e:
    print(f"[Posture] 초기화 실패 (자세 감지 비활성화): {e}")
    posture_analyzer = None  # type: ignore
settings = load_settings()
# Reset monitoring flag on startup (monitoring doesn't survive restarts)
if settings.monitoring_active:
    settings.monitoring_active = False
    save_settings(settings)
warning_history = WarningHistory()

# Monitoring state
monitoring_active = False
break_timer_start: float = 0.0

# Shared posture state (written by distance stream, read by preview stream)
_posture_data: dict = {}
_active_posture_level: int = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager."""
    global settings
    # Apply saved calibration
    if settings.calibration.is_calibrated:
        face_detector.set_calibration(
            settings.calibration.reference_distance_cm,
            settings.calibration.reference_ied_pixels,
        )
    # Apply warning thresholds
    _apply_warning_thresholds()
    # Apply face yaw threshold
    face_detector.set_face_yaw_threshold(settings.face_yaw_threshold_deg)

    # Restore posture calibration & thresholds
    if posture_analyzer:
        if settings.posture_calibration:
            posture_analyzer.set_calibration(PostureCalibration.from_dict(settings.posture_calibration))
        posture_analyzer.set_thresholds(
            forward_head=settings.posture_forward_head_threshold,
            slouch=settings.posture_slouch_threshold,
            lateral_tilt=settings.posture_lateral_tilt_threshold,
        )

    # Open saved camera
    if settings.selected_camera_index >= 0:
        camera_manager.select_camera(settings.selected_camera_index)

    yield

    # Cleanup
    camera_manager.release()
    face_detector.release()
    if posture_analyzer:
        posture_analyzer.release()


app = FastAPI(title=f"{APP_NAME} Backend", version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _apply_warning_thresholds():
    """Apply current warning thresholds to detector."""
    thresholds = [
        (level.enabled, level.distance_cm)
        for level in settings.warning_levels
    ]
    face_detector.set_warning_thresholds(thresholds)


# ─── REST API Endpoints ───────────────────────────────────────────────


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": APP_VERSION}


@app.get("/api/cameras")
async def list_cameras(refresh: bool = False):
    """List available cameras. Pass refresh=true to force re-scan."""
    cameras = camera_manager.list_cameras(force=refresh)
    return {
        "cameras": cameras,
        "selected": camera_manager.current_index,
    }


class CameraSelectRequest(BaseModel):
    index: int


@app.post("/api/cameras/select")
async def select_camera(req: CameraSelectRequest):
    """Select a camera by index."""
    success = camera_manager.select_camera(req.index)
    if not success:
        raise HTTPException(status_code=400, detail=f"Cannot open camera {req.index}")
    settings.selected_camera_index = req.index
    save_settings(settings)
    return {"success": True, "index": req.index}


class CalibrationStartRequest(BaseModel):
    reference_distance_cm: float = 50.0
    duration: float = 3.0


@app.post("/api/calibrate/start")
async def start_calibration(req: CalibrationStartRequest):
    """Start calibration process."""
    if not camera_manager.is_open:
        raise HTTPException(status_code=400, detail="No camera selected")
    face_detector.start_calibration(req.reference_distance_cm, req.duration)
    return {"success": True, "message": "Calibration started"}


@app.get("/api/calibrate/status")
async def get_calibration_status():
    """Get calibration status."""
    state = face_detector.get_calibration_state()
    result = {
        "is_running": state.is_running,
        "progress": round(state.progress * 100, 1),
        "is_complete": state.is_complete,
    }
    if state.is_complete:
        result["reference_ied"] = state.result_ied
        result["reference_distance_cm"] = state.reference_distance_cm

        # Save calibration to settings
        settings.calibration = CalibrationData(
            reference_distance_cm=state.reference_distance_cm,
            reference_ied_pixels=state.result_ied,
            is_calibrated=True,
        )
        save_settings(settings)

    return result


@app.get("/api/settings")
async def get_settings():
    """Get current settings."""
    return settings.model_dump()


class UpdateSettingsRequest(BaseModel):
    warning_levels: list[WarningLevel] | None = None
    frame_rate: int | None = None
    break_reminder_enabled: bool | None = None
    break_reminder_interval_min: int | None = None
    break_chaos_level: int | None = None
    posture_detection_enabled: bool | None = None
    head_tilt_threshold_deg: float | None = None
    emoji_mask_enabled: bool | None = None
    emoji_mask_type: str | None = None
    face_yaw_threshold_deg: float | None = None
    warning_grace_sec: int | None = None
    notification_enabled: bool | None = None
    warning_messages: list[str] | None = None
    history_retention_days: int | None = None
    history_max_events: int | None = None
    score_multiplier: float | None = None
    posture_forward_head_threshold: float | None = None
    posture_slouch_threshold: float | None = None
    posture_lateral_tilt_threshold: float | None = None
    posture_check_interval_sec: float | None = None
    auto_break_enabled: bool | None = None
    auto_break_minutes: float | None = None
    admin_mode: bool | None = None


@app.put("/api/settings")
async def update_settings(req: UpdateSettingsRequest):
    """Update settings."""
    if req.warning_levels is not None:
        settings.warning_levels = req.warning_levels
        _apply_warning_thresholds()
    if req.frame_rate is not None:
        settings.frame_rate = req.frame_rate
    if req.break_reminder_enabled is not None:
        settings.break_reminder_enabled = req.break_reminder_enabled
    if req.break_reminder_interval_min is not None:
        settings.break_reminder_interval_min = req.break_reminder_interval_min
    if req.break_chaos_level is not None:
        settings.break_chaos_level = max(1, min(req.break_chaos_level, 10))
    if req.posture_detection_enabled is not None:
        settings.posture_detection_enabled = req.posture_detection_enabled
    if req.head_tilt_threshold_deg is not None:
        settings.head_tilt_threshold_deg = req.head_tilt_threshold_deg
    if req.emoji_mask_enabled is not None:
        settings.emoji_mask_enabled = req.emoji_mask_enabled
    if req.emoji_mask_type is not None:
        settings.emoji_mask_type = req.emoji_mask_type
    if req.face_yaw_threshold_deg is not None:
        settings.face_yaw_threshold_deg = req.face_yaw_threshold_deg
        face_detector.set_face_yaw_threshold(req.face_yaw_threshold_deg)
    if req.warning_grace_sec is not None:
        settings.warning_grace_sec = req.warning_grace_sec
    if req.notification_enabled is not None:
        settings.notification_enabled = req.notification_enabled
    if req.warning_messages is not None:
        settings.warning_messages = req.warning_messages
    if req.history_retention_days is not None:
        settings.history_retention_days = max(1, min(req.history_retention_days, 365))
    if req.history_max_events is not None:
        settings.history_max_events = max(100, min(req.history_max_events, 50000))
    if req.score_multiplier is not None:
        settings.score_multiplier = max(0.1, min(req.score_multiplier, 10.0))
    if req.posture_forward_head_threshold is not None:
        settings.posture_forward_head_threshold = max(0.02, min(req.posture_forward_head_threshold, 0.5))
        if posture_analyzer:
            posture_analyzer.set_thresholds(forward_head=settings.posture_forward_head_threshold)
    if req.posture_slouch_threshold is not None:
        settings.posture_slouch_threshold = max(0.02, min(req.posture_slouch_threshold, 0.5))
        if posture_analyzer:
            posture_analyzer.set_thresholds(slouch=settings.posture_slouch_threshold)
    if req.posture_lateral_tilt_threshold is not None:
        settings.posture_lateral_tilt_threshold = max(2.0, min(req.posture_lateral_tilt_threshold, 20.0))
        if posture_analyzer:
            posture_analyzer.set_thresholds(lateral_tilt=settings.posture_lateral_tilt_threshold)
    if req.posture_check_interval_sec is not None:
        settings.posture_check_interval_sec = max(0.3, min(req.posture_check_interval_sec, 10.0))
    if req.auto_break_enabled is not None:
        settings.auto_break_enabled = req.auto_break_enabled
    if req.auto_break_minutes is not None:
        settings.auto_break_minutes = max(1.0, min(req.auto_break_minutes, 30.0))
    if req.admin_mode is not None:
        settings.admin_mode = req.admin_mode

    save_settings(settings)
    return {"success": True}


@app.post("/api/monitor/start")
async def start_monitoring():
    """Start distance monitoring."""
    global monitoring_active, break_timer_start
    if not camera_manager.is_open:
        raise HTTPException(status_code=400, detail="No camera selected")
    monitoring_active = True
    break_timer_start = time.time()
    settings.monitoring_active = True
    save_settings(settings)
    return {"success": True}


@app.post("/api/monitor/stop")
async def stop_monitoring():
    """Stop distance monitoring."""
    global monitoring_active
    monitoring_active = False
    settings.monitoring_active = False
    save_settings(settings)
    return {"success": True}


# ─── Posture Calibration ─────────────────────────────────────────────

@app.post("/api/posture/calibrate")
async def start_posture_calibration():
    """Start posture calibration — user should sit in good posture.

    Runs an independent background loop that reads camera frames and
    feeds them to the posture analyzer for 3 seconds, so calibration
    works even when monitoring is not active.
    """
    if not posture_analyzer:
        raise HTTPException(status_code=503, detail="Posture analyzer not available")
    if not camera_manager.is_open:
        raise HTTPException(status_code=400, detail="No camera selected")
    if posture_analyzer.is_calibrating():
        return {"success": False, "message": "Calibration already in progress"}

    cal_duration = 3.0
    posture_analyzer.start_calibration(duration=cal_duration)

    # Background task: feed frames to analyzer during calibration period
    async def _calibration_loop():
        import time as _time
        end_time = _time.time() + cal_duration + 0.5  # small buffer
        while _time.time() < end_time and posture_analyzer.is_calibrating():
            frame = camera_manager.read_frame()
            if frame is not None:
                posture_analyzer.analyze(frame)
            await asyncio.sleep(0.15)  # ~7fps
        # Save calibration to settings if successful
        if posture_analyzer.calibration.is_calibrated:
            settings.posture_calibration = posture_analyzer.calibration.to_dict()
            save_settings(settings)

    asyncio.create_task(_calibration_loop())
    return {"success": True, "message": "Posture calibration started — sit up straight!", "duration": cal_duration}


@app.get("/api/posture/calibration")
async def get_posture_calibration():
    """Get posture calibration state."""
    if not posture_analyzer:
        return {"is_calibrated": False, "is_calibrating": False, "progress": 0, "calibration": None, "available": False}
    cal = posture_analyzer.calibration
    return {
        "is_calibrated": cal.is_calibrated,
        "is_calibrating": posture_analyzer.is_calibrating(),
        "progress": round(posture_analyzer.calibration_progress(), 2),
        "calibration": cal.to_dict() if cal.is_calibrated else None,
        "available": True,
    }


@app.post("/api/break/trigger")
async def trigger_break():
    """Manually trigger a break reminder."""
    return {"success": True, "break_chaos_level": settings.break_chaos_level}


@app.get("/api/monitor/status")
async def monitor_status():
    """Get monitoring status."""
    return {
        "active": monitoring_active,
        "camera_open": camera_manager.is_open,
        "calibrated": settings.calibration.is_calibrated,
    }


@app.get("/api/history")
async def get_history(days: int = 7):
    """Get warning history events."""
    return {"events": warning_history.get_history(days)}


@app.get("/api/history/retention")
async def get_history_retention():
    """Get history retention info."""
    return warning_history.get_retention_info()


@app.get("/api/history/stats")
async def get_history_stats(days: int = 7):
    """Get warning history statistics."""
    return warning_history.get_stats(days)


@app.post("/api/history/reset")
async def reset_history():
    """Clear all warning history data and reset cumulative score."""
    count = warning_history.clear_history()
    reset_score_state()
    return {"success": True, "removed": count}


@app.post("/api/settings/reset")
async def reset_settings():
    """Reset all settings to default values."""
    global settings
    settings = AppSettings()
    save_settings(settings)
    # Re-apply defaults to detector
    face_detector.set_face_yaw_threshold(settings.face_yaw_threshold_deg)
    return {"success": True}


class InjectTestDataRequest(BaseModel):
    scenario: str = "rank_up"  # rank_up | heavy | light


@app.post("/api/history/test-data")
async def inject_test_data(req: InjectTestDataRequest):
    """Inject fake warning events for testing. Dev/debug only."""
    count = warning_history.inject_test_data(req.scenario)
    return {"success": True, "injected": count, "scenario": req.scenario}


# ─── Turtle Rank Endpoints ───────────────────────────────────────────


@app.get("/api/rank")
async def get_rank_info():
    """Get current turtle rank, score, and rank change info."""
    events = warning_history.events
    multiplier = settings.score_multiplier if settings else 1.0
    return get_full_rank_info(events, score_multiplier=multiplier)


@app.get("/api/rank/config")
async def get_rank_config():
    """Get rank definitions and scoring rules (for display/editing)."""
    return {
        "ranks": load_ranks(),
        "scoring_rules": load_scoring_rules(),
    }


@app.put("/api/rank/config")
async def update_rank_config(request: Request):
    """Update rank definitions and/or scoring rules."""
    body = await request.json()
    from config import get_config_path
    data_dir = get_config_path().parent

    if "ranks" in body:
        ranks = body["ranks"]
        ranks_path = data_dir / "turtle_ranks.json"
        ranks_path.write_text(
            json.dumps({"ranks": ranks}, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )

    if "scoring_rules" in body:
        rules = body["scoring_rules"]
        rules_path = data_dir / "scoring_rules.json"
        rules_path.write_text(
            json.dumps(rules, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )

    return {"success": True}


@app.get("/api/ranks")
async def get_ranks():
    """Get list of all ranks for the pixel editor rank selector."""
    ranks = load_ranks()
    return {"ranks": ranks}


@app.post("/api/ranks/{level}/image")
async def upload_rank_image(level: int, file: UploadFile = File(...)):
    """Upload a rank image (PNG, 32x32 or 64x64 pixels)."""
    # Validate file is provided
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Read file contents
    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    # Validate PNG format
    if not contents.startswith(b'\x89PNG'):
        raise HTTPException(status_code=400, detail="File is not a valid PNG image")

    # Load and validate image dimensions using cv2
    try:
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        img = cv2.imread(tmp_path)
        Path(tmp_path).unlink()  # Clean up temp file

        if img is None:
            raise HTTPException(status_code=400, detail="Failed to read image data")

        height, width = img.shape[:2]
        if width not in (32, 64) or height not in (32, 64) or width != height:
            raise HTTPException(
                status_code=400,
                detail=f"Image dimensions must be 32x32 or 64x64 pixels, got {width}x{height}"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")

    # Determine filename based on level
    if level >= 0:
        if level == 0:
            filename = "rank-0.png"
        else:
            filename = f"rank-pos{level}.png"
    else:
        filename = f"rank-neg{abs(level)}.png"

    # Get project root (2 levels up from backend main.py)
    backend_dir = Path(__file__).parent
    project_root = backend_dir.parent.parent
    ranks_dir = project_root / "packages/ui/public/ranks"

    # Ensure directory exists
    ranks_dir.mkdir(parents=True, exist_ok=True)

    # Save the image
    target_path = ranks_dir / filename
    try:
        target_path.write_bytes(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")

    # Update turtle_ranks.json to set the image field for this rank
    try:
        ranks = load_ranks()
        for rank in ranks:
            if rank.get("level") == level:
                rank["image"] = filename
                break

        # Save updated ranks back to data directory
        from config import get_config_path
        data_dir = get_config_path().parent
        ranks_json_path = data_dir / "turtle_ranks.json"
        ranks_json_path.write_text(
            json.dumps({"ranks": ranks}, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )
    except Exception as e:
        # Log error but don't fail the upload if we can't update JSON
        print(f"[Warning] Failed to update turtle_ranks.json: {e}")

    return {
        "success": True,
        "filename": filename,
        "level": level,
        "path": f"packages/ui/public/ranks/{filename}",
        "dimensions": {"width": width, "height": height},
    }


@app.get("/api/version")
async def get_version():
    """Get app version."""
    return {"version": APP_VERSION}


GITHUB_REPO = "gomsemarie/dont-be-a-turtle"

@app.get("/api/update/check")
async def check_update():
    """Check for updates by comparing current version with latest GitHub release tag."""
    import urllib.request
    import urllib.error

    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        req = urllib.request.Request(url, headers={"Accept": "application/vnd.github.v3+json", "User-Agent": "DontBeATurtle"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

        latest_tag = data.get("tag_name", "")
        # Strip leading 'v' for comparison (e.g. "v1.3.0" → "1.3.0")
        latest_version = latest_tag.lstrip("v")
        html_url = data.get("html_url", "")
        body = data.get("body", "")
        published = data.get("published_at", "")

        # Simple semver compare
        def parse_ver(v: str) -> tuple[int, ...]:
            try:
                return tuple(int(x) for x in v.split("."))
            except Exception:
                return (0,)

        current = parse_ver(APP_VERSION)
        latest = parse_ver(latest_version)
        has_update = latest > current

        return {
            "has_update": has_update,
            "current_version": APP_VERSION,
            "latest_version": latest_version,
            "latest_tag": latest_tag,
            "release_url": html_url,
            "release_notes": body[:500] if body else "",
            "published_at": published,
        }
    except urllib.error.URLError:
        return {"has_update": False, "current_version": APP_VERSION, "error": "네트워크 연결 실패"}
    except Exception as e:
        return {"has_update": False, "current_version": APP_VERSION, "error": str(e)}


# ─── SSE Streaming Endpoints ──────────────────────────────────────────


async def _generate_preview_stream() -> AsyncGenerator[dict, None]:
    """Generate SSE events with preview frames."""
    global _posture_data, _active_posture_level
    frame_interval = 1.0 / settings.frame_rate

    # Preview-local posture analysis (so it works even when monitoring is off)
    _preview_last_posture: float = 0.0

    while True:
        frame = camera_manager.read_frame()
        if frame is not None:
            result = face_detector.detect(frame)
            frame = face_detector.draw_landmarks(frame, result)

            # Run posture analysis in preview too (every N seconds)
            now = time.time()
            posture_interval = settings.posture_check_interval_sec
            if (
                posture_analyzer
                and settings.posture_detection_enabled
                and result.face_detected
                and (now - _preview_last_posture) >= posture_interval
            ):
                _preview_last_posture = now
                try:
                    p_result = posture_analyzer.analyze(frame)
                    if p_result.detected:
                        _posture_data = {
                            "forward_head_ratio": p_result.forward_head_ratio,
                            "slouch_ratio": p_result.slouch_ratio,
                            "lateral_tilt_ratio": p_result.lateral_tilt_ratio,
                            "posture_warning_level": p_result.posture_warning_level,
                            "posture_message": p_result.posture_message,
                            "forward_head_warning": p_result.forward_head_warning,
                            "slouch_warning": p_result.slouch_warning,
                            "lateral_tilt_warning": p_result.lateral_tilt_warning,
                            "visibility": round(p_result.visibility, 2),
                            "landmarks": p_result.landmarks,
                        }
                    else:
                        print(f"[Posture/Preview] Not detected (visibility={p_result.visibility:.2f})")
                except Exception as e:
                    print(f"[Posture/Preview] Error: {e}")

            # Encode frame as JPEG
            _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            b64 = base64.b64encode(buffer).decode("utf-8")

            yield {
                "event": "frame",
                "data": json.dumps({
                    "image": f"data:image/jpeg;base64,{b64}",
                    "face_detected": result.face_detected,
                    "distance_cm": result.distance_cm,
                    "ied_pixels": result.ied_pixels,
                    "face_bbox": result.face_bbox if result.face_detected else None,
                    "posture": _posture_data if _posture_data else None,
                }),
            }
        else:
            yield {
                "event": "frame",
                "data": json.dumps({"image": None, "face_detected": False}),
            }

        await asyncio.sleep(frame_interval)


@app.get("/api/stream/preview")
async def stream_preview():
    """SSE endpoint for camera preview with face detection overlay."""
    if not camera_manager.is_open:
        raise HTTPException(status_code=400, detail="No camera selected")
    return EventSourceResponse(_generate_preview_stream())


async def _generate_distance_stream() -> AsyncGenerator[dict, None]:
    """Generate SSE events with distance data."""
    global break_timer_start, _posture_data, _active_posture_level
    frame_interval = 1.0 / min(settings.frame_rate, 10)  # Max 10 fps for distance

    # Grace period tracking: only fire alert after sustained warning
    warning_entered_at: float = 0.0  # timestamp when warning_level first became > 0
    active_alert_level: int = 0  # the level currently being alerted (after grace)
    warning_exited_at: float = 0.0  # timestamp when warning_level last dropped to 0
    _GRACE_COOLDOWN: float = 1.5  # seconds: brief dips above threshold don't reset grace

    # Track previous rank levels to detect rank changes
    _prev_rank_levels: dict[str, int] = {}
    _rank_check_counter = 0
    # Good posture tracking: accumulate time with no warnings for positive scoring
    _last_good_posture_ts: float = 0.0
    _good_posture_accum: float = 0.0

    # Auto-break: trigger break when face not detected for N minutes
    _face_lost_at: float = 0.0  # timestamp when face was last lost (0 = face visible)
    _auto_break_triggered: bool = False  # prevent repeated triggers

    # Posture analysis (runs every N seconds, not every frame)
    _last_posture_check: float = 0.0
    _posture_grace_start: float = 0.0
    _POSTURE_GRACE_SEC: float = 2.0  # 2 second grace for posture warnings

    while monitoring_active:
        frame = camera_manager.read_frame()
        if frame is not None:
            result = face_detector.detect(frame)

            # ── Auto-break: face undetected for N minutes → rest mode ──
            auto_break_active = False
            face_lost_elapsed_sec = 0.0
            auto_break_remaining_sec = 0.0
            if settings.auto_break_enabled:
                if not result.face_detected:
                    if _face_lost_at == 0.0:
                        _face_lost_at = time.time()
                    face_lost_elapsed_sec = time.time() - _face_lost_at
                    face_gone_min = face_lost_elapsed_sec / 60.0
                    auto_break_remaining_sec = max(0.0, settings.auto_break_minutes * 60.0 - face_lost_elapsed_sec)
                    if face_gone_min >= settings.auto_break_minutes and not _auto_break_triggered:
                        _auto_break_triggered = True
                        # Reset break timer — user is resting
                        break_timer_start = time.time()
                        print(f"[AutoBreak] Face undetected for {face_gone_min:.1f}min → rest mode")
                    auto_break_active = _auto_break_triggered
                else:
                    if _auto_break_triggered:
                        print(f"[AutoBreak] Face detected again → resuming monitoring")
                    _face_lost_at = 0.0
                    _auto_break_triggered = False

            # Calculate break reminder
            elapsed_min = (time.time() - break_timer_start) / 60.0
            needs_break = (
                settings.break_reminder_enabled
                and elapsed_min >= settings.break_reminder_interval_min
            )

            # ── Posture analysis (every N seconds) ──
            now = time.time()
            posture_interval = settings.posture_check_interval_sec
            if (
                posture_analyzer
                and settings.posture_detection_enabled
                and result.face_detected
                and (now - _last_posture_check) >= posture_interval
            ):
                _last_posture_check = now
                try:
                    p_result = posture_analyzer.analyze(frame)

                    # Save calibration if just finished
                    if posture_analyzer.calibration.is_calibrated and posture_analyzer.calibration.timestamp > (settings.posture_calibration.get("timestamp", 0) if settings.posture_calibration else 0):
                        settings.posture_calibration = posture_analyzer.calibration.to_dict()
                        save_settings(settings)

                    if p_result.detected:
                        _posture_data = {
                            "forward_head_ratio": p_result.forward_head_ratio,
                            "slouch_ratio": p_result.slouch_ratio,
                            "lateral_tilt_ratio": p_result.lateral_tilt_ratio,
                            "posture_warning_level": p_result.posture_warning_level,
                            "posture_message": p_result.posture_message,
                            "forward_head_warning": p_result.forward_head_warning,
                            "slouch_warning": p_result.slouch_warning,
                            "lateral_tilt_warning": p_result.lateral_tilt_warning,
                            "visibility": round(p_result.visibility, 2),
                            "landmarks": p_result.landmarks,
                        }

                        # Posture grace period
                        raw_p_level = p_result.posture_warning_level
                        if raw_p_level > 0:
                            if _posture_grace_start == 0.0:
                                _posture_grace_start = now
                            if (now - _posture_grace_start) >= _POSTURE_GRACE_SEC:
                                _active_posture_level = raw_p_level
                        else:
                            _posture_grace_start = 0.0
                            _active_posture_level = 0
                    else:
                        _posture_data = {}
                        _active_posture_level = 0
                except Exception as e:
                    print(f"[Posture] Analysis error: {e}")

            posture_alert = (
                settings.posture_detection_enabled
                and _active_posture_level > 0
            )

            # ── Grace period logic ──
            raw_level = result.warning_level
            grace_sec = max(settings.warning_grace_sec, 0)
            now = time.time()

            if raw_level > 0:
                warning_exited_at = 0.0  # reset exit timer
                if warning_entered_at == 0.0:
                    # Just entered warning zone — start grace timer
                    warning_entered_at = now
                elapsed_grace = now - warning_entered_at
                if elapsed_grace >= grace_sec:
                    # Grace period passed → activate alert
                    active_alert_level = raw_level
                # else: still in grace period, keep active_alert_level as-is (0 or previous)
            else:
                # Distance is safe — but don't reset immediately (cooldown for jitter)
                if warning_entered_at > 0.0 or active_alert_level > 0:
                    if warning_exited_at == 0.0:
                        warning_exited_at = now
                    # Only fully reset after cooldown period
                    if (now - warning_exited_at) >= _GRACE_COOLDOWN:
                        warning_entered_at = 0.0
                        active_alert_level = 0
                    # else: keep grace timer running through brief safe dips

            # The level sent to clients (respects grace period)
            effective_level = active_alert_level

            # Debug: log warning state periodically
            if raw_level > 0 or effective_level > 0:
                grace_elapsed = (now - warning_entered_at) if warning_entered_at > 0 else 0
                print(f"[Warning] dist={result.distance_cm:.1f}cm raw={raw_level} eff={effective_level} grace={grace_elapsed:.1f}s/{grace_sec}s")

            # Track warning history (use effective level, not raw)
            rank_event = None
            if effective_level > 0:
                warning_history.record_warning(effective_level, result.distance_cm)
                # Reset good posture tracking during warning
                _last_good_posture_ts = 0.0
            else:
                was_warning = warning_history._current_warning_start is not None
                warning_history.end_warning()

                # Accumulate good posture time (face detected, no warning)
                if result.face_detected:
                    if _last_good_posture_ts > 0:
                        delta = now - _last_good_posture_ts
                        if delta < 5.0:  # Ignore gaps > 5s (face lost, etc.)
                            _good_posture_accum += delta
                    _last_good_posture_ts = now
                else:
                    _last_good_posture_ts = 0.0

                # Flush accumulated good posture every 60s
                if _good_posture_accum >= 60.0:
                    add_good_posture_time(_good_posture_accum)
                    _good_posture_accum = 0.0

                # Check rank change when a warning ends (new event recorded)
                if was_warning:
                    _rank_check_counter += 1
                    # Also check every ~30s during monitoring
                if _rank_check_counter > 0 or (int(now) % 30 == 0 and _rank_check_counter == 0):
                    try:
                        multiplier = settings.score_multiplier if settings else 1.0
                        rank_info = get_full_rank_info(warning_history.events, score_multiplier=multiplier)
                        curr_levels = {
                            "daily": rank_info["daily"]["current"]["level"],
                            "weekly": rank_info["weekly"]["current"]["level"],
                            "monthly": rank_info["monthly"]["current"]["level"],
                        }
                        if _prev_rank_levels:
                            for period in ("monthly", "weekly", "daily"):
                                old_lv = _prev_rank_levels.get(period, 0)
                                new_lv = curr_levels[period]
                                if old_lv > 0 and new_lv != old_lv:
                                    direction = "up" if new_lv > old_lv else "down"
                                    rank_data = rank_info[period]["current"]
                                    rank_event = {
                                        "direction": direction,
                                        "period": period,
                                        "rank": rank_data,
                                    }
                                    break
                        _prev_rank_levels = curr_levels
                        _rank_check_counter = 0
                    except Exception:
                        pass

            # Grace countdown: seconds remaining before alert fires
            grace_remaining = 0.0
            if raw_level > 0 and effective_level == 0 and warning_entered_at > 0:
                grace_remaining = max(0, grace_sec - (now - warning_entered_at))

            data = {
                "face_detected": result.face_detected,
                "distance_cm": result.distance_cm,
                "warning_level": effective_level,
                "raw_warning_level": raw_level,
                "grace_remaining": round(grace_remaining, 1),
                "head_tilt_deg": result.head_tilt_deg,
                "posture_alert": posture_alert,
                "posture_warning_level": _active_posture_level,
                "posture_message": _posture_data.get("posture_message", ""),
                "posture": _posture_data if _posture_data else None,
                "needs_break": needs_break,
                "elapsed_min": round(elapsed_min, 1),
                "auto_break_active": auto_break_active,
                "face_lost_elapsed_sec": round(face_lost_elapsed_sec, 1),
                "auto_break_remaining_sec": round(auto_break_remaining_sec, 1),
                "timestamp": now,
            }
            if rank_event:
                data["rank_event"] = rank_event

            yield {
                "event": "distance",
                "data": json.dumps(data),
            }

        await asyncio.sleep(frame_interval)

    # Flush remaining good posture time
    if _good_posture_accum > 0:
        add_good_posture_time(_good_posture_accum)

    # Send final stop event
    yield {
        "event": "stopped",
        "data": json.dumps({"message": "Monitoring stopped"}),
    }


@app.get("/api/stream/distance")
async def stream_distance():
    """SSE endpoint for real-time distance monitoring data."""
    if not monitoring_active:
        raise HTTPException(status_code=400, detail="Monitoring not active")
    return EventSourceResponse(_generate_distance_stream())


@app.post("/api/break/reset")
async def reset_break_timer():
    """Reset break reminder timer."""
    global break_timer_start
    break_timer_start = time.time()
    return {"success": True}


# ─── Entry Point ──────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18765
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
