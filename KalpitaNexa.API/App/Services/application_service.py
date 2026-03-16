# app/Services/application_service.py
"""
Contains business logic for Application Management, orchestrating calls to the ApplicationManager.
"""
import logging
from .. import config as nexa_config
from typing import Dict, Any, List
from ..Managers.application_manager import ApplicationManager
from .azure_search_automation_service import AzureSearchAutomationService

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
    
    async def automate_azure_resource_creation(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            import re
            import urllib.parse
            
            # 1. Sanitize Name for Azure
            raw_name = data['data_source_name']
            azure_safe_name = re.sub(r'[^a-zA-Z0-9]', '-', raw_name).lower().strip('-')
            if azure_safe_name[0].isdigit():
                azure_safe_name = "ds-" + azure_safe_name

            # 2. Extract SharePoint Hostname and Site Path
            spo_url = data['config'].get('spo_endpoint', '').strip().rstrip('/')
            url_no_proto = spo_url.replace("https://", "")
            hostname = url_no_proto.split('/')[0]
            
            # Initial site path from the URL field
            site_path = "/" + "/".join(url_no_proto.split('/')[1:]) if '/' in url_no_proto else ""

            # 3. SMART PATH PARSING
            # Folder from UI: /sites/KalpitaInternalPolicy/HolidayCalendar
            raw_folder = data['config'].get('folder_path', '').strip('/')
            decoded_folder = urllib.parse.unquote(raw_folder)
            
            # If the user included "/sites/..." in the folder path but not in the site URL
            if "sites/" in decoded_folder and not site_path:
                # Extract site segment: e.g., /sites/KalpitaInternalPolicy
                match = re.search(r'(sites/[^/]+)', decoded_folder)
                if match:
                    site_path = "/" + match.group(1)
            
            # 4. FINAL CLEAN: Get the path relative to the Document Library
            # We look for "Shared Documents" or "Documents" and take everything AFTER it
            clean_folder = decoded_folder
            lib_match = re.search(r'(?:Shared\sDocuments|Documents)/(.*)', decoded_folder, re.IGNORECASE)
            
            if lib_match:
                clean_folder = lib_match.group(1).strip('/')
            else:
                # If "Shared Documents" wasn't typed, just strip the site path we found
                temp_site = site_path.strip('/')
                if temp_site and clean_folder.lower().startswith(temp_site.lower()):
                    clean_folder = clean_folder[len(temp_site):].strip('/')

            logger.info(f"📁 Path Parsing: SitePath='{site_path}', CleanFolder='{clean_folder}'")

            infra_config = {
                "tenant_id": nexa_config.GRAPH_TENANT_ID,
                "app_id": nexa_config.GRAPH_CLIENT_ID,
                "app_secret": nexa_config.GRAPH_CLIENT_SECRET,
                "spo_hostname": hostname,
                "spo_site_path": site_path,
                "spo_endpoint": spo_url,
                "folder_path": clean_folder 
            }

            from .azure_search_automation_service import AzureSearchAutomationService
            azure_svc = AzureSearchAutomationService(nexa_config.AZURE_SEARCH_ENDPOINT, nexa_config.AZURE_SEARCH_KEY)
            
            if data['type'] == 'unstructured':
                azure_res = await azure_svc.create_unstructured_resources(azure_safe_name, infra_config)
            else:
                azure_res = await azure_svc.create_structured_resources(azure_safe_name, data['fields'], infra_config)

            # 5. Store in Local DB
            db_payload = {
                "data_source_id": 0,
                "app_id": data['app_id'],
                "data_source_name": raw_name,
                "data_source_type": data.get('data_source_type', 'SharePoint'),
                "is_active": True,
                "executing_user": data['executing_user'],
                "configurations": [
                    {"configuration_name": "Azure Index Name", "config_key": "AZURE_SEARCH_INDEX_NAME", "config_value": azure_res['index_name'], "category": "Azure"},
                    {"configuration_name": "Azure Endpoint", "config_key": "AZURE_SEARCH_ENDPOINT", "config_value": nexa_config.AZURE_SEARCH_ENDPOINT, "category": "Azure"},
                    {"configuration_name": "Azure Indexer Name", "config_key": "AZURE_SEARCH_INDEXER_NAME", "config_value": f"{azure_safe_name}-indexer", "category": "Azure"}
                ]
            }
            return await self._manager.upsert_data_source_db(db_payload)

        except Exception as e:
            logger.error(f"Automation Error: {str(e)}", exc_info=True)
            return {"success": False, "error": str(e)}
        
    async def run_azure_indexer(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            # 1. Get the Indexer Name from the database based on DataSourceId
            # (Assuming your configurations table stores the indexer name)
            with self._manager._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT ConfigValue FROM Configurations 
                    WHERE DataSourceId = ? AND ConfigKey = 'AZURE_SEARCH_INDEXER_NAME'
                """, data['data_source_id'])
                row = cursor.fetchone()
                
                if not row:
                    # Fallback: Many times the indexer name is same as data_source_name + '-indexer'
                    # Let's try to find the index name instead
                    cursor.execute("SELECT DataSourceName FROM DataSources WHERE DataSourceId = ?", data['data_source_id'])
                    ds_row = cursor.fetchone()
                    indexer_name = f"{ds_row[0]}-indexer"
                else:
                    indexer_name = row[0]

            # 2. Trigger Azure REST API to run indexer
            azure_endpoint = nexa_config.AZURE_SEARCH_ENDPOINT
            azure_key = nexa_config.AZURE_SEARCH_KEY
            
            headers = {"api-key": azure_key, "Content-Type": "application/json"}
            url = f"{azure_endpoint}/indexers/{indexer_name}/run?api-version=2024-05-01-preview"
            
            import requests
            response = requests.post(url, headers=headers)
            
            if response.status_code == 202:
                return {"success": True, "message": "Indexer run triggered successfully"}
            else:
                return {"success": False, "error": f"Azure rejected request: {response.text}"}

        except Exception as e:
            return {"success": False, "error": str(e)}   
