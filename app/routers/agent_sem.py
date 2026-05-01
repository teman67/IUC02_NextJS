"""FastAPI router for the AgentSem semantic pipeline."""

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.dependencies import limiter
from app.models import AgentSemRequest, AgentSemValidateKeyRequest, ParseGraphRequest
from app.services.agent_sem_service import (
    get_example_content,
    rdf_to_graph_data,
    run_pipeline,
    validate_api_key,
)

logger = logging.getLogger("iuc02.agent_sem")

router = APIRouter(prefix="/api/agent-sem", tags=["agent-sem"])


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
    content = get_example_content()
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
async def parse_graph(body: ParseGraphRequest):
    """Parse RDF Turtle text and return graph nodes + links for visualisation."""
    if not body.rdf.strip():
        return {"nodes": [], "links": []}
    data = await asyncio.to_thread(rdf_to_graph_data, body.rdf)
    return data


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

    model_info = {
        "provider": body.provider,
        "model": body.model,
        "temperature": body.temperature,
        "api_key": body.api_key,
        "endpoint": body.endpoint,
    }

    queue: asyncio.Queue[dict] = asyncio.Queue()
    loop = asyncio.get_event_loop()

    def push(event: dict) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, event)

    async def _run() -> None:
        try:
            await asyncio.to_thread(
                run_pipeline,
                body.user_input,
                model_info,
                body.max_opt,
                body.max_corr,
                body.similarity_threshold,
                push,
            )
        except Exception as exc:
            push({"type": "error", "message": str(exc)})
        finally:
            push({"type": "done"})

    task = asyncio.create_task(_run())

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=300)
                except asyncio.TimeoutError:
                    yield "data: " + json.dumps({"type": "error", "message": "Pipeline timed out."}) + "\n\n"
                    break
                yield "data: " + json.dumps(event) + "\n\n"
                if event.get("type") in ("done", "error"):
                    break
        finally:
            task.cancel()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
