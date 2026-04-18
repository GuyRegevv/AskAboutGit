from collections import defaultdict
from datetime import datetime, timedelta


class RateLimiter:
    def __init__(self, max_requests: int = 20, window_hours: int = 1):
        self._requests: dict[str, list[datetime]] = defaultdict(list)
        self._max = max_requests
        self._window = timedelta(hours=window_hours)

    def is_allowed(self, ip: str) -> bool:
        now = datetime.now()
        cutoff = now - self._window
        self._requests[ip] = [t for t in self._requests[ip] if t > cutoff]
        if len(self._requests[ip]) >= self._max:
            return False
        self._requests[ip].append(now)
        return True
