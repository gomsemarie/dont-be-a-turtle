"""Warning history tracking and statistics for 거북이 키우기 backend."""

import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from config import get_config_path, load_settings


class WarningHistory:
    """Manages warning event history and provides statistics."""

    def __init__(self):
        """Initialize warning history manager."""
        self.history_file = get_config_path().parent / "warning_history.json"
        self.events = self._load_history()
        self._current_warning_start: Optional[float] = None
        self._current_warning_level: Optional[int] = None
        self._current_warning_distance: Optional[float] = None
        # Apply cleanup on load
        self._cleanup()

    def _load_history(self) -> list[dict]:
        """Load warning history from file."""
        if self.history_file.exists():
            try:
                data = json.loads(self.history_file.read_text(encoding="utf-8"))
                return data if isinstance(data, list) else []
            except (json.JSONDecodeError, Exception):
                return []
        return []

    def _save_history(self) -> None:
        """Save warning history to file."""
        self.history_file.write_text(
            json.dumps(self.events, indent=2),
            encoding="utf-8",
        )

    def _cleanup(self) -> None:
        """Remove events older than retention period and enforce max event limit (FIFO)."""
        settings = load_settings()
        max_days = settings.history_retention_days
        max_events = settings.history_max_events

        # Remove events older than retention period
        cutoff_timestamp = time.time() - (max_days * 24 * 3600)
        self.events = [e for e in self.events if e["timestamp"] >= cutoff_timestamp]

        # FIFO: if over max, drop oldest
        if len(self.events) > max_events:
            self.events = self.events[-max_events:]

    def record_warning(self, level: int, distance_cm: float) -> None:
        """Record the start of a warning event."""
        if self._current_warning_start is not None:
            # Escalate to the highest (worst) level seen during this warning
            if level > self._current_warning_level:
                self._current_warning_level = level
                self._current_warning_distance = distance_cm
            return

        self._current_warning_start = time.time()
        self._current_warning_level = level
        self._current_warning_distance = distance_cm

    def end_warning(self) -> None:
        """End the current warning event and record it."""
        if self._current_warning_start is not None:
            duration_sec = time.time() - self._current_warning_start
            event = {
                "timestamp": self._current_warning_start,
                "distance_cm": self._current_warning_distance,
                "warning_level": self._current_warning_level,
                "duration_sec": duration_sec,
            }
            self.events.append(event)
            self._cleanup()
            self._save_history()

            self._current_warning_start = None
            self._current_warning_level = None
            self._current_warning_distance = None

    def get_history(self, days: int = 7) -> list[dict]:
        """Get warning events within the specified number of days."""
        cutoff_timestamp = time.time() - (days * 24 * 3600)
        return [e for e in self.events if e["timestamp"] >= cutoff_timestamp]

    def get_stats(self, days: int = 7) -> dict:
        """Get computed statistics for warning events."""
        history = self.get_history(days)

        total_warnings: dict[int, int] = {}
        total_distance = 0.0
        total_time = 0.0

        for event in history:
            level = event["warning_level"]
            total_warnings[level] = total_warnings.get(level, 0) + 1
            total_distance += event["distance_cm"]
            total_time += event["duration_sec"]

        avg_distance = total_distance / len(history) if history else 0.0

        hourly_distribution: dict[int, int] = {h: 0 for h in range(24)}
        for event in history:
            dt = datetime.fromtimestamp(event["timestamp"])
            hourly_distribution[dt.hour] += 1

        daily_counts: list[dict] = []
        now = datetime.now()
        for i in range(days):
            date = (now - timedelta(days=i)).date()
            date_str = date.isoformat()
            count = sum(
                1 for event in history
                if datetime.fromtimestamp(event["timestamp"]).date() == date
            )
            daily_counts.append({"date": date_str, "count": count})

        daily_counts.reverse()

        return {
            "total_warnings": total_warnings,
            "avg_distance": round(avg_distance, 2),
            "total_warning_time_sec": round(total_time, 1),
            "hourly_distribution": hourly_distribution,
            "daily_counts": daily_counts,
        }

    def clear_history(self) -> int:
        """Clear all warning history. Returns number of events removed."""
        count = len(self.events)
        self.events = []
        self._current_warning_start = None
        self._current_warning_level = None
        self._current_warning_distance = None
        self._save_history()
        return count

    def inject_test_data(self, scenario: str = "rank_up") -> int:
        """Inject fake warning events for testing celebration effects.

        Scenarios:
          - rank_up: Inject enough events to push score above next rank threshold.
          - heavy: Inject many high-severity events over the past week.
          - light: Inject a few low-severity events today.
        Returns the number of events injected.
        """
        import random

        now = time.time()
        injected = []

        if scenario == "heavy":
            # 50 events over the past 3 days, mostly level 2-3
            for i in range(50):
                ts = now - random.uniform(0, 3 * 86400)
                lvl = random.choice([2, 2, 3, 3, 3])
                injected.append({
                    "timestamp": ts,
                    "distance_cm": round(random.uniform(28, 40), 1),
                    "warning_level": lvl,
                    "duration_sec": round(random.uniform(5, 120), 1),
                })
        elif scenario == "light":
            # 5 events today, level 1
            for i in range(5):
                ts = now - random.uniform(0, 3600)
                injected.append({
                    "timestamp": ts,
                    "distance_cm": round(random.uniform(40, 45), 1),
                    "warning_level": 1,
                    "duration_sec": round(random.uniform(3, 15), 1),
                })
        else:  # rank_up — progressive events to trigger rank change
            # 30 events over the past week with escalating severity
            for i in range(30):
                ts = now - random.uniform(0, 7 * 86400)
                lvl = random.choice([1, 2, 2, 3])
                injected.append({
                    "timestamp": ts,
                    "distance_cm": round(random.uniform(30, 43), 1),
                    "warning_level": lvl,
                    "duration_sec": round(random.uniform(10, 90), 1),
                })

        injected.sort(key=lambda e: e["timestamp"])
        self.events.extend(injected)
        self._save_history()
        return len(injected)

    def get_retention_info(self) -> dict:
        """Return current retention settings and usage info."""
        settings = load_settings()
        return {
            "retention_days": settings.history_retention_days,
            "max_events": settings.history_max_events,
            "current_events": len(self.events),
        }
