# app/utils/translator_service.py
import logging
from typing import Optional

from azure.core.credentials import AzureKeyCredential
from azure.ai.translation.text import TextTranslationClient
from .. import config

logger = logging.getLogger("translator_service")

class TranslatorService:
    """A self-contained utility class for text translation using Azure AI Services."""
    def __init__(self):
        """Initializes the Translator Service client."""
        self.text_translator = None
        if not config.AZURE_TRANSLATOR_ENDPOINT or not config.AZURE_TRANSLATOR_KEY:
            logger.warning("Azure Translator endpoint or key is not configured. Translation service will be disabled.")
            return
            
        try:
            self.text_translator = TextTranslationClient(
                endpoint=config.AZURE_TRANSLATOR_ENDPOINT,
                credential=AzureKeyCredential(config.AZURE_TRANSLATOR_KEY),
                region= config.AZURE_TRANSLATOR_REGION
            )
            logger.info("Translator service initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize Azure Translator service: {e}")
            self.text_translator = None

    async def translate(self, text: str, to_language: str, from_language: Optional[str] = None) -> str:
        """
        Translates a single string of text to a target language.

        Args:
            text: The text to be translated.
            to_language: The ISO 639-1 code for the target language (e.g., 'es', 'fr').
            from_language: Optional. The ISO 639-1 code for the source language. Auto-detected if not provided.

        Returns:
            The translated text, or the original text if translation fails.
        """
        if not self.text_translator:
            logger.error("Translator client not initialized. Returning original text.")
            return text
        
        if not text or not to_language:
            return text

        try:
            logger.info(f"Translating text from '{from_language or 'auto'}' to '{to_language}': '{text[:50]}...'")
            
            # The translate method expects a list of strings
            # Pass from_language only if it's provided, otherwise omit it to let Azure auto-detect
            if from_language:
                response = self.text_translator.translate(body=[text], to_language=[to_language], from_language=from_language)
            else:
                response = self.text_translator.translate(body=[text], to_language=[to_language])
            
            # The response is a list, one item for each string in the input content
            translation_result = response[0] if response else None

            if translation_result and translation_result.translations:
                translated_text = translation_result.translations[0].text
                detected_lang = translation_result.detected_language
                if detected_lang:
                    logger.info(f"Translation successful. Detected source: {detected_lang.language} (Score: {detected_lang.score})")
                else:
                    logger.info("Translation successful.")
                return translated_text
            
            logger.warning("Translation response was empty or invalid. Returning original text.")
            return text

        except Exception as e:
            logger.error(f"Error during translation: {e}", exc_info=True)
            return text # Return original text on any error to prevent crashes