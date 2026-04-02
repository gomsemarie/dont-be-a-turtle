"""Turtle rank system — score calculation and rank determination."""

import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from config import get_config_path


def _data_dir() -> Path:
    return get_config_path().parent


def _bundle_dir() -> Path:
    """Return the directory where bundled files live (PyInstaller or source)."""
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS)
    return Path(__file__).parent


def _load_json(filename: str, fallback: dict) -> dict:
    """Load JSON config: user override in data dir > bundled default."""
    for path in [_data_dir() / filename, _bundle_dir() / filename]:
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
    return fallback


def load_ranks() -> list[dict]:
    data = _load_json("turtle_ranks.json", {"ranks": []})
    return sorted(data.get("ranks", []), key=lambda r: r.get("min_score", 0))


def load_scoring_rules() -> dict:
    return _load_json("scoring_rules.json", {
        "per_event": {"level_1_base": 1, "level_2_base": 3, "level_3_base": 8, "duration_multiplier": 0.1},
        "daily_bonus": {"zero_warning_day": -5},
        "decay": {"daily_decay_rate": 0.02},
        "score_period_days": 30,
    })


def _load_score_state() -> dict:
    path = _data_dir() / "turtle_score.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"score": 0.0, "rank_level": 1, "last_decay_date": None, "last_scored_ts": 0}


def _save_score_state(state: dict) -> None:
    path = _data_dir() / "turtle_score.json"
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def reset_score_state() -> None:
    """Reset cumulative score state to initial values."""
    _save_score_state({"score": 0.0, "rank_level": 1, "last_decay_date": None, "last_scored_ts": 0})


def _score_events(events: list[dict], rules: dict) -> float:
    """Calculate raw score from a list of events (no decay, no persistence)."""
    per = rules.get("per_event", {})
    base_points = {1: per.get("level_1_base", 1), 2: per.get("level_2_base", 3), 3: per.get("level_3_base", 8)}
    dur_mult = per.get("duration_multiplier", 0.1)

    total = 0.0
    for ev in events:
        lvl = ev.get("warning_level", 1)
        bp = base_points.get(lvl, 1)
        dur = ev.get("duration_sec", 0)
        total += bp + (dur * dur_mult)
    return total


def calculate_period_score(events: list[dict], days: int, rules: Optional[dict] = None) -> float:
    """Calculate score for a specific period (1=daily, 7=weekly, 30=monthly).
    Simple: sum of event scores within the period. No decay."""
    if rules is None:
        rules = load_scoring_rules()

    cutoff = time.time() - (days * 86400)
    period_events = [e for e in events if e.get("timestamp", 0) >= cutoff]
    return round(_score_events(period_events, rules), 1)


def calculate_cumulative_score(events: list[dict], rules: Optional[dict] = None) -> float:
    """Calculate cumulative score with decay (persistent, used for overall rank)."""
    if rules is None:
        rules = load_scoring_rules()

    state = _load_score_state()
    score = state.get("score", 0.0)

    # Apply daily decay
    decay_rate = rules.get("decay", {}).get("daily_decay_rate", 0.02)
    last_decay = state.get("last_decay_date")
    today_str = datetime.now().date().isoformat()

    if last_decay and last_decay != today_str:
        try:
            last_date = datetime.fromisoformat(last_decay).date()
            days_missed = (datetime.now().date() - last_date).days
            if days_missed > 0:
                score *= (1 - decay_rate) ** days_missed
                # Zero-warning day bonus
                daily_bonus = rules.get("daily_bonus", {}).get("zero_warning_day", -5)
                period_days = rules.get("score_period_days", 30)
                cutoff = time.time() - (period_days * 86400)
                recent = [e for e in events if e.get("timestamp", 0) >= cutoff]
                for i in range(1, days_missed + 1):
                    check = last_date + timedelta(days=i)
                    if not any(datetime.fromtimestamp(e["timestamp"]).date() == check for e in recent):
                        score += daily_bonus
        except Exception:
            pass

    # Score new events since last calculation
    last_scored_ts = state.get("last_scored_ts", 0)
    new_events = [e for e in events if e.get("timestamp", 0) > last_scored_ts]
    score += _score_events(new_events, rules)
    score = max(0, score)

    # Persist
    max_ts = max((e.get("timestamp", 0) for e in events), default=last_scored_ts) if events else last_scored_ts
    state["score"] = round(score, 1)
    state["last_decay_date"] = today_str
    state["last_scored_ts"] = max_ts
    _save_score_state(state)

    return round(score, 1)


def get_rank_for_score(score: float, ranks: Optional[list[dict]] = None) -> dict:
    """Determine rank for a given score."""
    if ranks is None:
        ranks = load_ranks()

    current = ranks[0] if ranks else {"level": 1, "name": "자세 깡패", "emoji": "😏", "image": "rank-1.png", "min_score": 0, "color": "#22c55e"}
    for r in ranks:
        if score >= r.get("min_score", 0):
            current = r
        else:
            break

    nxt = None
    for r in ranks:
        if r.get("min_score", 0) > score:
            nxt = r
            break

    progress = 0.0
    if nxt:
        denom = nxt["min_score"] - current.get("min_score", 0)
        if denom > 0:
            progress = (score - current.get("min_score", 0)) / denom * 100

    return {"current": current, "next": nxt, "score": score, "progress_to_next": round(progress, 1)}


def get_full_rank_info(events: list[dict], score_multiplier: float = 1.0) -> dict:
    """Get complete rank info with daily/weekly/monthly breakdowns."""
    rules = load_scoring_rules()
    ranks = load_ranks()

    # Period scores (apply multiplier)
    m = max(0.0, score_multiplier)
    daily_score = round(calculate_period_score(events, 1, rules) * m, 1)
    weekly_score = round(calculate_period_score(events, 7, rules) * m, 1)
    monthly_score = round(calculate_cumulative_score(events, rules) * m, 1)

    daily_rank = get_rank_for_score(daily_score, ranks)
    weekly_rank = get_rank_for_score(weekly_score, ranks)
    monthly_rank = get_rank_for_score(monthly_score, ranks)

    # Check rank change on monthly (primary) rank
    state = _load_score_state()
    old_level = state.get("rank_level", 1)
    new_level = monthly_rank["current"]["level"]
    rank_change = None
    if old_level > 0 and new_level != old_level:
        rank_change = "up" if new_level > old_level else "down"
        state["rank_level"] = new_level
        _save_score_state(state)

    return {
        "daily": daily_rank,
        "weekly": weekly_rank,
        "monthly": monthly_rank,
        "rank_change": rank_change,
        "all_ranks": ranks,
    }
