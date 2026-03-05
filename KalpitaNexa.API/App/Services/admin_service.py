# app/Services/admin_service.py
"""
Contains business logic for administrator tasks, orchestrating calls to the AdminManager.
"""
import logging
from typing import Dict, List, Any
from ..Managers.admin_manager import AdminManager
from ..Models.admin_models import TenantAdmin, AdminFeature,TenantAdminDetails

logger = logging.getLogger(__name__)

class AdminService:
    """Orchestrates administrator-related business logic."""

    def __init__(self, manager: AdminManager):
        self._manager = manager
        # logger.info("AdminService initialized.")

    async def update_user_assignments(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        return await self._manager.update_user_assignments_db(request_data)

    async def get_tenant_admins(self, tenant_id: str) -> Dict[str, Any]:
        result = await self._manager.get_tenant_admins_db(tenant_id)
        if result["success"]:
            # Logic to parse the feature strings into structured objects
            admins = []
            for admin_raw in result["admins"]:
                features = []
                if admin_raw.get("FeatureIds") and admin_raw.get("FeatureNames"):
                    f_ids = admin_raw["FeatureIds"].split(',')
                    f_names = admin_raw["FeatureNames"].split(',')
                    features = [AdminFeature(feature_id=int(f_ids[i]), feature_name=f_names[i]) for i in range(len(f_ids))]
                
                admins.append(TenantAdmin(
                    user_id=str(admin_raw['UserId']), user_name=admin_raw['UserName'],
                    user_email=admin_raw['UserEmail'], role_id=admin_raw['RoleId'],
                    role_name=admin_raw['RoleName'], is_active=admin_raw['IsActive'],
                    created_on=admin_raw['CreatedOn'], created_by=admin_raw['CreatedBy'],
                    features=features
                ))
            result["admins"] = admins
        return result

    async def create_tenant_admin(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        return await self._manager.create_tenant_admin_db(request_data)

    async def update_tenant_admin(self, user_id: str, request_data: Dict[str, Any]) -> Dict[str, Any]:
        return await self._manager.update_tenant_admin_db(user_id, request_data)

    async def delete_tenant_admin(self, user_id: str, tenant_id: str, modified_by: str) -> Dict[str, Any]:
        return await self._manager.delete_tenant_admin_db(user_id, tenant_id, modified_by)

    async def reset_admin_password(self, user_email: str, modified_by: str) -> Dict[str, Any]:
        return await self._manager.reset_admin_password_db(user_email, modified_by)

    async def get_tenant_admin_details(self, admin_id: str, tenant_id: str) -> Dict[str, Any]:
        result = await self._manager.get_tenant_admin_details_db(admin_id, tenant_id)
        # Add parsing logic here if needed, similar to get_tenant_admins
        return result
    
    # --- START OF INTEGRATION ---
    async def get_tenant_admin_details(self, admin_id: str, tenant_id: str) -> Dict[str, Any]:
        """
        Fetches admin details from the manager and transforms the raw data,
        including parsing feature strings, into the final response model structure.
        """
        result = await self._manager.get_tenant_admin_details_db(admin_id, tenant_id)
        
        # If data was fetched successfully, transform it
        if result.get("success"):
            details_raw = result["admin_details"]
            features = []
            
            # This is the key transformation logic, as seen in get_tenant_admins
            if details_raw.get("FeatureIds") and details_raw.get("FeatureNames"):
                try:
                    f_ids = details_raw["FeatureIds"].split(',')
                    f_names = details_raw["FeatureNames"].split(',')
                    min_len = min(len(f_ids), len(f_names))
                    features = [
                        AdminFeature(feature_id=int(f_ids[i]), feature_name=f_names[i].strip())
                        for i in range(min_len)
                    ]
                except (ValueError, IndexError):
                    # Handle cases with malformed data gracefully
                    logger.warning(f"Could not parse features for admin {admin_id}. Data may be inconsistent.")
                    features = []

            # Create the final, structured Pydantic model from the raw data + parsed features
            admin_details_model = TenantAdminDetails(
                user_id=str(details_raw.get('TenantAdminId')),
                user_name=details_raw.get('TenantAdminName'),
                user_email=details_raw.get('UserEmail'),
                role_id=details_raw.get('RoleId'),
                role_name=details_raw.get('RoleName'),
                is_active=bool(details_raw.get('IsActive')),
                created_on=details_raw.get('CreatedOn'),
                created_by=details_raw.get('CreatedBy'),
                modified_on=details_raw.get('ModifiedOn'),
                modified_by=details_raw.get('ModifiedBy'),
                features=features
            )
            
            # Replace the raw dictionary with the structured Pydantic model object
            result["admin_details"] = admin_details_model
            
        return result
    # --- END OF INTEGRATION ---