# app/Services/tenant_service.py
"""
Contains the business logic for Tenant Management.
"""
import logging
from typing import Dict, Any, List

from App.Models.role_models import RoleResponse
from ..Managers.tenant_manager import TenantManager
from ..Managers.user_manager import UserManager # Needed to look up user IDs

logger = logging.getLogger(__name__)

class TenantService:
    """Orchestrates tenant-related business logic."""

    def __init__(self, manager: TenantManager, user_manager: UserManager):
        self._manager = manager
        self._user_manager = user_manager
        logger.info("TenantService initialized.")

    async def get_all_tenants(self) -> Dict[str, Any]:
        """
        Handles the business logic for retrieving all tenants and formats the
        data to match the Pydantic models.
        """
        result = await self._manager.get_tenants_db()
        if result.get("success"):
            formatted_tenants = []
            for tenant_raw in result.get("tenants", []):
                # DEBUG LOGGING
                if len(formatted_tenants) < 3: # Log first few only
                    logger.info(f"DEBUG: Processing tenant: {tenant_raw}")
                
                formatted_tenants.append({
                    "tenant_id": str(tenant_raw.get("TenantId")),
                    "tenant_name": tenant_raw.get("TenantName"),
                    "is_active": tenant_raw.get("IsActive"),
                    "created_on": tenant_raw.get("CreatedOn"),
                    "CreatedOn": tenant_raw.get("CreatedOn"),
                    "created_by": tenant_raw.get("CreatedBy"),
                    "CreatedBy": tenant_raw.get("CreatedBy")
                })
            result["tenants"] = formatted_tenants
        
        return result


    async def upsert_tenant(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handles business logic for creating or updating a tenant."""
        try:
            user_details = await self._user_manager.get_user_details_by_email(request_data['requesting_user_email'])
            if not user_details.get("success"):
                return {"success": False, "error": "Requesting user not found or is inactive."}
            user_id = user_details.get("userId")

            # The tenant_id from the request (can be None for creation)
            tenant_id = request_data.get('tenant_id')

            return await self._manager.upsert_tenant_db(
                tenant_id=tenant_id, 
                name=request_data['tenant_name'], 
                app_ids=request_data['application_ids'],
                feature_ids=request_data['feature_ids'],
                user_id=user_id
            )
        except KeyError as e:
            logger.error(f"Missing key in upsert_tenant request data: {e}")
            return {"success": False, "error": f"Missing required field in request: {e}"}

    async def delete_tenant(self, tenant_id: str, user_email: str) -> Dict[str, Any]:
        user_details = await self._user_manager.get_user_details_by_email(user_email)
        if not user_details.get("success"):
            return {"success": False, "error": "Requesting user not found or is inactive."}
        user_id = user_details.get("userId")
        # FIX END
        return await self._manager.delete_tenant_db(tenant_id, user_id)

    async def get_tenant_details(self, tenant_id: str) -> Dict[str, Any]:
        """
        Handles the business logic for retrieving a single tenant's details and
        formats the data to match the Pydantic models.
        """
        result = await self._manager.get_tenant_by_id_db(tenant_id)

        if not result.get("success"):
            return result

        # The manager returns a dictionary with PascalCase keys.
        # We need to transform it to snake_case for the 'TenantInfo' model.
        tenant_raw = result.get("tenant", {})
        if not tenant_raw:
            return {"success": False, "error": "Tenant data could not be retrieved."}

        # Manually map the fields from the raw data to the Pydantic model's expected format.
        formatted_tenant = {
            "tenant_id": str(tenant_raw.get("TenantId")),
            "tenant_name": tenant_raw.get("TenantName"),
            "is_active": tenant_raw.get("IsActive"),
            "created_on": tenant_raw.get("CreatedOn"),
            "created_by": tenant_raw.get("CreatedBy"),
            "applications": tenant_raw.get("applications", []), # These lists are already correct
            "features": tenant_raw.get("features", [])          # These lists are already correct
        }
        
        # Replace the original 'tenant' object with the correctly formatted one.
        result["tenant"] = formatted_tenant
        
        return result

    async def get_all_tenants_with_apps(self, user_email: str) -> Dict[str, Any]:
        return await self._manager.get_tenants_with_apps_db(user_email)

    async def get_features_for_tenant(self, tenant_id: str, app_id: int) -> Dict[str, Any]:
        """
        Handles the business logic for retrieving features for a tenant and formats
        the data to match the Pydantic models.
        """
        result = await self._manager.get_tenant_features_db(tenant_id, app_id)

        if result.get("success"):
            # The manager returns a list with PascalCase keys.
            # We need to transform them to snake_case for the 'TenantFeature' model.
            formatted_features = []
            for feature_raw in result.get("features", []):
                formatted_features.append({
                    "feature_id": feature_raw.get("FeatureId"),
                    "feature_name": feature_raw.get("FeatureName"),
                    "isactive": feature_raw.get("IsActive"),
                    "created_on": feature_raw.get("CreatedOn"),
                    "created_by": feature_raw.get("CreatedBy"),
                    # Note: The TenantFeature model only requires these two fields.
                })
            # Replace the original list with the correctly formatted one.
            result["features"] = formatted_features
        
        return result
    
    async def assign_features_to_tenant(self, tenant_id: str, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handles the business logic for assigning features to a tenant."""
        return await self._manager.assign_features_to_tenant_db(
            tenant_id=tenant_id,
            feature_ids=request_data.get('feature_ids', []),
            created_by=request_data['created_by']
        )
    

    async def get_roles_for_tenant_app(self, tenant_id: str, app_id: int) -> Dict[str, Any]:
        """Handles the business logic for retrieving roles in a specific context."""
        result = await self._manager.get_tenant_app_roles_db(tenant_id, app_id)
        if result["success"]:
            # Format the data to match the RoleResponse model
            formatted_roles = []
            for row in result["roles"]:
                formatted_roles.append(RoleResponse(
                    role_id=str(row.get('RoleId')),
                    role_name=row.get('RoleName'),
                    features=row.get('FeatureNames', '').split(', ') if row.get('FeatureNames') else [],
                    is_active=bool(row.get('IsActive')),
                    created_on=row.get('CreatedOn'),
                    created_by=row.get('CreatedBy'),
                    modified_on=row.get('ModifiedOn'),
                    modified_by=row.get('ModifiedBy')
                ))
            result["roles"] = formatted_roles
        return result