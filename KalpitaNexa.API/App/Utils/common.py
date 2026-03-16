# app/utils/common.py

import hashlib
import logging
import json
import uuid
from datetime import datetime
from typing import List

# --- Imports for Token Counting ---
import tiktoken

from azure.storage.blob import BlobServiceClient
from .. import config

logger = logging.getLogger("utils_common")

# ============================================================================
# TOKEN COUNTING UTILITY
# ============================================================================

try:
    # Initialize encoding for token counting, designed to be resilient
    encoding = tiktoken.encoding_for_model("o3-mini")
except Exception as e:
    logger.error(f"Could not initialize tiktoken encoding: {e}. Token counts will use an approximation.")
    encoding = None

def count_tokens(text: str) -> int:
    """Counts the number of tokens in a given text string using tiktoken."""
    if not text or not isinstance(text, str):
        return 0
    if not encoding:
        return len(text) // 4 # Fallback approximation if tiktoken fails to load

    try:
        return len(encoding.encode(text))
    except Exception as e:
        logger.warning(f"Token counting failed for text: {e}. Using approximation.")
        return len(text) // 4

# ============================================================================
# HASHING UTILITY
# ============================================================================

def hash_message(message: str) -> str:
    """Hashes a message using SHA-256 for privacy or identification."""
    if not message or not isinstance(message, str):
        return ""
    return hashlib.sha256(message.encode('utf-8')).hexdigest()

# ============================================================================
# CHAT HISTORY STORAGE (Legacy Blob Storage)
# This can be used for backup/archival purposes. The primary storage is now in the DB.
# ============================================================================

try:
    if config.AZURE_BLOB_CONNECTION_STRING:
        blob_service_client = BlobServiceClient.from_connection_string(config.AZURE_BLOB_CONNECTION_STRING)
        container_client = blob_service_client.get_container_client(config.AZURE_BLOB_CONTAINER_NAME)
    else:
        container_client = None
        logger.warning("Azure Blob Storage connection string not found. Chat history archival is disabled.")
except Exception as e:
    logger.error(f"Could not initialize Azure Blob Storage client: {e}. Archival is disabled.")
    container_client = None

def store_chat_history_blob(user_message: str, ai_response: str, user_tokens: int, response_tokens: int, 
                            client_id: str, user_id_token: str, file_names: List[str] = None):
    """(Legacy) Stores a chat interaction as a JSON blob in Azure Storage for archival."""
    if not container_client:
        return # Do nothing if blob storage is not configured

    try:
        timestamp = datetime.utcnow().isoformat()
        chat_id = str(uuid.uuid4())
        
        chat_data = {
            "chat_id": chat_id,
            "user_id_token": user_id_token,
            "client_id": client_id,
            "timestamp": timestamp,
            "user_message": user_message,
            "ai_response": ai_response,
            "user_message_tokens": user_tokens,
            "ai_response_tokens": response_tokens,
            "file_names": file_names or []
        }
        
        blob_name = f"chat_history_archive/{chat_id}_{timestamp}.json"
        blob_client = container_client.get_blob_client(blob_name)
        blob_client.upload_blob(json.dumps(chat_data, indent=2), overwrite=True)
        
        logger.info(f"Successfully archived chat history to blob: {blob_name}")
        
    except Exception as e:
        logger.error(f"Failed to archive chat history to blob: {e}")