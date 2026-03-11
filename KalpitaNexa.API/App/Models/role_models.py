# app/Models/role_models.py
"""
Defines Pydantic models for the Role Management feature.
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Request Models ---

class UpsertRoleRequest(BaseModel):
    """Request model for creating or updating a role."""
    role_id: Optional[int] = None # NULL for CREATE, provide ID for UPDATE
    role_name: str
    tenant_id: str
    app_id: int
    user_id: str # Consolidated from created_by/modified_by
    feature_ids: List[int] = []
# --- Response Models ---
class RoleFeatureItem(BaseModel):
    """Defines the structure for a single feature returned for a role."""
    feature_id: int
    feature_name: str

class RoleDetail(BaseModel):
    """Represents the detailed state of a role after an upsert."""
    role_id: int
    role_name: str
    features: List[RoleFeatureItem] = [] 

class UpsertRoleResponse(BaseModel):
    """Defines the API response for an upsert operation."""
    success: bool
    role: Optional[RoleDetail] = None
    error: Optional[str] = None
    message: Optional[str] = None


class RoleFeature(BaseModel):
    feature_id: int
    feature_name: str

class RoleResponse(BaseModel):
    role_id: str
    role_name: str
    is_active: bool
    created_on: Optional[datetime]
    created_by: Optional[str]
    modified_on: Optional[datetime]
    modified_by: Optional[str]
    features: List[str] = []

class GetRolesResponse(BaseModel):
    success: bool
    roles: List[RoleResponse] = []
    error: Optional[str] = None

class AllRolesItem(BaseModel):
    role_id: int
    role_name: str

class GetAllRolesResponse(BaseModel):
    success: bool
    roles: List[AllRolesItem] = []
    error: Optional[str] = None

# --- START OF INTEGRATION ---


class GetRoleFeaturesResponse(BaseModel):
    """Defines the API response model for getting the features of a role."""
    success: bool
    features: List[RoleFeatureItem] = []
    error: Optional[str] = None
# --- END OF INTEGRATION ---    