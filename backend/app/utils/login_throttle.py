"""
Per-account brute-force protection for login (in addition to the per-IP rate limit).
In-memory: fine for a single instance; use Redis if you scale to several workers.
"""
import threading
import time
from typing import Dict, List

from app.config import settings

_failures: Dict[str, List[float]] = {}
_lock = threading.Lock()


def _window() -> float:
    return settings.LOGIN_LOCKOUT_MINUTES * 60.0


def _prune(identifier: str, now: float) -> List[float]:
    recent = [t for t in _failures.get(identifier, []) if now - t < _window()]
    if recent:
        _failures[identifier] = recent
    else:
        _failures.pop(identifier, None)
    return recent


def is_locked(identifier: str) -> bool:
    with _lock:
        return len(_prune(identifier, time.time())) >= settings.LOGIN_MAX_FAILURES


def register_failure(identifier: str) -> None:
    with _lock:
        now = time.time()
        _prune(identifier, now)
        _failures.setdefault(identifier, []).append(now)


def clear(identifier: str) -> None:
    with _lock:
        _failures.pop(identifier, None)


def reset_all() -> None:
    with _lock:
        _failures.clear()
