import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from rdflib import Graph

from app.config import MAX_RDF_CHARS
from app.dependencies import get_openai_client, limiter
from app.models import ValidationAnalysisRequest, ValidationFixRequest
from app.services.ai_service import build_fix_prompt, build_retry_prompt, count_errors
from app.services.rdf_service import shacl_validate
from app.utils import strip_markdown_fences

logger = logging.getLogger("iuc02")

router = APIRouter(prefix="/api", tags=["ai"])

MAX_ATTEMPTS = 3

_ANALYSIS_SYSTEM = (
    "You are a helpful expert in RDF, SHACL validation, and semantic web technologies. "
    "Explain technical concepts in a way that's accessible to users with varying levels of expertise."
)

_FIX_SYSTEM = (
    "You are an expert RDF/SHACL data correction assistant. You systematically fix ALL "
    "validation errors by carefully analysing each one. CRITICAL: Property names are "
    "case-sensitive – you MUST use EXACT property names from the validation report's "
    "'Result Path:' fields. Output ONLY valid RDF Turtle format. Never use markdown code blocks."
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _size_guard(body: ValidationAnalysisRequest | ValidationFixRequest) -> None:
    """Raise 413 if any text field exceeds MAX_RDF_CHARS."""
    fields = [body.rdf_content, body.shacl_content, body.validation_report]
    if any(len(f) > MAX_RDF_CHARS for f in fields):
        raise HTTPException(
            status_code=413, detail="Input too large. Maximum 500 KB per field."
        )


def _load_shacl_sync(shacl_content: str) -> Graph:
    g = Graph()
    g.parse(data=shacl_content, format="turtle")
    return g


async def _load_shacl(shacl_content: str) -> Graph:
    return await asyncio.to_thread(_load_shacl_sync, shacl_content)


async def _syntax_check(rdf_text: str) -> str | None:
    """Return None on success, or an error message string on failure."""
    try:
        await asyncio.to_thread(lambda: Graph().parse(data=rdf_text, format="turtle"))
        return None
    except Exception as exc:
        return str(exc)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/analyze-validation")
@limiter.limit("10/minute")
async def analyze_validation(request: Request, body: ValidationAnalysisRequest):
    """Analyse a SHACL validation report using GPT-4o mini and return a markdown explanation."""
    _size_guard(body)

    status_word = "passed" if body.conforms else "FAILED"
    action = (
        "Since validation failed, please analyse the validation report and help the user "
        "understand what went wrong and how to fix it."
        if not body.conforms
        else "Please provide a summary of what was validated successfully."
    )

    rdf_snippet = body.rdf_content[:2000]
    if len(body.rdf_content) > 2000:
        rdf_snippet += "...(truncated)"
    shacl_snippet = body.shacl_content[:2000]
    if len(body.shacl_content) > 2000:
        shacl_snippet += "...(truncated)"

    prompt = f"""You are an expert in RDF/SHACL validation and semantic data analysis.

A user has performed SHACL validation on their RDF data graph, and the validation {status_word}.

{action}

**Validation Report:**
```
{body.validation_report}
```

**Data Graph (RDF - Turtle format):**
```turtle
{rdf_snippet}
```

**Shape Graph (SHACL - Turtle format):**
```turtle
{shacl_snippet}
```

Please provide:
1. **Summary**: A brief, non-technical explanation of what happened
2. **Issues Found**: List specific violations in plain language (if any)
3. **Root Causes**: Explain why these violations occurred
4. **Recommendations**: Concrete steps to fix each issue
5. **Example Fix**: Show a code snippet example of how to correct one of the main issues (if applicable)

Format your response in clear markdown with headers and bullet points for easy reading."""

    client = get_openai_client()
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _ANALYSIS_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=2000,
        )
        return {
            "success": True,
            "analysis": response.choices[0].message.content,
            "model": "gpt-4o-mini",
            "timestamp": response.created,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error in /api/analyze-validation")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/fix-validation-errors")
@limiter.limit("5/minute")
async def fix_validation_errors(request: Request, body: ValidationFixRequest):
    """Attempt to auto-fix SHACL validation errors using GPT-4o (up to 3 attempts)."""
    _size_guard(body)

    client = get_openai_client()
    error_count = count_errors(body.validation_report)
    initial_prompt = build_fix_prompt(
        body.validation_report,
        body.rdf_content,
        body.shacl_content,
        body.ai_analysis,
        error_count,
    )

    # First attempt
    try:
        initial_response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _FIX_SYSTEM},
                {"role": "user", "content": initial_prompt},
            ],
            temperature=0.1,
            max_tokens=4500,
        )
    except Exception:
        logger.exception("OpenAI error in /api/fix-validation-errors")
        raise HTTPException(status_code=500, detail="Internal server error")

    response_timestamp = initial_response.created
    fixed_rdf = strip_markdown_fences(
        initial_response.choices[0].message.content or ""
    )

    # Syntax check
    syntax_error = await _syntax_check(fixed_rdf)
    syntax_valid = syntax_error is None

    validation_passed = False
    validation_status: str | None = None
    attempts = 1

    if not syntax_valid:
        validation_status = None
        return {
            "success": True,
            "fixed_rdf": fixed_rdf,
            "syntax_valid": False,
            "syntax_error": syntax_error,
            "validation_passed": False,
            "validation_status": None,
            "attempts": attempts,
            "max_attempts": MAX_ATTEMPTS,
            "model": "gpt-4o",
            "timestamp": response_timestamp,
            "original_error_count": error_count or None,
        }

    # Load the SHACL graph once; reuse across retry iterations
    try:
        shacl_graph = await _load_shacl(body.shacl_content)
    except Exception:
        logger.exception("Could not parse SHACL content")
        raise HTTPException(
            status_code=400, detail="Could not parse SHACL content. Check your Turtle syntax."
        )

    try:
        conforms, results_text = await shacl_validate(fixed_rdf, shacl_graph)
        validation_passed = conforms

        while not conforms and attempts < MAX_ATTEMPTS:
            attempts += 1
            retry_prompt = build_retry_prompt(
                results_text, fixed_rdf, body.shacl_content, attempts, MAX_ATTEMPTS
            )
            try:
                retry_response = await client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": _FIX_SYSTEM},
                        {"role": "user", "content": retry_prompt},
                    ],
                    temperature=0.1,
                    max_tokens=4500,
                )
            except Exception:
                logger.exception("OpenAI error on retry attempt %d", attempts)
                break

            fixed_rdf = strip_markdown_fences(
                retry_response.choices[0].message.content or ""
            )

            # Syntax check on retry output
            retry_syntax_error = await _syntax_check(fixed_rdf)
            if retry_syntax_error:
                results_text = f"Parse error on attempt {attempts}: {retry_syntax_error}"
                break

            conforms, results_text = await shacl_validate(fixed_rdf, shacl_graph)
            validation_passed = conforms
            if conforms:
                break

        validation_status = (
            "Validation passed! ✅"
            if conforms
            else f"Still has validation issues (after {attempts} attempt(s)):\n{results_text}"
        )
    except Exception:
        logger.exception("Validation error in /api/fix-validation-errors")
        validation_status = "Could not validate fixed RDF."

    return {
        "success": True,
        "fixed_rdf": fixed_rdf,
        "syntax_valid": True,
        "syntax_error": None,
        "validation_passed": validation_passed,
        "validation_status": validation_status,
        "attempts": attempts,
        "max_attempts": MAX_ATTEMPTS,
        "model": "gpt-4o",
        "timestamp": response_timestamp,
        "original_error_count": error_count or None,
    }


@router.post("/fix-validation-errors-stream")
@limiter.limit("5/minute")
async def fix_validation_errors_stream(request: Request, body: ValidationFixRequest):
    """Stream AI fix progress via Server-Sent Events (SSE)."""
    _size_guard(body)

    async def generate_progress():
        try:
            client = get_openai_client()
            error_count = count_errors(body.validation_report)

            yield f"data: {json.dumps({'type': 'info', 'message': f'🔍 Analysing validation report... Found ~{error_count} constraint violations'})}\n\n"
            await asyncio.sleep(0.1)

            # Pre-parse SHACL graph once
            try:
                shacl_graph = await _load_shacl(body.shacl_content)
            except Exception as exc:
                yield f"data: {json.dumps({'type': 'error', 'message': f'Could not parse SHACL content: {str(exc)}'})}\n\n"
                return

            current_prompt = build_fix_prompt(
                body.validation_report,
                body.rdf_content,
                body.shacl_content,
                body.ai_analysis,
                error_count,
            )

            attempts = 0
            fixed_rdf = ""
            validation_passed = False
            validation_status = ""

            while attempts < MAX_ATTEMPTS and not validation_passed:
                attempts += 1
                yield f"data: {json.dumps({'type': 'attempt', 'attempt': attempts, 'max_attempts': MAX_ATTEMPTS, 'message': f'🤖 Attempt {attempts}/{MAX_ATTEMPTS}: AI is generating fixes...'})}\n\n"
                await asyncio.sleep(0.1)

                if attempts > 1:
                    remaining = [
                        line.split("Result Path:")[1].strip()
                        for line in validation_status.split("\n")
                        if "Result Path:" in line
                    ]
                    if remaining:
                        props_str = ", ".join(remaining)
                        yield f"data: {json.dumps({'type': 'info', 'message': f'🔍 Targeting properties: {props_str}'})}\n\n"
                    current_prompt = build_retry_prompt(
                        validation_status,
                        fixed_rdf,
                        body.shacl_content,
                        attempts,
                        MAX_ATTEMPTS,
                    )

                yield f"data: {json.dumps({'type': 'progress', 'message': '✍️ AI is writing corrected RDF...'})}\n\n"

                # Async streaming call – does not block the event loop
                stream = await client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": _FIX_SYSTEM},
                        {"role": "user", "content": current_prompt},
                    ],
                    temperature=0.1,
                    max_tokens=4500,
                    stream=True,
                )

                fixed_rdf = ""
                chunk_count = 0
                async for chunk in stream:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        fixed_rdf += delta
                        chunk_count += 1
                        if chunk_count % 10 == 0:
                            yield f"data: {json.dumps({'type': 'streaming', 'partial_content': delta, 'total_length': len(fixed_rdf)})}\n\n"

                fixed_rdf = strip_markdown_fences(fixed_rdf)
                yield f"data: {json.dumps({'type': 'progress', 'message': f'✅ Generated {len(fixed_rdf)} characters of RDF'})}\n\n"

                # Syntax check
                yield f"data: {json.dumps({'type': 'progress', 'message': '🔍 Checking RDF syntax...'})}\n\n"
                syntax_error = await _syntax_check(fixed_rdf)
                if syntax_error:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'❌ Syntax error: {syntax_error}'})}\n\n"
                    yield f"data: {json.dumps({'type': 'done', 'fixed_rdf': fixed_rdf, 'syntax_valid': False, 'syntax_error': syntax_error, 'validation_passed': False, 'attempts': attempts})}\n\n"
                    return
                yield f"data: {json.dumps({'type': 'success', 'message': '✅ RDF syntax is valid'})}\n\n"

                # SHACL check
                yield f"data: {json.dumps({'type': 'progress', 'message': '🔍 Validating against SHACL shapes...'})}\n\n"
                try:
                    conforms, results_text = await shacl_validate(fixed_rdf, shacl_graph)
                    validation_passed = conforms
                    validation_status = results_text

                    if conforms:
                        yield f"data: {json.dumps({'type': 'success', 'message': f'🎉 Validation PASSED on attempt {attempts}!'})}\n\n"
                        break
                    else:
                        remaining_errors = results_text.count("Constraint Violation")
                        yield f"data: {json.dumps({'type': 'warning', 'message': f'⚠️ Still has {remaining_errors} validation error(s)'})}\n\n"
                        if attempts < MAX_ATTEMPTS:
                            yield f"data: {json.dumps({'type': 'info', 'message': f'🔄 Preparing retry attempt {attempts + 1}...'})}\n\n"
                        await asyncio.sleep(0.5)
                except Exception as exc:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'❌ Validation error: {str(exc)}'})}\n\n"
                    validation_status = str(exc)
                    break

            final_status = (
                "Validation passed! ✅"
                if validation_passed
                else f"Still has validation issues (after {attempts} attempt(s)):\n{validation_status}"
            )
            yield f"data: {json.dumps({'type': 'done', 'fixed_rdf': fixed_rdf, 'syntax_valid': True, 'validation_passed': validation_passed, 'validation_status': final_status, 'attempts': attempts, 'max_attempts': MAX_ATTEMPTS, 'model': 'gpt-4o', 'original_error_count': error_count or None})}\n\n"

        except HTTPException as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': exc.detail})}\n\n"
        except Exception:
            logger.exception("Unhandled error in fix-validation-errors-stream")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Internal server error'})}\n\n"

    return StreamingResponse(generate_progress(), media_type="text/event-stream")
