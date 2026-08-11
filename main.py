"""Entry point â€“ creates the FastAPI application and wires up all components.

Keep this file thin: configuration, middleware, and route logic live in the
``app/`` package.  The Procfile targets ``main:app`` so this module must
always export an ``app`` symbol.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import CORS_ORIGINS, DATA_DIR
from app.dependencies import (
    PIPELINE_MAX_CONCURRENCY,
    configure_default_executor,
    limiter,
    pipeline_executor,
)
from app.middleware import register_middleware
from app.routers import ai, agent_sem, files, validation
from app.services.agent_sem_service import get_ontology_matcher, ontology_cache_is_warm

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "name": "%(name)s", "message": "%(message)s"}',
)
logger = logging.getLogger("iuc02")

# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

WARM_ONTOLOGIES = os.getenv("WARM_ONTOLOGIES", "1") != "0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Size the thread pools and warm the ontology cache before serving traffic."""
    configure_default_executor(asyncio.get_running_loop())

    if WARM_ONTOLOGIES:
        # Parsing the ontology directory costs ~2.6s; do it at boot so the first
        # request does not pay for it.
        try:
            matcher = await asyncio.to_thread(get_ontology_matcher)
            logger.info(
                "Ontology cache warm: %d files, %d terms",
                len(matcher.ontology_graphs),
                sum(len(t) for t in matcher.ontology_terms.values()),
            )
        except Exception:
            # A failed warm-up must not stop the app - the RDF/SHACL and file
            # endpoints do not need the ontologies at all.
            logger.exception("Ontology warm-up failed; will retry on first request")

    yield

    pipeline_executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(
    title="IUC02 Validation API",
    description="Backend API for RDF/SHACL validation and file operations",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
    max_age=600,
)

# Structured request/response logging
register_middleware(app)

# Routers
app.include_router(files.router)
app.include_router(validation.router)
app.include_router(ai.router)
app.include_router(agent_sem.router)


# ---------------------------------------------------------------------------
# Root & health
# ---------------------------------------------------------------------------


@app.get("/")
async def root():
    return {"message": "IUC02 Validation API is running", "version": "1.0.0"}

@app.get("/api/health")
async def health_check():
    """Health check that also probes optional external dependencies."""
    checks: dict = {"status": "healthy", "dependencies": {}}
    checks["dependencies"]["openai_key"] = (
        "configured" if os.getenv("OPENAI_API_KEY") else "missing"
    )
    checks["dependencies"]["data_dir"] = "ok" if DATA_DIR.exists() else "missing"
    checks["dependencies"]["ontology_cache"] = (
        "warm" if ontology_cache_is_warm() else "cold"
    )
    checks["pipeline"] = {
        "max_concurrency": PIPELINE_MAX_CONCURRENCY,
        "active": len(getattr(pipeline_executor, "_threads", ())),
    }
    if not os.getenv("OPENAI_API_KEY") or not DATA_DIR.exists():
        checks["status"] = "degraded"
    logger.info("Health check: %s", checks)
    return checks


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
