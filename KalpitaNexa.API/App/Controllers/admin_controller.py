# app/Controllers/admin_controller.py
"""
Defines all API endpoints for Administrator-level management tasks.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Dict
from ..Services.admin_service import AdminService
from ..Models.admin_models import (
    UserUpdateAssignmentsRequest, GetTenantAdminsResponse, CreateTenantAdminRequest,
    UpdateTenantAdminRequest, DeleteTenantAdminRequest, ResetAdminPasswordRequest,
    GetTenantAdminDetailsResponse, AdminUserActionResponse
)
from ..Models.system_models import SuccessResponse
from ..dependencies import get_admin_service

logger = logging.getLogger(__name__)
router = APIRouter()

@router.put("/users/assignments", response_model=SuccessResponse, tags=["Admin Management"])
async def admin_update_user_assignments(request: UserUpdateAssignmentsRequest, service: AdminService = Depends(get_admin_service)):
    """[Admin] Updates a regular user's name, email, roles, and default settings."""
    result = await service.update_user_assignments(request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.get("/tenants/{tenant_id}/admins", response_model=GetTenantAdminsResponse, tags=["Admin Management"])
async def get_tenant_admins(tenant_id: str, service: AdminService = Depends(get_admin_service)):
    """Gets all admins for a specific tenant, including their assigned features."""
    result = await service.get_tenant_admins(tenant_id)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result


@router.post("/tenants/admins", response_model=AdminUserActionResponse, tags=["Admin Management"])
async def create_tenant_admin(request: CreateTenantAdminRequest, service: AdminService = Depends(get_admin_service)):
    """Creates a new tenant administrator and assigns roles and features."""
    result = await service.create_tenant_admin(request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.put("/tenants/admins/{user_id}", response_model=SuccessResponse, tags=["Admin Management"])
async def update_tenant_admin(user_id: str, request: UpdateTenantAdminRequest, service: AdminService = Depends(get_admin_service)):
    """Updates an existing tenant administrator's details, roles, and features."""
    result = await service.update_tenant_admin(user_id, request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.delete("/tenants/admins/{user_id}", response_model=SuccessResponse, tags=["Admin Management"])
async def delete_tenant_admin(user_id: str, request: DeleteTenantAdminRequest, service: AdminService = Depends(get_admin_service)):
    """Soft-deletes (deactivates) a tenant administrator."""
    result = await service.delete_tenant_admin(user_id, request.tenant_id, request.modified_by)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.post("/tenants/admins/reset-password", response_model=AdminUserActionResponse, tags=["Admin Management"])
async def reset_admin_password(request: ResetAdminPasswordRequest, service: AdminService = Depends(get_admin_service)):
    """Resets a tenant admin's password and returns a new temporary password."""
    result = await service.reset_admin_password(request.user_email, request.modified_by)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error"))
    return result




@router.get("/tenants/{tenant_id}/admins/{admin_id}", response_model=GetTenantAdminDetailsResponse, tags=["Admin Management"])
async def get_tenant_admin_details(tenant_id: str, admin_id: str, service: AdminService = Depends(get_admin_service)):
    """Gets detailed information for a specific tenant admin, including their features."""
    result = await service.get_tenant_admin_details(admin_id, tenant_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error"))
    return result
# --- END OF INTEGRATION ---