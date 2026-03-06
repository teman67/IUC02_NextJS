"""Entry point â€“ creates the FastAPI application and wires up all components.

Keep this file thin: configuration, middleware, and route logic live in the
``app/`` package.  The Procfile targets ``main:app`` so this module must
always export an ``app`` symbol.
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import CORS_ORIGINS, DATA_DIR
from app.dependencies import limiter
from app.middleware import register_middleware
from app.routers import ai, files, validation

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

app = FastAPI(
    title="IUC02 Validation API",
    description="Backend API for RDF/SHACL validation and file operations",
    version="1.0.0",
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
    if not os.getenv("OPENAI_API_KEY") or not DATA_DIR.exists():
        checks["status"] = "degraded"
    logger.info("Health check: %s", checks)
    return checks


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
