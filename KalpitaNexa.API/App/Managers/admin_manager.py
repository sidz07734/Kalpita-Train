# app/Managers/admin_manager.py
"""
This manager handles all direct database interactions for administrator-level
tasks, such as managing tenant admins and updating user assignments.
"""
import logging
import hashlib
import secrets
import string
from typing import Dict, List, Any
import pyodbc
from .. import config

logger = logging.getLogger(__name__)

class AdminManager:
    """Manages data access for administrator operations."""

    def _get_connection(self):
        try:
            return config.get_sql_connection()
        except Exception as e:
            logger.error(f"FATAL: Could not establish database connection: {e}", exc_info=True)
            raise

    # --- Password Utility Methods ---
    def _generate_secure_password(self, length: int = 12) -> str:
        chars = string.ascii_letters + string.digits
        return ''.join(secrets.choice(chars) for _ in range(length))

    def _hash_password(self, password: str) -> str:
        return hashlib.sha256(password.encode('utf-8')).hexdigest().upper()

    # --- Core DB Methods ---
    async def update_user_assignments_db(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Executes spUpdateUserAndAssignments."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                roles_csv = ','.join(role.strip() for role in request_data['role_names'] if role.strip())
                cursor.execute(
                    "EXEC spUpdateUserAndAssignments @ExecutingUserEmail=?, @TenantId=?, @UserIdToUpdate=?, @NewUserName=?, @NewUserEmail=?, @NewAppId=?, @RoleNames=?, @NewLanguageId=?, @NewModelId=?",
                    request_data['executing_user_email'], request_data['tenant_id'], request_data['user_id_to_update'],
                    request_data['new_user_name'], request_data['new_user_email'], request_data['app_id'],
                    roles_csv, request_data.get('language_id'), request_data.get('model_id')
                )
                row = cursor.fetchone()
                conn.commit()
                return {"success": True, "message": row[0] if row else "User updated."}
        except pyodbc.Error as e:
            return {"success": False, "error": str(e).split('](')[-1].split(') (SQLProce')[0]}

    async def get_tenant_admins_db(self, tenant_id: str) -> Dict[str, Any]:
        """Executes spGetTenantAdmins to fetch all admins for a tenant."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetTenantAdmins @TenantId=?", tenant_id)
                admins_raw = [dict(zip([c[0] for c in cursor.description], row)) for row in cursor.fetchall()]
                return {"success": True, "admins": admins_raw}
        except pyodbc.Error as e:
            return {"success": False, "error": str(e), "admins": []}

    async def create_tenant_admin_db(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Executes spCreateTenantAdmin."""
        try:
            plain_password = self._generate_secure_password()
            password_hash = self._hash_password(plain_password)
            feature_ids_csv = ",".join(map(str, request_data.get('feature_ids', [])))

            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Updated SQL: Wrap EXEC in T-SQL to handle OUTPUT parameters and SELECT results
                sql = """
                DECLARE @UserId UNIQUEIDENTIFIER;
                DECLARE @GeneratedPassword NVARCHAR(50) = ?;
                
                EXEC spCreateTenantAdmin 
                    @UserId = @UserId OUTPUT,
                    @UserName = ?,
                    @UserEmail = ?,
                    @PasswordHash = ?,
                    @TenantId = ?,
                    @RoleId = ?,
                    @FeatureIds = ?,
                    @CreatedBy = ?,
                    @GeneratedPassword = @GeneratedPassword OUTPUT;
                
                SELECT @UserId AS UserId, @GeneratedPassword AS GeneratedPassword;
                """
                
                # Execute with placeholders matching the DECLARE and EXEC params
                cursor.execute(sql,
                            plain_password,      # Initial value for @GeneratedPassword (echoed back)
                            request_data['user_name'],
                            request_data['user_email'],
                            password_hash,
                            request_data['tenant_id'],
                            request_data['role_id'],
                            feature_ids_csv,
                            request_data['created_by'])
                
                row = cursor.fetchone()
                conn.commit()
                
                # Check for success (similar to original, but now using SELECTed UserId)
                if not row or not row.UserId:
                    return {"success": False, "error": "Admin creation failed in database."}
                
                # Return with generated_password (from SELECT or plain – use SELECT if SP modifies it)
                return {
                    "success": True,
                    "user_id": str(row.UserId),
                    "generated_password": row.GeneratedPassword if row.GeneratedPassword else plain_password,
                    "assigned_features": request_data.get('feature_ids', [])  # Added for completeness
                }
                
        except pyodbc.Error as e:
            return {"success": False, "error": str(e).split('](')[-1].split(') (SQLProce')[0]}

    async def update_tenant_admin_db(self, user_id: str, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Executes spUpdateTenantAdmin."""
        try:
            feature_ids_csv = ",".join(map(str, request_data.get('feature_ids', [])))
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC spUpdateTenantAdmin @UserId=?, @UserName=?, @UserEmail=?, @TenantId=?, @RoleId=?, @FeatureIds=?, @ModifiedBy=?",
                    user_id, request_data['user_name'], request_data['user_email'], request_data['tenant_id'],
                    request_data['role_id'], feature_ids_csv, request_data['modified_by']
                )
                conn.commit()
            return {"success": True, "message": "Admin updated successfully."}
        except pyodbc.Error as e:
            return {"success": False, "error": str(e).split('](')[-1].split(') (SQLProce')[0]}

    async def delete_tenant_admin_db(self, user_id: str, tenant_id: str, modified_by: str) -> Dict[str, Any]:
        """Executes spDeleteTenantAdmin."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spDeleteTenantAdmin @UserId=?, @TenantId=?, @ModifiedBy=?", user_id, tenant_id, modified_by)
                conn.commit()
            return {"success": True, "message": "Admin deactivated successfully."}
        except pyodbc.Error as e:
            return {"success": False, "error": str(e).split('](')[-1].split(') (SQLProce')[0]}

    async def reset_admin_password_db(self, user_email: str, modified_by: str) -> Dict[str, Any]:
        """Resets a user's password and returns the new plain-text password."""
        try:
            plain_password = self._generate_secure_password()
            password_hash = self._hash_password(plain_password)
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("UPDATE Users SET PasswordHash=?, ModifiedOn=GETUTCDATE(), ModifiedBy=? WHERE UserEmail=? AND IsActive=1",
                               (password_hash, modified_by, user_email))
                if cursor.rowcount == 0:
                    return {"success": False, "error": "User not found or is inactive."}
                conn.commit()
            return {"success": True, "message": "Password reset successfully.", "generated_password": plain_password}
        except pyodbc.Error as e:
            return {"success": False, "error": str(e)}

    async def get_tenant_admin_details_db(self, admin_id: str, tenant_id: str) -> Dict[str, Any]:
        """Executes spGetTenantAdminDetails."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetTenantAdminDetails @AdminId=?, @TenantId=?", admin_id, tenant_id)
                row = cursor.fetchone()
                if not row:
                    return {"success": False, "error": "Admin not found."}
                details = dict(zip([c[0] for c in cursor.description], row))
                return {"success": True, "admin_details": details}
        except pyodbc.Error as e:
            return {"success": False, "error": str(e)}