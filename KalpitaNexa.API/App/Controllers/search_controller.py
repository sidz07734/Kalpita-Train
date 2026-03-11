# app/controllers/search_controller.py
import logging
from fastapi import APIRouter, Depends, HTTPException

# Import Managers
from ..Managers.sharepoint_manager import SharePointManager
from ..Managers.sql_search_manager import SqlSearchManager
from ..Managers.brave_manager import BraveManager
from ..Managers.policy_manager import PolicyManager

# Import models
from ..Models.search_models import (
    SharePointRequest, SharePointResponse,
    SQLRequest, SQLResponse,
    BraveSearchRequest, BraveSearchResponse,
    KalpitaPolicyRequest, KalpitaPolicyResponse
)

# Import dependencies
from ..dependencies import (
    get_sharepoint_manager, get_sql_search_manager,
    get_brave_manager, get_policy_manager
)

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/sharepoint/search", response_model=SharePointResponse)
async def search_sharepoint(
    request: SharePointRequest,
    sp_manager: SharePointManager = Depends(get_sharepoint_manager)
):
    """Search SharePoint index and return results with citations."""
    try:
        # FIX: Pass the app_id from the request to the manager method.
        result = await sp_manager.search_documents(
            query=request.query,
            app_id=request.app_id, 
            max_results=request.max_results,
            # temperature=request.temperature
        )
        if not result.success:
            return result
        return result
    except Exception as e:
        logger.error(f"SharePoint search endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred during SharePoint search.")

@router.post("/sql/search", response_model=SQLResponse)
async def search_sql_database(
    request: SQLRequest,
    sql_manager: SqlSearchManager = Depends(get_sql_search_manager)
):
    """Search SQL database indexer and return candidate results."""
    try:
        # FIX: Pass the app_id from the request to the manager method.
        result = await sql_manager.search_candidates(
            query=request.query,
            app_id=request.app_id,
            max_results=10,
            # temperature=0.7,
            user_role=request.user_role,
            user_email=request.user_email
        )
        return result
    except Exception as e:
        logger.error(f"SQL search endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred during SQL search.")

@router.post("/brave/search", response_model=BraveSearchResponse)
async def search_brave(
    request: BraveSearchRequest,
    brave_manager: BraveManager = Depends(get_brave_manager)
):
    """Search the web using Brave Search API."""
    try:
        # FIX: The model now correctly contains 'search_type', so this call will work.
        result = await brave_manager.search_web(
            query=request.query,
            max_results=request.max_results,
            search_type=request.search_type
        )
        return result
    except Exception as e:
        logger.error(f"Brave search endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred during web search.")

@router.post("/kalpitapolicy/search", response_model=KalpitaPolicyResponse)
async def search_kalpita_policies(
    request: KalpitaPolicyRequest,
    policy_manager: PolicyManager = Depends(get_policy_manager)
):
    """Search company policy documents."""
    try:
        # FIX: Pass the 'use_semantic' flag from the request to the manager.
        result = await policy_manager.search_policies(
            query=request.query,
            app_id=request.app_id,
            max_results=request.max_results,
            # temperature=request.temperature,
            use_semantic=request.use_semantic
        )
        return result
    except Exception as e:
        logger.error(f"Kalpita Policy search endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred during policy search.")