import asyncio
import logging
import time
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile
from rdflib import Graph

from app.config import ALLOWED_MIME_TYPES, MAX_RDF_CHARS, MAX_UPLOAD_BYTES
from app.models import RdfGraphRequest, ValidationRequest
from app.services.rdf_service import build_rdf_graph, run_validation

logger = logging.getLogger("iuc02")

router = APIRouter(prefix="/api", tags=["validation"])


@router.post("/validate")
async def validate_rdf(request: ValidationRequest):
    """Validate an RDF Turtle graph against SHACL shapes.

    Returns conformance status, a human-readable report, triple-level details,
    and a JSON-LD serialisation of the data graph.
    """
    if (
        len(request.rdf_content) > MAX_RDF_CHARS
        or len(request.shacl_content) > MAX_RDF_CHARS
    ):
        raise HTTPException(
            status_code=413, detail="Input too large. Maximum 500 KB per graph."
        )

    req_id = str(uuid.uuid4())[:8]
    start = time.monotonic()
    logger.info(
        "[%s] /api/validate started – rdf=%d chars shacl=%d chars",
        req_id,
        len(request.rdf_content),
        len(request.shacl_content),
    )
    try:
        conforms, results_text, report_details, json_ld = await run_validation(
            request.rdf_content, request.shacl_content
        )
        elapsed = time.monotonic() - start
        logger.info(
            "[%s] /api/validate done – conforms=%s latency=%.2fs",
            req_id,
            conforms,
            elapsed,
        )
        return {
            "conforms": conforms,
            "report_text": results_text,
            "report_details": report_details,
            "json_ld": json_ld,
        }
    except Exception:
        logger.exception("[%s] /api/validate error", req_id)
        raise HTTPException(
            status_code=400, detail="Validation error. Check your Turtle syntax."
        )


@router.post("/rdf-graph")
async def get_rdf_graph(request: RdfGraphRequest):
    """Parse an RDF Turtle graph and return a node/edge structure for visualisation."""
    if len(request.rdf_content) > MAX_RDF_CHARS:
        raise HTTPException(status_code=413, detail="Input too large. Maximum 500 KB.")
    try:
        return await build_rdf_graph(request.rdf_content)
    except Exception:
        logger.exception("/api/rdf-graph error")
        raise HTTPException(
            status_code=400,
            detail="Error building RDF graph. Check your Turtle syntax.",
        )


@router.post("/parse-rdf")
async def parse_rdf(file: UploadFile = File(...)):
    """Validate the syntax of an uploaded Turtle file.

    Size (2 MB) and MIME-type checks occur *before* the try/except so that
    HTTPException is never accidentally swallowed.
    """
    content = await file.read(MAX_UPLOAD_BYTES + 1)

    # Size and MIME checks raised BEFORE the try block so they are not swallowed
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_UPLOAD_BYTES // 1024} KB.",
        )
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        logger.warning("Rejected upload with MIME type '%s'", file.content_type)
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type. Upload a Turtle (.ttl) file.",
        )

    try:
        content_str = content.decode("utf-8")

        def _parse() -> int:
            g = Graph()
            g.parse(data=content_str, format="turtle")
            return len(g)

        triple_count = await asyncio.to_thread(_parse)
        return {
            "valid": True,
            "triples_count": triple_count,
            "message": "RDF file is valid",
        }
    except Exception as exc:
        return {"valid": False, "message": f"RDF parsing error: {str(exc)}"}
