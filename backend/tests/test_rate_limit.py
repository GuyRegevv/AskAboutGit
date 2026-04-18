import pytest
from rate_limit.limiter import RateLimiter


def test_first_request_is_allowed():
    limiter = RateLimiter(max_requests=20, window_hours=1)
    assert limiter.is_allowed("1.2.3.4") is True


def test_requests_up_to_limit_are_allowed():
    limiter = RateLimiter(max_requests=5, window_hours=1)
    ip = "10.0.0.1"
    for _ in range(5):
        assert limiter.is_allowed(ip) is True


def test_request_beyond_limit_is_rejected():
    limiter = RateLimiter(max_requests=5, window_hours=1)
    ip = "10.0.0.2"
    for _ in range(5):
        limiter.is_allowed(ip)
    assert limiter.is_allowed(ip) is False


def test_different_ips_are_independent():
    limiter = RateLimiter(max_requests=1, window_hours=1)
    assert limiter.is_allowed("192.168.1.1") is True
    assert limiter.is_allowed("192.168.1.2") is True


def test_limit_is_inclusive():
    limiter = RateLimiter(max_requests=3, window_hours=1)
    ip = "10.0.0.3"
    assert limiter.is_allowed(ip) is True   # 1
    assert limiter.is_allowed(ip) is True   # 2
    assert limiter.is_allowed(ip) is True   # 3
    assert limiter.is_allowed(ip) is False  # 4 - over limit
