from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional


@dataclass
class _Entry:
    files: dict[str, str]
    created_at: datetime = field(default_factory=datetime.now)


class ContextCache:
    def __init__(self, ttl_minutes: int = 30):
        self._store: dict[str, _Entry] = {}
        self._ttl = timedelta(minutes=ttl_minutes)

    def get(self, key: str) -> Optional[dict[str, str]]:
        entry = self._store.get(key)
        if entry is None:
            return None
        if datetime.now() - entry.created_at >= self._ttl:
            del self._store[key]
            return None
        return entry.files

    def set(self, key: str, files: dict[str, str]) -> None:
        self._store[key] = _Entry(files=files)
