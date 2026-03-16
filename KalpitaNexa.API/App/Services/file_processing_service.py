import logging
import json
from typing import List, Optional, Dict, Any
from fastapi import UploadFile
from openai import AzureOpenAI
from .. import config
from ..Utils.file_text_extractor import extract_text_from_file
from ..Managers.file_processing_manager import FileProcessingManager
from .promptmanager_service import PromptManagerService

logger = logging.getLogger(__name__)

class FileProcessingService:
    """Orchestrates the file upload and analysis workflow."""

    def __init__(self, openai_client: AzureOpenAI, manager: FileProcessingManager, prompt_manager: PromptManagerService):
        self._openai_client = openai_client
        self._manager = manager
        self._prompt_manager = prompt_manager
        logger.info("FileProcessingService initialized.")

    async def process_uploaded_files(self, files: List[UploadFile], user_query: Optional[str], user_id: str, tenant_id: str, app_id: int, client_id: Optional[str]) -> Dict[str, Any]:
        processed_docs = []
        failed_files = []
        all_citations = []
        file_id_map = {} 

        for file in files:
            try:
                self._validate_file(file)
                text = extract_text_from_file(file)
                if not text or text.startswith("Error:"):
                    raise ValueError(text or "No text could be extracted.")

                # THE FIX: Pass all necessary context to the manager
                db_file_id = await self._manager.upload_file_to_db(
                    file=file,
                    user_id=user_id,
                    tenant_id=tenant_id,
                    app_id=app_id,
                    client_id=client_id
                )
                file_id_map[file.filename] = db_file_id
                
                processed_docs.append({"filename": file.filename, "text": text})
                all_citations.append({
                    "title": f"[Uploaded] {file.filename}",
                    "filepath": file.filename,
                    "content": text[:300] + "...",
                    "source_type": "Uploaded Document"
                })
            except Exception as e:
                logger.error(f"Failed to process file {file.filename}: {e}")
                failed_files.append(file.filename)

        if not processed_docs:
            return {"success": False, "error": "None of the files could be processed successfully."}

        ai_content = await self._get_ai_analysis(processed_docs, user_query)
        user_message = user_query or f"Analyze: {', '.join(d['filename'] for d in processed_docs)}"
        primary_file_id = file_id_map.get(processed_docs[0]['filename']) if processed_docs else None

        # Insert the chat message, now linking the new FileId
        insert_data = {
            "user_id": user_id, "tenant_id": tenant_id, "app_id": app_id,
            "client_id": client_id, "user_message": user_message, "ai_response": ai_content,
            "prompt_tokens": 0, "response_tokens": 0, "file_id": primary_file_id, "is_favorited": False,   
            "visibility": "private"
        }
        db_result = await self._prompt_manager.insert_message(insert_data)
        
        follow_ups = await self._generate_follow_up_questions(user_message, ai_content)

        return {
            "success": len(failed_files) == 0,
            "response": ai_content,
            "citations": all_citations,
            "follow_up_questions": follow_ups,
            "files_processed": [d['filename'] for d in processed_docs],
            "failed_files": failed_files,
            "message_id": db_result.get("message_id"),
            "error": f"Failed to process: {', '.join(failed_files)}" if failed_files else None
        }

    # ... The rest of the service file (_validate_file, _get_ai_analysis, etc.) remains unchanged ...
    def _validate_file(self, file: UploadFile):
        """Validates file size and type."""
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        if file_size > 10 * 1024 * 1024:
            raise ValueError("File exceeds 10MB limit.")
        
        allowed_extensions = ('.docx', '.pdf', '.ppt', '.pptx', '.xlsx', '.txt', '.png')
        if not file.filename.lower().endswith(allowed_extensions):
            raise ValueError("Unsupported file format.")

    async def _get_ai_analysis(self, documents: List[Dict[str, str]], user_query: Optional[str]) -> str:
        # This method remains unchanged
        try:
            combined_text = ""
            for i, doc in enumerate(documents, 1):
                combined_text += f"--- START OF DOCUMENT {i}: {doc['filename']} ---\n{doc['text'][:4000]}\n--- END ---\n\n"

            if user_query:
                system_prompt = f"Answer the user's query based on the content of the provided documents. Reference the document names when possible.\n\nDocuments:\n{combined_text}"
                user_content = user_query
            else:
                system_prompt = f"Summarize the key information from the following documents. If they are resumes, compare their skills and experience.\n\nDocuments:\n{combined_text}"
                user_content = "Summarize these documents."

            response = self._openai_client.chat.completions.create(
                model=config.AZURE_OPENAI_DEPLOYMENT_NAME,
                messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_content}],
                # temperature=0.7, 
                # max_tokens=1500
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Error during AI analysis of documents: {e}")
            return "An error occurred while analyzing the document(s)."
            
    async def _generate_follow_up_questions(self, user_message: str, response: str) -> List[str]:
        # This method remains unchanged
        try:
            prompt = f"""Based on the user's action and the AI's response regarding uploaded files, suggest 3 relevant follow-up questions.
            User Action: {user_message}
            AI Response: {response[:500]}
            Respond ONLY with a JSON list of 3 string questions. Example: ["Question 1?", "Question 2?", "Question 3?"]"""
            
            response = self._openai_client.chat.completions.create(
                model=config.AZURE_OPENAI_DEPLOYMENT_NAME,
                messages=[{"role": "system", "content": prompt}],
                # temperature=0.8, 
                # max_tokens=200
            )
            questions = json.loads(response.choices[0].message.content)
            return questions if isinstance(questions, list) and len(questions) <= 3 else []
        except Exception as e:
            logger.warning(f"Failed to generate follow-up questions: {e}")
            return []