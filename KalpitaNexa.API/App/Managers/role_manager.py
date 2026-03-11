# app/Managers/role_manager.py
"""
This manager handles all direct database interactions for creating, updating,
deleting, and retrieving roles and their associated features.
"""
import logging
from typing import Dict, List, Any, Optional
import pyodbc
from .. import config

logger = logging.getLogger(__name__)

class RoleManager:
    """Manages data access for role-related operations."""

    def _get_connection(self):
        """Establishes and returns a new database connection."""
        try:
            return config.get_sql_connection()
        except Exception as e:
            logger.error(f"FATAL: Could not establish database connection: {e}", exc_info=True)
            raise

    async def upsert_role_db(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Executes spUpsertRoleWithFeatures to create or update a role."""
        try:
            # ... (Your existing code for setting up connection and executing SP) ...
            
            feature_ids_csv = ",".join(map(str, request_data.get('feature_ids', [])))
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC dbo.spUpsertRoleWithFeatures @RoleId=?, @RoleName=?, @TenantId=?, @AppId=?, @UserId=?, @FeatureIds=?",
                    (
                        request_data.get('role_id'), 
                        request_data['role_name'],
                        request_data['tenant_id'],
                        request_data['app_id'],
                        request_data['user_id'],
                        feature_ids_csv
                    )
                )
                
                rows = cursor.fetchall()
                conn.commit()

                if not rows:
                    return {"success": False, "error": "Upsert operation failed to return the role details."}

                columns = [column[0] for column in cursor.description]
                processed_data = [dict(zip(columns, row)) for row in rows]

                return {"success": True, "data": processed_data}

        except pyodbc.Error as e:
            error_str = str(e)
            logger.error(f"Database error during role upsert: {error_str}")

            # 1. Check specifically for the duplicate name error from your SQL SP
            if "A role with this name already exists" in error_str:
                return {
                    "success": False, 
                    "error": "A role with this name already exists for this tenant and application."
                }

            # 2. General cleanup for other SQL errors
            # Tries to remove the [SQL Server] technical prefixes
            try:
                # Example: [42000] [Microsoft]...[SQL Server]Incorrect syntax...
                # We take the part after the last ']'
                clean_error = error_str.split(']')[-1]
                # Remove any trailing code in parenthesis like (50000)
                clean_error = clean_error.split('(')[0].strip()
                # Remove quotes
                clean_error = clean_error.replace("'", "").replace('"', "")
            except:
                clean_error = "An unexpected database error occurred."

            return {"success": False, "error": clean_error}

    async def delete_role_db(self, role_id: int, tenant_id: str, app_id: int) -> Dict[str, Any]:
        """Executes spSoftDeleteRoleById to deactivate a role."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC spSoftDeleteRoleById @RoleId=?, @TenantId=?, @AppId=?",
                    (role_id, tenant_id, app_id)
                )
                conn.commit()
            return {"success": True, "message": f"Role {role_id} has been deactivated."}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Database error deleting role {role_id}: {error_message}")
            return {"success": False, "error": error_message}


    async def get_all_roles_db(self) -> Dict[str, Any]:
        """Executes spGetAllRoles to fetch a list of all roles in the system."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetAllRoles")
                roles = [{"role_id": row.RoleId, "role_name": row.RoleName} for row in cursor.fetchall()]
                return {"success": True, "roles": roles}
        except pyodbc.Error as e:
            logger.error(f"Database error getting all roles: {e}")
            return {"success": False, "error": str(e), "roles": []}
        
    async def get_role_features_db(self, tenant_id: str, app_id: int, role_name: str) -> Dict[str, Any]:
        """Executes GetRoleFeatures to fetch features for a specific role."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC dbo.GetRoleFeatures @TenantId = ?, @AppId = ?, @RoleName = ?",
                    (tenant_id, app_id, role_name)
                )
                # The SP returns both FeatureId and FeatureName
                features = [
                    {"feature_id": row.FeatureId, "feature_name": row.FeatureName}
                    for row in cursor.fetchall()
                ]
                return {"success": True, "features": features}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Database error fetching features for role '{role_name}': {error_message}")
            return {"success": False, "error": error_message, "features": []}
