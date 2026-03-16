from fastapi import APIRouter, Depends
from openai import AzureOpenAI
from ..Services.daily_auth_service import DailyAuthService
from ..Models.daily_auth_models import DailyAuthRequest, DailyAuthResult
from .. import config
import logging
from ..dependencies import validate_optimized_payments_access
logger = logging.getLogger(__name__)

# Create router WITHOUT prefix (prefix will be added in main.py)
router = APIRouter(tags=["DailyAuth"])

logger.info("Daily Auth Controller router created successfully")

def get_service():
    client = AzureOpenAI(
        api_key=config.AZURE_OPENAI_API_KEY,
        api_version=config.AZURE_OPENAI_API_VERSION,
        azure_endpoint=config.AZURE_OPENAI_ENDPOINT
    )
    return DailyAuthService(client)

@router.post("/query", response_model=DailyAuthResult)
async def query_daily_auth(
    request: DailyAuthRequest, 
    service: DailyAuthService = Depends(get_service),
    token_data: dict = Depends(validate_optimized_payments_access) 
):
    # Now just pass the 'request' fields to the service
    return await service.process_natural_language_query(
        query=request.query,
        tenant_id=request.tenant_id,
        app_id=request.app_id
    )