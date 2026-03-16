# app/Models/file_processing_models.py
"""
Defines Pydantic models for the file processing feature.
"""
from pydantic import BaseModel
from typing import Optional, List
from .system_models import Citation

class FileProcessingResponse(BaseModel):
    """
    Standardized response for the file upload and analysis process.
    """
    success: bool
    response: Optional[str] = None
    citations: Optional[List[Citation]] = []
    error: Optional[str] = None
    follow_up_questions: Optional[List[str]] = []
    files_processed: Optional[List[str]] = []
    failed_files: Optional[List[str]] = []
    message_id: Optional[str] = None # The ID of the chat message created