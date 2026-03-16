# app/Controllers/visualization_controller.py
"""
Defines the API endpoints for generating single charts and multi-chart dashboards.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from ..Services.visualization_service import VisualizationService
from ..Models.visualization_models import VisualizationRequest, VisualizationResponse, DashboardRequest, DashboardResponse
from ..dependencies import get_visualization_service

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/visualization/generate", response_model=VisualizationResponse, tags=["Visualization"])
async def generate_single_chart(
    request: VisualizationRequest,
    service: VisualizationService = Depends(get_visualization_service)
):
    """
    Generates a single Chart.js visualization from a natural language query.
    """
    try:
        result = await service.generate_chart_data(
            query=request.query, chart_type=request.chart_type, data_sources=request.data_sources
        )
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to generate chart."))
        return result
    except Exception as e:
        logger.error(f"Chart generation controller error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {e}")

@router.post("/dashboard/generate", response_model=DashboardResponse, tags=["Visualization"])
async def generate_dashboard(
    request: DashboardRequest,
    service: VisualizationService = Depends(get_visualization_service)
):
    """
    Parses a complex query to generate multiple Chart.js visualizations for a dashboard.
    """
    try:
        result = await service.generate_dashboard_data(
            query=request.query, data_sources=request.data_sources,
            max_results=10,  app_id= request.app_id,tenant_id=request.tenant_id,
            user_role=request.user_role,
            user_email=request.user_email
        )
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to generate dashboard."))
        return result
    except Exception as e:
        logger.error(f"Dashboard generation controller error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {e}")