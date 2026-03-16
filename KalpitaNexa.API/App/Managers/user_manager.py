# app/managers/user_manager.py
import datetime
import logging
import pyodbc
from typing import Dict, Any, List, Optional
import re
from .. import config

logger = logging.getLogger(__name__)

class UserManager:
    def _get_connection(self):
        return config.get_sql_connection()

    def _execute_sp_for_single_row(self, sp_name: str, params: tuple) -> Dict[str, Any]:
        """Helper to execute a stored procedure that returns a single row with a status message."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(f"EXEC {sp_name}", params)
                row = cursor.fetchone()
                conn.commit()
                if row and hasattr(row, 'Success') and row.Success:
                    message = getattr(row, 'Message', "Operation successful.")
                    return {"success": True, "message": message}
                else:
                    error_message = getattr(row, 'Message', "Operation failed.")
                    return {"success": False, "error": error_message}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Database error in {sp_name}: {error_message}")
            return {"success": False, "error": error_message}
        except Exception as e:
            logger.error(f"Generic error in {sp_name}: {e}", exc_info=True)
            return {"success": False, "error": "An unexpected server error occurred."}

    async def create_user_and_assign(self, executing_user_email: str, tenant_id: str, new_user_name: str, new_user_email: str, app_name: str, role_names: List[str], allow_reactivation: bool) -> Dict[str, Any]:
        """Executes spCreateUserAndAssignToTenant, now with reactivation logic."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                roles_csv = ','.join(role.strip() for role in role_names if role.strip())
                
                cursor.execute(
                    "EXEC spCreateUserAndAssignToTenant @ExecutingUserEmail=?, @TenantId=?, @NewUserName=?, @NewUserEmail=?, @AppName=?, @RoleNames=?, @AllowReactivation=?",
                    (executing_user_email, tenant_id, new_user_name, new_user_email, app_name, roles_csv, allow_reactivation)
                )
                row = cursor.fetchone()
                conn.commit()

                if hasattr(row, 'Status') and row.Status == 'USER_INACTIVE':
                    logger.warning(f"Attempted to create an existing inactive user: {new_user_email}")
                    return {
                        "success": False,
                        "status": "USER_INACTIVE",
                        "error": row.Message,
                        "userId": str(row.UserId)
                    }
                
                if row and row.UserId:
                    return {"success": True, "message": row.Message, "user_data": {"UserId": str(row.UserId), "TemporaryPassword": row.TemporaryPassword}}
                else:
                    return {"success": False, "error": getattr(row, 'Message', "Stored procedure did not return expected user data.")}

        except pyodbc.Error as e:
            # --- UPDATED ERROR HANDLING ---
            error_message = self._clean_sql_error(e)
            logger.error(f"Create user DB error: {error_message}")
            return {"success": False, "error": error_message}

    # --- START OF INTEGRATION ---
    async def reactivate_user(self, executing_user_email: str, tenant_id: str, new_user_name: str, new_user_email: str, app_name: str, role_names: List[str]) -> Dict[str, Any]:
        """Executes spCreateUserAndAssignToTenant with the reactivation flag enabled."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                roles_csv = ','.join(role.strip() for role in role_names if role.strip())
                # Set AllowReactivation to 1 to permit reactivating the user
                cursor.execute(
                    "EXEC spCreateUserAndAssignToTenant @ExecutingUserEmail=?, @TenantId=?, @NewUserName=?, @NewUserEmail=?, @AppName=?, @RoleNames=?, @AllowReactivation=1",
                    (executing_user_email, tenant_id, new_user_name, new_user_email, app_name, roles_csv)
                )
                row = cursor.fetchone()
                conn.commit()
                if row and row.UserId:
                    return {"success": True, "message": row.Message, "UserId": str(row.UserId)}
                else:
                    return {"success": False, "error": getattr(row, 'Message', "Failed to reactivate user.")}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Reactivate user DB error: {error_message}")
            return {"success": False, "error": error_message}

    async def cleanup_user_history(self, user_id: str, app_id: int) -> Dict[str, Any]:
        """Executes the spDeleteUserChatHistoryForApp stored procedure."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC dbo.spDeleteUserChatHistoryForApp @UserId = ?, @AppId = ?",
                    (user_id, app_id)
                )
                result_row = cursor.fetchone()
                conn.commit()
            if result_row and result_row.Success == 1:
                return {"success": True, "message": result_row.Message}
            elif result_row:
                # SP ran but did nothing (e.g., no old chats found)
                return {"success": True, "message": result_row.Message}
            else:
                return {"success": False, "error": "Stored procedure did not return a valid response."}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Database error during chat history cleanup: {error_message}")
            return {"success": False, "error": error_message}
    # --- END OF INTEGRATION ---    

    async def update_user(self, executing_user_email: str, tenant_id: str, user_id_to_update: str, new_user_name: str, new_user_email: str, new_role_name: str) -> Dict[str, Any]:
        """Executes the spUpdateUser stored procedure."""
        return self._execute_sp_for_single_row(
            "spUpdateUser @ExecutingUserEmail=?, @TenantId=?, @UserIdToUpdate=?, @NewUserName=?, @NewUserEmail=?, @NewRoleName=?",
            (executing_user_email, tenant_id, user_id_to_update, new_user_name, new_user_email, new_role_name)
        )

    async def soft_delete_user(self, executing_user_email: str, tenant_id: str, user_id_to_delete: str) -> Dict[str, Any]:
        """Executes the spSoftDeleteUser stored procedure."""
        return self._execute_sp_for_single_row(
            "spSoftDeleteUser @ExecutingUserEmail=?, @TenantId=?, @UserIdToDelete=?",
            (executing_user_email, tenant_id, user_id_to_delete)
        )

    async def get_tenant_users(self, tenant_id: str, app_id: int) -> Dict[str, Any]:
        """Executes spGetUsersByTenant to get all users for a tenant and app."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetUsersByTenant @TenantId = ?, @AppId = ?", (tenant_id, app_id))
                columns = [column[0] for column in cursor.description]
                users = [dict(zip(columns, row)) for row in cursor.fetchall()]
                return {"success": True, "users": users}
        except Exception as e:
            logger.error(f"Get tenant users DB error for tenant {tenant_id}: {e}", exc_info=True)
            return {"success": False, "error": "Database error fetching tenant users.", "users": []}

    async def update_user_assignments(self, executing_user_email: str, tenant_id: str, user_id_to_update: str, new_user_name: str, new_user_email: str, app_name: str, role_names: List[str], language_name: Optional[str], model_name: Optional[str]) -> Dict[str, Any]:
        """Executes spUpdateUserAndAssignments."""
        roles_csv = ','.join(role.strip() for role in role_names if role.strip())
        return self._execute_sp_for_single_row(
            "spUpdateUserAndAssignments @ExecutingUserEmail=?, @TenantId=?, @UserIdToUpdate=?, @NewUserName=?, @NewUserEmail=?, @NewAppName=?, @RoleNames=?, @NewLanguageName=?, @NewModelName=?",
            (executing_user_email, tenant_id, user_id_to_update, new_user_name, new_user_email, app_name, roles_csv, language_name, model_name)
        )

    async def update_self_profile(self, executing_user_email: str, new_user_name: str, new_user_email: str, language_names: List[str], model_names: List[str]) -> Dict[str, Any]:
        """Executes spUserUpdateSelfProfile."""
        languages_csv = ','.join(name.strip() for name in language_names if name.strip())
        models_csv = ','.join(name.strip() for name in model_names if name.strip())
        # This SP uses a TVP in the original code, but we adapted it to use CSV.
        # Assuming the SP `spUserUpdateSelfProfile` was also changed to accept CSVs.
        return self._execute_sp_for_single_row(
            "spUserUpdateSelfProfile @ExecutingUserEmail=?, @NewUserName=?, @NewUserEmail=?, @LanguageNames=?, @ModelNames=?",
            (executing_user_email, new_user_name, new_user_email, languages_csv, models_csv)
        )
    
    async def get_user_profile_by_email(self, email: str) -> Dict[str, Any]:
        """Executes spGetUserProfile to get a user's full profile."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetUserProfile @UserEmail = ?", email)
                user_info = cursor.fetchone()
                if not user_info:
                    return {"success": False, "error": "User not found."}
                
                profile = {
    "userId": str(user_info.UserId),
    "userName": user_info.UserName,
    "userEmail": user_info.UserEmail,
    "isSuperAdmin": user_info.IsSuperAdmin,
    "CreatedOn": user_info.CreatedOn.isoformat() if user_info.CreatedOn else None,
    "CreatedBy": user_info.CreatedBy,
}

                
                cursor.nextset()
                profile["roles"] = [row.RoleName for row in cursor.fetchall()]
                cursor.nextset()
                profile["languages"] = [{"language_id": row.LanguageID, "language_name": row.LanguageName} for row in cursor.fetchall()]
                cursor.nextset()
                profile["models"] = [{"model_id": row.ModelID, "model_name": row.ModelName} for row in cursor.fetchall()]
                
                return {"success": True, "profile": profile}
        except Exception as e:
            logger.error(f"Get profile DB error for {email}: {e}", exc_info=True)
            return {"success": False, "error": "Database error fetching user profile."}

    async def get_user_tenants(self, user_email: str) -> Dict[str, Any]:
        """Executes spGetUserTenants."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetUserTenants @UserEmail = ?", user_email)
                rows = cursor.fetchall()
                if not rows:
                    return {"success": True, "total_tenants": 0, "tenants": []}
                
                columns = [col[0] for col in cursor.description]
                tenants = [dict(zip(columns, row)) for row in rows]
                total_tenants = tenants[0].pop('TotalTenants', len(tenants))
                
                return {"success": True, "total_tenants": total_tenants, "tenants": tenants}
        except Exception as e:
            logger.error(f"Get tenants DB error for {user_email}: {e}", exc_info=True)
            return {"success": False, "error": "Database error fetching user tenants."}

    async def get_user_details_by_email(self, email: str) -> Dict[str, Any]:
        """Executes spGetUserDetailsByEmail."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetUserDetailsByEmail @UserEmail = ?", email)
                row = cursor.fetchone()
                if row:
                    return {"success": True, "userId": str(row.UserId), "tenantId": str(row.TenantId)}
                return {"success": False, "error": "User details not found."}
        except Exception as e:
            logger.error(f"Get details by email DB error for {email}: {e}", exc_info=True)
            return {"success": False, "error": "Database error fetching user details."}

    async def get_user_permissions(self, user_email: str, app_id: int,tenant_id: str) -> Dict[str, Any]:
        """Executes spGetUserPermissions with grouped applications structure."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetUserPermissions @UserEmail = ?, @AppId = ?,@TenantId = ?", (user_email, app_id,tenant_id))

                # --- GROUP APPLICATIONS & DATA SOURCES ---
                app_dict = {}
                rows = cursor.fetchall()
                for row in rows:
                    key = row.AppId
                    if key not in app_dict:
                        app_dict[key] = {
                            "app_id": row.AppId,
                            "application_name": row.ApplicationName,
                            "data_sources": []
                        }

                    app_dict[key]["data_sources"].append({
                        "data_source_id": row.DataSourceId,
                        "data_source_name": row.DataSourceName,
                        "is_default": row.IsDefault
                    })

                permissions = {}
                permissions["applications"] = list(app_dict.values())

                # --- FEATURES ---
                cursor.nextset()
                permissions["features"] = [row.FeatureName for row in cursor.fetchall()]

                # --- LANGUAGES ---
                cursor.nextset()
                permissions["languages"] = [
                    {"LanguageID": r.LanguageID, "LanguageName": r.LanguageName, "IsDefault": r.IsDefault}
                    for r in cursor.fetchall()
                ]

                # --- MODELS ---
                cursor.nextset()
                permissions["models"] = [
                    {"ModelID": r.ModelID, "ModelName": r.ModelName, "IsDefault": r.IsDefault}
                    for r in cursor.fetchall()
                ]

                # --- PREFERENCES ---
                cursor.nextset()
                prefs_row = cursor.fetchone()
                preferences = dict(zip([c[0] for c in cursor.description], prefs_row)) if prefs_row else {}

                return {
                    "success": True,
                    "permissions": permissions,
                    "preferences": preferences
                }

        except Exception as e:
            logger.error(f"Get permissions DB error for {user_email}: {e}", exc_info=True)
            return {"success": False, "error": "Database error fetching permissions."}

    async def get_user_defaults(self, user_id: str,TenantId:str) -> Dict[str, Any]:
        """Executes spGetUserDefaults."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetUserDefaults @UserId = ?, @TenantId =?",(user_id,TenantId))
                row = cursor.fetchone()
                if not row or all(getattr(row, col) is None for col in ['DefaultAppId', 'DefaultLanguageId', 'DefaultModelId']):
                    return {"success": False, "error": "User not found or has no defaults set."}
               
                defaults = {
                    "default_app_id": row.DefaultAppId, "default_app_name": row.DefaultAppName,
                    "default_language_id": row.DefaultLanguageId, "default_language_name": row.DefaultLanguageName,
                    "default_model_id": row.DefaultModelId, "default_model_name": row.DefaultModelName
                }
                return {"success": True, "defaults": defaults}
        except Exception as e:
            logger.error(f"Get defaults DB error for {user_id}: {e}", exc_info=True)
            return {"success": False, "error": "Database error fetching user defaults."}
        

    async def get_user_credits(
        self,
        executing_user_email: str,
        date_filter: str = 'all',
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Executes spGetUserCreditInfo with full parameter support."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()

                # Convert string dates to datetime
                # Note the double 'datetime'
                start_date_dt = datetime.datetime.strptime(start_date, "%Y-%m-%d") if start_date else None
                end_date_dt = datetime.datetime.strptime(end_date, "%Y-%m-%d") if end_date else None

                # Execute SP with ALL 4 parameters
                cursor.execute("""
                    EXEC dbo.spGetUserCreditInfo 
                        @ExecutingUserEmail = ?, 
                        @DateFilter = ?, 
                        @StartDateCustom = ?, 
                        @EndDateCustom = ?
                """, (
                    executing_user_email,
                    date_filter,
                    start_date_dt,
                    end_date_dt
                ))

                rows = cursor.fetchall()
                columns = [col[0] for col in cursor.description]
                credits = [dict(zip(columns, row)) for row in rows]

                return {"success": True, "credits": credits}

        except Exception as e:
            logger.error(f"UserManager.get_user_credits error: {str(e)}")
            return {"success": False, "error": str(e), "credits": []}
    
    async def authenticate_user(self, email: str, password_hash: str) -> Dict[str, Any]:
        """Executes spGetUserInfoOnAuthentication to verify user credentials."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC spGetUserInfoOnAuthentication @UserEmail=?, @PasswordHash=?",
                    (email, password_hash)
                )
                row = cursor.fetchone()
                if not row:
                    return {"success": False, "error": "Invalid email or password."}

                # Unpack the row into a dictionary for the service layer
                user_data = {
                    "userId": str(row.UserId),
                    "tenantId": str(row.TenantId),
                    "userName": row.UserName,
                    "userEmail": row.UserEmail,
                    "userRole": row.UserRole,
                }
                return {"success": True, "user_data": user_data}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Database error during authentication for {email}: {error_message}")
            return {"success": False, "error": error_message}
        except Exception as e:
            logger.error(f"Generic error during authentication for {email}: {e}", exc_info=True)
            return {"success": False, "error": "An unexpected server error occurred during authentication."}

    async def check_and_refresh_credits(self, user_email: str, app_name: str) -> Dict[str, Any]:
        """
        Executes the spCheckAndRefreshCreditsOnLogin stored procedure.
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC dbo.spCheckAndRefreshCreditsOnLogin @UserEmail = ?, @AppName = ?",
                    (user_email, app_name)
                )
                row = cursor.fetchone()
                # We don't need to return the data, just confirm it ran.
                if row:
                    logger.info(f"Credit refresh check completed for user {user_email} in app {app_name}.")
                    return {"success": True}
                else:
                    logger.warning(f"Credit refresh procedure did not return data for user {user_email} in app {app_name}.")
                    return {"success": False, "error": "Credit refresh procedure returned no data."}
        except pyodbc.Error as db_err:
            error_message = str(db_err).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Database error during credit refresh for {user_email}: {error_message}")
            return {"success": False, "error": error_message}
        except Exception as e:
            logger.error(f"Unexpected error during credit refresh for {user_email}: {str(e)}")
            return {"success": False, "error": "An unexpected server error during credit refresh."}
        
    # --- NEW METHOD: Get Permissions for Integrated App ---
    async def get_user_permissions_for_integrated_app(self, user_role: str, app_id: int, tenant_id: str) -> Dict[str, Any]:
        """Executes spGetUserPermissionsForIntegratedApp and formats response like get_user_permissions."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC spGetUserPermissionsForIntegratedApp @UserRole = ?, @AppId = ?, @TenantId = ?", 
                    (user_role, app_id, tenant_id)
                )

                # --- Result Set 1: APPLICATION & DATA SOURCES ---
                app_dict = {}
                rows = cursor.fetchall()
                for row in rows:
                    key = row.AppId
                    if key not in app_dict:
                        app_dict[key] = {
                            "app_id": row.AppId,
                            "application_name": row.ApplicationName,
                            "data_sources": []
                        }
                    app_dict[key]["data_sources"].append({
                        "data_source_id": row.DataSourceId,
                        "data_source_name": row.DataSourceName,
                        "is_default": row.IsDefault
                    })

                permissions = {}
                permissions["applications"] = list(app_dict.values())

                # --- Result Set 2: FEATURES ---
                if cursor.nextset():
                    permissions["features"] = [row.FeatureName for row in cursor.fetchall()]
                else:
                    permissions["features"] = []

                # --- Result Set 3: LANGUAGES ---
                if cursor.nextset():
                    permissions["languages"] = [
                        {"LanguageID": r.LanguageID, "LanguageName": r.LanguageName, "IsDefault": r.IsDefault}
                        for r in cursor.fetchall()
                    ]
                else:
                    permissions["languages"] = []

                # --- Result Set 4: MODELS ---
                if cursor.nextset():
                    permissions["models"] = [
                        {"ModelID": r.ModelID, "ModelName": r.ModelName, "IsDefault": r.IsDefault}
                        for r in cursor.fetchall()
                    ]
                else:
                    permissions["models"] = []

                # --- Result Set 5: DATA SOURCES (Standalone List) ---
                if cursor.nextset():
                    permissions["data_sources"] = [
                        {"DataSourceID": r.DataSourceID, "DataSourceName": r.DataSourceName, "IsDefault": r.IsDefault}
                        for r in cursor.fetchall()
                    ]
                else:
                    permissions["data_sources"] = []

                # --- NO PREFERENCES IN THIS SP (Returning Empty object) ---
                preferences = {}

                return {
                    "success": True,
                    "permissions": permissions,
                    "preferences": preferences
                }

        except Exception as e:
            logger.error(f"Get integrated permissions DB error: {e}", exc_info=True)
            return {"success": False, "error": "Database error fetching permissions for integrated app."}

    def _clean_sql_error(self, e: Exception) -> str:
        """
        Extracts the clean error message from a pyodbc exception string.
        Target format: ...[SQL Server]User already exists. (50000)...
        """
        raw_msg = str(e)
        # Regex looks for text between '[SQL Server]' and the error code '(50000)'
        match = re.search(r"\[SQL Server\](.*?)\s*\((\d+)\)", raw_msg)
        if match:
            return match.group(1).strip()
        
        # Fallback: Clean up standard ODBC driver artifacts if the specific regex fails
        # Removes ('42000', '[42000] [Microsoft]...
        cleaner = raw_msg.replace("('42000', '", "").replace("')", "")
        return cleaner.split('] (')[0].split('] ')[-1]