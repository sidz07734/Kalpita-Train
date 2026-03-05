# app/Services/application_service.py
"""
Contains business logic for Application Management, orchestrating calls to the ApplicationManager.
"""
import logging
from typing import Dict, Any, List
from ..Managers.application_manager import ApplicationManager

logger = logging.getLogger(__name__)

class ApplicationService:
    """Orchestrates application-related business logic."""

    def __init__(self, manager: ApplicationManager):
        self._manager = manager
        # logger.info("ApplicationService initialized.")

    async def get_all_applications_with_settings(self, tenant_id: str) -> Dict[str, Any]:
        return await self._manager.get_all_apps_with_settings_db(tenant_id)

    async def get_application_settings(self, app_id: int) -> Dict[str, Any]:
        """
        Fetches all settings for an application from the manager.
        The manager now prepares the data in the exact format required, so this
        service method just passes the result through.
        """
        # The manager now returns the dictionary in the correct final format.
        # The flawed "app_config" logic is removed.
        return await self._manager.get_app_settings_db(app_id)

    async def set_application_settings(self, app_id: int, req: Dict[str, Any]) -> Dict[str, Any]:
        return await self._manager.set_app_settings_db(app_id, req['language_ids'], req['model_ids'], req['data_source_ids'], req['created_by'])

    async def update_application_settings(self, app_id: int, req: Dict[str, Any]) -> Dict[str, Any]:
        return await self._manager.update_app_settings_db(app_id, req)

    async def get_all_languages(self) -> Dict[str, Any]:
        return await self._manager.get_languages_db()

    async def get_all_data_sources(self) -> Dict[str, Any]:
        return await self._manager.get_data_sources_db()

    async def get_all_models(self) -> Dict[str, Any]:
        return await self._manager.get_models_db()

    async def get_applications_for_tenant(self, tenant_id: str) -> Dict[str, Any]:
        result = await self._manager.get_apps_for_tenant_db(tenant_id)
        if not result.get("success"):
            return result
        
        # Group data sources by application
        apps_dict = {}
        for row in result.get("data", []):
            app_id = row.AppId
            if app_id not in apps_dict:
                apps_dict[app_id] = {"app_id": app_id, "application_name": row.ApplicationName, "data_sources": []}
            apps_dict[app_id]["data_sources"].append({"data_source_id": row.DataSourceId, "data_source_name": row.DataSourceName})
        
        result["applications"] = list(apps_dict.values())
        return result

    async def get_languages_by_app_id(self, app_id: int) -> Dict[str, Any]:
        return await self._manager.get_languages_by_app_id_db(app_id)
        
    async def get_models_by_app_id(self, app_id: int) -> Dict[str, Any]:
        return await self._manager.get_models_by_app_id_db(app_id)
    

    async def get_all_features(self) -> Dict[str, Any]:
        """
        Retrieves all active features by calling the manager and formats the final response.
        """
        result = await self._manager.get_features_db()
        
        # The manager already returns the data in a good format, so we can just add the count
        if result.get("success"):
            result["total_features"] = len(result.get("features", []))
            
        return result
    

    async def upsert_application(self, app_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handles the business logic for creating or updating an application.
        """
        return await self._manager.upsert_application_db(app_data)
    
    
    async def delete_application(self, app_id: int, executing_user: str) -> Dict[str, Any]:
        """
        Handles the business logic for deleting an application.
        """
        return await self._manager.delete_application_db(app_id, executing_user)

    async def upsert_data_source(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        return await self._manager.upsert_data_source_db(request_data)
    
    async def delete_data_source(self, app_id: int, data_source_id: int) -> Dict[str, Any]:
        return await self._manager.delete_data_source_db(app_id, data_source_id)
    
    async def get_all_data_source_types(self) -> Dict[str, Any]:
        """Retrieves the list of available data source types."""
        return await self._manager.get_data_source_types_db()
