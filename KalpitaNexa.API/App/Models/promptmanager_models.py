# app/Models/promptmanager_models.py
"""
Defines Pydantic models for the PromptManager feature, which handles
all core chat history and message management.
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Request Models ---
class ChatHistoryItem(BaseModel):
    """Represents a single chat record returned from the database."""
    ChatId: str
    UserMessage: str
    AIResponse: str
    Visibility: str
    IsFavorited: bool
    Timestamp: Any
    AppId: int
    Tags: Optional[str] = None
    PublicApprovalStatus: Optional[str] = 'NotApplicable'

class InsertMessageRequest(BaseModel):
    """Body for creating a new chat message record."""
    user_id: str
    tenant_id: str
    client_id: str
    app_id: int
    user_message: str
    ai_response: str
    prompt_tokens: int
    response_tokens: int
    is_favorited: bool = False
    visibility: str = 'private'
    file_id: Optional[str] = None
    system_username: Optional[str] = None

class UpdateMessageRequest(BaseModel):
    """Body for updating an existing chat message's properties."""
    message_id: str
    user_id_token: str
    tenant_id: str
    app_id: int
    user_message: Optional[str] = None
    is_favorited: Optional[bool] = None
    visibility: Optional[str] = None

class DeleteMessageRequest(BaseModel):
    """Body for deleting a chat message."""
    message_id: str
    user_id_token: str

class PublicChatItem(BaseModel):
    ChatId: str
    UserMessage: str
    Timestamp: datetime
    AppId: int

class FavoriteChatItem(BaseModel):
    ChatId: str
    UserMessage: str
    Timestamp: datetime
    AppId: int

class TaggedChatItem(BaseModel):
    ChatId: str
    UserMessage: str
    Timestamp: datetime
    AppId: int
    Tags: Optional[str] = None

class ChatFilterRequest(BaseModel):
    """
    Flexible body for fetching chats. This single model handles getting
    all history, public chats, favorites, or tagged chats by changing the
    'category' field.
    """
    user_id: str
    tenant_id: str
    app_id: Optional[int] = None
    category: str  # e.g., 'all_my_history', 'public', 'favorites', 'tagged'
    tag_name: Optional[str] = None
    date_filter: Optional[str] = 'all'
    start_date: Optional[str] = None
    end_date: Optional[str] = None

# --- Approval Workflow Request Models ---

class RequestPublicApprovalRequest(BaseModel):
    """Body for a user to request their chat be made public."""
    chat_id: str
    tenant_id: str
    requester_user_id: str

class ProcessPublicApprovalRequest(BaseModel):
    """Body for an admin to approve or reject a public request."""
    approval_id: str
    approver_user_id: str
    new_status: str  # Valid values: 'Approved' or 'Rejected'
    admin_comments: Optional[str] = None

# --- Response Models ---

class GetUserChatHistoryResponse(BaseModel):
    success: bool
    total_chats: int = 0
    history: List['ChatHistoryItem'] = []
    error: Optional[str] = None


class GetChatsResponse(BaseModel):
    """Standard response for any query that returns a list of chats."""
    success: bool
    total_chats: int = 0
    history: List[ChatHistoryItem] = []
    error: Optional[str] = None

class TagSearchResponse(BaseModel):
    """Response for the tag autocomplete search."""
    success: bool
    tags: List[Dict[str, Any]] = []
    error: Optional[str] = None


class GetFavoriteChatsResponse(BaseModel):
    success: bool
    total_favorite_chats: int = 0
    favorite_chats: List[FavoriteChatItem] = []
    error: Optional[str] = None

class GetTaggedChatsResponse(BaseModel):
    success: bool
    total_tagged_chats: int = 0
    tagged_chats: List[TaggedChatItem] = []
    error: Optional[str] = None
    
class GetPublicChatsResponse(BaseModel):
    success: bool
    total_public_chats: int = 0
    public_chats: List[PublicChatItem] = []
    error: Optional[str] = None

# --- Approval Workflow Response Models ---

class ApprovalQueueItem(BaseModel):
    """Represents a single item in the pending approvals queue."""
    ApprovalId: str
    ChatId: str
    RequestDate: Any
    RequesterUserId: str
    UserMessage: str

class GetPendingApprovalsResponse(BaseModel):
    """Response for fetching the list of chats pending public approval."""
    success: bool
    pending_approvals: List[ApprovalQueueItem] = []
    total_pending: int = 0
    error: Optional[str] = None