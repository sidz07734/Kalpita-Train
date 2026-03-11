# app/controllers/chat_controller.py
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, Query
from App import config

# Import Services that this controller depends on
from ..Services.chat_service import ChatService
from ..Services.promptmanager_service import PromptManagerService
from ..dependencies import get_chat_service,get_promptmanager_service

# Import all necessary Pydantic models
from ..Models.chat_models import (
    ChatRequest, ChatResponse,
    UpdateMessageFeedbackRequest, UpdateMessageFeedbackResponse,
    GetUserChatHistoryResponse, ChatFilterRequest,
    TranslationRequest, TranslationResponse,GetQuestionManagerChatsResponse,
    RequestPublicApprovalRequest, ProcessPublicApprovalRequest, GetPendingApprovalsResponse
)
from ..Models.system_models import SuccessResponse

logger = logging.getLogger(__name__)
router = APIRouter()

# ============================================================================
# CORE CHAT AND FILE ENDPOINTS
# ============================================================================

@router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(
    request: ChatRequest,
    chat_service: ChatService = Depends(get_chat_service),
    PromptManager_Service: PromptManagerService = Depends(get_promptmanager_service)
):
    """Main endpoint for all chat interactions, orchestrating data sources and AI responses."""
    try:
        deployment_name = config.AZURE_OPENAI_DEPLOYMENT_NAME_GPT35
        if request.model == "o3-mini":
            if hasattr(config, 'AZURE_OPENAI_DEPLOYMENT_NAME_GPT35') and config.AZURE_OPENAI_DEPLOYMENT_NAME_GPT35:
                deployment_name = config.AZURE_OPENAI_DEPLOYMENT_NAME_GPT35
       
        result = await chat_service.process_chat(
            message=request.message,
            client_id=request.client_id,
            user_id_token=request.user_id_token,
            data_sources=request.data_sources,
            debug_mode=request.debug_mode,
            user_role=request.user_role,
            user_email=request.user_email,
            model_deployment=deployment_name,
            app_id = request.app_id
        )

        db_message_id = None  # Initialize message_id variable

        # After getting a successful AI response, save it to the database
        if result.get("success") and not request.debug_mode and request.user_id_token:
            usage_data = result.get("usage")  # This is now a TokenUsage instance or None

            if usage_data:
                # If the API provided token counts, use them from the model
                prompt_tokens = usage_data.prompt_tokens
                response_tokens = usage_data.completion_tokens
            else:
                # Fallback to the local estimation utility if no usage data was returned
                from App.Utils.common import count_tokens
                prompt_tokens = count_tokens(request.message)
                response_tokens = count_tokens(result.get("response", ""))
            
         # ✅ Build request_data dict for insert_message_db
            request_data = {
                "user_id": request.user_id_token,
                "tenant_id": request.tenant_id,
                "client_id": request.client_id if request.client_id else None ,
                "app_id": request.app_id,
                "user_message": request.message,
                "ai_response": result.get("response", ""),
                "prompt_tokens": prompt_tokens,
                "response_tokens": response_tokens,
                "is_favorited": False,
                "visibility": "private",   # or whatever default fits
                "file_id": None,
                "system_username": request.user_email or "system"
            }

            # ✅ Call the new DB method
            db_result = await PromptManager_Service.insert_message(request_data)

            if db_result.get("success"):
                db_message_id = db_result.get("message_id")

        # Add message_id to response
        response_data = result.copy()
        response_data['message_id'] = db_message_id

        return ChatResponse(**response_data)

    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        return ChatResponse(
            success=False,
            response="I'm sorry, I encountered an error while processing your request. Please try again later.",
            citations=[],
            error=f"Chat error: {str(e)}",
            is_visualization=False,
            follow_up_questions=[]
        )


# ============================================================================
# CHAT INTERACTION & HISTORY ENDPOINTS
# ============================================================================

@router.put("/database/chats/feedback", response_model=UpdateMessageFeedbackResponse)
async def update_chat_feedback(
    request: UpdateMessageFeedbackRequest,
    chat_service: ChatService = Depends(get_chat_service)
):
    """Updates user feedback (like/dislike) for a specific chat message."""
    try:
        result = await chat_service.update_feedback(
            chat_id=request.chat_id, user_id=request.user_id, tenant_id=request.tenant_id,
            app_id=request.app_id, feedback=request.feedback
        )
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Update feedback endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@router.post("/translate", response_model=TranslationResponse)
async def translate_text(
    request: TranslationRequest,
    chat_service: ChatService = Depends(get_chat_service)
):
    """Translates text to a target language using the configured translation service."""
    try:
        translated_text = await chat_service.translate_text(
            text=request.text,
            to_language=request.target_language,
            from_language=request.source_language
        )
        return TranslationResponse(success=True, translated_text=translated_text)
    except Exception as e:
        logger.error(f"Translation endpoint error: {e}", exc_info=True)
        return TranslationResponse(success=False, error=str(e), translated_text=request.text)
    
# Add to chat_controller.py

@router.get("/question_manager/chats", response_model=GetQuestionManagerChatsResponse)
async def get_question_manager_chats(
    user_id: str = Query(...),
    tenant_id: str = Query(...),
    app_id: int = Query(...),
    date_filter: Optional[str] = Query('all'),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    chat_service: ChatService = Depends(get_chat_service)
):
    """
    Gets all chats for a specific user in the Question Manager application,
    with optional date filtering.
    """
    try:
        result = await chat_service.get_question_manager_chats(
            user_id=user_id,
            tenant_id=tenant_id,
            app_id=app_id,
            date_filter=date_filter,
            start_date=start_date,
            end_date=end_date
        )
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Get question manager chats endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
    

