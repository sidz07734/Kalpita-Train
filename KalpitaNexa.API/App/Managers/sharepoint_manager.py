# app/managers/sharepoint_manager.py
import logging
import re
import pyodbc
from typing import Dict, List, Optional
from functools import lru_cache
from openai import AzureOpenAI
from azure.search.documents import SearchClient
from azure.core.credentials import AzureKeyCredential
from azure.search.documents.models import QueryType
from .. import config
from ..Models.search_models import SharePointResponse, Citation

logger = logging.getLogger(__name__)

class SharePointManager:
    def __init__(self, openai_client: AzureOpenAI):
        self.openai_client = openai_client
        self._search_clients: Dict[int, SearchClient] = {}
        

    @lru_cache(maxsize=32)
    def _get_index_name_for_app(self, app_id: int) -> Optional[str]:
        try:
            with config.get_sql_connection() as conn:
                cursor = conn.cursor()
                # Row 11 in your screenshot
                query = "SELECT ConfigValue FROM dbo.Configurations WHERE AppId = ? AND ConfigKey = 'AZURE_SEARCH_INDEX_NAME' AND IsActive = 1"
                cursor.execute(query, app_id)
                row = cursor.fetchone()
                return row.ConfigValue.strip() if row else None
        except Exception:
            return None
        
    def _get_search_client(self, app_id: int) -> Optional[SearchClient]:
        index_name = self._get_index_name_for_app(app_id)
        if not index_name:
            # STOP: Do not fallback to config.AZURE_SEARCH_INDEX_NAME
            return None 

        return SearchClient(
            endpoint=config.AZURE_SEARCH_ENDPOINT,
            index_name=index_name,
            credential=AzureKeyCredential(config.AZURE_SEARCH_KEY)
        )
    
    async def search_documents(self, query: str, app_id: int, max_results: int) -> SharePointResponse:
        try:
            search_client = self._get_search_client(app_id)
            if not search_client:
                error_msg = f"SharePoint search is not configured for this application (AppId: {app_id})."
                logger.error(error_msg)
                return SharePointResponse(success=False, content=error_msg, error=error_msg, query_processed=query)

            logger.info(f"Searching SharePoint index '{search_client._index_name}' for: '{query}'")
            
            results = search_client.search(
                search_text=query,
                query_type=QueryType.SEMANTIC,
                semantic_configuration_name="default",
                top=max_results,
                include_total_count=True
            )

            documents = [dict(result) for result in results]
            if not documents:
                return SharePointResponse(success=False, content="No relevant documents found.", query_processed=query)

            context_docs = []
            for doc in documents:
                doc['search_score'] = doc.get('@search.score', 0)
                doc['title'] = doc.get("metadata_spo_item_name", "SharePoint Document")
                content = doc.get('content', '') or doc.get('merged_content', '')
                doc['content'] = (content[:800] + "...") if len(content) > 800 else content
                context_docs.append(doc)

            ai_content = await self._generate_ai_response(query, context_docs)
            citations = self._extract_citations(ai_content, context_docs)

            return SharePointResponse(
                success=True,
                content=ai_content,
                citations=citations,
                document_count=len(documents),
                query_processed=query
            )
        except Exception as e:
            logger.error(f"SharePoint Manager Error: {e}", exc_info=True)
            return SharePointResponse(success=False, error=str(e), content="Error searching SharePoint.", query_processed=query)

    async def _generate_ai_response(self, query: str, documents: List[Dict]) -> str:
        system_prompt = "You are an AI assistant analyzing SharePoint documents and give the information in a beautiful way and if you are getting any information don't give any response like there is insufficient data even if the name is little bit simmler that details is enough . Use citation markers [docX] for every piece of information.\n\n"
        for i, doc in enumerate(documents, 1):
            system_prompt += f"[doc{i}] Title: {doc['title']}\nContent: {doc['content']}\n\n"

        response = self.openai_client.chat.completions.create(
            model=config.AZURE_OPENAI_DEPLOYMENT_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ],
            # temperature=temperature,
            # max_tokens=1500
        )
        return response.choices[0].message.content

    def _extract_citations(self, content: str, documents: List[Dict]) -> List[Citation]:
        citations = []
        doc_indices = set(re.findall(r'\[doc(\d+)\]', content))
        for doc_idx_str in doc_indices:
            doc_num = int(doc_idx_str)
            if 0 < doc_num <= len(documents):
                doc = documents[doc_num - 1]
                citations.append(Citation(
                    title=f"[SharePoint] {doc.get('title')}",
                    url=doc.get("metadata_spo_item_weburi"),
                    filepath=doc.get("metadata_spo_item_path"),
                    content=doc.get("content"),
                    source_type="SharePoint",
                    score=doc.get("search_score", 0)
                ))
        return citations