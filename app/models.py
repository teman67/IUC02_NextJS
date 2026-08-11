from pydantic import BaseModel, Field


class ValidationRequest(BaseModel):
    rdf_content: str
    shacl_content: str


class RdfGraphRequest(BaseModel):
    """Dedicated model for /api/rdf-graph – shacl_content is not needed."""
    rdf_content: str


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


# ---------------------------------------------------------------------------
# AgentSem models
# ---------------------------------------------------------------------------

class AgentSemRequest(BaseModel):
    user_input: str
    provider: str = "OpenAI"
    model: str = "gpt-4.1"
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    api_key: str = ""
    endpoint: str = "http://localhost:11434"
    max_opt: int = Field(default=1, ge=0, le=10)
    max_corr: int = Field(default=8, ge=0, le=10)
    # Floor of 0.5: below that every ontology term matches every RDF term, which
    # produced millions of match dicts (multi-GB) rather than useful signal.
    similarity_threshold: float = Field(default=1.0, ge=0.5, le=1.0)


class AgentSemValidateKeyRequest(BaseModel):
    provider: str
    api_key: str = ""
    endpoint: str = ""


class ParseGraphRequest(BaseModel):
    rdf: str
