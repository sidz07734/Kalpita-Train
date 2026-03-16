# app/Services/promptmanager_service.py
"""
Contains the business logic for the PromptManager feature. It orchestrates
operations by calling the PromptManagerManager for data access.
"""
import logging
from typing import Dict, Any, Optional
from ..Managers.promptmanager_manager import PromptManagerManager

logger = logging.getLogger(__name__)

class PromptManagerService:
    """Orchestrates chat and prompt-related business logic."""

    def __init__(self, manager: PromptManagerManager):
        self._manager = manager
        logger.info("PromptManagerService initialized.")

    async def insert_message(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handles the business logic for inserting a new message."""
        result = await self._manager.insert_message_db(request_data)
        if result.get("success"):
            result["message"] = "Message stored successfully."
        return result

    async def update_message(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handles the business logic for updating a message."""
        return await self._manager.update_message_db(request_data)

    async def delete_chat(self, chat_id: str, user_id: str) -> Dict[str, Any]:
        """Handles the business logic for deleting a chat."""
        return await self._manager.delete_chat_db(chat_id, user_id)

    async def get_chats(self, filter_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handles the business logic for retrieving chats based on filters.
        This serves all 'get' requests (history, public, favorites, etc.).
        """
        return await self._manager.get_chats_db(filter_data)

    async def search_tags(self, search_term: str, limit: int) -> Dict[str, Any]:
        """Handles the business logic for searching tags."""
        return await self._manager.search_tags_db(search_term, limit)
    
    async def get_user_chat_history(self, user_id: str, tenant_id: str, app_id: Optional[int]) -> Dict[str, Any]:
        """Service logic for retrieving a user's entire chat history."""
        # logger.info(f"Service: Getting all chat history for user {user_id}")
        return await self._manager.get_user_chat_history_db(user_id, tenant_id, app_id)

    async def get_public_chats(self, tenant_id: str, app_id: Optional[int]) -> Dict[str, Any]:
        """Service logic for retrieving all public chats."""
        # logger.info(f"Service: Getting public chats for tenant {tenant_id}")
        return await self._manager.get_public_chats_db(tenant_id, app_id)

    async def get_favorite_chats(self, user_id: str, tenant_id: str, app_id: Optional[int]) -> Dict[str, Any]:
        """Service logic for retrieving a user's favorited chats."""
        # logger.info(f"Service: Getting favorite chats for user {user_id}")
        return await self._manager.get_favorite_chats_db(user_id, tenant_id, app_id)

    async def get_user_tagged_chats(self, user_id: str, tenant_id: str, app_id: Optional[int]) -> Dict[str, Any]:
        """Service logic for retrieving all chats with tags relevant to a user."""
        # logger.info(f"Service: Getting all tagged chats for user {user_id}")
        return await self._manager.get_user_tagged_chats_db(user_id, tenant_id, app_id)
    
    
    # --- Approval Workflow Service Methods ---

    async def request_public_approval(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handles the business logic for a user requesting to make a chat public."""
        return await self._manager.request_public_approval_db(request_data)

    async def process_public_approval(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handles the business logic for an admin processing an approval request."""
        return await self._manager.process_public_approval_db(request_data)

    async def get_pending_approvals(self, tenant_id: str, start_date: str = None, end_date: str = None) -> Dict[str, Any]:
        """Handles the business logic for fetching the pending approval queue."""
        return await self._manager.get_pending_approvals_db(tenant_id, start_date, end_date)