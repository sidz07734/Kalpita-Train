"""
Controller for the Training module.
Defines the HTTP endpoints — NO business logic here.

Place at: KalpitaNexa/KalpitaNexa.API/App/Controllers/training_controller.py

Endpoints:
  POST /api/training/process    — trigger Phase 1 for a Day folder
  POST /api/training/reprocess  — force regenerate outputs with updated prompts
  GET  /api/training/status     — check processing status of a Day folder
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from ..Models.training_models import (
    ProcessTrainingRequest,
    QuizRequest,
    TrainingApiResponse,
)
from ..Services.training_service import TrainingService
from ..dependencies import get_training_service
from ..dependencies import verify_token
from ..Models.training_models import QuizResultRequest

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/training/process", response_model=TrainingApiResponse)
async def process_training(
    request: ProcessTrainingRequest,
    training_service: TrainingService = Depends(get_training_service),
):
    """
    Trigger Phase 1 for a given Day folder on SharePoint.
    Idempotent — safe to call multiple times.

    Request body example:
        { "day_folder_name": "Day 2 - AI training - Pavan" }
    """
    try:
        result = await training_service.process_phase1(request.day_folder_name)
        return TrainingApiResponse(success=True, data=result)
    except FileNotFoundError as e:
        logger.warning(f"Training process — file not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        logger.warning(f"Training process — validation error: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Training process failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Processing failed. Check server logs.")


@router.post("/training/reprocess", response_model=TrainingApiResponse)
async def reprocess_training(
    request: ProcessTrainingRequest,
    training_service: TrainingService = Depends(get_training_service),
):
    """
    Force reprocess Phase 1 by deleting existing outputs and regenerating.
    
    Use this when:
    - Prompts have been updated and you want fresh outputs
    - You want to regenerate with new AI rules
    - Existing outputs need to be redone
    
    Request body example:
        { "day_folder_name": "Day 2 - AI training - Pavan" }
    """
    try:
        result = await training_service.reprocess_phase1(request.day_folder_name)
        return TrainingApiResponse(success=True, data=result)
    except FileNotFoundError as e:
        logger.warning(f"Reprocess — file not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        logger.warning(f"Reprocess — validation error: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Reprocess failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Reprocessing failed. Check server logs.")

@router.post("/training/generate-summary", response_model=TrainingApiResponse)
async def generate_summary(
    request: ProcessTrainingRequest,
    training_service: TrainingService = Depends(get_training_service),
):
    """
    Generate only the summary.docx for a Day folder.
    If summary already exists, returns a message without regenerating.

    Request body example:
        { "day_folder_name": "Day 2 - AI training - Pavan" }
    """
    try:
        result = await training_service.generate_summary(request.day_folder_name)
        return TrainingApiResponse(success=True, data=result)
    except FileNotFoundError as e:
        logger.warning(f"Generate summary — file not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        logger.warning(f"Generate summary — validation error: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Generate summary failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Summary generation failed. Check server logs.")


@router.post("/training/generate-qa", response_model=TrainingApiResponse)
async def generate_qa(
    request: ProcessTrainingRequest,
    training_service: TrainingService = Depends(get_training_service),
):
    """
    Generate only the qa.docx for a Day folder.
    If Q&A already exists, returns a message without regenerating.

    Request body example:
        { "day_folder_name": "Day 2 - AI training - Pavan" }
    """
    try:
        result = await training_service.generate_qa(request.day_folder_name)
        return TrainingApiResponse(success=True, data=result)
    except FileNotFoundError as e:
        logger.warning(f"Generate Q&A — file not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        logger.warning(f"Generate Q&A — validation error: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Generate Q&A failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Q&A generation failed. Check server logs.")
    
@router.post("/training/quiz", response_model=TrainingApiResponse)
async def get_quiz(
    request: QuizRequest,
    training_service: TrainingService = Depends(get_training_service),
):
    """
    Generate a structured MCQ quiz for the frontend interactive quiz component.
    Called when a user clicks "Test my knowledge on {topic}" in the chat UI.

    Request body example:
        { "topic": "LLMs" }
    """
    try:
        if not request.topic or not request.topic.strip():
            raise HTTPException(status_code=422, detail="Topic cannot be empty.")
        result = await training_service.generate_quiz(request.topic.strip())
        return TrainingApiResponse(success=True, data=result)
    except ValueError as e:
        logger.warning(f"Quiz generation — validation error: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Quiz generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Quiz generation failed. Check server logs.")

@router.get("/training/status", response_model=TrainingApiResponse)
async def get_training_status(
    day_folder_name: str,
    training_service: TrainingService = Depends(get_training_service),
):
    """
    Return the processing status of a given Day folder.

    Query param example:
        /api/training/status?day_folder_name=Day%202%20-%20AI%20training%20-%20Pavan
    """
    try:
        result = await training_service.get_status(day_folder_name)
        return TrainingApiResponse(success=True, data=result)
    except Exception as e:
        logger.error(f"Status check failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Status check failed. Check server logs.")

@router.get("/training/all-status", response_model=TrainingApiResponse)
async def get_all_training_status(
    training_service: TrainingService = Depends(get_training_service),
):
    """
    Returns processing status for ALL Day folders in SharePoint.
    Used by the Video Analytics dashboard in the admin panel.
    """
    try:
        result = await training_service.get_all_statuses()
        return TrainingApiResponse(success=True, data=result)
    except Exception as e:
        logger.error(f"All-status check failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch all statuses.")
    


@router.post("/training/quiz-result", response_model=TrainingApiResponse)
async def save_quiz_result(
    request: QuizResultRequest,
    current_user: dict = Depends(verify_token),
    training_service: TrainingService = Depends(get_training_service),
):
    try:
        user_id = current_user.get("sub") or current_user.get("user_id", "")
        user_email = current_user.get("email", "")
        result = await training_service.save_quiz_result(
            user_id=user_id,
            user_email=user_email,
            topic=request.topic,
            score=request.score,
            total_questions=request.total_questions,
            tenant_id=request.tenant_id,
            app_id=request.app_id,
        )
        return TrainingApiResponse(success=result["success"], data=result)
    except Exception as e:
        logger.error(f"Save quiz result failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save quiz result.")

@router.get("/training/quiz-results", response_model=TrainingApiResponse)
async def get_quiz_results(
    tenant_id: str = None,
    training_service: TrainingService = Depends(get_training_service),
):
    try:
        result = await training_service.get_quiz_results(tenant_id=tenant_id)
        return TrainingApiResponse(success=result["success"], data=result)
    except Exception as e:
        logger.error(f"Get quiz results failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch quiz results.")
    
@router.post("/training/process-audio", response_model=TrainingApiResponse)
async def process_audio(
    request: ProcessTrainingRequest,
    training_service: TrainingService = Depends(get_training_service),
):
    """
    Generate audio recap files from a Day folder's summary.

    - Reads summary.docx → GPT writes natural spoken scripts per topic
    - Azure TTS converts each topic → topic_N_audio.mp3
    - Also generates full_recap_audio.mp3 (all topics combined)
    - Uploads all to output/ on SharePoint + audio_metadata.json

    Requires Phase 1 to be completed first (summary.docx must exist).

    Request body example:
        { "day_folder_name": "Day 1 - AI training - Pavan" }
    """
    try:
        result = await training_service.process_audio(request.day_folder_name)
        return TrainingApiResponse(success=True, data=result)
    except FileNotFoundError as e:
        logger.warning(f"Process audio — file not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        logger.warning(f"Process audio — validation error: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Process audio failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Audio processing failed. Check server logs.")


@router.get("/training/audio/stream", response_class=Response)
async def stream_audio(
    day_folder_name: str = Query(...),
    filename: str = Query(...),
    training_service: TrainingService = Depends(get_training_service),
):
    """
    Stream an audio file from SharePoint output/ folder.
    Used by the Angular chat audio player.

    Query params:
        day_folder_name: "Day 1 - AI training - Pavan (Previous)"
        filename: "topic_1_audio.mp3"
    """
    try:
        audio_bytes = await training_service.stream_audio_file(day_folder_name, filename)
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": f"inline; filename={filename}"},
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Audio stream failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to stream audio.")








@router.get("/training/audio/{day_folder_name:path}", response_model=TrainingApiResponse)
async def get_audio_by_day(
    day_folder_name: str,
    training_service: TrainingService = Depends(get_training_service),
):
    """
    Get all available audio files for a specific training Day folder.

    Path param example:
        /api/training/audio/Day 1 - AI training - Pavan

    Returns audio files from output/audio_metadata.json.
    Returns empty list if audio hasn't been generated yet.
    """
    try:
        result = await training_service.get_audio_by_day(day_folder_name)
        return TrainingApiResponse(success=True, data=result)
    except Exception as e:
        logger.error(f"Get audio by day failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch audio. Check server logs.")

@router.post("/training/reprocess-audio", response_model=TrainingApiResponse)
async def reprocess_audio(
    request: ProcessTrainingRequest,
    training_service: TrainingService = Depends(get_training_service),
):
    try:
        result = await training_service.reprocess_audio(request.day_folder_name)
        return TrainingApiResponse(success=True, data=result)
    except Exception as e:
        logger.error(f"Reprocess audio failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Reprocess audio failed. Check server logs.")






