"""Configuration management for 거북이 키우기 backend.

Settings are loaded from:
  1. User data dir: ~/Library/Application Support/DontBeATurtle/settings.json (runtime state)
  2. Bundled defaults: default_settings.json (shipped with app, editable)
  3. Pydantic defaults (hardcoded fallback)
"""

import json
import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field


# ─── Locate bundled default_settings.json ─────────────────────

def _find_default_settings_json() -> dict:
    """Load default settings from the bundled JSON file.
    Looks in user data dir first (override), then next to this source file.
    Returns an empty dict if not found.
    """
    # 1. User data dir override
    user_override = get_config_dir() / "default_settings.json"
    if user_override.exists():
        try:
            return json.loads(user_override.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, Exception):
            pass

    # 2. Bundled with the app (same dir as this .py file)
    bundled = Path(__file__).parent / "default_settings.json"
    if bundled.exists():
        try:
            return json.loads(bundled.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, Exception):
            pass

    return {}


_DEFAULTS: dict = {}  # populated lazily


def _get_defaults() -> dict:
    global _DEFAULTS
    if not _DEFAULTS:
        _DEFAULTS = _find_default_settings_json()
    return _DEFAULTS


def _d(key: str, fallback):
    """Get a default value from the JSON defaults, with a hardcoded fallback."""
    return _get_defaults().get(key, fallback)


# ─── Pydantic Models ──────────────────────────────────────────

class WarningLevel(BaseModel):
    """Single warning level configuration."""
    enabled: bool = True
    distance_cm: float = 45.0
    label: str = "주의"


class CalibrationData(BaseModel):
    """Calibration reference data."""
    reference_distance_cm: float = 50.0
    reference_ied_pixels: float = 0.0
    is_calibrated: bool = False


def _default_warning_levels() -> list[WarningLevel]:
    raw = _d("warning_levels", None)
    if raw and isinstance(raw, list):
        return [WarningLevel(**wl) for wl in raw]
    return [
        WarningLevel(enabled=True, distance_cm=46.0, label="주의"),
        WarningLevel(enabled=True, distance_cm=43.0, label="경고"),
        WarningLevel(enabled=True, distance_cm=40.0, label="위험"),
    ]


def _default_calibration() -> CalibrationData:
    raw = _d("calibration", None)
    if raw and isinstance(raw, dict):
        return CalibrationData(**raw)
    return CalibrationData()


def _default_warning_messages() -> list[str]:
    return _d("warning_messages", [
        "화면에 조금 가까워요. 적정 거리를 유지해주세요.",
        "화면에 너무 가까워요! 뒤로 물러나주세요.",
        "화면에 매우 가까워요! 즉시 거리를 두세요.",
    ])


class AppSettings(BaseModel):
    """Application settings."""
    selected_camera_index: int = Field(default_factory=lambda: _d("selected_camera_index", 0))
    warning_levels: list[WarningLevel] = Field(default_factory=_default_warning_levels)
    calibration: CalibrationData = Field(default_factory=_default_calibration)
    monitoring_active: bool = Field(default_factory=lambda: _d("monitoring_active", False))
    frame_rate: int = Field(default_factory=lambda: _d("frame_rate", 15))
    # Break reminder settings
    break_reminder_enabled: bool = Field(default_factory=lambda: _d("break_reminder_enabled", True))
    break_reminder_interval_min: int = Field(default_factory=lambda: _d("break_reminder_interval_min", 50))
    # Posture detection
    posture_detection_enabled: bool = Field(default_factory=lambda: _d("posture_detection_enabled", False))
    head_tilt_threshold_deg: float = Field(default_factory=lambda: _d("head_tilt_threshold_deg", 15.0))
    # Emoji mask (privacy mode)
    emoji_mask_enabled: bool = Field(default_factory=lambda: _d("emoji_mask_enabled", True))
    emoji_mask_type: str = Field(default_factory=lambda: _d("emoji_mask_type", "emoji_smile"))
    # Face yaw threshold
    face_yaw_threshold_deg: float = Field(default_factory=lambda: _d("face_yaw_threshold_deg", 45.0))
    # Warning grace period
    warning_grace_sec: int = Field(default_factory=lambda: _d("warning_grace_sec", 3))
    # OS notification toggle
    notification_enabled: bool = Field(default_factory=lambda: _d("notification_enabled", True))
    # History data retention
    history_retention_days: int = Field(default_factory=lambda: _d("history_retention_days", 30))
    history_max_events: int = Field(default_factory=lambda: _d("history_max_events", 5000))
    # Point score multiplier (1.0 = normal, 2.0 = double points, 0.5 = half)
    score_multiplier: float = Field(default_factory=lambda: _d("score_multiplier", 1.0))
    # Custom warning messages per level
    warning_messages: list[str] = Field(default_factory=_default_warning_messages)


# ─── File I/O ─────────────────────────────────────────────────

def get_config_dir() -> Path:
    """Get platform-appropriate config directory."""
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    else:
        base = Path.home() / "Library" / "Application Support"
    config_dir = base / "DontBeATurtle"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir


def get_config_path() -> Path:
    """Get platform-appropriate config file path."""
    return get_config_dir() / "settings.json"


def load_settings() -> AppSettings:
    """Load settings from disk."""
    config_path = get_config_path()
    if config_path.exists():
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
            return AppSettings(**data)
        except (json.JSONDecodeError, Exception):
            pass
    return AppSettings()


def save_settings(settings: AppSettings) -> None:
    """Save settings to disk."""
    config_path = get_config_path()
    config_path.write_text(
        settings.model_dump_json(indent=2),
        encoding="utf-8",
    )
