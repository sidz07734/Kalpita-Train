# app/Managers/visualization_manager.py
"""
This manager handles all direct interactions with the OpenAI client for
visualization-specific tasks, such as converting data to Chart.js format
and analyzing user intent.
"""
import logging
import json
from typing import Dict, Any
from openai import AzureOpenAI
from .. import config
from ..Utils.visualization_helpers import clean_json_response, parse_markdown_table

logger = logging.getLogger(__name__)

class VisualizationManager:
    """Manages AI-powered visualization tasks."""

    def __init__(self, openai_client: AzureOpenAI):
        self._openai_client = openai_client
        logger.info("VisualizationManager initialized.")

    async def convert_data_to_chart_json(self, data_string: str, query: str, chart_type: str) -> Dict[str, Any]:
        """
        Converts a raw data string (like a Markdown table) into a valid
        Chart.js JSON object.
        """
        logger.info(f"Attempting to convert data string to chart JSON for query: '{query}'")

        # First, try a reliable non-AI method to parse Markdown tables
        parsed_table = parse_markdown_table(data_string)
        if parsed_table:
            logger.info("Successfully parsed data as a Markdown table. Building JSON directly.")
            return self._build_chart_from_parsed_table(parsed_table, query, chart_type)

        # If it's not a table, use AI as a fallback to interpret the data
        logger.warning("Data is not a standard Markdown table. Using AI to interpret raw data.")
        return await self._build_chart_with_ai(data_string, query, chart_type)

    def _build_chart_from_parsed_table(self, parsed_table: dict, query: str, chart_type: str) -> Dict[str, Any]:
        """Builds a Chart.js object from pre-parsed table data without an AI call."""
        labels = parsed_table.get("labels", [])
        data = parsed_table.get("data", [])
        dataset_label = parsed_table.get("header", ["", "Value"])[1]

        options = {
            "responsive": True, "maintainAspectRatio": False,
            "plugins": {
                "legend": {"display": True, "position": "top"},
                "title": {"display": True, "text": query}
            }
        }
        if chart_type not in ['pie', 'doughnut']:
            options["scales"] = {"y": {"beginAtZero": True}}

        return {
            "chart_type": chart_type, "title": query, "labels": labels,
            "datasets": [{
                "label": dataset_label, "data": data,
                "backgroundColor": ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40", "#C9CBCF"],
                "borderWidth": 1
            }],
            "options": options
        }

    async def _build_chart_with_ai(self, data_string: str, query: str, chart_type: str) -> Dict[str, Any]:
        """Uses an AI call to convert unstructured data into a Chart.js object."""
        prompt = f"""You are a data visualization expert. Convert the following data into a valid Chart.js JSON object based on the user's query.

User Query: "{query}"
Requested Chart Type: "{chart_type if chart_type != 'auto' else 'bar'}"

Data:
{data_string}

CRITICAL:
1. Your response MUST be ONLY the valid JSON object. Do not include explanations or markdown.
2. Do NOT use placeholder or fake data. If the provided data is insufficient, return an empty JSON object: {{}}."""
        
        try:
            response = self._openai_client.chat.completions.create(
                model=config.AZURE_OPENAI_DEPLOYMENT_NAME,
                messages=[{"role": "user", "content": prompt}],
                # temperature=0.1, 
                # max_tokens=2000
            )
            json_string = clean_json_response(response.choices[0].message.content)
            return json.loads(json_string)
        except Exception as e:
            logger.error(f"Failed to build chart with AI: {e}")
            return {}