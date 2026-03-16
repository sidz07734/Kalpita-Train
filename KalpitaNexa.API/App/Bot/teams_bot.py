import logging
from botbuilder.core import ActivityHandler, TurnContext
from botbuilder.schema import ChannelAccount, Activity, ActivityTypes 

from App import config
from ..Services.chat_service import ChatService

logger = logging.getLogger(__name__)

class TeamsBot(ActivityHandler):
    def __init__(self, chat_service: ChatService):
        self.chat_service = chat_service

    async def on_message_activity(self, turn_context: TurnContext):
        # 1. Extract text
        user_message = turn_context.activity.text
        if not user_message:
            return
        user_message = user_message.strip()
        
        # 2. Extract User Info
        user_aad_id = turn_context.activity.from_property.id 
        user_name = turn_context.activity.from_property.name or "Teams User"

        # 3. Send "Typing..." indicator
        await turn_context.send_activity(Activity(type=ActivityTypes.typing))

        try:
            # 4. Determine AI Model
            deployment_name = getattr(config, 'AZURE_OPENAI_DEPLOYMENT_NAME_GPT35', "gpt-35-turbo")
            
            # 5. Call Chat Service
            result = await self.chat_service.process_chat(
                message=user_message,
                app_id=2,                       
                client_id="msteams",
                user_id_token=user_aad_id,
                user_email=user_name,
                data_sources=["all"],           
                debug_mode=False,
                user_role="user",
                model_deployment=deployment_name 
            )

            # 6. Extract response
            response_text = result.get("response") or result.get("content")
            if not response_text:
                response_text = "I received your message but could not generate a response."

            # 7. Send back to Teams
            await turn_context.send_activity(response_text)

        except Exception as e:
            logger.error(f"TEAMS BOT ERROR: {str(e)}", exc_info=True)
            await turn_context.send_activity("I'm sorry, I encountered an internal error.")

    async def on_members_added_activity(self, members_added: list[ChannelAccount], turn_context: TurnContext):
        for member in members_added:
            if member.id != turn_context.activity.recipient.id:
                await turn_context.send_activity("Hello! I am connected and ready to help.")