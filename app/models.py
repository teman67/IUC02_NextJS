from pydantic import BaseModel


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
