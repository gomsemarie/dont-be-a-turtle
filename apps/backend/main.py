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
from fastapi import FastAPI, HTTPException
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
from turtle_rank import get_full_rank_info, load_ranks, load_scoring_rules, reset_score_state, add_good_posture_time


# Global instances
camera_manager = CameraManager()
face_detector = FaceDetector()
settings = load_settings()
# Reset monitoring flag on startup (monitoring doesn't survive restarts)
if settings.monitoring_active:
    settings.monitoring_active = False
    save_settings(settings)
warning_history = WarningHistory()

# Monitoring state
monitoring_active = False
break_timer_start: float = 0.0


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

    # Open saved camera
    if settings.selected_camera_index >= 0:
        camera_manager.select_camera(settings.selected_camera_index)

    yield

    # Cleanup
    camera_manager.release()
    face_detector.release()


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


@app.get("/api/version")
async def get_version():
    """Get app version."""
    return {"version": APP_VERSION}


# ─── SSE Streaming Endpoints ──────────────────────────────────────────


async def _generate_preview_stream() -> AsyncGenerator[dict, None]:
    """Generate SSE events with preview frames."""
    frame_interval = 1.0 / settings.frame_rate
    while True:
        frame = camera_manager.read_frame()
        if frame is not None:
            result = face_detector.detect(frame)
            frame = face_detector.draw_landmarks(frame, result)

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
    global break_timer_start
    frame_interval = 1.0 / min(settings.frame_rate, 10)  # Max 10 fps for distance

    # Grace period tracking: only fire alert after sustained warning
    warning_entered_at: float = 0.0  # timestamp when warning_level first became > 0
    active_alert_level: int = 0  # the level currently being alerted (after grace)

    # Track previous rank levels to detect rank changes
    _prev_rank_levels: dict[str, int] = {}
    _rank_check_counter = 0
    # Good posture tracking: accumulate time with no warnings for positive scoring
    _last_good_posture_ts: float = 0.0
    _good_posture_accum: float = 0.0

    while monitoring_active:
        frame = camera_manager.read_frame()
        if frame is not None:
            result = face_detector.detect(frame)

            # Calculate break reminder
            elapsed_min = (time.time() - break_timer_start) / 60.0
            needs_break = (
                settings.break_reminder_enabled
                and elapsed_min >= settings.break_reminder_interval_min
            )

            # Posture alert
            posture_alert = (
                settings.posture_detection_enabled
                and result.face_detected
                and result.head_tilt_deg > settings.head_tilt_threshold_deg
            )

            # ── Grace period logic ──
            raw_level = result.warning_level
            grace_sec = max(settings.warning_grace_sec, 0)
            now = time.time()

            if raw_level > 0:
                if warning_entered_at == 0.0:
                    # Just entered warning zone — start grace timer
                    warning_entered_at = now
                elapsed_grace = now - warning_entered_at
                if elapsed_grace >= grace_sec:
                    # Grace period passed → activate alert
                    active_alert_level = raw_level
                # else: still in grace period, keep active_alert_level as-is (0 or previous)
            else:
                # No warning — reset everything
                warning_entered_at = 0.0
                active_alert_level = 0

            # The level sent to clients (respects grace period)
            effective_level = active_alert_level

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
                "needs_break": needs_break,
                "elapsed_min": round(elapsed_min, 1),
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
