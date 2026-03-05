# app/Controllers/tenant_controller.py
"""
Defines all API endpoints related to Tenant Management.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query

from App.Models.role_models import GetRolesResponse
from App.Services.role_service import RoleService
from ..Services.tenant_service import TenantService
from ..Models.tenant_models import (
    AssignTenantFeaturesRequest, UpsertTenantRequest, DeleteTenantRequest,
    GetTenantsResponse, GetTenantResponse, GetTenantsWithApplicationsResponse,
    GetTenantFeaturesResponse, TenantActionResponse
)
from ..dependencies import get_role_service, get_tenant_service

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/tenants", response_model=TenantActionResponse, tags=["Tenant Management"])
async def upsert_tenant(request: UpsertTenantRequest, service: TenantService = Depends(get_tenant_service)):
    """
    Creates a new tenant if tenant_id is not provided.
    Updates an existing tenant if tenant_id is provided.
    """
    result = await service.upsert_tenant(request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result

@router.delete("/tenants/{tenant_id}", response_model=TenantActionResponse, tags=["Tenant Management"])
async def delete_tenant(tenant_id: str, request: DeleteTenantRequest, service: TenantService = Depends(get_tenant_service)):
    result = await service.delete_tenant(tenant_id, request.requesting_user_email)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result

@router.get("/tenants", response_model=GetTenantsResponse, tags=["Tenant Management"])
async def get_all_tenants(service: TenantService = Depends(get_tenant_service)):
    result = await service.get_all_tenants()
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return {"success": True, "tenants": result.get("tenants", []), "total_tenants": len(result.get("tenants", []))}

@router.get("/tenants/with-applications", response_model=GetTenantsWithApplicationsResponse, tags=["Tenant Management"])
async def get_tenants_with_applications(requesting_user_email: str = Query(...), service: TenantService = Depends(get_tenant_service)):
    result = await service.get_all_tenants_with_apps(requesting_user_email)
    if not result.get("success"):
        raise HTTPException(status_code=403, detail=result.get("error", "Permission denied."))
    return result

@router.get("/tenants/{tenant_id}", response_model=GetTenantResponse, tags=["Tenant Management"])
async def get_tenant_details(tenant_id: str, service: TenantService = Depends(get_tenant_service)):
    result = await service.get_tenant_details(tenant_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error"))
    return result

@router.get("/tenants/{tenant_id}/features", response_model=GetTenantFeaturesResponse, tags=["Tenant Management"])
async def get_features_for_tenant(tenant_id: str, app_id: int = Query(...), service: TenantService = Depends(get_tenant_service)):
    result = await service.get_features_for_tenant(tenant_id, app_id)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result

@router.post("/tenants/{tenant_id}/features", response_model=TenantActionResponse, tags=["Tenant Management"])
async def assign_tenant_features(
    tenant_id: str,
    request: AssignTenantFeaturesRequest,
    service: TenantService = Depends(get_tenant_service)
):
    """Assigns a list of features directly to a specific tenant."""
    result = await service.assign_features_to_tenant(tenant_id, request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.get("/roles/tenant/{tenant_id}/app/{app_id}", response_model=GetRolesResponse, tags=["Tenant Management"])
async def get_roles_for_tenant_app(
    tenant_id: str,
    app_id: int,
    service: TenantService = Depends(get_tenant_service)
):
    """Gets all roles and their assigned features for a specific tenant and application."""
    result = await service.get_roles_for_tenant_app(tenant_id, app_id)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result