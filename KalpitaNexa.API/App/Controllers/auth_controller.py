# app/Controllers/auth_controller.py -- CORRECTED VERSION--Used for sso , login, change password and reset password

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from ..Services.auth_service import AuthService
from ..Models.auth_models import LoginRequest, SsoLoginRequest, SendOtpRequest, ResetPasswordRequest, ChangePasswordRequest,ExternalLoginRequest
from ..Models.auth_models import LoginResponse
from ..Models.system_models import SuccessResponse
from ..dependencies import get_auth_service, verify_token


router = APIRouter()

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, auth_service: AuthService = Depends(get_auth_service)):
    return await auth_service.authenticate_user(request.email, request.password)

@router.post("/sso-login", response_model=LoginResponse)
async def sso_login(request: SsoLoginRequest, auth_service: AuthService = Depends(get_auth_service)):
    return await auth_service.authenticate_sso_user(request.token)

@router.post("/send-otp", response_model=SuccessResponse)
async def send_otp(request: SendOtpRequest, auth_service: AuthService = Depends(get_auth_service)):
    result = await auth_service.handle_send_otp(request.email)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to send OTP."))
    return result

@router.post("/reset-password", response_model=SuccessResponse)
async def reset_password(request: ResetPasswordRequest, auth_service: AuthService = Depends(get_auth_service)):
    result = await auth_service.handle_reset_password(request.email, request.otp, request.newPassword)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to reset password."))
    return result

@router.post("/change-password", response_model=SuccessResponse)
async def change_password(
    request: ChangePasswordRequest, 
    auth_service: AuthService = Depends(get_auth_service),
     # <--- LOCKS THIS ENDPOINT
):
    # Security Check: Ensure the token email matches the request email
    

    result = await auth_service.handle_change_password(request.email, request.oldPassword, request.newPassword)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result

@router.post("/token", response_model=LoginResponse)
async def login_for_swagger(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    This endpoint is used exclusively by Swagger UI to generate tokens.
    It maps the Swagger 'username' field to our 'email' field.
    """
    # Swagger sends 'username', but our DB expects 'email'
    result = await auth_service.authenticate_user(form_data.username, form_data.password)
    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("error", "Invalid credentials"))
    return result

@router.post("/external-login", response_model=LoginResponse)
async def external_login(
    request: ExternalLoginRequest, 
    auth_service: AuthService = Depends(get_auth_service)
):
    result = await auth_service.generate_external_token(
        email=request.email,
        name=request.name,
        role=request.role,
        # timestamp=request.timestamp,
        signature=request.signature,
        tenant_id=request.tenant_id,
        app_id=request.app_id
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("error"))
        
    return result