# app/Managers/application_manager.py
"""
This manager handles all direct database interactions for managing applications,
their settings, and related catalogs like languages, models, and data sources.
"""
import logging
from typing import Dict, List, Any, Optional
import uuid
import pyodbc
import json
from .. import config

logger = logging.getLogger(__name__)

class ApplicationManager:
    """Manages data access for application-related operations."""

    def _get_connection(self):
        try:
            return config.get_sql_connection()
        except Exception as e:
            logger.error(f"FATAL: Could not establish database connection: {e}", exc_info=True)
            raise

    async def get_all_apps_with_settings_db(self, tenant_id: Optional[str] = None) -> Dict[str, Any]:
        """Gets all apps with aggregated settings using spGetAllApplicationsWithSettings filtered by Tenant."""
        try:
            formatted_tenant_id = None
            if tenant_id and tenant_id.lower() != "none" and tenant_id.strip() != "":
                try:
                    formatted_tenant_id = uuid.UUID(tenant_id)
                except ValueError:
                    formatted_tenant_id = None
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Pass the tenant_id parameter to the stored procedure
                cursor.execute("EXEC dbo.spGetAllApplicationsWithSettings @TenantId=?", formatted_tenant_id)
                
                apps = []
                columns = [column[0] for column in cursor.description]
                for row in cursor.fetchall():
                    app_dict = dict(zip(columns, row))
                    apps.append({
                        "app_id": app_dict.get("AppId"),
                        "tenant_id": str(app_dict.get("TenantId")),
                        "tenant_name": app_dict.get("TenantName"),
                        "client_id": app_dict.get("ClientId"),
                        "application_name": app_dict.get("ApplicationName"),
                        "is_active": app_dict.get("IsActive"),
                        "created_on": app_dict.get("CreatedOn"),
                        "created_by": app_dict.get("CreatedBy"),
                        "modified_on": app_dict.get("ModifiedOn"),
                        "modified_by": app_dict.get("ModifiedBy"),
                        "assigned_languages": app_dict.get("AssignedLanguages"),
                        "assigned_language_ids": app_dict.get("AssignedLanguageIds"),
                        "assigned_models": app_dict.get("AssignedModels"),
                        "assigned_model_ids": app_dict.get("AssignedModelIds"),
                        "assigned_data_sources": app_dict.get("AssignedDataSources"),
                        "assigned_data_source_ids": app_dict.get("AssignedDataSourceIds"),
                    })
                
                return {
                    "success": True,
                    "applications": apps,
                    "total_applications": len(apps)
                }
        except Exception as e:
            logger.error(f"Error getting all applications with settings for tenant {tenant_id}: {str(e)}")
            return {"success": False, "error": str(e), "applications": [], "total_applications": 0}


    async def get_app_settings_db(self, app_id: int) -> Dict[str, Any]:
        """
        Calls spGetApplicationSettings and correctly reads the 'MonthlyCredits' column.
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC dbo.spGetApplicationSettings @AppId = ?", (app_id,))
                
                languages = [{"id": int(r.LanguageID), "name": r.LanguageName, "is_default": bool(r.IsDefault), "is_active": bool(r.IsActive)} for r in cursor.fetchall()]

                cursor.nextset()
                models = [{"id": int(r.ModuleID), "name": r.ModuleName, "is_default": bool(r.IsDefault), "is_active": bool(r.IsActive)} for r in cursor.fetchall()]

                cursor.nextset()
                data_sources = [{"id": int(r.DataSourceId), "name": r.DataSourceName, "is_default": bool(r.IsDefault), "is_active": bool(r.IsActive)} for r in cursor.fetchall()]

                app_settings = {
                    "monthlyCredits": None,
                    "tokensPerCredit": None,
                    "chatHistoryInDays": None,
                    "xScore": None
                }
                if cursor.nextset():
                    settings_row = cursor.fetchone()
                    if settings_row:
                        app_settings["monthlyCredits"] = settings_row.MonthlyCredits # Corrected from FreeCredits
                        app_settings["tokensPerCredit"] = settings_row.TokensPerCredit
                        app_settings["chatHistoryInDays"] = settings_row.ChatHistoryInDays
                        raw_xscore = getattr(settings_row, 'XScore', None)
                        app_settings["xScore"] = float(raw_xscore) if raw_xscore is not None else None

            return {
                "success": True,
                "languages": languages,
                "models": models,
                "data_sources": data_sources,
                **app_settings
            }
        except Exception as e:
            logger.error(f"Error getting app settings for {app_id}: {e}")
            return {"success": False, "error": str(e)}

    async def set_app_settings_db(self, app_id: int, lang_ids: List[int], model_ids: List[int], ds_ids: List[int], created_by: str) -> Dict[str, Any]:
        """Executes spSetApplicationSettings."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spSetApplicationSettings @AppId=?, @LanguageIds=?, @ModelIds=?, @DataSourceIds=?, @CreatedBy=?",
                               app_id, ",".join(map(str, lang_ids)), ",".join(map(str, model_ids)), ",".join(map(str, ds_ids)), created_by)
                row = cursor.fetchone()
                conn.commit()
                return {"success": True, "message": row.Message if row else "Settings saved."}
        except pyodbc.Error as e:
            return {"success": False, "error": str(e).split('](')[-1].split(') (SQLProce')[0]}

    async def update_app_settings_db(self, app_id: int, req: Dict[str, Any]) -> Dict[str, Any]:
        """Executes spUpdateApplicationSettings with the correct @MonthlyCredits parameter."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC spUpdateApplicationSettings @AppId=?, @LanguageIds=?, @ModelIds=?, @DataSourceIds=?, @ModifiedBy=?, @MonthlyCredits=?, @TokensPerCredit=?, @ChatHistoryInDays=?, @ConfidentialScore=?", # Corrected from @FreeCredits
                    app_id, ",".join(map(str, req['language_ids'])) if req.get('language_ids') is not None else None,
                    ",".join(map(str, req['model_ids'])) if req.get('model_ids') is not None else None,
                    ",".join(map(str, req['data_source_ids'])) if req.get('data_source_ids') is not None else None,
                    req['modified_by'], req.get('monthlyCredits'), req.get('tokensPerCredit'), # Corrected from freeCredits
                    req.get('chatHistoryInDays'), req.get('xScore')
                )
                row = cursor.fetchone()
                conn.commit()
                return {"success": True, "message": row.Message if row else "Settings updated."}
        except pyodbc.Error as e:
            return {"success": False, "error": str(e).split('](')[-1].split(') (SQLProce')[0]}

    async def get_languages_db(self) -> Dict[str, Any]:
        """Gets all languages from the catalog using spGetLanguages."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC dbo.spGetLanguages")
                
                languages = []
                for row in cursor.fetchall():
                    languages.append({
                        "language_id": row.LanguageID,
                        "language_name": row.LanguageName,
                        "language_code": row.LanguageCode
                    })
                
                return {
                    "success": True,
                    "languages": languages,
                    "total_languages": len(languages)
                }
        except Exception as e:
            logger.error(f"Error getting languages: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to retrieve languages: {str(e)}",
                "languages": [],
                "total_languages": 0
            }

    async def get_data_sources_db(self) -> Dict[str, Any]:
        """
        Gets all data sources from the catalog using spGetAllDataSources.
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Executing the Stored Procedure instead of raw SQL
                cursor.execute("EXEC dbo.spGetAllDataSources")
                
                data_sources = []
                for row in cursor.fetchall():
                    data_sources.append({
                        "data_source_id": row.DataSourceId,
                        "data_source_name": row.DataSourceName,
                        "data_source_type": row.DataSourceType,
                        "isActive": row.IsActive,
                        "appId": row.AppId,
                        "applicationName": row.ApplicationName or "N/A",
                        "tenant_id": str(row.TenantId) if row.TenantId else None,
                        "tenantName": row.TenantName or "N/A"
                    })
                
                return {
                    "success": True,
                    "data_sources": data_sources,
                }
        except pyodbc.Error as e:
            logger.error(f"SQL Error in spGetAllDataSources: {str(e)}")
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            return {"success": False, "error": f"Database query failed: {error_message}", "data_sources": []}
        except Exception as e:
            logger.error(f"Generic Error getting data sources: {str(e)}")
            return {
                "success": False,
                "error": f"An unexpected error occurred: {str(e)}",
                "data_sources": [],
            }

    async def get_models_db(self) -> Dict[str, Any]:
        """Gets all models from the catalog using spGetModels."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC dbo.spGetModels")
                
                models = []
                for row in cursor.fetchall():
                    models.append({
                        # THE FIX: Use the alias from the Stored Procedure
                        "model_id": row.DefaultModelID,
                        "model_name": row.ModelName
                    })
                
                return {
                    "success": True,
                    "models": models,
                    "total_models": len(models)
                }
        except Exception as e:
            logger.error(f"Error getting models: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to retrieve models: {str(e)}",
                "models": [],
                "total_models": 0
            }
        
    async def get_languages_by_app_id_db(self, app_id: int) -> Dict[str, Any]:
        """Gets all active languages for a specific application using spGetLanguagesByAppId."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC dbo.spGetLanguagesByAppId @AppId = ?", (app_id,))
                
                languages = []
                for row in cursor.fetchall():
                    languages.append({
                        "language_id": row.LanguageID,
                        "language_name": row.LanguageName,
                    })
                
                return {
                    "success": True,
                    "languages": languages
                }
        except Exception as e:
            logger.error(f"Error getting languages for app_id {app_id}: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to retrieve languages for app {app_id}: {str(e)}",
                "languages": []
            }
    
        
    async def get_models_by_app_id_db(self, app_id: int) -> Dict[str, Any]:
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC dbo.spGetModelsByAppId @AppId = ?", (app_id,))
                
                models = []
                for row in cursor.fetchall():
                    models.append({
                        "model_id": row.ModuleID,
                        "model_name": row.ModuleName
                    })
                
                return {
                    "success": True,
                    "models": models
                }
        except Exception as e:
            logger.error(f"Error getting models for app_id {app_id}: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to retrieve models for app {app_id}: {str(e)}",
                "models": []
            }
        

    async def get_apps_for_tenant_db(self, tenant_id: str) -> Dict[str, Any]:
        """Executes spGetApplicationsAndDataSourcesByTenant."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetApplicationsAndDataSourcesByTenant @TenantId=?", tenant_id)
                rows = cursor.fetchall()
                return {"success": True, "data": rows}
        except pyodbc.Error as e:
            return {"success": False, "error": str(e), "data": []}
        

    async def get_features_db(self) -> Dict[str, Any]:
        """
        Executes the spGetFeatures stored procedure and returns all active features.
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC dbo.spGetFeatures")
                
                # Get column names from the cursor description
                columns = [column[0] for column in cursor.description]
                
                # Fetch all rows and create a list of dictionaries
                features_list = [dict(zip(columns, row)) for row in cursor.fetchall()]
                
                return {
                    "success": True,
                    "features": features_list
                }
        except Exception as e:
            logger.error(f"Error getting features from DB: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to retrieve features: {str(e)}",
                "features": []
            }
        

    async def upsert_application_db(self, app_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes the spUpsertApplication stored procedure to create or update an application.
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # <-- STEP 2: CONVERT THE STRING TO A UUID OBJECT -->
                tenant_id_uuid = uuid.UUID(app_data['tenant_id'])

                cursor.execute(
                    "EXEC dbo.spUpsertApplication @AppId=?, @TenantId=?, @ApplicationName=?, @IsActive=?, @ExecutingUser=?",
                    app_data['app_id'],
                    tenant_id_uuid,  # <-- USE THE CONVERTED UUID OBJECT HERE
                    app_data['application_name'],
                    app_data['is_active'],
                    app_data['executing_user']
                )
                conn.commit()
                
                message = "Application updated successfully." if app_data['app_id'] > 0 else "Application created successfully."
                
                return {
                    "success": True,
                    "message": message
                }
        except pyodbc.Error as e:
            logger.error(f"Error upserting application: {str(e)}")
            return {"success": False, "error": str(e).split('](')[-1].split(') (SQLProce')[0]}
        except Exception as e:
            logger.error(f"An unexpected error occurred while upserting application: {str(e)}")
            return {"success": False, "error": "An unexpected server error occurred."}
        

    async def delete_application_db(self, app_id: int, executing_user: str) -> Dict[str, Any]:
        """
        Executes the spDeleteApplication stored procedure to soft-delete an application.
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC dbo.spSoftDeleteApplication @AppId=?, @ExecutingUser=?",
                    app_id,
                    executing_user
                )
                conn.commit()
                
                return {
                    "success": True,
                    "message": "Application deleted successfully."
                }
        except pyodbc.Error as e:
            logger.error(f"Error deleting application {app_id}: {str(e)}")
            # Parse the clean error message from RAISERROR
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            if '[Microsoft][ODBC Driver 17 for SQL Server][SQL Server]' in error_message:
                error_message = error_message.split('[Microsoft][ODBC Driver 17 for SQL Server][SQL Server]')[1].strip()
            return {"success": False, "error": error_message}
        except Exception as e:
            logger.error(f"An unexpected error occurred while deleting application {app_id}: {str(e)}")
            return {"success": False, "error": "An unexpected server error occurred."}
        
    async def upsert_data_source_db(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes spUpsertDataSource using the data provided in the request body.
        Handles nested configurations by passing them as JSON.
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
 
                # Serialize the configurations list to a JSON string
                # The keys in the dictionary will match the '$.key' paths in the SP OPENJSON
                configs_json = json.dumps(data.get('configurations', [])) if data.get('configurations') else None

                # Call the stored procedure
                cursor.execute(
                    """
                    EXEC dbo.spUpsertDataSource 
                    @DataSourceId=?, 
                    @AppId=?, 
                    @DataSourceName=?, 
                    @DataSourceType=?, 
                    @IsActive=?, 
                    @ExecutingUser=?,
                    @ConfigurationsJson=?
                    """,
                    data['data_source_id'],
                    data['app_id'],
                    data['data_source_name'],
                    data['data_source_type'],
                    data['is_active'],
                    data['executing_user'],
                    configs_json 
                )
                
                # Fetch the returned DataSourceId (optional, but good practice)
                row = cursor.fetchone()
                new_id = row.DataSourceId if row else data['data_source_id']
                
                conn.commit()
 
                message = "Data source updated successfully." if data['data_source_id'] > 0 else "Data source created successfully."
                return {"success": True, "message": message, "data_source_id": new_id}
 
        except pyodbc.Error as e:
            logger.error(f"Database error upserting data source: {str(e)}")
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            if "UQ_DataSourceName_Per_App" in error_message:
                return {"success": False, "error": "A data source with this name already exists for this application."}
            return {"success": False, "error": error_message}
        except Exception as e:
            logger.error(f"An unexpected error occurred while upserting data source: {e}", exc_info=True)
            return {"success": False, "error": "An unexpected server error occurred."}
       
    async def delete_data_source_db(self, app_id: int, data_source_id: int) -> Dict[str, Any]:
        """
        Executes the spDeleteDataSource stored procedure.
 
        Args:
            app_id: The ID of the application the data source belongs to.
            data_source_id: The ID of the data source to delete.
 
        Returns:
            A dictionary with the result of the operation.
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                # Execute the stored procedure with the required parameters
                cursor.execute("EXEC dbo.spDeleteDataSource @DataSourceId=?, @AppId=?", data_source_id, app_id)
                conn.commit()
                return {"success": True, "message": "Data source deleted successfully."}
        except pyodbc.Error as e:
            # Catch the error raised by the stored procedure if the record is not found
            logger.error(f"Database error deleting data source {data_source_id} for app {app_id}: {str(e)}")
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            return {"success": False, "error": error_message}
        except Exception as e:
            logger.error(f"An unexpected error occurred while deleting data source {data_source_id}: {e}", exc_info=True)
            return {"success": False, "error": "An unexpected server error occurred."}
        

    async def get_data_source_types_db(self) -> Dict[str, Any]:
        """Gets all data source types (Web, Content, DB) from DataSourceDataType table."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC dbo.spGetDataSourceTypes")
                
                data_types = []
                for row in cursor.fetchall():
                    data_types.append({
                        "data_type_id": row.DataTypeId,
                        "data_type_name": row.DataTypeName
                    })
                
                return {
                    "success": True,
                    "data_types": data_types
                }
        except Exception as e:
            logger.error(f"Error getting data source types: {str(e)}")
            return {"success": False, "error": f"Failed to retrieve data types: {str(e)}"}
        



        

    