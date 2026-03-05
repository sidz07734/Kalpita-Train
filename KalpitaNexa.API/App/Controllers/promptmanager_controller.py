# app/Controllers/promptmanager_controller.py
"""
Defines the API endpoints for the PromptManager feature, covering all
core chat management functionalities.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from ..Services.promptmanager_service import PromptManagerService
from ..Models.promptmanager_models import (
    GetFavoriteChatsResponse, GetPendingApprovalsResponse, GetPublicChatsResponse, GetTaggedChatsResponse, GetUserChatHistoryResponse, InsertMessageRequest, ProcessPublicApprovalRequest, RequestPublicApprovalRequest, UpdateMessageRequest, DeleteMessageRequest,
    ChatFilterRequest, GetChatsResponse, TagSearchResponse
)
from ..Models.system_models import SuccessResponse
from ..dependencies import get_promptmanager_service

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/prompts/messages", response_model=SuccessResponse, tags=["Prompt Manager"])
async def insert_message(
    request: InsertMessageRequest,
    service: PromptManagerService = Depends(get_promptmanager_service)
):
    """(Insert Message) Stores a new user-AI chat interaction."""
    result = await service.insert_message(request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result

@router.put("/prompts/messages", response_model=SuccessResponse, tags=["Prompt Manager"])
async def update_message(
    request: UpdateMessageRequest,
    service: PromptManagerService = Depends(get_promptmanager_service)
):
    """(Update Message) Updates an existing chat message's properties like content or favorite status."""
    result = await service.update_message(request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result

@router.delete("/prompts/messages", response_model=SuccessResponse, tags=["Prompt Manager"])
async def delete_chat_message(
    request: DeleteMessageRequest,
    service: PromptManagerService = Depends(get_promptmanager_service)
):
    """(Delete Message) Soft-deletes a chat message, making it inactive."""
    result = await service.delete_chat(request.message_id, request.user_id_token)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result

@router.post("/prompts/chats/filter", response_model=GetChatsResponse, tags=["Prompt Manager"])
async def get_chats(
    request: ChatFilterRequest,
    service: PromptManagerService = Depends(get_promptmanager_service)
):
    """
    (Get Chats) Retrieves chat messages based on a filter. This single endpoint handles:
    - Get User Chat History (category: 'all_my_history')
    - Get Public Chats (category: 'public')
    - Get Favorite Chats (category: 'favorites')
    - Get User Tagged Chats (category: 'tagged', tag_name: 'your_tag')
    """
    result = await service.get_chats(request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result

@router.get("/prompts/tags/search", response_model=TagSearchResponse, tags=["Prompt Manager"])
async def search_tags(
    search_term: str,
    limit: int = Query(10, ge=1, le=50),
    service: PromptManagerService = Depends(get_promptmanager_service)
):
    """(Search Tags) Provides tag suggestions for UI autocomplete."""
    clean_search_term = search_term.lstrip('#')
    result = await service.search_tags(clean_search_term, limit)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result

@router.get("/prompts/chats/my-history", response_model=GetUserChatHistoryResponse, tags=["Prompt Manager"])
async def get_my_chat_history(
    user_id: str = Query(...),
    tenant_id: str = Query(...),
    app_id: Optional[int] = Query(None),
    service: PromptManagerService = Depends(get_promptmanager_service)
):
    """(Get User Chat History) Retrieves a user's entire chat history."""
    result = await service.get_user_chat_history(user_id, tenant_id, app_id)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    # FastAPI will automatically handle the key mapping (e.g., from 'history' to 'history')
    return result

@router.get("/prompts/chats/public", response_model=GetPublicChatsResponse, tags=["Prompt Manager"])
async def get_all_public_chats(
    tenant_id: str = Query(...),
    app_id: Optional[int] = Query(None),
    service: PromptManagerService = Depends(get_promptmanager_service)
):
    """(Get Public Chats) Retrieves all chats marked as 'public'."""
    result = await service.get_public_chats(tenant_id, app_id)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    # THE FIX: We rename the key from 'history' to 'public_chats' to match the new model
    return {"success": True, "total_public_chats": result.get("total_chats"), "public_chats": result.get("history")}

@router.get("/prompts/chats/favorites", response_model=GetFavoriteChatsResponse, tags=["Prompt Manager"])
async def get_my_favorite_chats(
    user_id: str = Query(...),
    tenant_id: str = Query(...),
    app_id: Optional[int] = Query(None),
    service: PromptManagerService = Depends(get_promptmanager_service)
):
    """(Get Favorite Chats) Retrieves a user's favorited chats."""
    result = await service.get_favorite_chats(user_id, tenant_id, app_id)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    # THE FIX: We rename the key from 'history' to 'favorite_chats' to match the new model
    return {"success": True, "total_favorite_chats": result.get("total_chats"), "favorite_chats": result.get("history")}

@router.get("/prompts/chats/tagged", response_model=GetTaggedChatsResponse, tags=["Prompt Manager"])
async def get_my_tagged_chats(
    user_id: str = Query(...),
    tenant_id: str = Query(...),
    app_id: Optional[int] = Query(None),
    service: PromptManagerService = Depends(get_promptmanager_service)
):
    """(Get User Tagged Chats) Retrieves all chats with tags relevant to the user."""
    result = await service.get_user_tagged_chats(user_id, tenant_id, app_id)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    # THE FIX: We rename the key from 'history' to 'tagged_chats' to match the new model
    return {"success": True, "total_tagged_chats": result.get("total_chats"), "tagged_chats": result.get("history")}

# --- Public Approval Workflow Endpoints ---

@router.post("/prompts/approvals/request", response_model=SuccessResponse, tags=["Prompt Manager"])
async def request_public_approval(
    request: RequestPublicApprovalRequest,
    service: PromptManagerService = Depends(get_promptmanager_service)
):
    """(USER) Submits a private chat for admin approval to be made public."""
    result = await service.request_public_approval(request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result

@router.put("/prompts/approvals/process", response_model=SuccessResponse, tags=["Prompt Manager"])
async def process_public_approval(
    request: ProcessPublicApprovalRequest,
    service: PromptManagerService = Depends(get_promptmanager_service)
):
    """(ADMIN) Approves or rejects a pending request to make a chat public."""
    if request.new_status not in ['Approved', 'Rejected']:
        raise HTTPException(status_code=400, detail="Invalid status. Must be 'Approved' or 'Rejected'.")
    result = await service.process_public_approval(request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result

@router.get("/prompts/approvals/pending/{tenant_id}", response_model=GetPendingApprovalsResponse, tags=["Prompt Manager"])
async def get_pending_approvals(
    tenant_id: str,
    service: PromptManagerService = Depends(get_promptmanager_service)
):
    """(ADMIN) Retrieves the queue of chats pending public approval for a tenant."""
    result = await service.get_pending_approvals(tenant_id)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result