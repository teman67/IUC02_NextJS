from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional
import pyshacl
from rdflib import Graph
import os
import tempfile
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv
import httpx
import json
import asyncio
import logging
import uuid
import time

# Load environment variables
load_dotenv()

# Structured logging
logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "name": "%(name)s", "message": "%(message)s"}'
)
logger = logging.getLogger("iuc02")

app = FastAPI(
    title="IUC02 Validation API",
    description="Backend API for RDF/SHACL validation and file operations",
    version="1.0.0"
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Structured request/response logging with request-id and latency."""
    req_id = str(uuid.uuid4())[:8]
    start = time.monotonic()
    logger.info(
        "[%s] --> %s %s  ip=%s",
        req_id, request.method, request.url.path,
        request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown"),
    )
    response = await call_next(request)
    elapsed = time.monotonic() - start
    logger.info("[%s] <-- %s %s  status=%d latency=%.3fs",
                req_id, request.method, request.url.path, response.status_code, elapsed)
    response.headers["X-Request-Id"] = req_id
    return response

# Configure CORS – origins from env to avoid hard-coding in production
_allowed_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://iuc-02-demonstrator.vercel.app",
]
_extra = os.getenv("FRONTEND_URL", "")
if _extra:
    _allowed_origins.append(_extra)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
    max_age=600,
)

# Data directory path
DATA_DIR = Path(__file__).parent / "data"

# Allowlist of files that may be served via the API (prevents path traversal)
ALLOWED_FILES = {
    "2024-09_Schema_IUC02_v1.json",
    "mapping document.json",
    "rdfGraph_smallExample.ttl",
    "shaclShape_smallExample.ttl",
    "Vh5205_C-95_translated.json",
    "Vh5205_C-95.LIS",
}

# Upload size limits
MAX_UPLOAD_BYTES = 2 * 1024 * 1024   # 2 MB per file upload
MAX_RDF_CHARS   = 500_000            # approx 500 KB text content
ALLOWED_MIME_TYPES = {"text/plain", "application/octet-stream", "text/turtle"}

class ValidationRequest(BaseModel):
    rdf_content: str
    shacl_content: str
    
class FileContent(BaseModel):
    content: str

class ValidationAnalysisRequest(BaseModel):
    validation_report: str
    rdf_content: str
    shacl_content: str
    conforms: bool

class ValidationFixRequest(BaseModel):
    validation_report: str
    rdf_content: str
    shacl_content: str
    ai_analysis: str

@app.get("/")
async def root():
    return {"message": "IUC02 Validation API is running", "version": "1.0.0"}

@app.get("/api/health")
async def health_check():
    """Health check that also probes optional external dependencies."""
    checks: dict = {"status": "healthy", "dependencies": {}}

    # Check OpenAI key is present (no live call to avoid cost)
    checks["dependencies"]["openai_key"] = "configured" if os.getenv("OPENAI_API_KEY") else "missing"

    # Confirm data directory is accessible
    checks["dependencies"]["data_dir"] = "ok" if DATA_DIR.exists() else "missing"

    if os.getenv("OPENAI_API_KEY") is None or not DATA_DIR.exists():
        checks["status"] = "degraded"

    logger.info("Health check: %s", checks)
    return checks

@app.post("/api/validate")
async def validate_rdf(request: ValidationRequest):
    """
    Validate RDF data against SHACL shapes
    """
    # Guard against excessively large inputs
    if len(request.rdf_content) > MAX_RDF_CHARS or len(request.shacl_content) > MAX_RDF_CHARS:
        raise HTTPException(status_code=413, detail="Input too large. Maximum 500 KB per graph.")

    request_id = str(uuid.uuid4())[:8]
    start = time.monotonic()
    logger.info("[%s] /api/validate started – rdf=%d chars shacl=%d chars",
                request_id, len(request.rdf_content), len(request.shacl_content))
    try:
        # Parse RDF data
        data_graph = Graph()
        data_graph.parse(data=request.rdf_content, format="turtle")
        
        # Parse SHACL shapes
        shacl_graph = Graph()
        shacl_graph.parse(data=request.shacl_content, format="turtle")
        
        # Perform validation
        conforms, results_graph, results_text = pyshacl.validate(
            data_graph,
            shacl_graph=shacl_graph,
            inference='rdfs',
            abort_on_first=False,
            allow_infos=False,
            allow_warnings=False,
            meta_shacl=False,
            advanced=False,
            js=False,
            debug=True,
        )
        
        # Convert to JSON-LD
        json_ld = data_graph.serialize(format="json-ld", indent=2)
        
        # Parse detailed report
        report_details = []
        for s, p, o in sorted(results_graph):
            report_details.append({
                "subject": str(s),
                "predicate": str(p),
                "object": str(o)
            })
        
        elapsed = time.monotonic() - start
        logger.info("[%s] /api/validate done – conforms=%s latency=%.2fs", request_id, conforms, elapsed)
        return {
            "conforms": conforms,
            "report_text": results_text,
            "report_details": report_details,
            "json_ld": json_ld
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[%s] /api/validate error: %s", request_id, e)
        raise HTTPException(status_code=400, detail=f"Validation error: {str(e)}")

@app.get("/api/files/{filename}")
async def get_file(filename: str):
    """
    Get content of a file from the data directory.
    Only files in the ALLOWED_FILES allowlist can be served.
    """
    # Prevent path traversal: reject any filename that contains path separators
    # or is not in the explicit allowlist.
    if filename not in ALLOWED_FILES:
        logger.warning("Blocked file request for '%s' (not in allowlist)", filename)
        raise HTTPException(status_code=404, detail="File not found")

    try:
        file_path = DATA_DIR / filename
        # Verify the resolved path is still inside DATA_DIR
        resolved = file_path.resolve()
        if not str(resolved).startswith(str(DATA_DIR.resolve())):
            logger.error("Path traversal attempt blocked for '%s'", filename)
            raise HTTPException(status_code=400, detail="Invalid filename")

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # Try different encodings
        encodings = ['utf-8', 'latin-1', 'iso-8859-1']
        content = None
        
        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    content = f.read()
                break
            except UnicodeDecodeError:
                continue
        
        if content is None:
            raise HTTPException(status_code=500, detail="Could not decode file")
        
        return {"filename": filename, "content": content}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/files")
async def list_files():
    """
    List all files in the data directory
    """
    try:
        files = []
        if DATA_DIR.exists():
            for file_path in DATA_DIR.iterdir():
                if file_path.is_file():
                    files.append({
                        "name": file_path.name,
                        "size": file_path.stat().st_size,
                        "extension": file_path.suffix
                    })
        return {"files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/files/download")
async def download_file(
    file_content: FileContent,
    filename: str,
    background_tasks: BackgroundTasks,
):
    """
    Create a downloadable file from content.
    The temp file is removed from disk after the response is sent.
    """
    # Basic name sanitisation – allow only safe characters in the download name
    safe_name = Path(filename).name
    if not safe_name or any(c in safe_name for c in ("/", "\\", "..:")):
        raise HTTPException(status_code=400, detail="Invalid filename")

    try:
        # Create a temporary file
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix=f"_{safe_name}") as tmp_file:
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
            media_type='application/octet-stream',
            filename=safe_name,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/parse-rdf")
async def parse_rdf(file: UploadFile = File(...)):
    """
    Parse and validate RDF file syntax.
    Enforces a 2 MB size cap to prevent resource exhaustion.
    """
    try:
        content = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum allowed size is {MAX_UPLOAD_BYTES // 1024} KB.",
            )
        # Validate MIME type if provided by client
        if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
            logger.warning("Rejected upload with MIME type '%s'", file.content_type)
            raise HTTPException(status_code=415, detail="Unsupported file type. Upload a Turtle (.ttl) file.")
        content_str = content.decode('utf-8')
        
        # Try to parse the RDF
        g = Graph()
        g.parse(data=content_str, format="turtle")
        
        return {
            "valid": True,
            "triples_count": len(g),
            "message": "RDF file is valid"
        }
    except Exception as e:
        return {
            "valid": False,
            "message": f"RDF parsing error: {str(e)}"
        }

@app.post("/api/analyze-validation")
async def analyze_validation(request: ValidationAnalysisRequest):
    """
    Analyze validation failures using OpenAI GPT-4o mini
    """
    try:
        # Get OpenAI API key from environment
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=500, 
                detail="OpenAI API key not configured. Please set OPENAI_API_KEY environment variable."
            )
        
        # Initialize OpenAI client with timeout and retry settings
        client = OpenAI(
            api_key=api_key,
            timeout=httpx.Timeout(60.0, connect=10.0),
            max_retries=2
        )
        
        # Construct the analysis prompt
        prompt = f"""You are an expert in RDF/SHACL validation and semantic data analysis. 

A user has performed SHACL validation on their RDF data graph, and the validation {'passed' if request.conforms else 'FAILED'}.

{'Since validation failed, please analyze the validation report and help the user understand what went wrong and how to fix it.' if not request.conforms else 'Please provide a summary of what was validated successfully.'}

**Validation Report:**
```
{request.validation_report}
```

**Data Graph (RDF - Turtle format):**
```turtle
{request.rdf_content[:2000]}{'...(truncated)' if len(request.rdf_content) > 2000 else ''}
```

**Shape Graph (SHACL - Turtle format):**
```turtle
{request.shacl_content[:2000]}{'...(truncated)' if len(request.shacl_content) > 2000 else ''}
```

Please provide:
1. **Summary**: A brief, non-technical explanation of what happened
2. **Issues Found**: List specific violations in plain language (if any)
3. **Root Causes**: Explain why these violations occurred
4. **Recommendations**: Concrete steps to fix each issue
5. **Example Fix**: Show a code snippet example of how to correct one of the main issues (if applicable)

Format your response in clear markdown with headers and bullet points for easy reading."""
        
        # Call OpenAI API
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful expert in RDF, SHACL validation, and semantic web technologies. Explain technical concepts in a way that's accessible to users with varying levels of expertise."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.7,
            max_tokens=2000
        )
        
        analysis = response.choices[0].message.content
        
        return {
            "success": True,
            "analysis": analysis,
            "model": "gpt-4o-mini",
            "timestamp": response.created
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Analysis error: {str(e)}"
        )

@app.post("/api/fix-validation-errors")
async def fix_validation_errors(request: ValidationFixRequest):
    """
    Attempt to automatically fix validation errors using OpenAI GPT-4o
    Uses iterative refinement with up to 3 attempts
    """
    try:
        # Get OpenAI API key from environment
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=500, 
                detail="OpenAI API key not configured. Please set OPENAI_API_KEY environment variable."
            )
        
        # Initialize OpenAI client with timeout and retry settings
        client = OpenAI(
            api_key=api_key,
            timeout=httpx.Timeout(90.0, connect=10.0),  # Increased timeout for gpt-4o
            max_retries=2
        )
        
        # Try to count validation errors for better context
        error_count = request.validation_report.lower().count("constraint violation")
        if error_count == 0:
            error_count = request.validation_report.lower().count("result")
        error_context = f"\n**Estimated number of constraint violations: {error_count}**\n" if error_count > 0 else ""
        
        # Construct the fix prompt with chain-of-thought approach
        prompt = f"""You are an expert in RDF/SHACL validation and semantic data correction. 

A user has performed SHACL validation on their RDF data graph, and the validation FAILED with MULTIPLE ERRORS.
{error_context}
**Original Validation Report (READ CAREFULLY - contains ALL errors to fix):**
```
{request.validation_report}
```

**Original Data Graph (RDF - Turtle format):**
```turtle
{request.rdf_content}
```

**Shape Graph (SHACL - Turtle format):**
```turtle
{request.shacl_content}
```

**AI Analysis of Issues:**
{request.ai_analysis}

CRITICAL STEP-BY-STEP INSTRUCTIONS:

STEP 1: Extract EXACT property names from validation report
   - Look for "Result Path:" in each error
   - Copy the EXACT property name (case-sensitive, character-for-character)
   - Example: If it says "Result Path: :dateOftestStart" use EXACTLY ":dateOftestStart" (NOT :dateOfTestStart)

STEP 2: For EACH error in the validation report:
   - Note the Focus Node (which resource has the issue)
   - Note the Result Path (EXACT property name - preserve exact capitalization)
   - Note what's required (MinCount, MaxCount, datatype, etc.)
   - Note the constraint violation message

STEP 3: Generate fixes using EXACT property names
   - Use the EXACT property names from the validation report
   - Do NOT change capitalization or spelling
   - If report says ":dateOftestStart", use ":dateOftestStart" (not :dateOfTestStart)
   - Match every property name character-for-character with the validation report

STEP 4: Apply ALL fixes systematically
   - Fix EVERY error found in the validation report
   - Preserve all valid data from original
   - Add inline comments (using #) explaining each fix

CRITICAL REQUIREMENTS:
- **EXACT PROPERTY NAME MATCHING**: Use property names EXACTLY as shown in "Result Path:" of validation report
- Property names are **CASE-SENSITIVE**: :dateOftestStart ≠ :dateOfTestStart
- Fix EVERY SINGLE ERROR from the validation report
- Preserve all valid data and structure from the original
- Output ONLY the corrected RDF Turtle format
- NO markdown code blocks (```), NO explanations before/after
- Ensure syntactically valid Turtle format

Output the complete corrected RDF Data Graph in Turtle format:"""
        
        # Call OpenAI API with gpt-4o for better reasoning capability
        response = client.chat.completions.create(
            model="gpt-4o",  # Using more powerful model
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert RDF/SHACL data correction assistant. You systematically fix ALL validation errors by carefully analyzing each one. CRITICAL: Property names are case-sensitive - you MUST use EXACT property names from the validation report's 'Result Path:' fields (e.g., :dateOftestStart is different from :dateOfTestStart). You output ONLY valid RDF Turtle format with ALL corrections applied using EXACT property names. Never use markdown code blocks - output pure Turtle syntax only."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.1,  # Very low temperature for precise, systematic fixes
            max_tokens=4500  # Increased token limit
        )
        
        fixed_rdf = response.choices[0].message.content
        
        # Clean up potential markdown code blocks if AI included them
        if fixed_rdf:
            # Remove potential markdown code block syntax
            fixed_rdf = fixed_rdf.strip()
            if fixed_rdf.startswith("```turtle"):
                fixed_rdf = fixed_rdf[9:]
            elif fixed_rdf.startswith("```ttl"):
                fixed_rdf = fixed_rdf[6:]
            elif fixed_rdf.startswith("```"):
                fixed_rdf = fixed_rdf[3:]
            if fixed_rdf.endswith("```"):
                fixed_rdf = fixed_rdf[:-3]
            fixed_rdf = fixed_rdf.strip()
        
        # Validate that the fixed RDF is syntactically correct
        try:
            test_graph = Graph()
            test_graph.parse(data=fixed_rdf, format="turtle")
            syntax_valid = True
            syntax_error = None
        except Exception as e:
            syntax_valid = False
            syntax_error = str(e)
        
        # Validate the fixed RDF against SHACL to confirm it passes
        validation_status = None
        validation_passed = False
        attempts = 1
        max_attempts = 3  # Increased to 3 attempts for complex fixes
        
        if syntax_valid:
            try:
                data_graph = Graph()
                data_graph.parse(data=fixed_rdf, format="turtle")
                
                shacl_graph = Graph()
                shacl_graph.parse(data=request.shacl_content, format="turtle")
                
                conforms, results_graph, results_text = pyshacl.validate(
                    data_graph,
                    shacl_graph=shacl_graph,
                    inference='rdfs',
                    abort_on_first=False,
                )
                
                validation_passed = conforms
                
                # If fix attempt still has errors, try additional times with the remaining errors
                while not conforms and attempts < max_attempts:
                    attempts += 1
                    
                    # Extract property names from remaining errors to make them explicit
                    remaining_property_names = []
                    for line in results_text.split('\n'):
                        if 'Result Path:' in line:
                            prop = line.split('Result Path:')[1].strip()
                            remaining_property_names.append(prop)
                    
                    property_emphasis = ""
                    if remaining_property_names:
                        property_emphasis = f"\n**⚠️ EXACT PROPERTY NAMES TO FIX (copy these exactly):**\n" + "\n".join([f"   - {prop}" for prop in remaining_property_names]) + "\n"
                    
                    retry_prompt = f"""Your previous fix attempt (attempt #{attempts-1}) still has validation errors. You need to fix the REMAINING errors.

**REMAINING VALIDATION ERRORS (these must ALL be fixed):**
```
{results_text}
```
{property_emphasis}
**Your previous fix attempt #{attempts-1} (that still has errors above):**
```turtle
{fixed_rdf}
```

**Original SHACL Shape constraints (for reference):**
```turtle
{request.shacl_content[:1500]}{'...' if len(request.shacl_content) > 1500 else ''}
```

CRITICAL: This is attempt #{attempts} of {max_attempts}. 

🔴 COMMON MISTAKE TO AVOID:
   - Using wrong property name capitalization
   - Example: If error shows ":dateOftestStart" (lowercase 't'), don't use ":dateOfTestStart" (uppercase 'T')
   - Look at "Result Path:" in the error and copy it EXACTLY

YOU MUST:
1. Read "Result Path:" in EACH error above - copy property names EXACTLY (character-by-character)
2. Look at the Focus Node to see which resource needs the property
3. Fix ALL remaining errors using the EXACT property names
4. Keep all the corrections from the previous attempt
5. Only add/modify what's needed to fix the remaining errors with EXACT property names

Output the FULLY CORRECTED RDF (Turtle format ONLY, no markdown blocks):"""
                    
                    retry_response = client.chat.completions.create(
                        model="gpt-4o",  # Continue using more powerful model
                        messages=[
                            {
                                "role": "system",
                                "content": "You are an expert RDF/SHACL data correction assistant. This is a retry attempt. Fix ALL remaining validation errors comprehensively. CRITICAL: Use EXACT property names from the 'Result Path:' in the validation report - property names are case-sensitive (e.g., :dateOftestStart ≠ :dateOfTestStart). Output ONLY valid RDF Turtle format with EXACT property names."
                            },
                            {
                                "role": "user",
                                "content": retry_prompt
                            }
                        ],
                        temperature=0.1,
                        max_tokens=4500
                    )
                    
                    fixed_rdf = retry_response.choices[0].message.content
                    
                    # Clean up again
                    if fixed_rdf:
                        fixed_rdf = fixed_rdf.strip()
                        if fixed_rdf.startswith("```turtle"):
                            fixed_rdf = fixed_rdf[9:]
                        elif fixed_rdf.startswith("```ttl"):
                            fixed_rdf = fixed_rdf[6:]
                        elif fixed_rdf.startswith("```"):
                            fixed_rdf = fixed_rdf[3:]
                        if fixed_rdf.endswith("```"):
                            fixed_rdf = fixed_rdf[:-3]
                        fixed_rdf = fixed_rdf.strip()
                    
                    # Re-validate
                    try:
                        data_graph = Graph()
                        data_graph.parse(data=fixed_rdf, format="turtle")
                        
                        conforms, results_graph, results_text = pyshacl.validate(
                            data_graph,
                            shacl_graph=shacl_graph,
                            inference='rdfs',
                            abort_on_first=False,
                        )
                        validation_passed = conforms
                        
                        if conforms:
                            break  # Success! Exit the retry loop
                        
                    except Exception as e:
                        validation_passed = False
                        results_text = f"Parse error on attempt {attempts}: {str(e)}"
                        break  # Stop if we get parse errors
                
                validation_status = "Validation passed! ✅" if conforms else f"Still has validation issues (after {attempts} attempt(s)):\n{results_text}"
                
            except Exception as e:
                validation_status = f"Could not validate fixed RDF: {str(e)}"
        
        return {
            "success": True,
            "fixed_rdf": fixed_rdf,
            "syntax_valid": syntax_valid,
            "syntax_error": syntax_error,
            "validation_passed": validation_passed,
            "validation_status": validation_status,
            "attempts": attempts,
            "max_attempts": max_attempts,
            "model": "gpt-4o",
            "timestamp": response.created,
            "original_error_count": error_count if error_count > 0 else None
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Fix generation error: {str(e)}"
        )

@app.post("/api/fix-validation-errors-stream")
async def fix_validation_errors_stream(request: ValidationFixRequest):
    """
    Stream AI progress while fixing validation errors
    Uses Server-Sent Events (SSE) to provide real-time updates
    """
    async def generate_progress():
        try:
            # Get OpenAI API key
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                yield f"data: {json.dumps({'type': 'error', 'message': 'OpenAI API key not configured'})}\n\n"
                return
            
            # Initialize OpenAI client
            client = OpenAI(
                api_key=api_key,
                timeout=httpx.Timeout(90.0, connect=10.0),
                max_retries=2
            )
            
            # Count errors
            error_count = request.validation_report.lower().count("constraint violation")
            if error_count == 0:
                error_count = request.validation_report.lower().count("result")
            
            yield f"data: {json.dumps({'type': 'info', 'message': f'🔍 Analyzing validation report... Found ~{error_count} constraint violations'})}\n\n"
            await asyncio.sleep(0.1)
            
            error_context = f"\n**Estimated number of constraint violations: {error_count}**\n" if error_count > 0 else ""
            
            # Construct the fix prompt
            prompt = f"""You are an expert in RDF/SHACL validation and semantic data correction. 

A user has performed SHACL validation on their RDF data graph, and the validation FAILED with MULTIPLE ERRORS.
{error_context}
**Original Validation Report (READ CAREFULLY - contains ALL errors to fix):**
```
{request.validation_report}
```

**Original Data Graph (RDF - Turtle format):**
```turtle
{request.rdf_content}
```

**Shape Graph (SHACL - Turtle format):**
```turtle
{request.shacl_content}
```

**AI Analysis of Issues:**
{request.ai_analysis}

CRITICAL STEP-BY-STEP INSTRUCTIONS:

STEP 1: Extract EXACT property names from validation report
   - Look for "Result Path:" in each error
   - Copy the EXACT property name (case-sensitive, character-for-character)
   - Example: If it says "Result Path: :dateOftestStart" use EXACTLY ":dateOftestStart" (NOT :dateOfTestStart)

STEP 2: For EACH error in the validation report:
   - Note the Focus Node (which resource has the issue)
   - Note the Result Path (EXACT property name - preserve exact capitalization)
   - Note what's required (MinCount, MaxCount, datatype, etc.)
   - Note the constraint violation message

STEP 3: Generate fixes using EXACT property names
   - Use the EXACT property names from the validation report
   - Do NOT change capitalization or spelling
   - If report says ":dateOftestStart", use ":dateOftestStart" (not :dateOfTestStart)
   - Match every property name character-for-character with the validation report

STEP 4: Apply ALL fixes systematically
   - Fix EVERY error found in the validation report
   - Preserve all valid data from original
   - Add inline comments (using #) explaining each fix

CRITICAL REQUIREMENTS:
- **EXACT PROPERTY NAME MATCHING**: Use property names EXACTLY as shown in "Result Path:" of validation report
- Property names are **CASE-SENSITIVE**: :dateOftestStart ≠ :dateOfTestStart
- Fix EVERY SINGLE ERROR from the validation report
- Preserve all valid data and structure from the original
- Output ONLY the corrected RDF Turtle format
- NO markdown code blocks (```), NO explanations before/after
- Ensure syntactically valid Turtle format

Output the complete corrected RDF Data Graph in Turtle format:"""
            
            max_attempts = 3
            attempts = 0
            fixed_rdf = ""
            validation_passed = False
            validation_status = ""
            
            while attempts < max_attempts and not validation_passed:
                attempts += 1
                yield f"data: {json.dumps({'type': 'attempt', 'attempt': attempts, 'max_attempts': max_attempts, 'message': f'🤖 Attempt {attempts}/{max_attempts}: AI is generating fixes...'})}\n\n"
                await asyncio.sleep(0.1)
                
                # Use different prompt for retry attempts
                if attempts > 1:
                    # Extract property names from remaining errors
                    remaining_property_names = []
                    for line in validation_status.split('\n'):
                        if 'Result Path:' in line:
                            prop = line.split('Result Path:')[1].strip()
                            remaining_property_names.append(prop)
                    
                    property_emphasis = ""
                    if remaining_property_names:
                        property_emphasis = f"\n**⚠️ EXACT PROPERTY NAMES TO FIX (copy these exactly):**\n" + "\n".join([f"   - {prop}" for prop in remaining_property_names]) + "\n"
                        properties_list = ", ".join(remaining_property_names)
                        yield f"data: {json.dumps({'type': 'info', 'message': f'🔍 Targeting specific properties: {properties_list}'})}\n\n"
                    
                    prompt = f"""Your previous fix attempt (attempt #{attempts-1}) still has validation errors. You need to fix the REMAINING errors.

**REMAINING VALIDATION ERRORS (these must ALL be fixed):**
```
{validation_status}
```
{property_emphasis}
**Your previous fix attempt #{attempts-1} (that still has errors above):**
```turtle
{fixed_rdf}
```

**Original SHACL Shape constraints (for reference):**
```turtle
{request.shacl_content[:1500]}{'...' if len(request.shacl_content) > 1500 else ''}
```

CRITICAL: This is attempt #{attempts} of {max_attempts}. 

🔴 COMMON MISTAKE TO AVOID:
   - Using wrong property name capitalization
   - Example: If error shows ":dateOftestStart" (lowercase 't'), don't use ":dateOfTestStart" (uppercase 'T')
   - Look at "Result Path:" in the error and copy it EXACTLY

YOU MUST:
1. Read "Result Path:" in EACH error above - copy property names EXACTLY (character-by-character)
2. Look at the Focus Node to see which resource needs the property
3. Fix ALL remaining errors using the EXACT property names
4. Keep all the corrections from the previous attempt
5. Only add/modify what's needed to fix the remaining errors with EXACT property names

Output the FULLY CORRECTED RDF (Turtle format ONLY, no markdown blocks):"""
                
                # Stream the AI response
                yield f"data: {json.dumps({'type': 'progress', 'message': '✍️ AI is writing corrected RDF...'})}\n\n"
                
                stream = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {
                            "role": "system",
                            "content": "You are an expert RDF/SHACL data correction assistant. You systematically fix ALL validation errors by carefully analyzing each one. CRITICAL: Property names are case-sensitive - you MUST use EXACT property names from the validation report's 'Result Path:' fields (e.g., :dateOftestStart is different from :dateOfTestStart). You output ONLY valid RDF Turtle format with ALL corrections applied using EXACT property names. Never use markdown code blocks - output pure Turtle syntax only."
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    temperature=0.1,
                    max_tokens=4500,
                    stream=True  # Enable streaming
                )
                
                fixed_rdf = ""
                chunk_count = 0
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        fixed_rdf += content
                        chunk_count += 1
                        # Send progress every 10 chunks to avoid overwhelming
                        if chunk_count % 10 == 0:
                            yield f"data: {json.dumps({'type': 'streaming', 'partial_content': content, 'total_length': len(fixed_rdf)})}\n\n"
                
                # Clean up markdown blocks
                fixed_rdf = fixed_rdf.strip()
                if fixed_rdf.startswith("```turtle"):
                    fixed_rdf = fixed_rdf[9:]
                elif fixed_rdf.startswith("```ttl"):
                    fixed_rdf = fixed_rdf[6:]
                elif fixed_rdf.startswith("```"):
                    fixed_rdf = fixed_rdf[3:]
                if fixed_rdf.endswith("```"):
                    fixed_rdf = fixed_rdf[:-3]
                fixed_rdf = fixed_rdf.strip()
                
                yield f"data: {json.dumps({'type': 'progress', 'message': f'✅ Generated {len(fixed_rdf)} characters of RDF'})}\n\n"
                await asyncio.sleep(0.1)
                
                # Validate syntax
                yield f"data: {json.dumps({'type': 'progress', 'message': '🔍 Checking RDF syntax...'})}\n\n"
                try:
                    test_graph = Graph()
                    test_graph.parse(data=fixed_rdf, format="turtle")
                    yield f"data: {json.dumps({'type': 'success', 'message': '✅ RDF syntax is valid'})}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'❌ Syntax error: {str(e)}'})}\n\n"
                    yield f"data: {json.dumps({'type': 'done', 'fixed_rdf': fixed_rdf, 'syntax_valid': False, 'syntax_error': str(e), 'validation_passed': False, 'attempts': attempts})}\n\n"
                    return
                
                # Validate against SHACL
                yield f"data: {json.dumps({'type': 'progress', 'message': '🔍 Validating against SHACL shapes...'})}\n\n"
                try:
                    data_graph = Graph()
                    data_graph.parse(data=fixed_rdf, format="turtle")
                    
                    shacl_graph = Graph()
                    shacl_graph.parse(data=request.shacl_content, format="turtle")
                    
                    conforms, results_graph, results_text = pyshacl.validate(
                        data_graph,
                        shacl_graph=shacl_graph,
                        inference='rdfs',
                        abort_on_first=False,
                    )
                    
                    validation_passed = conforms
                    validation_status = results_text
                    
                    if conforms:
                        yield f"data: {json.dumps({'type': 'success', 'message': f'🎉 Validation PASSED on attempt {attempts}!'})}\n\n"
                        break
                    else:
                        remaining_errors = results_text.count("Constraint Violation")
                        yield f"data: {json.dumps({'type': 'warning', 'message': f'⚠️ Still has {remaining_errors} validation error(s)'})}\n\n"
                        if attempts < max_attempts:
                            yield f"data: {json.dumps({'type': 'info', 'message': f'🔄 Preparing retry attempt {attempts + 1}...'})}\n\n"
                        await asyncio.sleep(0.5)
                        
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'❌ Validation error: {str(e)}'})}\n\n"
                    validation_status = str(e)
                    break
            
            # Send final result
            final_status = "Validation passed! ✅" if validation_passed else f"Still has validation issues (after {attempts} attempt(s)):\n{validation_status}"
            
            yield f"data: {json.dumps({'type': 'done', 'fixed_rdf': fixed_rdf, 'syntax_valid': True, 'validation_passed': validation_passed, 'validation_status': final_status, 'attempts': attempts, 'max_attempts': max_attempts, 'model': 'gpt-4o', 'original_error_count': error_count if error_count > 0 else None})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Error: {str(e)}'})}\n\n"
    
    return StreamingResponse(generate_progress(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
