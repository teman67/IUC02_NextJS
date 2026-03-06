import asyncio
import logging
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

from app.config import ALLOWED_FILES, DATA_DIR
from app.models import FileContent

logger = logging.getLogger("iuc02")

router = APIRouter(prefix="/api", tags=["files"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read_file_sync(file_path: Path) -> str:
    """Try common encodings in order; raise RuntimeError if none succeed."""
    for encoding in ("utf-8", "latin-1", "iso-8859-1"):
        try:
            with open(file_path, "r", encoding=encoding) as fh:
                return fh.read()
        except UnicodeDecodeError:
            continue
    raise RuntimeError("Could not decode file with any supported encoding.")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/files/{filename}")
async def get_file(filename: str):
    """Return the content of a single static data file.

    Only filenames present in ALLOWED_FILES are served (path-traversal guard).
    """
    # Primary allowlist check – must come before any path operations
    if filename not in ALLOWED_FILES:
        logger.warning("Blocked file request for '%s' (not in allowlist)", filename)
        raise HTTPException(status_code=404, detail="File not found")

    file_path = DATA_DIR / filename
    # Secondary check: resolved path must still be inside DATA_DIR
    if not str(file_path.resolve()).startswith(str(DATA_DIR.resolve())):
        logger.error("Path traversal attempt blocked for '%s'", filename)
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        content = await asyncio.to_thread(_read_file_sync, file_path)
        return {"filename": filename, "content": content}
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        logger.exception("Unexpected error reading file '%s'", filename)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/files")
async def list_files():
    """List all files in the data directory that are on the allowlist."""
    try:
        files = []
        if DATA_DIR.exists():
            for file_path in DATA_DIR.iterdir():
                # Filter to allowlist – avoids information disclosure of unlisted files
                if file_path.is_file() and file_path.name in ALLOWED_FILES:
                    files.append(
                        {
                            "name": file_path.name,
                            "size": file_path.stat().st_size,
                            "extension": file_path.suffix,
                        }
                    )
        return {"files": files}
    except Exception:
        logger.exception("Unexpected error listing files")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/files/download")
async def download_file(
    file_content: FileContent,
    filename: str,
    background_tasks: BackgroundTasks,
):
    """Create a temporary file from *content* and stream it as a download.

    The temp file is deleted after the response is sent.
    """
    safe_name = Path(filename).name
    if not safe_name or any(c in safe_name for c in ("/", "\\", "..:")):
        raise HTTPException(status_code=400, detail="Invalid filename")

    try:
        with tempfile.NamedTemporaryFile(
            mode="w", delete=False, suffix=f"_{safe_name}"
        ) as tmp_file:
            tmp_file.write(file_content.content)
            tmp_file_path = tmp_file.name

        def _cleanup(path: str) -> None:
            try:
                os.unlink(path)
                logger.info("Temp file cleaned up: %s", path)
            except OSError:
                pass

        background_tasks.add_task(_cleanup, tmp_file_path)
        return FileResponse(
            tmp_file_path,
            media_type="application/octet-stream",
            filename=safe_name,
        )
    except Exception:
        logger.exception("Unexpected error creating download for '%s'", filename)
        raise HTTPException(status_code=500, detail="Internal server error")
