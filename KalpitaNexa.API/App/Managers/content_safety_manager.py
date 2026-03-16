# app/Managers/content_safety_manager.py
import logging
import asyncio
from typing import Dict, Any, List
from azure.ai.contentsafety import ContentSafetyClient
from azure.core.credentials import AzureKeyCredential
from azure.ai.contentsafety.models import AnalyzeTextOptions
from azure.core.exceptions import HttpResponseError

from .. import config

logger = logging.getLogger(__name__)

class ContentSafetyManager:
    """
    Manages interactions with Azure AI Content Safety to filter harmful content.
    """
    def __init__(self):
        self.endpoint = config.AZURE_CONTENT_SAFETY_ENDPOINT
        self.key = config.AZURE_CONTENT_SAFETY_KEY
        
        # 1. Custom Messages (Positive & Helpful)
        self.custom_messages = {
            "Hate": "Let's keep our conversation respectful and inclusive. I'm here to help with positive and constructive topics.",
            "SelfHarm": "I care about your well-being. If you're going through a tough time, please consider reaching out to a professional or a trusted friend who can support you.",
            "Sexual": "I focus on professional and helpful conversations. Let's switch to a different topic—how else can I assist you today?",
            "Violence": "I promote safety and peace. Let's discuss something constructive and helpful instead.",
            "Default": "I'm unable to process that request. Let's keep our discussion positive and focused on how I can help you."
        }

        # 2. Custom Thresholds (Control sensitivity per category)
        # Severity Levels: 0 (Safe), 2 (Low), 4 (Medium), 6 (High)
        # We set 'Sexual' to 2 to block even mild/suggestive content.
        # We keep others at 4 to allow mild context (e.g., "I hate broccoli" or "The movie had a fight scene").
        self.thresholds = {
            "Hate": 4,
            "SelfHarm": 4,
            "Sexual": 2,     # <--- STRICTER THRESHOLD HERE
            "Violence": 4
        }
        
        if not self.endpoint or not self.key:
            logger.warning("Azure Content Safety credentials not found. Safety checks will be skipped.")
            self.client = None
        else:
            self.client = ContentSafetyClient(self.endpoint, AzureKeyCredential(self.key))

    async def validate_text(self, text: str) -> Dict[str, Any]:
        """
        Analyzes text for harmful content.
        Returns {'is_safe': bool, 'reason': str}
        """
        if not self.client or not text:
            return {"is_safe": True}

        try:
            request = AnalyzeTextOptions(text=text)
            
            # Run in executor
            response = await asyncio.to_thread(self.client.analyze_text, request)

            if response.categories_analysis:
                for result in response.categories_analysis:
                    # Clean up the category name: 'TextCategory.SEXUAL' -> 'Sexual'
                    category_name = str(result.category).replace("TextCategory.", "").replace("_", "").title()
                    
                    # Handle 'Self Harm' mapping
                    if "Self" in category_name and "Harm" in category_name:
                        category_name = "SelfHarm"

                    # Get the specific threshold for this category (default to 4 if not found)
                    required_threshold = self.thresholds.get(category_name, 4)

                    # Check if the detected severity meets or exceeds our limit
                    if result.severity >= required_threshold:
                        logger.warning(f"Safety Filter Triggered: {category_name} (Severity {result.severity}) >= Threshold {required_threshold}")
                        
                        # Get the polite message
                        user_message = self.custom_messages.get(category_name, self.custom_messages["Default"])

                        return {
                            "is_safe": False, 
                            "reason": user_message
                        }

            return {"is_safe": True}

        except HttpResponseError as e:
            logger.error(f"Azure Content Safety API error: {e.message}")
            return {"is_safe": True} 
        except Exception as e:
            logger.error(f"Unexpected error in content safety check: {e}")
            return {"is_safe": True}