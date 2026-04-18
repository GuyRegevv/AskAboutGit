import time
import pytest
from context_cache.cache import ContextCache


def test_set_and_get_returns_value():
    cache = ContextCache(ttl_minutes=30)
    files = {"README.md": "# Hello", "src/index.ts": "console.log('hi')"}
    cache.set("facebook/react", files)
    result = cache.get("facebook/react")
    assert result == files


def test_missing_key_returns_none():
    cache = ContextCache(ttl_minutes=30)
    assert cache.get("owner/nonexistent") is None


def test_expired_entry_returns_none():
    cache = ContextCache(ttl_minutes=0)
    cache.set("owner/repo", {"README.md": "content"})
    time.sleep(0.01)
    assert cache.get("owner/repo") is None


def test_overwrite_resets_ttl():
    cache = ContextCache(ttl_minutes=30)
    cache.set("owner/repo", {"a.py": "old"})
    cache.set("owner/repo", {"a.py": "new"})
    assert cache.get("owner/repo") == {"a.py": "new"}


def test_different_keys_are_independent():
    cache = ContextCache(ttl_minutes=30)
    cache.set("owner/repo-a", {"a": "1"})
    cache.set("owner/repo-b", {"b": "2"})
    assert cache.get("owner/repo-a") == {"a": "1"}
    assert cache.get("owner/repo-b") == {"b": "2"}
