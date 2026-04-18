import os
from context_cache.cache import ContextCache
from rate_limit.limiter import RateLimiter

context_cache = ContextCache(ttl_minutes=int(os.getenv("CONTEXT_CACHE_TTL_MINUTES", "30")))
rate_limiter = RateLimiter(
    max_requests=int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "20")),
    window_hours=int(os.getenv("RATE_LIMIT_WINDOW_HOURS", "1")),
)
