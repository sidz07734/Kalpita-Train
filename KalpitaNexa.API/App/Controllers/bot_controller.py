import sys
import traceback
from fastapi import APIRouter, Request, Response, Depends

from botbuilder.schema import Activity
from botbuilder.integration.aiohttp import (
    CloudAdapter,
    ConfigurationServiceClientCredentialFactory,
    ConfigurationBotFrameworkAuthentication
)
from botframework.connector.auth import AuthenticationConfiguration

# Internal Imports
from App import config
from ..Services.chat_service import ChatService
from ..dependencies import get_chat_service
from ..Bot.teams_bot import TeamsBot

router = APIRouter()

async def on_error(context, error):
    print(f"\n [on_turn_error] {error}", file=sys.stderr)
    await context.send_activity("The bot encountered an error.")

@router.api_route("/api/messages", methods=["POST", "OPTIONS"])
async def messages(
    request: Request,
    chat_service: ChatService = Depends(get_chat_service),
):
    if request.method == "OPTIONS":
        return Response(status_code=200)

    # 1. SETUP SECURITY BYPASS (Fixes the PermissionError)
    # We tell the bot to trust the V2 token authority since we can't edit the Azure Manifest
    auth_config = AuthenticationConfiguration()
    auth_config.validate_authority = False 

    # 2. SETUP CREDENTIALS
    # We use .strip() to ensure no accidental spaces from the .env file
    # We use SimpleNamespace because ConfigurationServiceClientCredentialFactory 
    # expects an object with attributes, not a dictionary.
    from types import SimpleNamespace
    config_obj = SimpleNamespace(
        APP_ID=config.MICROSOFT_APP_ID.strip(),
        APP_PASSWORD=config.MICROSOFT_APP_PASSWORD.strip(),
        APP_TYPE="SingleTenant",
        APP_TENANTID=config.MICROSOFT_APP_TENANT_ID.strip()
    )

    credentials_factory = ConfigurationServiceClientCredentialFactory(config_obj)


    # 3. INITIALIZE AUTHENTICATION (Fixes the TypeError)
    # Note: We pass them as keyword arguments (using = ) to avoid the "positional arguments" error
    auth_runtime = ConfigurationBotFrameworkAuthentication(
        configuration={}, 
        credentials_factory=credentials_factory,
        auth_configuration=auth_config
    )
    
    adapter = CloudAdapter(auth_runtime)
    adapter.on_turn_error = on_error

    # 4. PROCESS MESSAGE
    try:
        body = await request.json()
        activity = Activity().deserialize(body)
        auth_header = request.headers.get("Authorization", "")

        my_bot = TeamsBot(chat_service=chat_service)
        
        # This will now pass both the security check and the ID check
        response = await adapter.process_activity(auth_header, activity, my_bot.on_turn)

        if response:
            return Response(status_code=response.status, content=response.body)
        return Response(status_code=201)

    except Exception as e:
        traceback.print_exc()
        return Response(status_code=500, content=f"Internal Server Error: {str(e)}")