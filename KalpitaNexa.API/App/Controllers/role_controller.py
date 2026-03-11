# app/Controllers/role_controller.py
"""
Defines all API endpoints related to Role Management.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from ..Services.role_service import RoleService
from ..Models.role_models import (
    GetRoleFeaturesResponse, GetRolesResponse, GetAllRolesResponse, UpsertRoleRequest, UpsertRoleResponse
)
from ..Models.system_models import SuccessResponse
from ..dependencies import get_role_service

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/roles/upsert", response_model=UpsertRoleResponse, tags=["Role Management"])
async def upsert_role(
    request: UpsertRoleRequest,
    service: RoleService = Depends(get_role_service)
):
    """
    Creates a new role if role_id is null, or updates an existing role
    and its feature assignments if a role_id is provided.
    """
    result = await service.upsert_role(request.model_dump())
    if not result.success:
        raise HTTPException(status_code=400, detail=result.error)
    return result


@router.delete("/roles/{role_id}", response_model=SuccessResponse, tags=["Role Management"])
async def delete_role(
    role_id: int,
    tenant_id: str = Query(...),
    app_id: int = Query(...),
    service: RoleService = Depends(get_role_service)
):
    """Soft-deletes (deactivates) a role within a specific tenant and app."""
    result = await service.delete_role(role_id, tenant_id, app_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result

@router.get("/roles/all", response_model=GetAllRolesResponse, tags=["Role Management"])
async def get_all_roles(service: RoleService = Depends(get_role_service)):
    """Retrieves a list of all available roles in the system."""
    result = await service.get_all_roles()
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result


@router.get("/roles/features", response_model=GetRoleFeaturesResponse, tags=["Role Management"])
async def get_features_for_role(
    tenant_id: str = Query(..., description="The ID of the tenant."),
    app_id: int = Query(..., description="The ID of the application."),
    role_name: str = Query(..., description="The name of the role."),
    service: RoleService = Depends(get_role_service)
):
    """
    Retrieves a list of all features assigned to a specific role within a tenant and app.
    """
    result = await service.get_role_features(tenant_id, app_id, role_name)
    if not result.get("success"):
        # Use 404 Not Found if the role doesn't exist or has no features
        raise HTTPException(status_code=404, detail=result.get("error"))
    return result