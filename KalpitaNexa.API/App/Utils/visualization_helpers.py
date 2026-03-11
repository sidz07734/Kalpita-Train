# app/Utils/visualization_helpers.py
"""
Helper functions for the Visualization Service, responsible for parsing
natural language queries into structured chart requests and cleaning data.
"""
import re
import json
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

def parse_dashboard_query(query: str) -> List[Dict[str, str]]:
    """
    Parses a natural language query to extract multiple chart requests.
    Example: "Show me skills in a bar chart and experience in a pie chart"
    """
    logger.info(f"Parsing dashboard query: '{query}'")
    
    chart_types = {
        'bar chart': 'bar', 'bar': 'bar', 'pie chart': 'pie', 'pie': 'pie',
        'line chart': 'line', 'line': 'line', 'doughnut chart': 'doughnut',
        'donut chart': 'doughnut', 'donut': 'doughnut', 'radar chart': 'radar',
        'radar': 'radar', 'scatter chart': 'scatter', 'scatter': 'scatter'
    }
    
    requests = []
    request_id = 1
    
    # Split query by conjunctions like "and" or "also"
    segments = re.split(r'\s+(?:and|also|as well as)\s+', query, flags=re.IGNORECASE)
    
    for segment in segments:
        segment = segment.strip()
        found_chart_type = None
        chart_keyword_found = None

        for keyword, chart_type in chart_types.items():
            if re.search(r'\b' + re.escape(keyword) + r'\b', segment, re.IGNORECASE):
                found_chart_type = chart_type
                chart_keyword_found = keyword
                break
        
        if found_chart_type:
            # Extract the part of the query before the chart keyword
            request_text = re.split(r'\s+in an?|\s+as an?', segment, flags=re.IGNORECASE)[0]
            request_text = request_text.replace(chart_keyword_found, '').strip()
            
            # Clean common leading phrases
            request_text = re.sub(r'^(show|give|provide|create|generate|display)\s+(me\s+)?(a\s+|an\s+)?', '', request_text, flags=re.IGNORECASE).strip()

            if request_text:
                requests.append({
                    'chart_query': request_text,
                    'chart_type': found_chart_type,
                    'chart_id': f'chart_{request_id}'
                })
                logger.info(f"Parsed chart request {request_id}: '{request_text}' as type '{found_chart_type}'")
                request_id += 1

    return requests

def clean_json_response(response: str) -> str:
    """Cleans a string to extract a valid JSON object."""
    # Remove markdown code blocks
    response = re.sub(r'```json\s*', '', response)
    response = re.sub(r'```\s*', '', response)
    
    # Find the first '{' and the last '}'
    json_start = response.find('{')
    json_end = response.rfind('}') + 1
    
    if json_start != -1 and json_end > json_start:
        return response[json_start:json_end]
    return "{}" # Return empty JSON if not found

def parse_markdown_table(table_string: str) -> dict:
    """Parses a simple two-column Markdown table into structured data."""
    try:
        lines = [line.strip() for line in table_string.strip().split('\n') if line.strip().startswith('|')]
        if len(lines) < 3: return {}

        header = [h.strip() for h in lines[0].split('|') if h.strip()]
        if len(header) != 2: return {}

        labels, data = [], []
        for row_str in lines[2:]:
            cols = [col.strip() for col in row_str.split('|') if col.strip()]
            if len(cols) == 2:
                labels.append(cols[0])
                try:
                    num_val = float(cols[1])
                    data.append(int(num_val) if num_val.is_integer() else num_val)
                except ValueError:
                    continue # Skip rows where the second column isn't a number
        
        if not labels or not data: return {}
        return {"labels": labels, "data": data, "header": header}
    except Exception:
        return {}