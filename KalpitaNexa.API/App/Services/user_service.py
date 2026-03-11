# app/services/user_service.py
import logging
from typing import Dict, Any, List, Optional
import uuid

from ..Managers.user_manager import UserManager
from ..Utils.email_service import EmailService

logger = logging.getLogger(__name__)

class UserService:
    def __init__(self, user_manager: UserManager, email_service: EmailService):
        self.user_manager = user_manager
        self.email_service = email_service

    async def create_user(self, executing_user_email: str, tenant_id: str, new_user_name: str, new_user_email: str, app_name: str, role_names: List[str]) -> Dict[str, Any]:
        """
        Orchestrates user creation. It first attempts to create the user.
        If the database indicates the user is inactive, it returns a special status.
        Otherwise, it proceeds with sending a welcome email for new users.
        """
        # First, call with allow_reactivation=False to check the user's status
        db_result = await self.user_manager.create_user_and_assign(
            executing_user_email, tenant_id, new_user_name, new_user_email, app_name, role_names, allow_reactivation=False
        )

        # If the manager detected an inactive user, pass this status up to the controller
        if db_result.get("status") == "USER_INACTIVE":
            return db_result

        if not db_result.get("success"):
            return db_result

        user_data = db_result.get("user_data", {})
        temp_password = user_data.get("TemporaryPassword")
        message = db_result.get("message", "User processed successfully.")

        if not temp_password:
            logger.info(f"User {new_user_email} already existed and was assigned. No welcome email sent.")
            return {"success": True, "message": message, "UserId": user_data.get("UserId")}

        email_sent = await self.email_service.send_welcome_email(
            recipient_email=new_user_email, user_name=new_user_name, temp_password=temp_password
        )
        if not email_sent:
            logger.warning(f"User created, but failed to send welcome email to {new_user_email}.")
            return {"success": True, "message": "User created, but the welcome email could not be sent.", "UserId": user_data.get("UserId")}

        return {"success": True, "message": message, "UserId": user_data.get("UserId")}

    async def reactivate_user(self, executing_user_email: str, tenant_id: str, new_user_name: str, new_user_email: str, app_name: str, role_names: List[str]) -> Dict[str, Any]:
        """
        Handles the final step of reactivating a user after admin confirmation by setting allow_reactivation=True.
        """
        logger.info(f"Service: Attempting to reactivate user: {new_user_email}")
        return await self.user_manager.create_user_and_assign(
            executing_user_email, tenant_id, new_user_name, new_user_email, app_name, role_names, allow_reactivation=True
        )
    
     # --- START OF INTEGRATION ---
    async def reactivate_user(self, executing_user_email: str, tenant_id: str, new_user_name: str, new_user_email: str, app_name: str, role_names: List[str]) -> Dict[str, Any]:
        """Handles the final step of reactivating a user after admin confirmation."""
        logger.info(f"Attempting to reactivate user: {new_user_email}")
        result = await self.user_manager.reactivate_user(
            executing_user_email, tenant_id, new_user_name, new_user_email, app_name, role_names
        )
        # On successful reactivation, no email is sent. Just return success.
        return result

    async def cleanup_user_history(self, user_id: str, app_id: int) -> Dict[str, Any]:
        """Handles the business logic for cleaning up a user's chat history."""
        logger.info(f"Service: Initiating chat history cleanup for UserId: {user_id}, AppId: {app_id}")
        return await self.user_manager.cleanup_user_history(user_id, app_id)
    # --- END OF INTEGRATION ---

    async def update_user(self, executing_user_email: str, tenant_id: str, user_id_to_update: str, new_user_name: str, new_user_email: str, new_role_name: str) -> Dict[str, Any]:
        """Updates a user's basic information."""
        return await self.user_manager.update_user(
            executing_user_email, tenant_id, user_id_to_update, new_user_name, new_user_email, new_role_name
        )

    async def soft_delete_user(self, executing_user_email: str, tenant_id: str, user_id_to_delete: str) -> Dict[str, Any]:
        """Deactivates a user in the database."""
        return await self.user_manager.soft_delete_user(executing_user_email, tenant_id, user_id_to_delete)

    async def get_tenant_users(self, tenant_id: str, app_id: int) -> Dict[str, Any]:
        """Gets all users for a specific tenant and application."""
        return await self.user_manager.get_tenant_users(tenant_id, app_id)

    async def update_user_assignments(self, executing_user_email: str, tenant_id: str, user_id_to_update: str, new_user_name: str, new_user_email: str, app_name: str, role_names: List[str], language_name: Optional[str], model_name: Optional[str]) -> Dict[str, Any]:
        """Updates a user's full profile, roles, and default settings."""
        return await self.user_manager.update_user_assignments(
            executing_user_email, tenant_id, user_id_to_update, new_user_name, new_user_email, app_name, role_names, language_name, model_name
        )

    async def update_self_profile(self, executing_user_email: str, new_user_name: str, new_user_email: str, language_names: List[str], model_names: List[str]) -> Dict[str, Any]:
        """Allows a user to update their own profile information."""
        return await self.user_manager.update_self_profile(
            executing_user_email, new_user_name, new_user_email, language_names, model_names
        )

    async def get_user_profile(self, email: str) -> Dict[str, Any]:
        """Fetches a user's complete profile, including permissions."""
        return await self.user_manager.get_user_profile_by_email(email)

    async def get_user_tenants(self, user_email: str) -> Dict[str, Any]:
        """Fetches all tenants associated with a user."""
        return await self.user_manager.get_user_tenants(user_email)
        
    async def get_user_details_by_email(self, email: str) -> Dict[str, Any]:
        """Gets basic user details (ID, TenantID) by email."""
        return await self.user_manager.get_user_details_by_email(email)

    async def get_user_permissions(self, user_email: str, app_id: int,tenant_id: str) -> Dict[str, Any]:
        """Gets all permissions and preferences for a user in an app."""
        return await self.user_manager.get_user_permissions(user_email, app_id,tenant_id)

    async def get_user_defaults(self, user_id: str,TenantId:str) -> Dict[str, Any]:
        """Gets a user's default settings."""
        # Add input validation at the service layer
        try:
            uuid.UUID(user_id)
            uuid.UUID(TenantId)
        except ValueError:
            logger.warning(f"Invalid user ID format for get_user_defaults: {user_id}")
            raise ValueError("Invalid user ID format. Must be a valid GUID.")
        return await self.user_manager.get_user_defaults(user_id,TenantId)


    async def get_user_credits(
        self,
        executing_user_email: str,
        date_filter: str = 'all',
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Forwards request to manager with all filtering params."""
        try:
            return await self.user_manager.get_user_credits(
                executing_user_email=executing_user_email,
                date_filter=date_filter,
                start_date=start_date,
                end_date=end_date
            )
        except Exception as e:
            logger.error(f"UserService.get_user_credits error: {str(e)}")
            return {
                "success": False,
                "error": f"Service error: {str(e)}",
                "credits": []
            }

    # --- NEW METHOD WRAPPER ---
    async def get_user_permissions_for_integrated_app(self, user_role: str, app_id: int, tenant_id: str) -> Dict[str, Any]:
        """Gets all permissions for a user in an integrated app context."""
        return await self.user_manager.get_user_permissions_for_integrated_app(user_role, app_id, tenant_id)