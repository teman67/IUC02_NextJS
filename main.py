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
        "https://iuc-02-demonstrator.vercel.app",  # Your production frontend
        os.getenv("FRONTEND_URL", "")  # Additional frontend URL if needed
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data directory path
DATA_DIR = Path(__file__).parent.parent / "data"

class ValidationRequest(BaseModel):
    rdf_content: str
    shacl_content: str
    
class FileContent(BaseModel):
    content: str

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
