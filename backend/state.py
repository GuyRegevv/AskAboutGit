import os
import asyncio
from collections import defaultdict

from context_cache.cache import ContextCache
from rate_limit.limiter import RateLimiter
from vectorstore.chroma import ChromaStore
from indexer.embedder import OpenAIEmbedder

context_cache = ContextCache(ttl_minutes=int(os.getenv("CONTEXT_CACHE_TTL_MINUTES", "30")))

rate_limiter = RateLimiter(
    max_requests=int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "20")),
    window_hours=int(os.getenv("RATE_LIMIT_WINDOW_HOURS", "1")),
)

indexing_rate_limiter = RateLimiter(
    max_requests=int(os.getenv("INDEXING_RATE_LIMIT_PER_HOUR", "5")),
    window_hours=1,
)

chroma_store = ChromaStore(
    persist_dir=os.getenv("CHROMA_PERSIST_DIR", "/data/chroma"),
)

embedder = OpenAIEmbedder()

DEEP_MODE_TTL_SECONDS = int(os.getenv("DEEP_MODE_TTL_SECONDS", "86400"))
DEEP_MODE_FILE_CAP = int(os.getenv("DEEP_MODE_FILE_CAP", "1500"))
DEEP_MODE_TOP_K = int(os.getenv("DEEP_MODE_TOP_K", "8"))

# Per-(owner,repo) async locks so concurrent indexing requests coalesce.
_locks: dict[tuple[str, str], asyncio.Lock] = defaultdict(asyncio.Lock)


def index_lock(owner: str, repo: str) -> asyncio.Lock:
    return _locks[(owner, repo)]
