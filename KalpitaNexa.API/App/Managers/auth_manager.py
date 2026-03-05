# app/managers/auth_manager.py
import logging
from typing import Dict, Any
import pyodbc

from .. import config

logger = logging.getLogger(__name__)

class AuthManager:
    def _get_connection(self):
        return config.get_sql_connection()

    async def authenticate_user(self, email: str, password_hash: str) -> Dict[str, Any]:
        """Calls the database to verify a user's email and password hash."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetUserInfoOnAuthentication ?, ?", email, password_hash)
                row = cursor.fetchone()
                if not row:
                    return {"success": False, "error": "Invalid email or password."}
                
                # This response contains user data, but its purpose is authentication success
                user_id, user_name, user_email, user_role,tenant_Id = row

                return {
                    "success": True,
                    "userId": str(user_id),
                    "TenantId": str(tenant_Id),
                    "userName": user_name,
                    "userEmail": user_email,
                    "userRole": user_role
                }
        except Exception as e:
            logger.error(f"Authentication DB error for {email}: {e}", exc_info=True)
            return {"success": False, "error": "Login failed. Please check your credentials."}

    async def get_sso_user_by_email(self, email: str) -> Dict[str, Any]:
        """Fetches user base info specifically for SSO validation."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetUserByEmailForSso @UserEmail = ?", email)
                row = cursor.fetchone()
                if not row:
                    return {"success": False, "error": "User not found or is inactive for SSO."}
                
                return {
                    "success": True, 
                    "userId": str(row.UserId), 
                    "TenantId": str(row.TenantId),
                    "userName": row.UserName, 
                    "userEmail": row.UserEmail, 
                    "userRole": row.UserRoleName
                }
        except Exception as e:
            logger.error(f"SSO user fetch DB error for {email}: {e}", exc_info=True)
            return {"success": False, "error": "Database error during SSO user validation."}

    async def generate_and_store_otp(self, email: str) -> Dict[str, Any]:
        """Calls SP to generate, store, and return an OTP for a user."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGenerateAndStoreOtpForUser ?", email)
                row = cursor.fetchone()
                conn.commit()
                if not row or not row[2]:
                    return {"success": False, "error": row.Message if row else "User not found."}
                return {"success": True, "otp": row[0], "message": row.Message}
        except Exception as e:
            logger.error(f"OTP generation DB error for {email}: {e}", exc_info=True)
            return {"success": False, "error": "Database error during OTP generation."}

    async def verify_otp_and_reset_password(self, email: str, otp: str, new_password_hash: str) -> Dict[str, Any]:
        """Calls SP to verify an OTP and update the user's password."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spVerifyOtpAndResetPassword ?, ?, ?", email, otp, new_password_hash)
                row = cursor.fetchone()
                conn.commit()
                if row and row.Success:
                    return {"success": True, "message": row.Message}
                else:
                    return {"success": False, "error": row.Message if row else "Operation failed."}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Password reset DB error: {error_message}")
            return {"success": False, "error": error_message}

    async def change_user_password(self, email: str, old_password_hash: str, new_password_hash: str) -> Dict[str, Any]:
        """Calls SP for a user to change their own password, verifying the old one."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC spUpdateUserPassword @UserEmail=?, @OldPasswordHash=?, @NewPasswordHash=?, @ModifiedBy=?",
                    (email, old_password_hash, new_password_hash, email)
                )
                row = cursor.fetchone()
                conn.commit()
                if row and row.ResultStatus == 'Success':
                    return {"success": True, "message": row.ResultMessage}
                else:
                    return {"success": False, "error": row.ResultMessage if row else "An unknown error occurred."}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Change password DB error: {error_message}")
            return {"success": False, "error": error_message}