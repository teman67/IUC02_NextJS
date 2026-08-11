"""FastAPI router for the AgentSem semantic pipeline."""

import asyncio
import json
import logging
import os
import threading

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, StreamingResponse

from app.dependencies import get_pipeline_slots, limiter, pipeline_executor
from app.models import AgentSemRequest, AgentSemValidateKeyRequest, ParseGraphRequest
from app.services.agent_sem_service import (
    get_example_content,
    generate_graph_html,
    rdf_to_graph_data,
    run_pipeline,
    validate_api_key,
)

logger = logging.getLogger("iuc02.agent_sem")

router = APIRouter(prefix="/api/agent-sem", tags=["agent-sem"])

# How long the stream waits for the next event before giving up.  This MUST stay
# above the longest a single LLM call can take (OLLAMA_READ_TIMEOUT_SEC defaults
# to 600 s), otherwise a slow model reliably trips the timeout and orphans a
# pipeline that is still running normally.
SSE_IDLE_TIMEOUT: float = float(os.getenv("AGENTSEM_SSE_IDLE_TIMEOUT_SEC", "660"))

# Bounded so an abandoned stream cannot accumulate events without limit - each
# `step` event carries the full RDF + SHACL text.
EVENT_QUEUE_MAXSIZE: int = 256


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _check_input_size(text: str, limit: int = 200_000) -> None:
    if len(text) > limit:
        raise HTTPException(status_code=413, detail="Input too large (max 200 KB).")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/example")
async def get_example():
    """Return the example BAM creep test file content."""
    content = await asyncio.to_thread(get_example_content)
    if not content:
        raise HTTPException(status_code=404, detail="Example file not found.")
    return {"content": content}


@router.post("/validate-key")
@limiter.limit("20/minute")
async def validate_key(request: Request, body: AgentSemValidateKeyRequest):
    """Validate an LLM provider API key without running the full pipeline."""
    valid, message = await asyncio.to_thread(
        validate_api_key, body.provider, body.api_key, body.endpoint
    )
    return {"valid": valid, "message": message}


@router.post("/parse-graph")
@limiter.limit("30/minute")
async def parse_graph(request: Request, body: ParseGraphRequest):
    """Parse RDF Turtle text and return graph nodes + links for visualisation."""
    _check_input_size(body.rdf)
    if not body.rdf.strip():
        return {"nodes": [], "links": []}
    data = await asyncio.to_thread(rdf_to_graph_data, body.rdf)
    return data


@router.post("/graph-html")
@limiter.limit("10/minute")
async def graph_html(request: Request, body: ParseGraphRequest):
    """Parse RDF Turtle and return a pyvis interactive HTML graph."""
    _check_input_size(body.rdf)
    if not body.rdf.strip():
        return HTMLResponse(content="<p>No RDF provided.</p>")
    html = await asyncio.to_thread(generate_graph_html, body.rdf)
    return HTMLResponse(content=html)


@router.post("/generate-stream")
@limiter.limit("5/minute")
async def generate_stream(request: Request, body: AgentSemRequest):
    """
    Run the AgentSem pipeline and stream progress + results as Server-Sent Events.

    Each event is a JSON object on a ``data:`` line:
      {"type": "progress", "phase": "...", "message": "..."}
      {"type": "step",     "step":  "...", ...}
      {"type": "final",    "rdf": "...", "shacl": "...", "conforms": bool, ...}
      {"type": "error",    "message": "..."}
      {"type": "done"}
    """
    _check_input_size(body.user_input)

    # Shed load explicitly instead of queueing behind busy workers.
    slots = get_pipeline_slots()
    if slots.locked():
        logger.warning("Rejecting pipeline request: all worker slots busy")
        raise HTTPException(
            status_code=503,
            detail="All pipeline workers are busy. Please retry in a few minutes.",
            headers={"Retry-After": "60"},
        )

    model_info = {
        "provider": body.provider,
        "model": body.model,
        "temperature": body.temperature,
        "api_key": body.api_key,
        "endpoint": body.endpoint,
    }

    queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=EVENT_QUEUE_MAXSIZE)
    loop = asyncio.get_running_loop()
    # Set when the client disconnects or the stream gives up; run_pipeline polls
    # it at each step boundary.  Cancelling the asyncio task alone cannot stop a
    # thread, so without this the pipeline keeps calling (and billing) the LLM.
    cancel = threading.Event()

    def push(event: dict) -> None:
        """Enqueue an event from the worker thread."""
        def _put() -> None:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Reader is gone or far behind; drop progress noise but never a
                # terminal event.
                if event.get("type") in ("final", "error", "done"):
                    try:
                        _ = queue.get_nowait()
                        queue.put_nowait(event)
                    except Exception:
                        logger.warning("Dropped terminal event; queue saturated")
                else:
                    logger.debug("Dropped progress event; queue full")

        try:
            loop.call_soon_threadsafe(_put)
        except RuntimeError:
            # Loop already closed - nothing left to deliver to.
            pass

    async def _run() -> None:
        try:
            async with slots:
                await loop.run_in_executor(
                    pipeline_executor,
                    run_pipeline,
                    body.user_input,
                    model_info,
                    body.max_opt,
                    body.max_corr,
                    body.similarity_threshold,
                    push,
                    cancel,
                )
        except Exception as exc:
            logger.exception("Pipeline task failed")
            push({"type": "error", "message": str(exc)})
        finally:
            push({"type": "done"})

    task = asyncio.create_task(_run())

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    logger.info("Client disconnected; cancelling pipeline")
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=SSE_IDLE_TIMEOUT)
                except asyncio.TimeoutError:
                    yield "data: " + json.dumps({"type": "error", "message": "Pipeline timed out."}) + "\n\n"
                    break
                yield "data: " + json.dumps(event) + "\n\n"
                if event.get("type") in ("done", "error"):
                    break
        finally:
            # Stop the worker thread at its next checkpoint, then drop the task.
            cancel.set()
            task.cancel()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
