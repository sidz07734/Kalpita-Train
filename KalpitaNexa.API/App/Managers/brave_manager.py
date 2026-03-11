# app/managers/brave_manager.py
import asyncio
import logging
import re
import requests
from typing import Dict, Any, List
from openai import AzureOpenAI

from .. import config
# Import the standard Citation model for consistency
from ..Models.search_models import Citation

logger = logging.getLogger(__name__)

class BraveManager:
    """
    Manages all interactions with the Brave Search API, with specialized
    methods for general web search and targeted LinkedIn profile searches.
    """
    def __init__(self, openai_client: AzureOpenAI):
        self.openai_client = openai_client
        self.api_key = config.BRAVE_API_KEY
        self.base_url = "https://api.search.brave.com/res/v1"
        if not self.api_key:
            logger.warning("Brave API Key is not configured. Web search will be disabled.")

    async def search_web_general(self, query: str, max_results: int = 7) -> Dict[str, Any]:
        """
        Performs a GENERAL web search and returns an AI-processed summary.
        """
        if not self.api_key:
            return {"success": True, "content": "Web search is not configured.", "citations": []}
        
        try:
            logger.info(f"Performing general web search for: '{query}'")
            # ... [This part is the same as the search_web method from my previous answer] ...
            # ... [It calls the Brave API, gets results, summarizes them with AI, and returns citations] ...
            # For brevity, I'll put a simplified version here. Use the full version from before.
            
            headers = {"Accept": "application/json", "X-Subscription-Token": self.api_key}
            params = {"q": query, "count": max_results}
            response = requests.get(f"{self.base_url}/web/search", headers=headers, params=params, timeout=15)
            response.raise_for_status()
            web_results_raw = response.json().get("web", {}).get("results", [])

            if not web_results_raw:
                return {"success": True, "content": f"No web results found for '{query}'.", "citations": []}

            system_prompt = f"Answer the user's query '{query}' based ONLY on these snippets. Cite with [webX].\n\n"
            for i, res in enumerate(web_results_raw, 1):
                system_prompt += f"[web{i}] Title: {res.get('title')}\nSnippet: {res.get('description')}\n\n"
            
            # ... (AI call) ...
            content = "AI summary of general web results." # Placeholder
            citations = [] # Build citations here

            return {"success": True, "content": content, "citations": citations, "services_used": ["brave"]}

        except Exception as e:
            logger.error(f"Brave general search error: {e}", exc_info=True)
            return {"success": False, "error": str(e), "citations": []}


    async def search_linkedin_profiles(self, original_query: str, max_results: int = 5) -> Dict[str, Any]:
        """
        Performs a series of targeted searches on LinkedIn to find professional profiles
        and returns a specialized AI summary.
        """
        if not self.api_key:
            return {"success": True, "content": "LinkedIn search is not configured.", "citations": []}

        try:
            # This is the powerful multi-query strategy from your old code
            linkedin_queries = [
                f'site:linkedin.com/in/ "{original_query}"',  # Exact phrase search
                f'site:linkedin.com/in/ {original_query} "Open to work"',  # With "Open to work"
                f'site:linkedin.com/in/ {original_query}',  # Basic site search
            ]

            all_linkedin_results = []
            seen_urls = set()

            for i, linkedin_query in enumerate(linkedin_queries):
                # Add a delay BEFORE each call, but not the very first one.
                if i > 0:
                    await asyncio.sleep(1)
                if len(all_linkedin_results) >= max_results:
                    break

                logger.info(f"Executing LinkedIn strategy: {linkedin_query}")
                headers = {"Accept": "application/json", "X-Subscription-Token": self.api_key}
                params = {"q": linkedin_query, "count": max_results * 2} # Get extra to filter
                
                response = requests.get(f"{self.base_url}/web/search", headers=headers, params=params, timeout=20)
                response.raise_for_status()
                search_results = response.json().get("web", {}).get("results", [])

                for result in search_results:
                    url = result.get('url', '')
                    if "linkedin.com/in/" in url and url not in seen_urls:
                        all_linkedin_results.append(result)
                        seen_urls.add(url)
                        if len(all_linkedin_results) >= max_results:
                            break
            
            if not all_linkedin_results:
                return {
                    "success": True, 
                    "content": f"No LinkedIn profiles were found for your query: '{original_query}'. Try being more specific with job titles or skills.",
                    "citations": []
                }
            
            # Use the specialized LinkedIn summary prompt from your old code
            formatted_results = "\n\n".join([
                f"Profile {i+1}:\nName: {res.get('title', 'N/A')}\nURL: {res.get('url', 'N/A')}\nDescription: {res.get('description', 'N/A')}"
                for i, res in enumerate(all_linkedin_results)
            ])
            
            # 2. Define the specialized LinkedIn summary prompt
            summary_prompt = f"""Based on these LinkedIn profile search results, provide a summary for: "{original_query}"

LinkedIn Profiles Found:
{formatted_results}

Instructions:
1. Summarize the key candidates found with their relevant skills/experience.
2. Mention which profiles best match the query requirements.
3. Include direct links to the profiles using [webX] format for citations.
4. If a profile's description mentions "Open to work", highlight it.
"""
            
            # 3. Call the OpenAI API to generate the summary
            summary_response = self.openai_client.chat.completions.create(
                model=config.AZURE_OPENAI_DEPLOYMENT_NAME,
                messages=[
                    {"role": "system", "content": "You are a recruitment assistant helping to find and summarize LinkedIn profiles."},
                    {"role": "user", "content": summary_prompt}
                ],
                # temperature=temperature,
                # max_tokens=1500
            )
            # 4. Extract the content from the response and ensure it's not empty
            content = summary_response.choices[0].message.content
            if not content or not content.strip():
                content = "I found several LinkedIn profiles but was unable to generate a summary."
                messages=[
                    {"role": "system", "content": "You are a recruitment assistant helping to find and summarize LinkedIn profiles."},
                    {"role": "user", "content": summary_prompt}
                ],
                # temperature=temperature,
                # max_tokens=1500
            
            content = summary_response.choices[0].message.content

            # Create standard Citation objects
            citations = []
            cited_indices = {int(idx) for idx in re.findall(r'\[web(\d+)\]', content)}
            for i, res in enumerate(all_linkedin_results, 1):
                if i in cited_indices:
                    citations.append(Citation(
                        title=f"[LinkedIn] {res.get('title', 'No title')}",
                        url=res.get('url', 'No URL'),
                        content=res.get('description', ''),
                        source_type="Brave_LinkedIn"
                    ))

            return {
                "success": True,
                "response": content,
                "citations": citations,
                "services_used": ["brave_linkedin"]
            }

        except Exception as e:
            logger.error(f"Brave LinkedIn search error: {e}", exc_info=True)
            return {"success": False, "error": str(e), "citations": []}