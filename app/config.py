import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# DATA_DIR lives two levels up from this file  (project_root/data/)
DATA_DIR = Path(__file__).parent.parent / "data"

# ---------------------------------------------------------------------------
# Security / allowlists
# ---------------------------------------------------------------------------

# Only these filenames may be served through /api/files – prevents path traversal
ALLOWED_FILES: set[str] = {
    "2024-09_Schema_IUC02_v1.json",
    "mapping document.json",
    "rdfGraph_smallExample.ttl",
    "shaclShape_smallExample.ttl",
    "Vh5205_C-95_translated.json",
    "Vh5205_C-95.LIS",
}

ALLOWED_MIME_TYPES: set[str] = {"text/plain", "application/octet-stream", "text/turtle"}

# ---------------------------------------------------------------------------
# Size limits
# ---------------------------------------------------------------------------

MAX_UPLOAD_BYTES: int = 2 * 1024 * 1024  # 2 MB hard cap for file uploads
MAX_RDF_CHARS: int = 500_000             # ~500 KB text content for JSON body fields

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

CORS_ORIGINS: list[str] = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://iuc-02-demonstrator.vercel.app",
]

_extra = os.getenv("FRONTEND_URL", "")
if _extra:
    CORS_ORIGINS.append(_extra)
