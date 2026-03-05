# app/Services/visualization_service.py
"""
This service orchestrates the generation of single charts and multi-chart dashboards.
"""
import logging
import asyncio
from typing import Dict, List, Any, Optional 
from ..Services.chat_service import ChatService
from ..Managers.visualization_manager import VisualizationManager
from ..Utils.visualization_helpers import parse_dashboard_query

logger = logging.getLogger(__name__)

class VisualizationService:
    def __init__(self, manager: VisualizationManager,chat_service: ChatService):
   
        self._manager = manager
        self._chat_service = chat_service
        logger.info("VisualizationService initialized.")

    async def generate_chart_data(self, query: str, chart_type: str, data_sources: List[str], max_results: int,app_id:int) -> Dict[str, Any]:
        """
        Orchestrates the full pipeline for generating a single chart.
        """
        logger.info(f"Generating single chart for query: '{query}'")

        # 1. Fetch summarized data from ChatService (which often returns a Markdown table for aggregations)
        analysis_result = await self._chat_service.process_chat(
            message=query, data_sources=data_sources,app_id=app_id
        )

        if not analysis_result.get("success") or not analysis_result.get("response", "").strip():
            return {"success": False, "error": "Failed to fetch or summarize data for the chart."}
        
        raw_data_string = analysis_result["response"]

        # 2. Convert the summarized data into a Chart.js JSON object
        chart_json = await self._manager.convert_data_to_chart_json(
            data_string=raw_data_string, query=query, chart_type=chart_type
        )

        if not chart_json or not chart_json.get("datasets"):
            return {"success": False, "error": "Could not convert the fetched data into a valid chart structure."}

        return {
            "success": True,
            "chart_data": chart_json,
            "citations": analysis_result.get("citations", []),
            "raw_ai_response": raw_data_string,
            "query_processed": query,
            "suggested_chart_type": chart_json.get("chart_type", chart_type),
            "data_sources_used": analysis_result.get("services_used", [])
        }

    async def generate_dashboard_data(self, query: str, data_sources: List[str], max_results: int,app_id :Optional [int]) -> Dict[str, Any]:
        """
      .     Orchestrates the generation of multiple charts for a dashboard.
        """
        # logger.info(f"Generating dashboard for query: '{query}'")

        chart_requests = parse_dashboard_query(query)
        if not chart_requests:
            return {"success": False, "error": "No valid chart requests found in the query."}

        # Create a list of concurrent tasks
        tasks = [
            self.generate_chart_data(req['chart_query'], req['chart_type'], data_sources, max_results,app_id)
            for req in chart_requests
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        charts_data = []
        for i, result in enumerate(results):
            chart_id = chart_requests[i]['chart_id']
            if isinstance(result, Exception) or not result.get("success"):
                error_msg = result.get("error", str(result)) if isinstance(result, dict) else str(result)
                charts_data.append({"chart_id": chart_id, "success": False, "error": error_msg})
            else:
                charts_data.append({"chart_id": chart_id, "success": True, "chart_data": result['chart_data']})
        
        return {"success": True, "charts_data": charts_data}