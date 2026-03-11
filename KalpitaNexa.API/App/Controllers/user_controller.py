# app/controllers/user_controller.py
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List,Optional
import re
from fastapi.responses import JSONResponse

from ..Services.user_service import UserService
from ..dependencies import get_user_service
from ..Models.user_models import (
    GetUserCreditsResponse, UserCreateRequest, UserCreateResponse,
    UserUpdateRequest, UserUpdateResponse,UserDeleteRequest,
    GetUsersResponse, UserUpdateSelfProfileRequest,
    GetUserProfileResponse, GetUserTenantsResponse,
    UserDetailsResponse, GetUserPermissionsResponse, GetUserDefaultsResponse,CleanupHistoryRequest,
)
from ..Models.system_models import SuccessResponse


logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/create", response_model=UserCreateResponse, status_code=201)
async def create_user(
    request: UserCreateRequest,
    user_service: UserService = Depends(get_user_service)
):
    """Creates a new user or detects if the user is inactive."""
    try:
        result = await user_service.create_user(
            executing_user_email=request.executing_user_email,
            tenant_id=request.tenant_id,
            new_user_name=request.new_user_name,
            new_user_email=request.new_user_email,
            app_name=request.app_name,
            role_names=request.role_names
        )

        # If the service detects an inactive user, return a 409 Conflict response
        # so the frontend knows to prompt the admin for reactivation.
        if result.get("status") == "USER_INACTIVE":
            return JSONResponse(status_code=409, content=result)

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        return result
    except HTTPException as he:
        raise he
    except Exception as e:
       
        logger.error(f"Create user endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/reactivate", response_model=UserCreateResponse)
async def reactivate_user(
    request: UserCreateRequest,
    user_service: UserService = Depends(get_user_service)
):
    """Reactivates an existing inactive user after admin confirmation."""
    try:
        result = await user_service.reactivate_user(
            executing_user_email=request.executing_user_email,
            tenant_id=request.tenant_id,
            new_user_name=request.new_user_name,
            new_user_email=request.new_user_email,
            app_name=request.app_name,
            role_names=request.role_names
        )
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Reactivate user endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
    
@router.post("/history/cleanup", response_model=SuccessResponse)
async def cleanup_user_chat_history(
    request: CleanupHistoryRequest,
    user_service: UserService = Depends(get_user_service)
):
    """
    Triggers a cleanup of old chat history for a specific user and application.
    This is a 'fire-and-forget' operation from the client's perspective.
    """
    try:
        result = await user_service.cleanup_user_history(user_id=request.user_id, app_id=request.app_id)
        if not result.get("success"):
            # Log the detailed error but return a generic server error to the client
            logger.error(f"History cleanup failed for user {request.user_id}: {result.get('error')}")
            raise HTTPException(status_code=500, detail="Cleanup process failed on the server.")
        
        # Always return a simple success message to the client
        return SuccessResponse(success=True, message="Cleanup process initiated successfully.")
    except Exception as e:
        logger.error(f"Chat history cleanup endpoint exception: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An unexpected error occurred during cleanup.")

@router.put("/update", response_model=UserUpdateResponse)
async def update_user(
    request: UserUpdateRequest,
    user_service: UserService = Depends(get_user_service)
):
    """[DEPRECATED - Use admin-update] Updates a user's basic info and single role."""
    try:
        result = await user_service.update_user(
            executing_user_email=request.executing_user_email,
            tenant_id=request.tenant_id,
            user_id_to_update=request.user_id_to_update,
            new_user_name=request.new_user_name,
            new_user_email=request.new_user_email,
            new_role_name=request.new_role_name
        )
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Update user endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@router.delete("/delete", response_model=SuccessResponse)
async def delete_user(
    request: UserDeleteRequest,
    user_service: UserService = Depends(get_user_service)
):
    """Soft deletes (deactivates) a user."""
    try:
        result = await user_service.soft_delete_user(
            executing_user_email=request.executing_user_email,
            tenant_id=request.tenant_id,
            user_id_to_delete=request.user_id_to_delete
        )
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        return SuccessResponse(success=True, message=result.get("message"))
    except Exception as e:
        logger.error(f"Delete user endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@router.get("/tenant/{tenant_id}", response_model=GetUsersResponse)
async def get_users_for_tenant(
    tenant_id: str,
    app_id: int = Query(..., description="The ID of the application to filter users by."),
    user_service: UserService = Depends(get_user_service)
):
    """Gets all active users and their roles for a specific tenant and application."""
    try:
        result = await user_service.get_tenant_users(tenant_id, app_id)
        if not result.get("success"):
            raise HTTPException(status_code=404, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Get tenant users endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@router.put("/profile/me", response_model=UserUpdateResponse)
async def update_own_profile(
    request: UserUpdateSelfProfileRequest,
    user_service: UserService = Depends(get_user_service)
):
    """[User] Allows a logged-in user to update their own name, email, language, and model preferences."""
    try:
        # In a real app, executing_user_email should be extracted from a JWT token for security.
        result = await user_service.update_self_profile(
            executing_user_email=request.executing_user_email,
            new_user_name=request.new_user_name,
            new_user_email=request.new_user_email,
            language_names=request.language_names,
            model_names=request.model_names
        )
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Update self profile endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@router.get("/profile/me", response_model=GetUserProfileResponse)
async def get_my_profile(
    user_email: str = Query(..., description="The email of the logged-in user."),
    user_service: UserService = Depends(get_user_service)
):
    """Gets the complete profile for the currently logged-in user, including their permissions."""
    try:
        result = await user_service.get_user_profile(user_email)
        if not result.get("success"):
            raise HTTPException(status_code=404, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Get my profile endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@router.get("/tenants", response_model=GetUserTenantsResponse)
async def get_user_tenants(
    user_email: str = Query(..., description="The email of the user to look up."),
    user_service: UserService = Depends(get_user_service)
):
    """Gets all tenants associated with a specific user's email address."""
    try:
        result = await user_service.get_user_tenants(user_email)
        if not result.get("success"):
            raise HTTPException(status_code=404, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Get user tenants endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@router.get("/details-by-email", response_model=UserDetailsResponse)
async def get_user_details_by_email(
    user_email: str = Query(...),
    user_service: UserService = Depends(get_user_service)
):
    """Gets a user's ID and primary Tenant ID based on their email address."""
    try:
        result = await user_service.get_user_details_by_email(user_email)
        if not result.get("success"):
            raise HTTPException(status_code=404, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Get user details by email endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@router.get("/permissions", response_model=GetUserPermissionsResponse)
async def get_user_permissions(
    user_email: str = Query(...),
    app_id: int = Query(...),
    tenant_id: str = Query(...),
    user_service: UserService = Depends(get_user_service)
):
    """Gets the complete set of permissions for a user within an application context."""
    try:
        result = await user_service.get_user_permissions(user_email, app_id,tenant_id)
        if not result.get("success"):
            raise HTTPException(status_code=404, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Get user permissions endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@router.get("/{user_id}/defaults/{TenantId}", response_model=GetUserDefaultsResponse)
async def get_user_defaults(
    user_id: str,
    TenantId:str,
    user_service: UserService = Depends(get_user_service)
):
    """Get default language, model, and application settings for a specific user."""
    try:
        result = await user_service.get_user_defaults(user_id,TenantId)
        if not result.get("success"):
            raise HTTPException(status_code=404, detail=result.get("error"))
        return result
    except ValueError as ve: # Catch specific validation errors
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Get user defaults endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
    
@router.get("/credits", response_model=GetUserCreditsResponse)
async def get_user_credits(
    executing_user_email: str = Query(..., description="The email of the user requesting the credit data."),
    date_filter: str = Query('all', description="Date filter ('all', 'lastWeek', 'lastMonth', 'custom')."),
    start_date: Optional[str] = Query(None, description="Custom start date (YYYY-MM-DD)."),
    end_date: Optional[str] = Query(None, description="Custom end date (YYYY-MM-DD)."),
    user_service: UserService = Depends(get_user_service)
):
    """Gets credit usage info, now with optional date filtering."""
    try:
        result = await user_service.get_user_credits(executing_user_email, date_filter, start_date, end_date)
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Get user credits endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
    
# --- NEW ENDPOINT FOR INTEGRATED APP ---
@router.get("/permissions/integrated", response_model=GetUserPermissionsResponse)
async def get_user_permissions_for_integrated(
    user_role: str = Query(..., description="The role of the user (e.g. Admin, User)."),
    app_id: int = Query(..., description="The ID of the application context."),
    tenant_id: str = Query(..., description="The GUID of the tenant."),
    user_service: UserService = Depends(get_user_service)
):
    """Gets permissions for a user in an integrated context (via Chatbot/External) based on Role, Tenant, and App."""
    try:
        result = await user_service.get_user_permissions_for_integrated_app(user_role, app_id, tenant_id)
        if not result.get("success"):
            raise HTTPException(status_code=404, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Get integrated permissions endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
