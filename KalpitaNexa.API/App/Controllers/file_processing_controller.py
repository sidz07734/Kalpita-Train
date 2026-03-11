# app/Controllers/file_processing_controller.py
"""
Defines the API endpoint for file uploads and processing.
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from ..Services.file_processing_service import FileProcessingService
from ..Models.file_processing_models import FileProcessingResponse
from ..dependencies import get_file_processing_service

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/files/upload", response_model=FileProcessingResponse, tags=["File Processing"])
async def upload_and_process_files(
    files: List[UploadFile] = File(...),
    user_query: Optional[str] = Query(None, description="A specific question to ask about the documents."),
    user_id: str = Query(..., description="The ID (email) of the user uploading the file."),
    tenant_id: str = Query(..., description="The tenant ID of the user."),
    app_id: int = Query(..., description="The application ID context."),
    client_id: Optional[str] = Query(None),
    service: FileProcessingService = Depends(get_file_processing_service)
):
    """
    Uploads document(s), saves them to the database, performs an AI analysis,
    and saves the interaction as a new chat message.
    """
    try:
        result = await service.process_uploaded_files(
            files=files, user_query=user_query, user_id=user_id,
            tenant_id=tenant_id, app_id=app_id, client_id=client_id
        )
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "File processing failed."))
        return result
    except Exception as e:
        logger.error(f"File upload controller error: {e}", exc_info=True)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {e}")