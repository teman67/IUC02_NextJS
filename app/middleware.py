import logging
import time
import uuid

from fastapi import FastAPI, Request

logger = logging.getLogger("iuc02")


def register_middleware(app: FastAPI) -> None:
    """Attach the structured request/response logging middleware to *app*."""

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        req_id = str(uuid.uuid4())[:8]
        start = time.monotonic()
        client_ip = request.headers.get(
            "x-forwarded-for",
            request.client.host if request.client else "unknown",
        )
        logger.info(
            "[%s] --> %s %s  ip=%s",
            req_id,
            request.method,
            request.url.path,
            client_ip,
        )
        response = await call_next(request)
        elapsed = time.monotonic() - start
        logger.info(
            "[%s] <-- %s %s  status=%d latency=%.3fs",
            req_id,
            request.method,
            request.url.path,
            response.status_code,
            elapsed,
        )
        response.headers["X-Request-Id"] = req_id
        return response
