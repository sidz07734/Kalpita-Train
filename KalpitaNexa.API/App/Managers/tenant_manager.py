# app/Managers/tenant_manager.py
"""
This manager is responsible for all direct database interactions for
creating, updating, deleting, and retrieving tenants and their features.
"""
import logging
from typing import Dict, List, Any, Optional
import pyodbc
from .. import config

logger = logging.getLogger(__name__)

class TenantManager:
    """Manages data access for tenant-related operations."""

    def _get_connection(self):
        try:
            return config.get_sql_connection()
        except Exception as e:
            logger.error(f"FATAL: Could not establish database connection: {e}", exc_info=True)
            raise

    async def get_tenants_db(self) -> Dict[str, Any]:
        """Executes spGetTenants to fetch all active tenants."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetTenants")
                tenants = [dict(zip([c[0] for c in cursor.description], row)) for row in cursor.fetchall()]
                return {"success": True, "tenants": tenants}
        except pyodbc.Error as e:
            logger.error(f"Database error getting tenants: {e}")
            return {"success": False, "error": str(e), "tenants": []}

    async def upsert_tenant_db(self, tenant_id: Optional[str], name: str, app_ids: List[int], feature_ids: List[int], user_id: str) -> Dict[str, Any]:
        """Executes spUpsertTenant for creating or updating a tenant."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                app_csv = ",".join(map(str, app_ids))
                feature_csv = ",".join(map(str, feature_ids))
                
                # CHANGED: Updated parameter names to match new SP definition (@ApplicationIds, @FeatureIds)
                cursor.execute(
                    "EXEC spUpsertTenant @TenantId=?, @TenantName=?, @ApplicationIds=?, @FeatureIds=?, @RequestingUserId=?",
                    (tenant_id, name, app_csv, feature_csv, user_id)
                )
                
                row = cursor.fetchone()
                conn.commit()
                
                if row and row.Success:
                    return {"success": True, "message": row.Message, "tenant_id": str(row.TenantId)}
                else:
                    error_msg = row.Message if row else "Upsert operation failed in the database."
                    return {"success": False, "error": error_msg}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            return {"success": False, "error": error_message}


    async def delete_tenant_db(self, tenant_id: str, user_id: str) -> Dict[str, Any]:
        """Executes spDeleteTenant."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spDeleteTenant @TenantId=?, @RequestingUserId=?", (tenant_id, user_id))
                row = cursor.fetchone()
                conn.commit()
                if row and row.Success:
                    return {"success": True, "message": row.Message}
                else:
                    return {"success": False, "error": row.Message if row else "Deletion failed."}
        except pyodbc.Error as e:
            return {"success": False, "error": str(e).split('](')[-1].split(') (SQLProce')[0]}

    async def get_tenant_by_id_db(self, tenant_id: str) -> Dict[str, Any]:
        """Executes spGetTenantDetailsById."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetTenantDetailsById @TenantId=?", (tenant_id,))
                tenant_row = cursor.fetchone()
                if not tenant_row: return {"success": False, "error": "Tenant not found."}
                
                cursor.nextset()
                apps = [{"application_id": row.application_id, "application_name": row.application_name} for row in cursor.fetchall()]
                
                cursor.nextset()
                features = [{"feature_id": row.feature_id, "feature_name": row.feature_name} for row in cursor.fetchall()]
                
                tenant_details = dict(zip([c[0] for c in tenant_row.cursor_description], tenant_row))
                tenant_details["applications"] = apps
                tenant_details["features"] = features
                
                return {"success": True, "tenant": tenant_details}
        except pyodbc.Error as e:
            return {"success": False, "error": str(e)}

    async def get_tenants_with_apps_db(self, user_email: str) -> Dict[str, Any]:
        """Executes spGetTenantsWithApplications."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetTenantsWithApplications @RequestingUserEmail=?", (user_email,))
                tenants = [dict(zip([c[0] for c in cursor.description], row)) for row in cursor.fetchall()]
                return {"success": True, "tenants": tenants}
        except pyodbc.Error as e:
            return {"success": False, "error": str(e), "tenants": []}

    async def get_tenant_features_db(self, tenant_id: str, app_id: int) -> Dict[str, Any]:
        """Executes spGetTenantFeatures."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetTenantFeatures @TenantId=?, @AppId=?", (tenant_id, app_id))
                features = [dict(zip([c[0] for c in cursor.description], row)) for row in cursor.fetchall()]
                return {"success": True, "features": features}
        except pyodbc.Error as e:
            return {"success": False, "error": str(e), "features": []}
        
    async def assign_features_to_tenant_db(self, tenant_id: str, feature_ids: List[int], created_by: str) -> Dict[str, Any]:
        """Executes spCreateTenantFeatures."""
        try:
            feature_ids_csv = ",".join(map(str, feature_ids)) if feature_ids else None
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC spCreateTenantFeatures @TenantId=?, @FeatureIds=?, @CreatedBy=?",
                    (tenant_id, feature_ids_csv, created_by)
                )
                conn.commit()
            return {"success": True, "message": "Tenant features assigned successfully."}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Database error assigning features to tenant {tenant_id}: {error_message}")
            return {"success": False, "error": error_message}
        

    async def get_tenant_app_roles_db(self, tenant_id: str, app_id: int) -> Dict[str, Any]:
        """Executes spGetRolesWithFeaturesByTenant to get roles for a specific context."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetRolesWithFeaturesByTenant @TenantId=?, @AppId=?", (tenant_id, app_id))
                roles = [dict(zip([c[0] for c in cursor.description], row)) for row in cursor.fetchall()]
                return {"success": True, "roles": roles}
        except pyodbc.Error as e:
            logger.error(f"Database error getting tenant/app roles: {e}")
            return {"success": False, "error": str(e), "roles": []}