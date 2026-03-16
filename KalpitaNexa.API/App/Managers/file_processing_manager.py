import logging
import uuid
from typing import Dict, Optional
from fastapi import UploadFile
import pyodbc
from .. import config

logger = logging.getLogger(__name__)

class FileProcessingManager:
    """Manages storing file data directly in the SQL database."""

    def _get_connection(self):
        """Establishes and returns a new database connection."""
        try:
            return config.get_sql_connection()
        except Exception as e:
            logger.error(f"FATAL: Could not establish database connection: {e}", exc_info=True)
            raise

    async def upload_file_to_db(self, file: UploadFile, user_id: str, tenant_id: str, app_id: int, client_id: Optional[str]) -> str:
        """
        Uploads a file's binary content to the database by executing the 'spUploadFile' stored procedure.
        Returns the new file's GUID.
        """
        try:
            file_id = str(uuid.uuid4())
            
            # 1. CRITICAL: Reset file pointer to 0. 
            # The Service layer read the file for text extraction, moving the cursor to the end.
            # Without this, file.read() returns empty bytes, causing driver crashes.
            await file.seek(0)
            
            file_content = await file.read()
            file_size = len(file_content)

            if file_size == 0:
                raise ValueError(f"File {file.filename} appears empty.")

            # 2. Convert to bytearray. PyODBC handles bytearray (mutable) more reliably than bytes (immutable) for blobs.
            file_data_param = bytearray(file_content)

            with self._get_connection() as conn:
                cursor = conn.cursor()

                # 3. Explicitly define the binary parameter size to prevent memory allocation errors (HY000)
                # Parameters index 0-7 are standard types (None). Index 8 is the FileContent.
                cursor.setinputsizes([
                    None, None, None, None, None, None, None, None, 
                    (pyodbc.SQL_LONGVARBINARY, file_size)
                ])

                # 4. CRITICAL: Use ODBC RPC syntax `{CALL ...}` instead of `EXEC ...`.
                # RPC binds parameters more strictly and handles binary streams significantly better than T-SQL batches.
                cursor.execute("""
                    {CALL spUploadFile (?, ?, ?, ?, ?, ?, ?, ?, ?)}
                """, (
                    file_id, 
                    user_id, 
                    tenant_id, 
                    app_id, 
                    client_id,
                    file.filename, 
                    file.content_type, 
                    file_size, 
                    file_data_param
                ))
                conn.commit()
            
            logger.info(f"Successfully stored file '{file.filename}' in database with ID: {file_id}")
            return file_id

        except pyodbc.Error as e:
            logger.error(f"Database error uploading file {file.filename}: {e}")
            # Clean error message for the logs
            error_code = e.args[0] if e.args else 'Unknown'
            error_msg = e.args[1] if len(e.args) > 1 else str(e)
            raise IOError(f"DB Error [{error_code}]: {error_msg}")
        except Exception as e:
            logger.error(f"Generic error uploading file {file.filename}: {e}")
            raise IOError(f"An unexpected error occurred: {str(e)}")