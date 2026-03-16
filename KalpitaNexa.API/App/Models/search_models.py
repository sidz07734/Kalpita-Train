# app/models/search_models.py
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

# ============================================================================
# DATA SOURCE-SPECIFIC REQUEST MODELS
# These models define the input shape for calling a specific search endpoint.
# ============================================================================

class SharePointRequest(BaseModel):
    query: str
    app_id: int # Crucial for multi-project support
    max_results: int = 10
    # temperature: float = 0.7

class SQLRequest(BaseModel):
    query: str
    app_id: int # Crucial for multi-project support
    max_results: int = 10
    # temperature: float = 0.7
    user_role: Optional[str] = None
    user_email: Optional[str] = None

class BraveSearchRequest(BaseModel):
    query: str
    max_results: int = 10
    search_type: str = "web"

class KalpitaPolicyRequest(BaseModel):
    query: str
    app_id: int # Crucial for multi-project support
    max_results: int = 5
    # temperature: float = 0.7
    use_semantic: bool = False

# ============================================================================
# DATA SOURCE-SPECIFIC RESPONSE MODELS
# These models define the output shape returned by the search endpoints.
# ============================================================================

class Citation(BaseModel):
    title: str
    url: Optional[str] = None
    filepath: Optional[str] = None
    content: Optional[str] = None
    source_type: Optional[str] = None
    score: Optional[float] = None

class SharePointResponse(BaseModel):
    success: bool
    content: Optional[str] = None
    citations: List[Citation] = []
    error: Optional[str] = None
    document_count: int = 0
    query_processed: Optional[str] = None

class CandidateInfo(BaseModel):
    """
    This model represents a single candidate record from the SQL index.
    It should contain ALL possible fields that can be returned from your SQL View.
    """
    # Core Fields
    name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    skills: Optional[str] = None
    experience: Optional[str] = None
    organization: Optional[str] = None
    designation: Optional[str] = None
    location: Optional[str] = None
    ctc: Optional[str] = None
    search_score: Optional[float] = None

    # Extended Fields from your original model
    sub_skills: Optional[str] = None
    skill_set_rating: Optional[int] = None
    education: Optional[str] = None
    relevant_experience: Optional[str] = None
    preferred_location: Optional[str] = None
    ectc: Optional[str] = None
    if_holding_offer: Optional[str] = None
    notice_period: Optional[str] = None
    if_serving_notice_lwd: Optional[str] = None
    comment: Optional[str] = None
    communication_rating: Optional[int] = None
    resume_url: Optional[str] = None
    remarks: Optional[str] = None
    doj: Optional[str] = None
    working_status: Optional[str] = None
    is_active: Optional[bool] = None
    recruiter: Optional[str] = None
    recruiter_email: Optional[str] = None
    is_candidate_flagged: Optional[bool] = None
    flagged_reason: Optional[str] = None
    source_name: Optional[str] = None
    dob: Optional[str] = None
    
    # Requisition & Interview Fields
    requisition_id: Optional[str] = None
    job_description: Optional[str] = None
    requestor_name: Optional[str] = None
    interview_status: Optional[str] = None
    interview_round_name: Optional[str] = None
    interview_round_comments: Optional[str] = None
    interviewer_email: Optional[str] = None

class SQLResponse(BaseModel):
    success: bool
    content: Optional[str] = None
    candidates: List[CandidateInfo] = []
    error: Optional[str] = None
    candidate_count: int = 0
    query_processed: Optional[str] = None

class WebResult(BaseModel):
    title: str
    url: str
    description: Optional[str] = None

class BraveSearchResponse(BaseModel):
    success: bool
    content: Optional[str] = None
    web_results: List[WebResult] = []
    error: Optional[str] = None
    results_count: int = 0
    query_processed: Optional[str] = None

class PolicyResult(BaseModel):
    """Represents a single policy document found in a search."""
    title: str
    content_snippet: Optional[str] = None
    url: Optional[str] = None
    filepath: Optional[str] = None
    search_score: Optional[float] = None

class KalpitaPolicyResponse(BaseModel):
    success: bool
    content: Optional[str] = None
    policies: List[PolicyResult] = []
    citations: List[Citation] = []
    error: Optional[str] = None
    policy_count: int = 0
    query_processed: Optional[str] = None