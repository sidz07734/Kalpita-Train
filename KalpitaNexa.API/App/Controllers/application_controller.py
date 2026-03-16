# app/Controllers/application_controller.py
"""
Defines all API endpoints related to Application Management and catalogs.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException

from App.Models.system_models import SuccessResponse
from ..Services.application_service import ApplicationService
from ..Models.application_models import *
from ..dependencies import get_application_service

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/applications/all", response_model=GetAllApplicationsResponse, tags=["Application Management"])
async def get_all_applications_with_settings(
    tenant_id: Optional[str] = None,  # Add tenant_id as a required query parameter
    service: ApplicationService = Depends(get_application_service)
):
    result = await service.get_all_applications_with_settings(tenant_id)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return {
        "success": True, 
        "applications": result.get("applications", []), 
        "total_applications": len(result.get("applications", []))
    }

@router.get("/applications/{app_id}/settings", response_model=GetAppSettingsResponse, tags=["Application Management"])  #working
async def get_application_settings(app_id: int, service: ApplicationService = Depends(get_application_service)):
    result = await service.get_application_settings(app_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error"))
    return result

@router.post("/applications/{app_id}/settings", response_model=SuccessResponse, tags=["Application Management"])   #working
async def set_application_settings(app_id: int, request: SetAppSettingsRequest, service: ApplicationService = Depends(get_application_service)):
    result = await service.set_application_settings(app_id, request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result

@router.put("/applications/{app_id}/settings", response_model=SuccessResponse, tags=["Application Management"])#working
async def update_application_settings(app_id: int, request: UpdateAppSettingsRequest, service: ApplicationService = Depends(get_application_service)):
    result = await service.update_application_settings(app_id, request.model_dump())
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result

@router.get("/catalog/languages", response_model=GetLanguagesResponse, tags=["Application Management"])#working
async def get_all_languages(service: ApplicationService = Depends(get_application_service)):
    result = await service.get_all_languages()
    return {"success": True, "languages": result.get("languages", []), "total_languages": len(result.get("languages", []))}

@router.get("/catalog/datasources", response_model=GetDataSourcesResponse, tags=["Application Management"])#working
async def get_all_data_sources(service: ApplicationService = Depends(get_application_service)):
    result = await service.get_all_data_sources()
    return {"success": True, "data_sources": result.get("data_sources", []), "total_data_sources": len(result.get("data_sources", []))}

@router.get("/catalog/models", response_model=GetModelsResponse, tags=["Application Management"])#working
async def get_all_models(service: ApplicationService = Depends(get_application_service)):
    result = await service.get_all_models()
    return {"success": True, "models": result.get("models", []), "total_models": len(result.get("models", []))}

@router.get("/tenants/{tenant_id}/applications", response_model=GetApplicationsForTenantResponse, tags=["Application Management"])#working
async def get_applications_for_tenant(tenant_id: str, service: ApplicationService = Depends(get_application_service)):
    result = await service.get_applications_for_tenant(tenant_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error"))
    return result

@router.get("/applications/{app_id}/languages", response_model=GetLanguagesByAppResponse, tags=["Application Management"])#working
async def get_languages_by_app_id(app_id: int, service: ApplicationService = Depends(get_application_service)):
    result = await service.get_languages_by_app_id(app_id)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result

@router.get("/applications/{app_id}/models", response_model=GetModelsByAppResponse, tags=["Application Management"]) #working
async def get_models_by_app_id(app_id: int, service: ApplicationService = Depends(get_application_service)):
    result = await service.get_models_by_app_id(app_id)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result

@router.get("/catalog/features", response_model=GetFeaturesResponse, tags=["Application Management"])
async def get_all_features(service: ApplicationService = Depends(get_application_service)):
    """
    Retrieves a list of all active features available in the system.
    """
    try:
        result = await service.get_all_features()
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Error in /catalog/features endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
    

@router.post("/applications", response_model=SuccessResponse, tags=["Application Management"])
async def upsert_application(request: UpsertApplicationRequest, service: ApplicationService = Depends(get_application_service)):
    """
    Creates a new application or updates an existing one.
    - To **create**, set `app_id` to `0`.
    - To **update**, provide the existing `app_id`.
    """
    try:
        result = await service.upsert_application(request.model_dump())
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Error in /applications endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
    

@router.delete("/applications/{app_id}", response_model=SuccessResponse, tags=["Application Management"])
async def delete_application(app_id: int, request: DeleteApplicationRequest, service: ApplicationService = Depends(get_application_service)):
    """
    Soft-deletes an application by setting its IsActive flag to false.
    """
    try:
        result = await service.delete_application(app_id, request.executing_user)
        if not result.get("success"):
            if "does not exist" in result.get("error", ""):
                 raise HTTPException(status_code=404, detail=result.get("error"))
            raise HTTPException(status_code=400, detail=result.get("error"))
        return result
    except Exception as e:
        logger.error(f"Error in DELETE /applications/{app_id} endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
    
@router.post("/catalog/datasources/upsert", response_model=SuccessResponse, tags=["Application Management"])
async def upsert_data_source(
    request: UpsertDataSourceRequest,
    service: ApplicationService = Depends(get_application_service)
):
    # Pass the entire request body to the service layer for processing
    result = await service.upsert_data_source(request.model_dump())

    # If the operation was not successful, return an error
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))

    return result

@router.delete("/applications/{app_id}/datasources/{data_source_id}", response_model=SuccessResponse, tags=["Application Management"])
async def delete_data_source(
    app_id: int,
    data_source_id: int,
    service: ApplicationService = Depends(get_application_service)
):
    result = await service.delete_data_source(app_id, data_source_id)

    # If the service layer reports failure (e.g., not found), return an error.
    # 404 Not Found is a suitable status code in this case.
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error"))

    return result

@router.get("/catalog/datasourcetypes", response_model=GetDataSourceTypesResponse, tags=["Application Management"])
async def get_all_data_source_types(service: ApplicationService = Depends(get_application_service)):
    """Retrieves all available data source types (e.g., Web, Content, DB)."""
    result = await service.get_all_data_source_types()
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result

@router.post("/catalog/datasources/automate", tags=["Application Management"])
async def automate_azure_search(request: dict, service: ApplicationService = Depends(get_application_service)):
    # request contains: mode ('new'), type ('structured'/'unstructured'), azure_creds, and ds_params
    result = await service.automate_azure_resource_creation(request)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.post("/catalog/indexers/run", tags=["Application Management"])
async def run_indexer(request: dict, service: ApplicationService = Depends(get_application_service)):
    # request contains data_source_id and app_id
    result = await service.run_azure_indexer(request)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result