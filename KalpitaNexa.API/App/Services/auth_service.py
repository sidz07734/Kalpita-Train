# app/services/auth_service.py
import datetime
import hashlib
import hmac
import logging
import time
from typing import Dict, Any, Optional
import uuid
import jwt
import requests

from .. import config
from ..Managers.auth_manager import AuthManager
from ..Managers.user_manager import UserManager
from ..Utils.email_service import EmailService

logger = logging.getLogger(__name__)

class AuthService:
    def __init__(self, auth_manager: AuthManager, user_manager: UserManager, email_service: EmailService):
        self.auth_manager = auth_manager
        self.user_manager = user_manager
        self.email_service = email_service

    # async def authenticate_user(self, email: str, password_hash: str) -> Dict[str, Any]:
    #     """Business logic for authenticating a user with email and password."""
    #     # logger.info(f"Authenticating user: {email}")
    #     return await self.auth_manager.authenticate_user(email, password_hash)

    async def authenticate_user(self, email: str, password_hash: str) -> Dict[str, Any]:
        """Standard Login: Verify DB -> Generate Token"""
        auth_result = await self.auth_manager.authenticate_user(email, password_hash)
        
        if auth_result.get("success"):
            # Create JWT
            token_payload = {
                "sub": auth_result["userId"],
                "email": auth_result["userEmail"],
                "role": auth_result["userRole"],
                "tid": auth_result["TenantId"]
            }
            access_token = self.create_access_token(token_payload)
            
            # Add token to response
            auth_result["access_token"] = access_token
            auth_result["token_type"] = "bearer"
            
        return auth_result 
       
    def create_access_token(self, data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
        """Generates a secure JWT token."""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.datetime.utcnow() + expires_delta
        else:
            expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
        
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)
        return encoded_jwt

    async def authenticate_sso_user(self, token: str) -> Dict[str, Any]:
        """SSO Login: Verify Microsoft Token -> Check DB -> Generate Backend Token"""
        try:
            # 1. Decode the MS Token Header
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get('kid')
            
            # 2. Get Microsoft Public Keys
            discovery_url = "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration"
            jwks_uri = requests.get(discovery_url).json()['jwks_uri']
            jwks = requests.get(jwks_uri).json()
            
            public_key = next((jwt.algorithms.RSAAlgorithm.from_jwk(key) for key in jwks['keys'] if key['kid'] == kid), None)
            if not public_key:
                raise ValueError("Public key not found for token validation.")

            # 3. Verify Microsoft Token Signature
            # We trust this signature. If this passes, the user is valid.
            decoded_ms_token = jwt.decode(
                token, 
                public_key, 
                algorithms=["RS256"],
                options={"verify_aud": False} 
            )
            REQUIRED_GROUP_ID = "2f492d20-f334-4dc5-be34-c472e0d7b2af" 
            
            user_groups = decoded_ms_token.get('groups', [])
            
            # Check if the required group ID is in the user's group list
            if REQUIRED_GROUP_ID not in user_groups:
                 logger.warning(f"SSO Failed: User {decoded_ms_token.get('email')} is not in KalpitaEmployees group.")
                 return {"success": False, "error": "Access Denied: You are not a member of KalpitaEmployees."}
            user_email = decoded_ms_token.get('upn') or decoded_ms_token.get('unique_name') or decoded_ms_token.get('email')
            user_name = decoded_ms_token.get('name', user_email)
            
            # 4. Extract and Normalize User Info
            user_email = decoded_ms_token.get('upn') or decoded_ms_token.get('unique_name') or decoded_ms_token.get('email', '')
            user_name = decoded_ms_token.get('name', user_email)
            user_email = user_email.lower()
            
            # --- CONFIGURATION: Define defaults for provisioning/mapping ---
            DEFAULT_TENANT_ID = "188E191A-F692-47DC-933A-22B78F5A6E4A" # Kalpita Tenant
            DEFAULT_APP_NAME = "Kalpita Recruit"
            DEFAULT_ROLES = ["User"]
            
            # 5. Check if user exists in Kalpita DB
            user_data = await self.auth_manager.get_sso_user_by_email(user_email)
            
            existing_id = None
            if user_data.get("success"):
                existing_id = user_data["userId"]
                logger.info(f"SSO Login: User {user_email} exists (ID: {existing_id}). Ensuring mapping to {DEFAULT_TENANT_ID}...")
            else:
                logger.info(f"SSO Login: User {user_email} not found. Provisioning now.")
                
            # --- PROVISIONING/MAPPING BLOCK ---
            # Using the simplified SP (no permission check)
            provision_result = await self.user_manager.create_user_and_assign(
                executing_user_email=config.SYSTEM_ADMIN_EMAIL,
                tenant_id=DEFAULT_TENANT_ID,
                new_user_name=user_name,
                new_user_email=user_email,
                app_name=DEFAULT_APP_NAME,
                role_names=DEFAULT_ROLES,
                allow_reactivation=True
            )
            
            if provision_result.get("success"):
                final_user_id = provision_result["user_data"]["UserId"]
                final_email = user_email
                final_role = DEFAULT_ROLES[0]
                final_tenant = DEFAULT_TENANT_ID
                final_name = user_name
                logger.info(f"✅ SSO: Successfully provisioned/mapped user {user_email} (ID: {final_user_id})")
            elif existing_id:
                # Fallback to existing ID if mapping logic already handled or if skip check caught it
                final_user_id = existing_id
                final_email = user_email
                final_role = user_data.get("userRole", DEFAULT_ROLES[0])
                final_tenant = user_data.get("TenantId", DEFAULT_TENANT_ID)
                final_name = user_data.get("userName", user_name)
                logger.info(f"✅ SSO: User {user_email} using existing ID {final_user_id}")
            else:
                # Final fallback (Guest) if both provisioning and existing lookup fail
                error_msg = provision_result.get('error', 'Unknown database failure')
                logger.error(f"❌ SSO DATABASE FAILURE for {user_email}: {error_msg}")
                final_user_id = user_email
                final_email = user_email
                final_role = "User"
                final_tenant = "Guest"
                final_name = user_name

            # 5. Generate OUR Secure JWT (For both scenarios)
            token_payload = {
                "sub": str(final_user_id),
                "email": final_email,
                "role": final_role,
                "tid": final_tenant
            }
            
            access_token = self.create_access_token(token_payload)
            
            # 6. Return Success Response (Frontend logic will accepts this)
            return {
                "success": True,
                "access_token": access_token,
                "token_type": "bearer",
                "userId": str(final_user_id),
                "userEmail": final_email,
                "userRole": final_role,
                "TenantId": final_tenant,
                "userName": final_name
            }

        except jwt.ExpiredSignatureError:
            return {"success": False, "error": "SSO token has expired."}
        except Exception as e:
            logger.error(f"SSO Error: {e}", exc_info=True)
            return {"success": False, "error": "SSO Authentication failed."}
        
    async def handle_send_otp(self, email: str) -> Dict[str, Any]:
        """Orchestrates generating an OTP and sending it via email."""
        db_result = await self.auth_manager.generate_and_store_otp(email)
        if not db_result["success"]:
            return db_result
        
        otp = db_result.get("otp")
        email_sent = await self.email_service.send_otp_email(email, otp)
        if not email_sent:
            return {"success": False, "error": "Failed to send OTP email."}
            
        return {"success": True, "message": db_result.get("message")}

    async def handle_reset_password(self, email: str, otp: str, new_password_hash: str) -> Dict[str, Any]:
        """Business logic for verifying an OTP and resetting a password."""
        return await self.auth_manager.verify_otp_and_reset_password(email, otp, new_password_hash)

    async def handle_change_password(self, email: str, old_password_hash: str, new_password_hash: str) -> Dict[str, Any]:
        """Business logic for a user changing their own password."""
        return await self.auth_manager.change_user_password(email, old_password_hash, new_password_hash)
    async def generate_external_token(self, email: str, name: str, role: str, signature: str, tenant_id: str, app_id: str) -> Dict[str, Any]:
        """
        Verifies the request using DIRECT SECRET KEY comparison and Auto-provisions user mapping.
        """
        try:
            # 1. Security Check: Direct Key Comparison
            if signature != config.INTEGRATION_SECRET_KEY:
                return {"success": False, "error": "Security violation: Invalid signature."}

            # 2. Normalize and Prepare Context
            email = email.lower()
            
            # --- CONFIGURATION: Default context for External Recruit Login ---
            provision_tenant = tenant_id or "188E191A-F692-47DC-933A-22B78F5A6E4A"
            provision_app = "Kalpita Recruit" 
            provision_roles = ["User"] # Always default to 'User' for security during auto-provisioning

            # 3. Check for Existing User
            user_data = await self.auth_manager.get_sso_user_by_email(email)
            
            existing_user_id = None
            if user_data.get("success"):
                existing_user_id = user_data["userId"]
                logger.info(f"External Login: Found user {email} (ID: {existing_user_id}). Ensuring mapping to {provision_tenant}...")
            else:
                logger.info(f"External Login: User {email} not found. Provisioning now.")
                
            # --- PROVISIONING/MAPPING BLOCK ---
            provision_result = await self.user_manager.create_user_and_assign(
                executing_user_email=config.SYSTEM_ADMIN_EMAIL,
                tenant_id=provision_tenant,
                new_user_name=name,
                new_user_email=email,
                app_name=provision_app,
                role_names=provision_roles,
                allow_reactivation=True
            )
            
            if provision_result.get("success"):
                final_user_id = provision_result["user_data"]["UserId"]
                final_tenant_id = provision_tenant
                final_role = provision_roles[0]
                final_name = name
                logger.info(f"✅ External: Successfully provisioned/mapped user {email} (ID: {final_user_id})")
            elif existing_user_id:
                final_user_id = existing_user_id
                final_tenant_id = provision_tenant
                final_role = user_data.get("userRole", provision_roles[0])
                final_name = user_data.get("userName", name)
                logger.info(f"✅ External: User {email} using existing ID {final_user_id}")
            else:
                error_msg = provision_result.get('error', 'Unknown database failure')
                logger.error(f"❌ External DATABASE FAILURE for {email}: {error_msg}")
                final_user_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, email))
                final_tenant_id = provision_tenant
                final_role = role
                final_name = name

            # 4. Generate OUR Secure JWT
            token_payload = {
                "sub": str(final_user_id),
                "email": email,
                "name": final_name,
                "role": final_role,
                "tid": final_tenant_id,
                "app_id": app_id, 
                "is_external": True
            }
 
            access_token = self.create_access_token(token_payload)
 
            return {
                "success": True,
                "access_token": access_token,
                "userId": str(final_user_id),
                "TenantId": final_tenant_id,
                "userName": final_name,
                "userEmail": email,
                "userRole": final_role
            }
  
        except Exception as e:
            logger.error(f"External auth failed: {str(e)}", exc_info=True)
            return {"success": False, "error": "External authentication failed."}

 