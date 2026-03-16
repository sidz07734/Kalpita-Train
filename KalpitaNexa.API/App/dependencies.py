# app/dependencies.py
from functools import lru_cache
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from openai import AzureOpenAI
from fastapi import Request
from .Managers.daily_auth_manager import DailyAuthManager



from . import config
import logging
import json
logger = logging.getLogger(__name__)


# Import Managers
from .Managers.user_manager import UserManager
from .Managers.auth_manager import AuthManager
from .Managers.chat_manager import ChatManager

from .Managers.sharepoint_manager import SharePointManager
from .Managers.sql_search_manager import SqlSearchManager
from .Managers.policy_manager import PolicyManager
from .Managers.brave_manager import BraveManager
from .Managers.promptmanager_manager import PromptManagerManager
from .Managers.file_processing_manager import FileProcessingManager
from .Managers.visualization_manager import VisualizationManager
from .Managers.role_manager import RoleManager
from .Managers.tenant_manager import TenantManager
from .Managers.admin_manager import AdminManager
from .Managers.application_manager import ApplicationManager
from .Managers.attendance_db_manager import AttendanceDbManager
from .Managers.content_safety_manager import ContentSafetyManager
from .Managers.holiday_manager import HolidayManager
from .Models.daily_auth_models import DailyAuthRequest
from .Managers.training_sharepoint_manager import TrainingSharePointManager
from .Managers.training_manager import TrainingManager




# Import Services
from .Services.user_service import UserService
from .Services.auth_service import AuthService  
from .Services.chat_service import ChatService
from .Services.promptmanager_service import PromptManagerService
from .Services.file_processing_service import FileProcessingService
from .Services.visualization_service import VisualizationService
from .Services.role_service import RoleService
from .Services.tenant_service import TenantService
from .Services.admin_service import AdminService
from .Services.application_service import ApplicationService
from .Services.training_service import TrainingService


# Import Utils
from .Utils.email_service import EmailService
from .Utils.translator_service import TranslatorService
from .Utils.intent_analyzer import IntentAnalyzer 

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


async def verify_token(token: str = Depends(oauth2_scheme)):
    """
    Decodes and validates the JWT token. 
    Returns the payload if valid, raises 401 if not.
    """
    try:
        payload = jwt.decode(token, config.JWT_SECRET_KEY, algorithms=[config.JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

def get_current_user_email(payload: dict = Depends(verify_token)) -> str:
    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return email

@lru_cache()
def get_openai_client() -> AzureOpenAI:
    return AzureOpenAI(
        api_key=config.AZURE_OPENAI_API_KEY,
        api_version=config.AZURE_OPENAI_API_VERSION,
        azure_endpoint=config.AZURE_OPENAI_ENDPOINT
    )

# Manager Dependencies
@lru_cache()
def get_user_manager() -> UserManager:
    return UserManager()

@lru_cache()
def get_auth_manager() -> AuthManager:          # <-- ADD
    return AuthManager()

@lru_cache()
def get_chat_manager() -> ChatManager:
    return ChatManager()

# @lru_cache()
# def get_admin_manager() -> AdminManager:
#     return AdminManager()

@lru_cache()
def get_sharepoint_manager() -> SharePointManager:
    return SharePointManager(openai_client=get_openai_client())

@lru_cache()
def get_sql_search_manager() -> SqlSearchManager:
    return SqlSearchManager(openai_client=get_openai_client())

@lru_cache()
def get_policy_manager() -> PolicyManager:
    return PolicyManager(openai_client=get_openai_client())

@lru_cache()
def get_brave_manager() -> BraveManager:
    return BraveManager(openai_client=get_openai_client())
@lru_cache()
def get_promptmanager_manager() -> PromptManagerManager:  # <-- ADD THIS
    return PromptManagerManager()
 
@lru_cache()
def get_file_processing_manager() -> FileProcessingManager:  # <-- RENAMED
    return FileProcessingManager()
 
@lru_cache()
def get_visualization_manager() -> VisualizationManager:
    return VisualizationManager(openai_client=get_openai_client())
 
@lru_cache()
def get_role_manager() -> RoleManager:
    return RoleManager()
 
@lru_cache()
def get_tenant_manager() -> TenantManager:
    return TenantManager()
 
@lru_cache()
def get_admin_manager() -> AdminManager:
    return AdminManager()
 
@lru_cache()
def get_application_manager() -> ApplicationManager:
    return ApplicationManager()

@lru_cache()
def get_attendance_db_manager() -> AttendanceDbManager:
    return AttendanceDbManager()

@lru_cache()
def get_content_safety_manager() -> ContentSafetyManager:
    return ContentSafetyManager()


@lru_cache()
def get_holiday_manager() -> HolidayManager:
    return HolidayManager(openai_client=get_openai_client())
 

# Util Dependencies
@lru_cache()
def get_email_service() -> EmailService:
    return EmailService()

@lru_cache()
def get_translator_service() -> TranslatorService:
    return TranslatorService()

# Service Dependencies (These depend on managers and other services)
@lru_cache()
def get_user_service() -> UserService:
    return UserService(
        user_manager=get_user_manager(),
        email_service=get_email_service()
    )

@lru_cache()
def get_auth_service() -> AuthService:        
    return AuthService(
        auth_manager=get_auth_manager(),
        user_manager=get_user_manager(),
        email_service=get_email_service()
    )

@lru_cache()
def get_chat_service() -> ChatService:
    """
    Dependency factory for ChatService.
    Initializes and provides a cached instance of the ChatService with all its dependencies.
    """
    # This function now correctly assembles ChatService with the new IntentAnalyzer.
    chat_service_instance = ChatService(
        openai_client=get_openai_client(),
        chat_manager=get_chat_manager(),
        sharepoint_manager=get_sharepoint_manager(),
        sql_search_manager=get_sql_search_manager(),
        policy_manager=get_policy_manager(),
        brave_manager=get_brave_manager(),
        translator_service=get_translator_service(),
        intent_analyzer=get_intent_analyzer(),
        attendance_db_manager=get_attendance_db_manager(),
        content_safety_manager=get_content_safety_manager(),
        holiday_manager=get_holiday_manager(),
        training_service=get_training_service()

        
    )
    return chat_service_instance

@lru_cache()
def get_promptmanager_service() -> PromptManagerService:  # <-- ADD THIS
    return PromptManagerService(manager=get_promptmanager_manager())
 
@lru_cache()
def get_file_processing_service() -> FileProcessingService:  # <-- RENAMED
    return FileProcessingService(
        openai_client=get_openai_client(),
        manager=get_file_processing_manager(), # <-- RENAMED
        prompt_manager=get_promptmanager_service()
    )
 
@lru_cache()
def get_role_service() -> RoleService:
    return RoleService(manager=get_role_manager())
 
@lru_cache()
def get_tenant_service() -> TenantService:
    return TenantService(
        manager=get_tenant_manager(),
        user_manager=get_user_manager() # TenantService needs UserManager
    )
 
@lru_cache()
def get_admin_service() -> AdminService:
    return AdminService(manager=get_admin_manager())
 
@lru_cache()
def get_application_service() -> ApplicationService:
    return ApplicationService(manager=get_application_manager())
 
 
@lru_cache()
def get_visualization_service() -> VisualizationService:
    return VisualizationService(
        manager=get_visualization_manager(),
        chat_service=get_chat_service()
    )

@lru_cache(maxsize=1)
def get_intent_analyzer() -> IntentAnalyzer:
    """
    Creates and caches a single instance of the IntentAnalyzer.
    """
   
    return IntentAnalyzer(openai_client=get_openai_client())

@lru_cache()
def get_training_sharepoint_manager() -> TrainingSharePointManager:
    return TrainingSharePointManager()

@lru_cache()
def get_training_manager() -> TrainingManager:
    return TrainingManager()

@lru_cache()
def get_training_service() -> TrainingService:
    return TrainingService(
        openai_client=get_openai_client(),
        training_sp_manager=get_training_sharepoint_manager(),
        training_manager=get_training_manager(),
    )


async def validate_optimized_payments_access(
    request: Request, 
    token_data: dict = Depends(verify_token)
):
    # 1. Parse body once (FastAPI workaround to prevent body consumption error)
    body_bytes = await request.body()
    body = json.loads(body_bytes)
    
    frontend_tenant_id = body.get("tenant_id")
    frontend_app_id = body.get("app_id")
    secure_token_tid = token_data.get("tid")

    # 2. Identity Verification (Anti-Spoofing)
    if frontend_tenant_id != secure_token_tid:
        raise HTTPException(status_code=403, detail="Security Mismatch.")

    # 3. Organization Verification (Strictly check for Optimized Payments name)
    manager = DailyAuthManager()
    # verify_tenant_name_match checks if the ID belongs to 'Optimized Payments'
    is_authorized = await manager.verify_tenant_name_match(secure_token_tid, "Optimized Payments")

    if not is_authorized:
        raise HTTPException(status_code=403, detail="Access Denied to this module.")

    # 4. App Isolation: Ensure this AppId belongs to this Tenant in Auth DB
    is_valid_mapping = await manager.verify_app_tenant_mapping(frontend_app_id, secure_token_tid)
    if not is_valid_mapping:
        raise HTTPException(status_code=403, detail="Invalid Application context.")

    # Reset request for the controller
    async def receive(): return {"type": "http.request", "body": body_bytes}
    request._receive = receive
    return token_data
    
