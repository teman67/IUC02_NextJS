import os
import logging

import httpx
from fastapi import HTTPException
from openai import AsyncOpenAI
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger("iuc02")

# ---------------------------------------------------------------------------
# Rate limiter (keyed by client IP)
# ---------------------------------------------------------------------------

limiter = Limiter(key_func=get_remote_address)

# ---------------------------------------------------------------------------
# OpenAI async client – created once, reused across requests
# ---------------------------------------------------------------------------

_openai_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI:
    """Return the module-level AsyncOpenAI client, creating it on first call.

    Raises HTTPException(500) if the API key is not configured so callers
    receive a proper HTTP error rather than an unhandled AttributeError.
    """
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=500,
                detail="OpenAI API key not configured. Set the OPENAI_API_KEY environment variable.",
            )
        _openai_client = AsyncOpenAI(
            api_key=api_key,
            timeout=httpx.Timeout(90.0, connect=10.0),
            max_retries=2,
        )
        logger.info("AsyncOpenAI client initialised")
    return _openai_client
