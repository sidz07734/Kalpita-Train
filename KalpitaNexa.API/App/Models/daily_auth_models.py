from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class DailyAuthRequest(BaseModel):
    query: str
    app_id: Optional[int] = 0
    tenant_id: Optional[str] = None
class DashboardWidget(BaseModel):
    """Represents a UI Element (Card, Chart, Table, Text)"""
    type: str  # 'kpi_card', 'line_chart', 'bar_chart', 'pivot_table', 'text_block'
    title: str
    data: Any  # Dict for card, List for charts/tables, String for text
    layout: Optional[Dict[str, Any]] = None

class DailyAuthResult(BaseModel):
    success: bool
    response_text: str
    widgets: List[DashboardWidget] = Field(default_factory=list) 
    
    follow_up_questions: List[str] = []  # NEW: Follow-up questions
    error: Optional[str] = None