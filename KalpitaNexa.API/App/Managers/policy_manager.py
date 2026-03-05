# app/managers/policy_manager.py
import logging
import re
from typing import Dict, List, Any, Optional
from functools import lru_cache

from azure.search.documents import SearchClient
from azure.core.credentials import AzureKeyCredential
from azure.search.documents.models import QueryType
from openai import AzureOpenAI

from .. import config
from ..Models.chat_models import Citation

logger = logging.getLogger(__name__)

class PolicyManager:
    def __init__(self, openai_client: AzureOpenAI):
        self.openai_client = openai_client
        self.endpoint = config.AZURE_SEARCH_ENDPOINT
        self.credential = AzureKeyCredential(config.AZURE_SEARCH_KEY)
        self.client_cache: Dict[int, SearchClient] = {}

    @lru_cache(maxsize=32)
    def _get_index_name_for_app(self, app_id: int, is_attendance: bool = False) -> Optional[str]:
        """Fetches index name from Configurations table based on intent."""
        # NEW LOGIC: Choose key based on flag
        config_key = "AZURE_SEARCH_INDEX_NAME_ATTENDANCE" if is_attendance else "AZURE_SEARCH_INDEX_NAME_KALPITAPOLICY"
        
        try:
            with config.get_sql_connection() as conn:
                cursor = conn.cursor()
                query = "SELECT ConfigValue FROM dbo.Configurations WHERE AppId = ? AND ConfigKey = ? AND IsActive = 1"
                cursor.execute(query, (app_id, config_key))
                row = cursor.fetchone()
                if row:
                    return row.ConfigValue.strip()
                return None
        except Exception as e:
            logger.error(f"DB lookup failed: {e}")
            return None
        
    @lru_cache(maxsize=32)
    def _get_config_value(self, app_id: int, config_key: str) -> Optional[str]:
        """Fetches a specific config value (index name) from the database."""
        try:
            with config.get_sql_connection() as conn:
                cursor = conn.cursor()
                query = "SELECT ConfigValue FROM dbo.Configurations WHERE AppId = ? AND ConfigKey = ? AND IsActive = 1"
                cursor.execute(query, (app_id, config_key))
                row = cursor.fetchone()
                return row.ConfigValue.strip() if row else None
        except Exception as e:
            logger.error(f"DB Error in PolicyManager: {e}")
            return None
        
    def _get_search_client(self, app_id: int, is_attendance: bool = False) -> SearchClient:
        """Creates search client for specific app and specific sub-index."""
        # Use a unique cache key that includes the attendance flag
        cache_key = f"{app_id}_{is_attendance}"
        if cache_key in self.client_cache:
            return self.client_cache[cache_key]

        # Pass the flag down to get the right row (13 or 18)
        index_name = self._get_index_name_for_app(app_id, is_attendance)
        
        if not index_name:
            raise ValueError(f"Strict Error: Config key for {'Attendance' if is_attendance else 'Policy'} not found for App {app_id}")

        client = SearchClient(endpoint=self.endpoint, index_name=index_name, credential=self.credential)
        self.client_cache[cache_key] = client
        logger.info(f"Initialized client for App {app_id} on index '{index_name}'")
        return client

    async def search_policies(self, query: str, app_id: int, max_results: int = 5, use_semantic: bool = True, is_attendance: bool = False) -> Dict[str, Any]:
        """Searches the correct policy index based on the app_id and attendance flag."""
        try:
            # Pass the is_attendance flag to the client helper
            search_client = self._get_search_client(app_id, is_attendance)
            logger.info(f"Searching Policy index '{search_client._index_name}' for query: '{query}'")
            
            if use_semantic:
                search_params = {
                    "query_type": QueryType.SEMANTIC,
                    "semantic_configuration_name": "default",
                    "query_caption": "extractive",
                }
            else:
                search_params = {
                    "query_type": QueryType.SIMPLE,
                }
            
            results = search_client.search(
                search_text=query,
                top=max_results,
                **search_params
            )
            
            policies = []
            citations = []
            for i, result in enumerate(results):
                # Only accept results with a decent search score to prevent "noise"
                if result.get('@search.score', 0) < 1.0: 
                    continue

                content = result.get("content", "") or result.get("merged_content", "")
                title = result.get("metadata_spo_item_name") or "Policy Document"
                
                policies.append({
                    "content": content,
                    "title": title,
                    "score": result.get('@search.score', 0)
                })

                citations.append(Citation(
                    title=f"[Policy] {title}",
                    url=result.get("citation_link") or result.get("metadata_spo_item_weburi"),
                    content=content[:300],
                    source_type="Kalpita Policy",
                    score=result.get('@search.score', 0)
                ))

            # --- CHANGE: DON'T CALL OPENAI HERE ---
            # Return raw data to ChatService for strict synthesis
            return {
                "success": True, 
                "content": "\n\n".join([f"Title: {p['title']}\nContent: {p['content']}" for p in policies]), 
                "citations": citations, 
                "services_used": ["kalpitapolicy"]
            }

        except Exception as e:
            logger.error(f"Policy manager error: {e}")
            return {"success": False, "error": str(e), "citations": []}
        

    
        

    async def get_team_hierarchy(self, user_email: str, app_id: int, fetch_all_levels: bool = True) -> List[Dict[str, Any]]:
        try:
            client = self._get_roster_search_client()
            logger.info(f"Fetching hierarchy for: {user_email} (Recursive: {fetch_all_levels})")

            # 1. FIND USER (Exact or Lowercase)
            user_filter = f"WorkEmail eq '{user_email}'"
            results = list(client.search(search_text="*", filter=user_filter, top=1))
            
            if not results:
                user_filter = f"WorkEmail eq '{user_email.lower()}'"
                results = list(client.search(search_text="*", filter=user_filter, top=1))

            if not results:
                return []

            me = results[0]
            # Ensure we use the clean ID from the index
            my_emp_code = me["EmployeeCode"].strip().upper()
            
            team_members = [{
                "Name": me["Name"],
                "EmployeeId": my_emp_code,
                "Email": me["WorkEmail"],
                "ReportingManagerCode": me.get("ReportingManagerCode"),
                "IsManager": True,
                "Level": 0
            }]

            # 2. RECURSIVE SEARCH
            managers_to_check = [my_emp_code]
            current_level = 1
            max_levels = 10 if fetch_all_levels else 1 
            collected_ids = {my_emp_code}

            while managers_to_check and current_level <= max_levels:
                # CLEAN IDs before query
                clean_ids = [m.strip().upper() for m in managers_to_check if m]
                if not clean_ids: break

                ids_string = ",".join(clean_ids)
                
                # Search for reportees
                rep_filter = f"search.in(ReportingManagerCode, '{ids_string}', ',')"
                
                logger.info(f"Level {current_level}: Managers {ids_string}")
                
                batch_results = list(client.search(search_text="*", filter=rep_filter, top=1000))
                
                if not batch_results:
                    break

                managers_to_check = [] 
                
                for r in batch_results:
                    # Get Clean ID from Index
                    emp_id = r["EmployeeCode"].strip().upper()
                    
                    if emp_id not in collected_ids:
                        team_members.append({
                            "Name": r["Name"],
                            "EmployeeId": emp_id,
                            "Email": r["WorkEmail"],
                            "ReportingManagerCode": r.get("ReportingManagerCode"),
                            "IsManager": False,
                            "Level": current_level
                        })
                        collected_ids.add(emp_id)
                        managers_to_check.append(emp_id)
                
                current_level += 1

            return team_members

        except Exception as e:
            logger.error(f"Hierarchy Error: {e}")
            return []
        


    def _get_roster_search_client(self) -> SearchClient:
        """Gets the client for the NEW Structured Roster Index."""
        # This targets the specific index created in Phase 1
        index_name = getattr(config, "AZURE_SEARCH_INDEX_NAME_EMPLOYEE_ROSTER")
        return SearchClient(
            endpoint=self.endpoint, 
            index_name=index_name, 
            credential=self.credential
        )