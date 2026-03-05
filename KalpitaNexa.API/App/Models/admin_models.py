# app/Models/admin_models.py
"""
Defines Pydantic models for the Admin Management feature, including
tenant admin management and updating user assignments.
"""
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Request Models ---

class UserUpdateAssignmentsRequest(BaseModel):
    """Body for an admin to update a regular user's assignments."""
    executing_user_email: EmailStr
    tenant_id: str
    user_id_to_update: str
    new_user_name: str
    new_user_email: EmailStr
    app_id: int
    role_names: List[str]
    language_id: Optional[int] = None
    model_id: Optional[int] = None

class CreateTenantAdminRequest(BaseModel):
    user_name: str
    user_email: str
    tenant_id: str
    role_id: int
    feature_ids: List[int] = []
    created_by: Optional[str] = "system"

class UpdateTenantAdminRequest(BaseModel):
    user_name: str
    user_email: str
    tenant_id: str
    role_id: int
    feature_ids: List[int] = []
    modified_by: Optional[str] = "system"

class DeleteTenantAdminRequest(BaseModel):
    tenant_id: str
    modified_by: Optional[str] = "system"

class ResetAdminPasswordRequest(BaseModel):
    user_email: str
    modified_by: Optional[str] = "system"

# --- Response Models ---

class AdminUserActionResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    user_id: Optional[str] = None
    generated_password: Optional[str] = None
    error: Optional[str] = None

class AdminFeature(BaseModel):
    feature_id: int
    feature_name: str

class TenantAdmin(BaseModel):
    user_id: str
    user_name: str
    user_email: str
    role_id: int
    role_name: str
    is_active: bool
    created_on: datetime
    created_by: str
    features: List[AdminFeature] = []

class GetTenantAdminsResponse(BaseModel):
    success: bool
    admins: List[TenantAdmin] = []
    error: Optional[str] = None

class TenantAdminDetails(BaseModel):
    user_id: str
    user_name: str
    user_email: str
    role_id: int
    role_name: str
    is_active: bool
    created_on: Optional[datetime]
    created_by: Optional[str]
    modified_on: Optional[datetime]
    modified_by: Optional[str]
    features: List[AdminFeature] = []

class GetTenantAdminDetailsResponse(BaseModel):
    success: bool
    admin_details: Optional[TenantAdminDetails] = None
    error: Optional[str] = None