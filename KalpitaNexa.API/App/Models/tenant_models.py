# app/Models/tenant_models.py
"""
Defines Pydantic models for the Tenant Management feature.
"""
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Sub-Models ---

class Feature(BaseModel):
    feature_id: int
    feature_name: str

class Application(BaseModel):
    application_id: int
    application_name: str

# --- Request Models ---

class UpsertTenantRequest(BaseModel):
    tenant_id: Optional[str] = None  # Key change: ID is optional
    tenant_name: str
    application_ids: List[int]
    feature_ids: List[int]
    requesting_user_email: EmailStr

class DeleteTenantRequest(BaseModel):
    requesting_user_email: EmailStr


class AssignTenantFeaturesRequest(BaseModel): 
    """Body for assigning a list of features directly to a tenant."""
    feature_ids: List[int] = []
    created_by: str

# --- Response Models ---

class TenantInfo(BaseModel):
    tenant_id: str
    tenant_name: str
    is_active: bool
    created_on: datetime
    created_by: str
    applications: List[Application] = []
    features: List[Feature] = []

class GetTenantResponse(BaseModel):
    success: bool
    tenant: Optional[TenantInfo] = None
    error: Optional[str] = None

class TenantBasicInfo(BaseModel):
    tenant_id: str
    tenant_name: str
    is_active: bool
    created_on: datetime | None = None
    CreatedOn: datetime | None = None
    created_by: str | None = None
    CreatedBy: str | None = None

class GetTenantsResponse(BaseModel):
    success: bool
    tenants: List[TenantBasicInfo] = []
    total_tenants: int = 0
    error: Optional[str] = None

class TenantWithApplications(BaseModel):
    TenantId: str
    TenantName: str
    IsActive: bool
    CreatedOn: datetime
    CreatedBy: str
    Applications: str

class GetTenantsWithApplicationsResponse(BaseModel):
    success: bool
    tenants: List[TenantWithApplications] = []
    error: Optional[str] = None

class TenantFeature(BaseModel):
    feature_id: int
    feature_name: str
    isactive : bool
    created_on: datetime | None = None
    created_by: str | None = None

class GetTenantFeaturesResponse(BaseModel):
    success: bool
    features: List[TenantFeature] = []
    error: Optional[str] = None

class TenantActionResponse(BaseModel):
    success: bool
    message: str
    tenant_id: Optional[str] = None
    error: Optional[str] = None

