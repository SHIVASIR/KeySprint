import time
from collections import defaultdict, deque
from fastapi import HTTPException, Request, status

from app.core.config import settings


class RateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._redis = None
        if settings.REDIS_URL:
            try:
                import redis

                self._redis = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
            except Exception:
                self._redis = None

    def check(self, key: str, limit: int | None = None, window_seconds: int | None = None) -> None:
        max_req = limit or settings.RATE_LIMIT_REQUESTS
        window = window_seconds or settings.RATE_LIMIT_WINDOW_SECONDS

        if self._redis is not None:
            try:
                redis_key = f"ks:rl:{key}"
                count = self._redis.incr(redis_key)
                if count == 1:
                    self._redis.expire(redis_key, window)
                if count > max_req:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Too many requests. Please slow down.",
                    )
                return
            except HTTPException:
                raise
            except Exception:
                # Fall back to memory limiter if Redis is unreachable
                pass

        now = time.monotonic()
        bucket = self._buckets[key]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= max_req:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please slow down.",
            )
        bucket.append(now)


rate_limiter = RateLimiter()


def enforce_rate_limit(scope: str, limit: int = 30, window_seconds: int = 60):
    def _dep(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        rate_limiter.check(f"{scope}:{client_ip}", limit=limit, window_seconds=window_seconds)

    return _dep
