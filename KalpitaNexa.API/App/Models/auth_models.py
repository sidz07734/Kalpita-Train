# app/models/auth_models.py
"""
This file defines the Pydantic models used for request and response bodies
in the authentication and authorization workflows.
"""
from pydantic import BaseModel, EmailStr
from typing import Optional

# --- Request Models ---

class LoginRequest(BaseModel):
    """Request body for standard email/password login."""
    email: EmailStr
    password: str # The frontend should send the hashed password

class SsoLoginRequest(BaseModel):
    """Request body for Single Sign-On using a provider token."""
    token: str

class SendOtpRequest(BaseModel):
    """Request body for initiating a password reset."""
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    """Request body for finalizing a password reset with an OTP."""
    email: EmailStr
    otp: str
    newPassword: str # The frontend should send the new hashed password

class ChangePasswordRequest(BaseModel):
    """Request body for a logged-in user to change their password."""
    email: EmailStr
    oldPassword: str
    newPassword: str

# --- Response Models ---

class LoginResponse(BaseModel):
    """Response body for a successful login, providing essential session info."""
    success: bool
    access_token: Optional[str] = None 
    token_type: str = "bearer"
    userId: Optional[str] = None
    TenantId: Optional[str] = None
    userName: Optional[str] = None
    userEmail: Optional[EmailStr] = None
    userRole: Optional[str] = None
    error: Optional[str] = None

class ExternalLoginRequest(BaseModel):
    """
    Payload sent by the Chatbot Frontend during the handshake.
    Contains the security signature and user context.
    """
    email: EmailStr
    name: str
    role: str
    # timestamp: str  # The 'ts' from the URL
    signature: str  # The 'sig' from the URL
    app_id: str     # The 'appId' context
    tenant_id: Optional[str] = "188E191A-F692-47DC-933A-22B78F5A6E4A"