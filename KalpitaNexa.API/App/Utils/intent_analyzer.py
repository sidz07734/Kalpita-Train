import logging
import json
import re
from typing import Dict, Any, List
from openai import AzureOpenAI

from .. import config
from . import prompts

logger = logging.getLogger(__name__)

class IntentAnalyzer:
    """
    A service to analyze user queries, detect intent, and generate related content
    using an LLM. This centralizes all direct LLM interactions for classification
    and content generation, separating them from the main business logic in ChatService.
    """
    def __init__(self, openai_client: AzureOpenAI):
        self.openai_client = openai_client
        self.current_deployment = config.AZURE_OPENAI_DEPLOYMENT_NAME_GPT35

    GREETING_KEYWORDS = ["hi", "hello", "hey", "good morning", "good afternoon", "greetings"]
    PROFESSIONAL_KEYWORDS = ["linkedin", "linked in", "professional profile", "search profiles"]
    ATTENDANCE_KEYWORDS = ["attendance", "regularization", "working hours", "login time", "present", "absent"]
    CHART_KEYWORDS = ["chart", "graph", "plot", "visualization", "visualize", "analytics"]
    HOLIDAY_KEYWORDS = [
        "holiday", "holidays", "calendar", "festival list", "public holiday", 
        "vacation list", "holiday list", "is it a holiday", "off day"
    ]

    def is_greeting(self, query: str) -> bool:
        return query.lower().strip().strip('?!.') in self.GREETING_KEYWORDS

    def is_professional_search(self, query: str) -> bool:
        return any(kw in query.lower() for kw in self.PROFESSIONAL_KEYWORDS)

    def is_attendance_query(self, query: str) -> bool:
        return any(kw in query.lower() for kw in self.ATTENDANCE_KEYWORDS)  

    def set_deployment(self, deployment_name: str):
        """Sets the OpenAI deployment to use for the analysis."""
        self.current_deployment = deployment_name

    def _extract_json_from_text(self, text: str) -> Dict[str, Any]:
        """Extracts a JSON object from a string, robust against surrounding text."""
        try:
            json_match = re.search(r'\{.*\}', text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(0))
            logger.warning(f"Could not find a JSON object in the LLM response: {text}")
            return {}
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON from LLM response: {text}. Error: {e}")
            return {}
        return {}

    async def analyze_general_intent(self, query: str) -> Dict[str, Any]:
        """Determines if a query is conversational or data-driven."""
        try:
            response = self.openai_client.chat.completions.create(
                model=self.current_deployment,
                messages=[
                    {"role": "system", "content": prompts.GENERAL_INTENT_PROMPT},
                    {"role": "user", "content": query}
                ],
                # temperature=0.3,
                # max_tokens=300
            )
            intent_text = response.choices[0].message.content
            return self._extract_json_from_text(intent_text)
        except Exception as e:
            logger.error(f"Error in analyze_general_intent: {e}", exc_info=True)
            return {"is_conversational": False, "intent": "data_driven"}

    def detect_chart_request(self, query: str) -> Dict[str, Any]:
        """Detects if a query is a request for a chart using keyword matching."""
        chart_keywords = [
            "chart", "graph", "plot", "visualization", "visualize", "visual",
            "show me a chart", "generate chart", "create graph", "display chart",
            "bar chart", "pie chart", "line chart", "analytics", "dashboard",
            "distribution", "compare visually", "doughnut chart", "scatter plot", "radar chart"
        ]
        query_lower = query.lower()

        if any(kw in query_lower for kw in chart_keywords):
            chart_type = "bar" # Default
            if "pie" in query_lower or "doughnut" in query_lower: chart_type = "pie"
            elif "line" in query_lower: chart_type = "line"
            elif "radar" in query_lower: chart_type = "radar"
            elif "scatter" in query_lower: chart_type = "scatter"

            return {"is_chart_request": True, "chart_type": chart_type}
        return {"is_chart_request": False}

    async def analyze_analytical_intent(self, query: str) -> Dict[str, Any]:
        """Classifies the query into specific analytical intents."""
        try:
            response = self.openai_client.chat.completions.create(
                model=self.current_deployment,
                messages=[
                    {"role": "system", "content": prompts.ANALYTICAL_INTENT_PROMPT},
                    {"role": "user", "content": query}
                ],
                # temperature=0.0,
                # max_tokens=250
            )
            result_text = response.choices[0].message.content
            return self._extract_json_from_text(result_text)
        except Exception as e:
            logger.error(f"Error in analyze_analytical_intent: {e}", exc_info=True)
            return {"intent": "NONE", "entities": {}}

    async def generate_follow_up_questions(self, query: str, response_summary: str, services_used: List[str]) -> List[str]:
        """Generates relevant follow-up questions."""
        try:
            prompt = prompts.FOLLOW_UP_PROMPT_TEMPLATE.format(
                query=query,
                response_summary=response_summary[:500],
                services_used=", ".join(services_used) if services_used else "none"
            )
            response_obj = self.openai_client.chat.completions.create(
                model=self.current_deployment,
                messages=[{"role": "system", "content": prompt}],
                # temperature=0.7,
                # max_tokens=200
            )
            content = response_obj.choices[0].message.content
            questions = self._extract_json_from_text(content)
            return questions.get("questions", []) if isinstance(questions, dict) else []
        except Exception as e:
            logger.error(f"Error generating follow-up questions: {e}", exc_info=True)
            return []
        
    async def analyze_aggregation_query(self, query: str) -> Dict[str, Any]:
        """Parses an aggregation query to extract structured parameters."""
        try:
            response = self.openai_client.chat.completions.create(
                model=self.current_deployment,
                messages=[
                    {"role": "system", "content": prompts.AGGREGATION_PARSE_PROMPT},
                    {"role": "user", "content": query}
                ],
                # temperature=0.0,
                # max_tokens=250
            )
            result_text = response.choices[0].message.content
            return self._extract_json_from_text(result_text)
        except Exception as e:
            logger.error(f"Error in analyze_aggregation_query: {e}", exc_info=True)
            return {}
        

    def is_holiday_query(self, query: str) -> bool:
        """Detects if the query is related to the holiday calendar."""
        query_lower = query.lower()
        return any(kw in query_lower for kw in self.HOLIDAY_KEYWORDS)