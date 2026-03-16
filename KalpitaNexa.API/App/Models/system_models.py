
"""
This file contains common, system-wide Pydantic models used across different
features, such as standardized success/error responses.
"""
from pydantic import BaseModel
from typing import Optional

class SuccessResponse(BaseModel):
    """A generic success response model used for operations that don't return data."""
    success: bool
    message: Optional[str] = None

class Citation(BaseModel):
    """A standardized citation model for search results."""
    title: str
    url: Optional[str] = None
    filepath: Optional[str] = None
    content: Optional[str] = None
    source_type: Optional[str] = None
    score: Optional[float] = None
 