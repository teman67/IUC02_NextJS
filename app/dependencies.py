import asyncio
import os
import logging
from concurrent.futures import ThreadPoolExecutor

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
# Thread pools
#
# The AgentSem pipeline occupies a worker thread for minutes at a time (many LLM
# round-trips plus SHACL validation).  Left on the default executor it starves
# every other endpoint that uses asyncio.to_thread - /api/validate,
# /api/rdf-graph, /api/parse-rdf, /api/files - because the default pool is only
# min(32, cpu_count + 4) threads, which is 5 on a 1-vCPU container.
#
# So the pipeline gets its own small, explicitly-sized pool, and IO work keeps
# the (also explicitly-sized) default one.
# ---------------------------------------------------------------------------

PIPELINE_MAX_CONCURRENCY: int = int(os.getenv("AGENTSEM_MAX_CONCURRENCY", "2"))
IO_POOL_SIZE: int = int(os.getenv("IO_THREADPOOL_SIZE", "16"))

pipeline_executor = ThreadPoolExecutor(
    max_workers=PIPELINE_MAX_CONCURRENCY, thread_name_prefix="agentsem"
)

# Created lazily so it binds to the running loop rather than import time.
_pipeline_slots: asyncio.Semaphore | None = None


def get_pipeline_slots() -> asyncio.Semaphore:
    """Global cap on concurrent AgentSem pipeline runs."""
    global _pipeline_slots
    if _pipeline_slots is None:
        _pipeline_slots = asyncio.Semaphore(PIPELINE_MAX_CONCURRENCY)
    return _pipeline_slots


def configure_default_executor(loop: asyncio.AbstractEventLoop) -> None:
    """Pin the default executor size instead of inheriting a cpu_count-derived value."""
    loop.set_default_executor(
        ThreadPoolExecutor(max_workers=IO_POOL_SIZE, thread_name_prefix="io")
    )
    logger.info(
        "Thread pools configured: io=%d agentsem=%d", IO_POOL_SIZE, PIPELINE_MAX_CONCURRENCY
    )

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
