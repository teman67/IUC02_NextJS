from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
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

# Load environment variables
load_dotenv()

app = FastAPI(
    title="IUC02 Validation API",
    description="Backend API for RDF/SHACL validation and file operations",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://iuc-02-demonstrator.vercel.app", 
        os.getenv("FRONTEND_URL", "")  # Production frontend URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data directory path
DATA_DIR = Path(__file__).parent / "data"

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
    return {"status": "healthy"}

@app.post("/api/validate")
async def validate_rdf(request: ValidationRequest):
    """
    Validate RDF data against SHACL shapes
    """
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
        
        return {
            "conforms": conforms,
            "report_text": results_text,
            "report_details": report_details,
            "json_ld": json_ld
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Validation error: {str(e)}")

@app.get("/api/files/{filename}")
async def get_file(filename: str):
    """
    Get content of a file from the data directory
    """
    try:
        file_path = DATA_DIR / filename
        
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
async def download_file(file_content: FileContent, filename: str):
    """
    Create a downloadable file from content
    """
    try:
        # Create a temporary file
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix=f"_{filename}") as tmp_file:
            tmp_file.write(file_content.content)
            tmp_file_path = tmp_file.name
        
        return FileResponse(
            tmp_file_path,
            media_type='application/octet-stream',
            filename=filename
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/parse-rdf")
async def parse_rdf(file: UploadFile = File(...)):
    """
    Parse and validate RDF file syntax
    """
    try:
        content = await file.read()
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
