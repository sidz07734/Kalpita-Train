# app/Models/visualization_models.py
"""
Defines Pydantic models for the visualization and dashboard generation feature.
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from .system_models import Citation

class VisualizationRequest(BaseModel):
    """Request body for generating a single chart."""
    query: str
    chart_type: str = "auto"
    data_sources: List[str] = ["sql", "sharepoint"]
    max_results: int = 20
    app_id: Optional[int] = None
    tenant_id: Optional[str] = None
    user_role: Optional[str] = None
    user_email: Optional[str] = None

class VisualizationResponse(BaseModel):
    """Response body for a single chart generation request."""
    success: bool
    chart_data: Optional[Dict[str, Any]] = None
    citations: Optional[List[Citation]] = []
    raw_ai_response: Optional[str] = None
    query_processed: Optional[str] = None
    suggested_chart_type: Optional[str] = None
    data_sources_used: Optional[List[str]] = []
    error: Optional[str] = None

class DashboardRequest(BaseModel):
    """Request body for generating a multi-chart dashboard."""
    query: str
    data_sources: List[str] = ["sql", "sharepoint"]
    max_results: int = 20
    app_id: Optional[int] = None
    tenant_id: Optional[str] = None
    user_role: Optional[str] = None
    user_email: Optional[str] = None

class DashboardResponse(BaseModel):
    """Response body for a dashboard generation request."""
    success: bool
    charts_data: List[Dict[str, Any]] = []
    error: Optional[str] = None
    