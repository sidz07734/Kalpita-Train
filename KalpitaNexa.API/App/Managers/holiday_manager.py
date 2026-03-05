# app/Managers/holiday_manager.py
import logging
from typing import Dict, Any, Optional
from azure.search.documents import SearchClient
from azure.core.credentials import AzureKeyCredential
from openai import AzureOpenAI
from .. import config
from ..Utils import prompts
from ..Models.chat_models import Citation

logger = logging.getLogger(__name__)

class HolidayManager:
    def __init__(self, openai_client: AzureOpenAI):
        self.openai_client = openai_client
        self.endpoint = config.AZURE_SEARCH_ENDPOINT
        self.credential = AzureKeyCredential(config.AZURE_SEARCH_KEY)

    async def _get_holiday_index(self, app_id: int) -> Optional[str]:
        """Fetches the Holiday Index name from the Configurations table (Row 19)."""
        try:
            with config.get_sql_connection() as conn:
                cursor = conn.cursor()
                query = "SELECT ConfigValue FROM dbo.Configurations WHERE AppId = ? AND ConfigKey = 'AZURE_SEARCH_INDEX_NAME_HOLIDAYS' AND IsActive = 1"
                cursor.execute(query, app_id)
                row = cursor.fetchone()
                return row.ConfigValue.strip() if row else None
        except Exception as e:
            logger.error(f"Error fetching Holiday index for App {app_id}: {e}")
            return None

    async def search_holidays(self, query: str, app_id: int) -> Dict[str, Any]:
        """Strictly fetches raw holiday data from the index."""
        try:
            index_name = await self._get_holiday_index(app_id)
            if not index_name:
                return {"success": False, "citations": [], "content": ""}

            client = SearchClient(self.endpoint, index_name, self.credential)
            
            # Search against the new fields
            results = client.search(search_text=query, top=20)
            
            context_list = []
            citations = []
            for res in results:
                # --- MATCHING YOUR AZURE OUTPUT ---
                h_name = res.get('HolidayName')
                h_date = res.get('DateString')
                h_day = res.get('DayOfWeek')
                h_type = res.get('HolidayType')
                h_score = res.get('@search.score', 0)

                # Build the text context for the AI
                h_info = f"Holiday: {h_name}, Date: {h_date}, Day: {h_day}, Type: {h_type}"
                context_list.append(h_info)
                
                # Add citation
                citations.append(Citation(
                    title=f"{h_name} ({h_date})",
                    content=h_info,
                    source_type="Holiday Calendar 2026",
                    score=h_score
                ))

            return {
                "success": True,
                "content": "\n".join(context_list), 
                "citations": citations,
                "services_used": ["holiday_manager"]
            }
        except Exception as e:
            logger.error(f"Holiday Manager Error: {e}")
            return {"success": False, "citations": [], "content": ""}