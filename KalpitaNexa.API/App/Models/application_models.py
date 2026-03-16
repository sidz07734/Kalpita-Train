# app/Models/application_models.py
"""
Defines Pydantic models for the Application Management feature.
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Request Models ---

class SetAppSettingsRequest(BaseModel):
    language_ids: List[int] = []
    model_ids: List[int] = []
    data_source_ids: List[int] = []
    created_by: str

class UpdateAppSettingsRequest(BaseModel):
    language_ids: Optional[List[int]] = None
    model_ids: Optional[List[int]] = None
    data_source_ids: Optional[List[int]] = None
    modified_by: str
    monthlyCredits: Optional[int] = None
    tokensPerCredit: Optional[int] = None
    chatHistoryInDays: Optional[int] = None
    xScore: Optional[float] = None

# --- Response Models ---

class AppSettingsItem(BaseModel):
    id: int
    name: str
    is_default: bool
    is_active: bool

class GetAppSettingsResponse(BaseModel):
    success: bool
    languages: List[AppSettingsItem] = []
    models: List[AppSettingsItem] = []
    data_sources: List[AppSettingsItem] = []
    monthlyCredits: Optional[int] = None
    tokensPerCredit: Optional[int] = None
    chatHistoryInDays: Optional[int] = None
    xScore: Optional[float] = None
    error: Optional[str] = None

class ApplicationDetailItem(BaseModel):
    app_id: int
    tenant_id: str
    tenant_name: str
    client_id: str
    application_name: str
    is_active: bool
    created_on: datetime
    assigned_languages: Optional[str] = None
    assigned_models: Optional[str] = None
    assigned_data_sources: Optional[str] = None

class GetAllApplicationsResponse(BaseModel):
    success: bool
    applications: List[ApplicationDetailItem] = []
    total_applications: int = 0
    error: Optional[str] = None

# Catalog Models
class LanguageItem(BaseModel):
    language_id: int
    language_name: str
    language_code: Optional[str] = None

class GetLanguagesResponse(BaseModel):
    success: bool
    languages: List[LanguageItem] = []
    total_languages: int = 0
    error: Optional[str] = None

class DataSourceItem(BaseModel):
    data_source_id: int
    data_source_name: str
    data_source_type: str
    isActive: Optional[bool] = None
    appId: Optional[int] = None
    applicationName: Optional[str] = None
    tenant_id: Optional[str] = None
    tenantName: Optional[str] = None

class GetDataSourcesResponse(BaseModel):
    success: bool
    data_sources: List[DataSourceItem] = []
    total_data_sources: int = 0
    error: Optional[str] = None

class ModelItem(BaseModel):
    model_id: int
    model_name: str

class GetModelsResponse(BaseModel):
    success: bool
    models: List[ModelItem] = []
    total_models: int = 0
    error: Optional[str] = None

# App-specific Catalog Models
class LanguageByAppResponseItem(BaseModel):
    language_id: int
    language_name: str

class GetLanguagesByAppResponse(BaseModel):
    success: bool
    languages: List[LanguageByAppResponseItem] = []
    error: Optional[str] = None

class ModelByAppResponseItem(BaseModel):
    model_id: int
    model_name: str

class GetModelsByAppResponse(BaseModel):
    success: bool
    models: List[ModelByAppResponseItem] = []
    error: Optional[str] = None

# Tenant-specific App Models
class DataSourceInfo(BaseModel):
    data_source_id: int
    data_source_name: str

class ApplicationForTenant(BaseModel):
    app_id: int
    application_name: str
    data_sources: List[DataSourceInfo] = []

class GetApplicationsForTenantResponse(BaseModel):
    success: bool
    applications: List[ApplicationForTenant] = []
    error: Optional[str] = None


class FeatureInfo(BaseModel):
    """Represents a single feature record from the database."""
    FeatureId: int
    FeatureName: str
    IsActive: bool
    CreatedOn: datetime
    CreatedBy: str
    ModifiedOn: Optional[datetime] = None
    ModifiedBy: Optional[str] = None

class GetFeaturesResponse(BaseModel):
    """Defines the response structure for the GET /features API endpoint."""
    success: bool
    features: List[FeatureInfo] = []
    total_features: int = 0
    error: Optional[str] = None


class UpsertApplicationRequest(BaseModel):
    app_id: int  
    tenant_id: str
    application_name: str
    is_active: bool
    executing_user: str

class UpsertApplicationResponse(BaseModel):
    success: bool
    message: str
    app_id: Optional[int] = None
    error: Optional[str] = None


class DeleteApplicationRequest(BaseModel):
    executing_user: str
class DataSourceConfigItem(BaseModel):
    configuration_name: str
    config_key: str
    config_value: str
    category: str

class UpsertDataSourceRequest(BaseModel):
    tenant_id: str
    app_id: int
    data_source_id: int
    data_source_name: str
    data_source_type: str
    is_active: bool
    executing_user: str
    # Add this new field
    configurations: List[DataSourceConfigItem] = [] 


class DataSourceTypeItem(BaseModel):
    data_type_id: int
    data_type_name: str

class GetDataSourceTypesResponse(BaseModel):
    success: bool
    data_types: List[DataSourceTypeItem] = []
    error: Optional[str] = None