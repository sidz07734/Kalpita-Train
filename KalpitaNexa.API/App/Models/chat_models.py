# app/models/chat_models.py
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Core Chat & File Models ---

class Citation(BaseModel):
    title: str
    url: Optional[str] = None
    filepath: Optional[str] = None
    content: Optional[str] = None
    source_type: Optional[str] = None
    score: Optional[float] = None

class TokenUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

class ChatRequest(BaseModel):
    message: str
    app_id: int
    client_id: Optional[str] = None
    tenant_id: Optional[str] = None
    user_id_token: Optional[str] = None
    data_sources: List[str] = ["all"]
    debug_mode: bool = False
    user_role: Optional[str] = None
    user_email: Optional[str] = None
    model: Optional[str] = "o3-mini"
    stream: bool = False

class ChatResponse(BaseModel):
    success: bool
    response: Optional[str] = None
    citations: List[Citation] = []
    error: Optional[str] = None
    is_visualization: bool = False
    visualization_suggestion: Optional[str] = None
    follow_up_questions: List[str] = []
    services_used: List[str] = []
    message_id: Optional[str] = None
    usage: Optional[TokenUsage] = None
    message_type: Optional[str] = None
    audio_url: Optional[str] = None
    audio_topic: Optional[str] = None
    audio_session: Optional[str] = None
    audio_session: Optional[str] = None
    short_url: Optional[str] = None      # ← add
    short_title: Optional[str] = None    # ← add
    short_session: Optional[str] = None  # ← add
    shorts_list: Optional[list] = None


class UploadFileResponse(BaseModel):
    success: bool
    file_id: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None

# --- Chat History & Feedback Models ---

class UpdateMessageFeedbackRequest(BaseModel):
    chat_id: str
    user_id: str
    tenant_id: str
    app_id: int
    feedback: int = Field(..., ge=-1, le=1) # Use validation: 1=like, -1=dislike, 0=neutral

class UpdateMessageFeedbackResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None

class ChatHistoryItem(BaseModel):
    ChatId: str
    UserMessage: str
    AIResponse: str
    Visibility: str
    IsFavorited: bool
    Timestamp: datetime
    AppId: int
    Tags: Optional[str] = None

class GetUserChatHistoryResponse(BaseModel):
    success: bool
    total_chats: int = 0
    history: List[ChatHistoryItem] = []
    error: Optional[str] = None

class ChatFilterRequest(BaseModel):
    user_id: str
    tenant_id: str
    app_id: Optional[int] = None
    category: str # e.g., 'my-history', 'public', 'favorites', 'tagged'
    tag_name: Optional[str] = None
    date_filter: Optional[str] = 'all'
    start_date: Optional[str] = None
    end_date: Optional[str] = None

# --- Public Chat Approval Models ---

class RequestPublicApprovalRequest(BaseModel):
    chat_id: str
    tenant_id: str
    requester_user_id: str

class ProcessPublicApprovalRequest(BaseModel):
    approval_id: str
    approver_user_id: str
    new_status: str  # Valid values: 'Approved' or 'Rejected'
    admin_comments: Optional[str] = None

class ApprovalQueueItem(BaseModel):
    ApprovalId: str
    ChatId: str
    RequestDate: datetime
    RequesterUserId: str
    UserMessage: str

class GetPendingApprovalsResponse(BaseModel):
    success: bool
    pending_approvals: List[ApprovalQueueItem] = []
    total_pending: int = 0
    error: Optional[str] = None

# --- Translation Models ---

class TranslationRequest(BaseModel):
    text: str
    target_language: str
    source_language: Optional[str] = None

class TranslationResponse(BaseModel):
    success: bool
    translated_text: Optional[str] = None
    error: Optional[str] = None

class QuestionManagerChatItem(BaseModel):
    ChatId: str
    UserMessage: str
    AIResponse: str
    Timestamp: datetime
    AppId: int

class GetQuestionManagerChatsResponse(BaseModel):
    success: bool
    total_chats: int = 0
    history: List[QuestionManagerChatItem] = []
    error: Optional[str] = None


