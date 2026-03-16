# app/models/user_models.py
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Request Models ---

class UserCreateRequest(BaseModel):
    executing_user_email: EmailStr
    tenant_id: str
    new_user_name: str
    new_user_email: EmailStr
    app_name: str
    role_names: List[str] = Field(..., min_length=1)

class UserUpdateRequest(BaseModel):
    executing_user_email: EmailStr
    tenant_id: str
    user_id_to_update: str
    new_user_name: str
    new_user_email: EmailStr
    new_role_name: str

class UserDeleteRequest(BaseModel):
    executing_user_email: EmailStr
    tenant_id: str
    user_id_to_delete: str

class UserUpdateAssignmentsRequest(BaseModel):
    executing_user_email: EmailStr
    tenant_id: str
    user_id_to_update: str
    new_user_name: str
    new_user_email: EmailStr
    app_name: str
    role_names: List[str]
    language_name: Optional[str] = None
    model_name: Optional[str] = None

class UserUpdateSelfProfileRequest(BaseModel):
    executing_user_email: EmailStr
    new_user_name: str
    new_user_email: EmailStr
    language_names: List[str] = []
    model_names: List[str] = []

# --- START OF INTEGRATION ---
class CleanupHistoryRequest(BaseModel):
    """Request model for cleaning up a user's chat history for a specific app."""
    user_id: str = Field(..., description="The ID of the user whose history needs cleanup.")
    app_id: int = Field(..., description="The ID of the application context for the cleanup.")

# --- Response Models ---

class UserCreateResponse(BaseModel):
    success: bool
    message: str
    UserId: str
    error: Optional[str] = None

class UserUpdateResponse(BaseModel):
    success: bool
    message: str
    error: Optional[str] = None

class UserRecord(BaseModel):
    UserId: str
    UserName: str
    UserEmail: EmailStr
    RoleName: str
    IsActive: bool
    CreatedOn: datetime
    CreatedBy: str
    ModifiedOn: Optional[datetime] = None
    ModifiedBy: Optional[str] = None

class GetUsersResponse(BaseModel):
    success: bool
    users: List[UserRecord]
    error: Optional[str] = None

class UserProfileLanguage(BaseModel):
    language_id: int
    language_name: str

class UserProfileModel(BaseModel):
    model_id: int
    model_name: str

class UserProfile(BaseModel):
    userId: str
    userName: str
    userEmail: EmailStr
    isSuperAdmin: bool
    roles: List[str] = []
    languages: List[UserProfileLanguage] = []
    models: List[UserProfileModel] = []
    CreatedOn: Optional[str] = None
    CreatedBy: Optional[str] = None

class GetUserProfileResponse(BaseModel):
    success: bool
    profile: Optional[UserProfile] = None
    error: Optional[str] = None

class UserTenantInfo(BaseModel):
    UserEmail: str
    UserId: str
    TenantName: str
    TenantId: str
    IsSuperAdmin: int

class GetUserTenantsResponse(BaseModel):
    success: bool
    total_tenants: int = 0
    tenants: List[UserTenantInfo] = []
    error: Optional[str] = None

class LoginResponse(BaseModel):
    success: bool
    userId: Optional[str] = None
    TenantId: Optional[str] = None
    userName: Optional[str] = None
    userEmail: Optional[str] = None
    userRole: Optional[str] = None
    error: Optional[str] = None

class UserDetailsResponse(BaseModel):
    success: bool
    userId: Optional[str] = None
    tenantId: Optional[str] = None
    error: Optional[str] = None
    
class ApplicationLanguage(BaseModel):
    LanguageID: int
    LanguageName: str
    IsDefault: bool

class ApplicationModel(BaseModel):
    ModelID: int
    ModelName: str
    IsDefault: bool

class ApplicationDataSource(BaseModel):
    DataSourceID: int
    DataSourceName: str
    IsDefault: bool

class UserPreferences(BaseModel):
    AppID: Optional[int] = None
    LanguageID: Optional[int] = None
    ModelID: Optional[int] = None
    DataSourceID: Optional[int] = None

class UserPermissions(BaseModel):
    applications: List[Dict[str, Any]] = []
    features: List[str] = []
    languages: List[ApplicationLanguage] = []
    models: List[ApplicationModel] = []
    data_sources: List[ApplicationDataSource] = []

class GetUserPermissionsResponse(BaseModel):
    success: bool
    permissions: Optional[UserPermissions] = None
    preferences: Optional[UserPreferences] = None
    error: Optional[str] = None

class UserDefaults(BaseModel):
    default_app_id: Optional[int] = None
    default_app_name: Optional[str] = None
    default_language_id: Optional[int] = None
    default_language_name: Optional[str] = None
    default_model_id: Optional[int] = None
    default_model_name: Optional[str] = None

class GetUserDefaultsResponse(BaseModel):
    success: bool
    defaults: Optional[UserDefaults] = None
    error: Optional[str] = None



class UserCreditInfo(BaseModel):
    """Updated to match the latest spGetUserCreditInfo procedure output."""
    UserId: str
    UserName: str
    UserEmail: EmailStr
    MonthlyCredits: int
    RemainingCredits: int
    ConsumedInputTokens: int
    ConsumedOutputTokens: int
    TokensPerCredit: int
    ConsumedTokens: int
    AvailableTokens: int
    TenantName: str
    AppId: int

class GetUserCreditsResponse(BaseModel):
    success: bool
    credits: List[UserCreditInfo] = []
    error: Optional[str] = None

