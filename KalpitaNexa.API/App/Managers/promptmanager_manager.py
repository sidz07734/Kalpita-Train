# app/Managers/promptmanager_manager.py
"""
This manager is responsible for all direct database interactions related to
chat messages and tags. It abstracts away the pyodbc connection and
stored procedure execution details from the service layer.
"""
import logging
import uuid
from typing import Dict, Any, Optional
import pyodbc
from .. import config

logger = logging.getLogger(__name__)

class PromptManagerManager:
    """Manages data access for chat and prompt-related database operations."""

    def _get_connection(self):
        """Establishes and returns a new database connection."""
        try:
            return config.get_sql_connection()
        except Exception as e:
            logger.error(f"FATAL: Could not establish database connection: {e}", exc_info=True)
            raise

    async def insert_message_db(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Executes spInsertMessage to store a new chat record."""
        try:
            message_id = str(uuid.uuid4())
            with self._get_connection() as conn:
                cursor = conn.cursor()
                # ✅ FIX: Added @IsFlagged=? to the SQL string
                cursor.execute("""
                    EXEC spInsertMessage @Id=?, @UserId=?, @TenantId=?, @ClientId=?, @AppId=?, 
                        @UserMessage=?, @AIResponse=?, @PromptTokens=?, @ResponseTokens=?, 
                        @IsFavorited=?, @IsFlagged=?, @Visibility=?, @FileId=?, @CreatedBy=?
                """, (
                    message_id, 
                    request_data['user_id'], 
                    request_data['tenant_id'], 
                    request_data['client_id'],
                    request_data['app_id'], 
                    request_data['user_message'], 
                    request_data['ai_response'],
                    request_data['prompt_tokens'], 
                    request_data['response_tokens'], 
                    request_data['is_favorited'],
                    0,   
                    request_data['visibility'], 
                    request_data.get('file_id'), 
                    request_data.get('system_username', 'system')
                ))
                conn.commit()
            return {"success": True, "message_id": message_id}
        except pyodbc.Error as e:
            logger.error(f"Database error inserting message: {e}")
            return {"success": False, "error": str(e)}

    async def update_message_db(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Executes spUpdatePromptMessage to modify an existing chat record."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    EXEC spUpdatePromptMessage @Id=?, @UserId=?, @TenantId=?, @AppId=?, 
                        @UserMessage=?, @IsFavorited=?, @Visibility=?, @ModifiedBy=?
                """, (
                    request_data['message_id'], request_data['user_id_token'], request_data['tenant_id'],
                    request_data['app_id'], request_data.get('user_message'), request_data.get('is_favorited'),
                    request_data.get('visibility'), request_data['user_id_token']
                ))
                row = cursor.fetchone()
                conn.commit()
                return {"success": True, "message": row[0] if row else "Update successful."}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Database error updating message: {error_message}")
            return {"success": False, "error": error_message}

    async def delete_chat_db(self, chat_id: str, user_id: str) -> Dict[str, Any]:
        """Executes spDeletePromptMessage to deactivate a chat record."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spDeletePromptMessage @ChatId=?, @RequestingUserId=?", chat_id, user_id)
                row = cursor.fetchone()
                conn.commit()
                return {"success": True, "message": row[0] if row else "Delete successful."}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Database error deleting chat {chat_id}: {error_message}")
            return {"success": False, "error": error_message}

    async def get_chats_db(self, filter_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC spGetFilteredPromptMessages @UserId=?, @TenantId=?, @AppId=?, @Category=?, @TagName=?, @DateFilter=?, @StartDateCustom=?, @EndDateCustom=?",
                    filter_data['user_id'], filter_data['tenant_id'], filter_data.get('app_id'),
                    filter_data['category'], filter_data.get('tag_name'), filter_data.get('date_filter', 'all'),
                    filter_data.get('start_date'), filter_data.get('end_date')
                )
                count_row = cursor.fetchone()
                total_chats = count_row.TotalChats if count_row else 0
                cursor.nextset()
                columns = [c[0] for c in cursor.description]
                
                history = []
                for row in cursor.fetchall():
                    row_dict = dict(zip(columns, row))
                    # FIX: Explicitly format 'Timestamp' as string if it's a datetime object
                    if row_dict.get('Timestamp') and hasattr(row_dict['Timestamp'], 'isoformat'):
                        row_dict['Timestamp'] = row_dict['Timestamp'].isoformat()
                    history.append(row_dict)
                    
                return {"success": True, "total_chats": total_chats, "history": history}
        except pyodbc.Error as e:
            logger.error(f"Database error in spGetFilteredPromptMessages: {e}")
            return {"success": False, "error": str(e), "history": []}

    async def search_tags_db(self, search_term: str, limit: int) -> Dict[str, Any]:
        """Searches for existing tags for autocomplete functionality."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                # This could be converted to a stored procedure if preferred
                query = "SELECT DISTINCT TOP (?) TagName FROM Tags WHERE TagName LIKE ? + '%'"
                params = [limit, search_term]
                cursor.execute(query, params)
                tags = [{"tag_name": row.TagName} for row in cursor.fetchall()]
                return {"success": True, "tags": tags}
        except pyodbc.Error as e:
            logger.error(f"Database error searching tags: {e}")
            return {"success": False, "error": str(e), "tags": []}
        


    async def get_user_chat_history_db(self, user_id: str, tenant_id: str, app_id: Optional[int]) -> Dict[str, Any]:
        """Executes the spGetUserChatHistory stored procedure."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetUserChatHistory @UserId=?, @TenantId=?, @AppId=?", user_id, tenant_id, app_id)
                count_row = cursor.fetchone()
                total_chats = count_row.TotalChats if count_row else 0
                cursor.nextset()
                columns = [c[0] for c in cursor.description]
                history = [dict(zip(columns, row)) for row in cursor.fetchall()]
                return {"success": True, "total_chats": total_chats, "history": history}
        except Exception as e:
            logger.error(f"DB error in spGetUserChatHistory: {e}")
            return {"success": False, "error": str(e), "history": []}

    async def get_public_chats_db(self, tenant_id: str, app_id: Optional[int]) -> Dict[str, Any]:
        """Executes the spGetPromptPublicMessages stored procedure."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetPromptPublicMessages @TenantId=?, @AppId=?", tenant_id, app_id)
                count_row = cursor.fetchone()
                total_chats = count_row.PublicChats if count_row else 0
                cursor.nextset()
                columns = [c[0] for c in cursor.description]
                history = [dict(zip(columns, row)) for row in cursor.fetchall()]
                return {"success": True, "total_chats": total_chats, "history": history}
        except Exception as e:
            logger.error(f"DB error in spGetPromptPublicMessages: {e}")
            return {"success": False, "error": str(e), "history": []}

    async def get_favorite_chats_db(self, user_id: str, tenant_id: str, app_id: Optional[int]) -> Dict[str, Any]:
        """Executes the spGetFavoriteChats stored procedure."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetFavoriteChats @UserId=?, @TenantId=?, @AppId=?", user_id, tenant_id, app_id)
                count_row = cursor.fetchone()
                total_chats = count_row.FavoriteChats if count_row else 0
                cursor.nextset()
                columns = [c[0] for c in cursor.description]
                history = [dict(zip(columns, row)) for row in cursor.fetchall()]
                return {"success": True, "total_chats": total_chats, "history": history}
        except Exception as e:
            logger.error(f"DB error in spGetFavoriteChats: {e}")
            return {"success": False, "error": str(e), "history": []}

    async def get_user_tagged_chats_db(self, user_id: str, tenant_id: str, app_id: Optional[int]) -> Dict[str, Any]:
        """Executes the spGetUserTaggedChats stored procedure."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetUserTaggedChats @UserId=?, @TenantId=?, @AppId=?", user_id, tenant_id, app_id)
                columns = [c[0] for c in cursor.description]
                history = [dict(zip(columns, row)) for row in cursor.fetchall()]
                total_chats = len(history)
                return {"success": True, "total_chats": total_chats, "history": history}
        except Exception as e:
            logger.error(f"DB error in spGetUserTaggedChats: {e}")
            return {"success": False, "error": str(e), "history": []}
        

    # --- Approval Workflow Methods ---

    async def request_public_approval_db(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Executes spRequestPublicApproval to create an approval request."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spRequestPublicApproval @ChatId=?, @TenantId=?, @RequesterUserId=?",
                               request_data['chat_id'], request_data['tenant_id'], request_data['requester_user_id'])
                conn.commit()
            return {"success": True, "message": "Request for public approval submitted successfully."}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Database error requesting approval: {error_message}")
            return {"success": False, "error": error_message}

    async def process_public_approval_db(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Executes spProcessPublicApproval to approve or reject a request."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spProcessPublicApproval @ApprovalId=?, @ApproverUserId=?, @NewStatus=?, @AdminComments=?",
                               request_data['approval_id'], request_data['approver_user_id'],
                               request_data['new_status'], request_data.get('admin_comments'))
                conn.commit()
            return {"success": True, "message": f"Request has been {request_data['new_status'].lower()}."}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.error(f"Database error processing approval: {error_message}")
            return {"success": False, "error": error_message}

    async def get_pending_approvals_db(self, tenant_id: str) -> Dict[str, Any]:
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spGetPendingPublicApprovals @TenantId=?", (tenant_id,))
                columns = [column[0] for column in cursor.description]
                
                approvals = []
                for row in cursor.fetchall():
                    row_dict = dict(zip(columns, row))
                    
                    # ✅ DEFINITIVE FIX: Format with 'Z' suffix
                    if row_dict.get('RequestDate'):
                        # strftime ensures we get a clean string, then we add Z
                        row_dict['RequestDate'] = row_dict['RequestDate'].strftime('%Y-%m-%dT%H:%M:%S') + 'Z'
                    
                    approvals.append(row_dict)
                    
                return {"success": True, "pending_approvals": approvals, "total_pending": len(approvals)}
        except pyodbc.Error as e:
            logger.error(f"Database error getting pending approvals: {e}")
            return {"success": False, "error": str(e), "pending_approvals": []}