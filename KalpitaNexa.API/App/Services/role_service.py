# app/Services/role_service.py
"""
Contains the business logic for Role Management. It orchestrates operations
by calling the RoleManager for data access.
"""
import logging
from typing import Dict, List, Any

from pydantic import ValidationError
from ..Managers.role_manager import RoleManager
from ..Models.role_models import RoleDetail, RoleFeatureItem, RoleResponse, UpsertRoleResponse

logger = logging.getLogger(__name__)

class RoleService:
    """Orchestrates role-related business logic."""

    def __init__(self, manager: RoleManager):
        self._manager = manager
        logger.info("RoleService initialized.")


    async def upsert_role(self, request_data: Dict[str, Any]) -> UpsertRoleResponse:
        """Handles the business logic for creating or updating a role."""
        
        # Call the new manager method
        result = await self._manager.upsert_role_db(request_data)
        
        if not result.get("success"):
            return UpsertRoleResponse(success=False, error=result.get("error"))

        # Process the rich data returned from the manager
        raw_data = result.get("data", [])
        if not raw_data:
            return UpsertRoleResponse(success=False, error="No role data returned after upsert.")

        # Aggregate the features for the role
        role_info = raw_data[0]
        features = []
        for row in raw_data:
            if row.get('FeatureId') is not None and row.get('FeatureName') is not None:
                features.append(RoleFeatureItem(feature_id=row['FeatureId'], feature_name=row['FeatureName']))

        # Build the final, structured response object
        final_role = RoleDetail(
            role_id=role_info['RoleId'],
            role_name=role_info['RoleName'],
            features=features
        )
        
        message = "Role updated successfully."
        if not request_data.get('role_id'): # If it was a create operation
            message = "Role created successfully."

        return UpsertRoleResponse(success=True, role=final_role, message=message)

    

    async def delete_role(self, role_id: int, tenant_id: str, app_id: int) -> Dict[str, Any]:
        """Handles the business logic for deleting a role."""
        return await self._manager.delete_role_db(role_id, tenant_id, app_id)

    
    async def get_all_roles(self) -> Dict[str, Any]:
        """Handles the business logic for retrieving all system roles."""
        return await self._manager.get_all_roles_db()
    
    async def get_role_features(self, tenant_id: str, app_id: int, role_name: str) -> Dict[str, Any]:
        """
        Handles fetching features for a specific role and transforms the
        raw data from the manager into structured response models.
        """
        result = await self._manager.get_role_features_db(tenant_id, app_id, role_name)
        
        if not result.get("success"):
            return result

        try:
            # Get the raw list of feature dictionaries from the manager's result
            raw_features = result.get("features", [])
            
            # This is the transformation step. It's now wrapped in a try block.
            # It converts the list of dictionaries into a list of Pydantic models.
            result["features"] = [RoleFeatureItem(**feature) for feature in raw_features]
            
            return result
            
        except ValidationError as e:
            # This block will execute if the data from the manager doesn't match the model
            error_details = e.errors()[0]
            field = error_details['loc'][0]
            msg = error_details['msg']
            logger.error(f"Pydantic validation failed for Role Features: Field '{field}' - {msg}")
            # Return a clean error message instead of crashing
            return {
                "success": False,
                "error": f"Data transformation error: The data for field '{field}' is invalid. Details: {msg}",
                "features": []
            }
        except Exception as e:
            # Catch any other unexpected errors during transformation
            logger.error(f"An unexpected error occurred during role feature transformation: {e}", exc_info=True)
            return {
                "success": False,
                "error": "An unexpected server error occurred while processing the data.",
                "features": []
            }

