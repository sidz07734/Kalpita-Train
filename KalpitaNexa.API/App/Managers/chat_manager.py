# app/managers/chat_manager.py
import logging
import uuid
from typing import Dict, Any, Optional, List
import pyodbc

from .. import config

logger = logging.getLogger(__name__)

class ChatManager:
    """Manages all chat-related interactions with the application's SQL database."""
    def _get_connection(self):
        return config.get_sql_connection()

    def _validate_guid(self, guid_string: str) -> bool:
        """Helper to validate if a string is a proper GUID format."""
        if not guid_string:
            return False
        try:
            uuid.UUID(guid_string)
            return True
        except (ValueError, TypeError):
            return False

    async def insert_message(self, user_id: str, tenant_id: str, client_id: str, app_id: int, user_message: str, ai_response: str, prompt_tokens: int, response_tokens: int, visibility: str = 'private', file_id: Optional[str] = None) -> Dict[str, Any]:
        """Inserts a new chat message into the database using spInsertMessage."""
        try:
            message_id = str(uuid.uuid4())
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC spInsertMessage @Id=?, @UserId=?, @TenantId=?, @ClientId=?, @AppId=?, @UserMessage=?, @AIResponse=?, @PromptTokens=?, @ResponseTokens=?, @Visibility=?, @FileId=?, @CreatedBy=?",
                    (message_id, user_id, tenant_id, client_id, app_id, user_message, ai_response, prompt_tokens, response_tokens, visibility, file_id, user_id)
                )
                conn.commit()
            # logger.info(f"Message {message_id} inserted successfully.")
            return {"success": True, "message_id": message_id}
        except Exception as e:
            logger.error(f"Error inserting message: {e}", exc_info=True)
            return {"success": False, "error": f"Failed to store message in the database: {e}"}

    async def upload_file_record(self, user_id: str, file_name: str, file_type: str, file_size: int, file_content: bytes) -> Dict[str, Any]:
        """Uploads a file's metadata and content to the database."""
        try:
            file_id = str(uuid.uuid4())
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC UploadFile @Id=?, @UserIdToken=?, @FileName=?, @FileType=?, @FileSize=?, @FileContent=?",
                    (file_id, user_id, file_name, file_type, file_size, file_content)
                )
                conn.commit()
            # logger.info(f"File record {file_id} uploaded to database successfully.")
            return {"success": True, "file_id": file_id}
        except Exception as e:
            logger.error(f"Error uploading file record to database: {e}", exc_info=True)
            return {"success": False, "error": f"Failed to upload file record: {e}"}

    async def update_message_feedback(self, chat_id: str, user_id: str, tenant_id: str, app_id: int, feedback: int) -> Dict[str, Any]:
        """Updates the like/dislike feedback for a specific chat message."""
        if not self._validate_guid(chat_id):
            return {"success": False, "error": "Invalid Chat ID format."}
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC dbo.spUpdateMessageFeedback @ChatId=?, @UserId=?, @TenantId=?, @AppId=?, @Feedback=?, @ModifiedBy=?",
                    (chat_id, user_id, tenant_id, app_id, feedback, user_id)
                )
                row = cursor.fetchone()
                conn.commit()
                return {"success": True, "message": row[0] if row else "Feedback updated."}
        except pyodbc.Error as e:
            # Extracts user-friendly RAISERROR messages from the SP
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            logger.warning(f"DB error updating feedback for chat {chat_id}: {error_message}")
            return {"success": False, "error": error_message}
        except Exception as e:
            logger.error(f"Unexpected error updating feedback: {e}", exc_info=True)
            return {"success": False, "error": "An unexpected server error occurred."}

    # async def get_chats(self, user_id: str, tenant_id: str, category: str, app_id: Optional[int] = None, tag_name: Optional[str] = None, date_filter: str = 'all', start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
    #     """Executes the unified spGetFilteredPromptMessages stored procedure to fetch various chat histories."""
    #     try:
    #         with self._get_connection() as conn:
    #             cursor = conn.cursor()
    #             cursor.execute(
    #                 "EXEC dbo. @UserId=?, @TenantId=?, @AppId=?, @Category=?, @TagName=?, @DateFilter=?, @StartDateCustom=?, @EndDateCustom=?",
    #                 (user_id, tenant_id, app_id, category, tag_name, date_filter, start_date, end_date)
    #             )
    #             count_row = cursor.fetchone()
    #             total_chats = count_row.TotalChats if count_row else 0
                
    #             cursor.nextset()
    #             columns = [column[0] for column in cursor.description]
    #             history = [dict(zip(columns, row)) for row in cursor.fetchall()]
                
    #             return {"success": True, "total_chats": total_chats, "history": history}
    #     except Exception as e:
    #         logger.error(f"Error executing spGetFilteredPromptMessages for category '{category}': {e}", exc_info=True)
    #         return {"success": False, "error": str(e), "history": [], "total_chats": 0}

    async def request_public_approval(self, chat_id: str, tenant_id: str, requester_user_id: str) -> Dict[str, Any]:
        """Calls the spRequestPublicApproval stored procedure."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC dbo.spRequestPublicApproval @ChatId = ?, @TenantId = ?, @RequesterUserId = ?",
                    (chat_id, tenant_id, requester_user_id)
                )
                conn.commit()
            return {"success": True, "message": "Your request to make this chat public has been submitted for approval."}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            return {"success": False, "error": error_message}

    async def process_public_approval(self, approval_id: str, approver_user_id: str, new_status: str, admin_comments: Optional[str]) -> Dict[str, Any]:
        """Calls the spProcessPublicApproval stored procedure."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "EXEC dbo.spProcessPublicApproval @ApprovalId = ?, @ApproverUserId = ?, @NewStatus = ?, @AdminComments = ?",
                    (approval_id, approver_user_id, new_status, admin_comments)
                )
                conn.commit()
            return {"success": True, "message": f"Approval request has been successfully {new_status.lower()}."}
        except pyodbc.Error as e:
            error_message = str(e).split('](')[-1].split(') (SQLProce')[0]
            return {"success": False, "error": error_message}

    async def get_pending_public_approvals(self, tenant_id: str) -> Dict[str, Any]:
        """Calls the spGetPendingPublicApprovals stored procedure."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC dbo.spGetPendingPublicApprovals @TenantId = ?", (tenant_id,))
                
                columns = [column[0] for column in cursor.description]
                approvals = [dict(zip(columns, row)) for row in cursor.fetchall()]

            return {"success": True, "pending_approvals": approvals, "total_pending": len(approvals)}
        except Exception as e:
            logger.error(f"Error getting pending approvals for tenant {tenant_id}: {e}", exc_info=True)
            return {"success": False, "error": "Failed to retrieve pending approvals.", "pending_approvals": [], "total_pending": 0}
        
    # Add to chat_manager.py

    async def get_chats(
        self,
        user_id: str,
        tenant_id: str,
        app_id: Optional[int] = None,
        category: str = 'my-history',
        tag_name: Optional[str] = None,
        date_filter: str = 'all',
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Unified method to fetch chats using spGetFilteredPromptMessages stored procedure.
        Supports all categories including 'question_manager'.
        """
        if not self._validate_guid(user_id) or not self._validate_guid(tenant_id):
            return {"success": False, "error": "Invalid UserId or TenantId format."}
            
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    EXEC dbo.spGetFilteredPromptMessages 
                        @UserId=?, @TenantId=?, @AppId=?, @Category=?, 
                        @TagName=?, @DateFilter=?, @StartDateCustom=?, @EndDateCustom=?
                """, (
                    user_id, tenant_id, app_id, category, 
                    tag_name, date_filter, start_date, end_date
                ))
                
                # First result set: total count
                count_row = cursor.fetchone()
                total_chats = count_row.TotalChats if count_row else 0
                
                # Second result set: chat history
                cursor.nextset()
                columns = [column[0] for column in cursor.description]
                history = [dict(zip(columns, row)) for row in cursor.fetchall()]
                
                return {
                    "success": True,
                    "total_chats": total_chats,
                    "history": history
                }
                
        except Exception as e:
            logger.error(f"Error executing spGetFilteredPromptMessages for category '{category}': {str(e)}", exc_info=True)
            return {"success": False, "error": "Failed to retrieve chat history.", "history": [], "total_chats": 0}


    async def check_token_status_db(self, user_email: str, app_id: int) -> dict:
        """Checks if the user has enough credits to chat."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("EXEC spCheckTokenAvailability @UserEmail=?, @AppId=?", user_email, app_id)
                row = cursor.fetchone()
                
                if row:
                    return {"allowed": bool(row.IsAllowed), "message": row.Message}
                
                # If no row returned, user might not be assigned to app
                return {"allowed": False, "message": "User not assigned to this application."}
        except Exception as e:
            logger.error(f"Token check failed: {e}")
            # Fail-safe: Block if DB check fails
            return {"allowed": False, "message": "System error verifying credits."}