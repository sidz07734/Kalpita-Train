# app/services/chat_service.py
import decimal
from functools import lru_cache
import logging
import asyncio
import json
import datetime # Make sure this is imported
from typing import Dict, Any, List, Optional
from urllib.parse import quote

from openai import AzureOpenAI, AsyncAzureOpenAI
from .. import config
from ..Managers.sharepoint_manager import SharePointManager
from ..Managers.sql_search_manager import SqlSearchManager
from ..Managers.brave_manager import BraveManager
from ..Managers.chat_manager import ChatManager
from ..Managers.policy_manager import PolicyManager
from ..Utils.translator_service import TranslatorService
from ..Utils.intent_analyzer import IntentAnalyzer
from ..Utils import prompts
from ..Models.chat_models import Citation, TokenUsage
from ..Managers.attendance_db_manager import AttendanceDbManager
from ..Managers.content_safety_manager import ContentSafetyManager
from ..Managers.holiday_manager import HolidayManager
from ..Services.training_service import TrainingService
from ..Managers.training_sharepoint_manager import TrainingSharePointManager


logger = logging.getLogger(__name__)

class ChatService:
    def __init__(
        self,
        openai_client: AzureOpenAI,
        sharepoint_manager: SharePointManager,
        sql_search_manager: SqlSearchManager,
        brave_manager: BraveManager,
        translator_service: TranslatorService,
        intent_analyzer: IntentAnalyzer,
        chat_manager :ChatManager,
        policy_manager: PolicyManager,
        attendance_db_manager:AttendanceDbManager,
        content_safety_manager: ContentSafetyManager,
        holiday_manager: HolidayManager,
        training_service: TrainingService
    ):
        self.openai_client = openai_client
        # Async client for streaming — same credentials as sync client
        self.async_openai_client = AsyncAzureOpenAI(
            api_key=config.AZURE_OPENAI_API_KEY,
            azure_endpoint=config.AZURE_OPENAI_ENDPOINT,
            api_version=config.AZURE_OPENAI_API_VERSION
        )
        self.sharepoint_manager = sharepoint_manager
        self.sql_search_manager = sql_search_manager
        self.brave_manager = brave_manager
        self.policy_manager = policy_manager
        self.translator_service = translator_service
        self.intent_analyzer = intent_analyzer
        self.attendance_db_manager = attendance_db_manager
        self.content_safety_manager = content_safety_manager
        self.holiday_manager = holiday_manager
        self.chat_manager = chat_manager
        self.training_service = training_service



    async def _prepare_chat_context(
        self,
        message: str,
        app_id: int,
        client_id: Optional[str] = None,
        user_id_token: Optional[str] = None,
        data_sources: Optional[List[str]] = None,
        debug_mode: bool = False,
        user_role: Optional[str] = None,
        user_email: Optional[str] = None,
        model_deployment: str = "o3-mini",
        tenant_id: str = None, 
        skip_chart_detection: bool = False
    ) -> Dict[str, Any]:
        """
        Shared pre-processing used by both process_chat() and process_chat_stream().

        Runs all checks (token, safety, greeting, chart, routing, data fetch, intent)
        and returns one of two shapes:

        Short-circuit (no LLM synthesis needed):
            { "short_circuit": True, "result": <final dict ready to return/stream> }

        Ready for synthesis (LLM call still needed):
            {
                "short_circuit": False,
                "intent": str,              # "AGGREGATION_RANKING" | "PROBABILITY" | ... | "NONE"
                "app_name": str,
                "search_result": dict,      # raw data from managers
                "analytical_intent": dict,  # full intent payload
                "user_role": str,
                "user_email": str,
            }
        """
        # ── TOKEN CHECK ───────────────────────────────────────────────────────
        token_status = await self.chat_manager.check_token_status_db(user_email, app_id)
        if not token_status["allowed"]:
            return {"short_circuit": True, "result": {
                "success": False, "response": None,
                "error": token_status["message"],
                "citations": [], "is_visualization": False, "follow_up_questions": []
            }}

        app_name = self._get_app_name_from_db(app_id)
        logger.info(f"Processing request for AppId: {app_id} (Name: {app_name})")

        # ── CONTENT SAFETY ────────────────────────────────────────────────────
        safety_result = await self.content_safety_manager.validate_text(message)
        if not safety_result["is_safe"]:
            return {"short_circuit": True, "result": {
                "success": False, "response": safety_result["reason"],
                "citations": [], "services_used": ["azure_content_safety"],
                "is_visualization": False, "follow_up_questions": []
            }}

        self.intent_analyzer.set_deployment(model_deployment)

        # ── GREETING ──────────────────────────────────────────────────────────
        if self.intent_analyzer.is_greeting(message):
            return {"short_circuit": True, "result": {
                "success": True, "response": prompts.GREETING_RESPONSE,
                "citations": [], "services_used": ["greeting"],
                "is_visualization": False, "follow_up_questions": []
            }}

        # ── CHART DETECTION ───────────────────────────────────────────────────
        if not skip_chart_detection:
            chart_intent = self.intent_analyzer.detect_chart_request(message)
            if chart_intent.get("is_chart_request"):
                logger.info(f"Chart request detected: {chart_intent.get('chart_type')}")
                return self._build_visualization_response(chart_intent.get("chart_type", "bar"))

        # ── APP ROUTING & DATA FETCH ──────────────────────────────────────────
        search_result = {"success": True, "citations": [], "response": "", "services_used": []}

        if "policy" in app_name:
            if self.intent_analyzer.is_holiday_query(message):
                logger.info("App 19: Holiday Intent detected. Fetching data.")
                search_result = await self.holiday_manager.search_holidays(message, app_id)

            elif self.intent_analyzer.is_attendance_query(message):
                logger.info("App 19: Attendance Intent detected. Routing to Attendance Flow.")
                att_result = await self._handle_attendance_flow(message, app_id, user_email)
                return {"short_circuit": True, "result": att_result}

            
            else:
                logger.info("App 19: General Policy Search.")
                search_result = await self.policy_manager.search_policies(message, app_id, is_attendance=False)

        elif "recruit" in app_name:
            if self.intent_analyzer.is_professional_search(message):
                logger.info("App Recruit: LinkedIn Search Intent detected.")
                result = await self.brave_manager.search_linkedin_profiles(original_query=message)
                linkedin_result = await self._build_final_response(message, result)
                return {"short_circuit": True, "result": linkedin_result}
            else:
                logger.info("App Recruit: Standard Recruit search.")
                search_result = await self._handle_standard_data_query(
                    message, app_id, data_sources or ["all"], user_role, user_email
                )
        elif "training" in app_name.lower():
            return {"short_circuit": True, "result": await self._handle_training_query(message)}
        else:
            return {"short_circuit": True, "result": {
                "success": False,
                "response": "This application is not recognized or configured for data search."
            }}

        # ── STRICT CHECK (no citations = no synthesis) ────────────────────────
        if not search_result.get("citations"):
            return {"short_circuit": True, "result": {
                "success": True,
                "response": "I'm sorry, I couldn't find any information related to your request in the official records for this application.",
                "citations": [], "services_used": search_result.get("services_used", [])
            }}

        # ── ANALYTICAL INTENT ─────────────────────────────────────────────────
        analytical_intent = await self.intent_analyzer.analyze_analytical_intent(message)
        intent = analytical_intent.get("intent", "NONE")

        # Aggregation and heavy analytical paths resolve fully here (no streaming benefit)
        if intent == "AGGREGATION_RANKING" and "recruit" in app_name:
            logger.info("App 18: Statistical query detected. Routing to Recruit SQL Aggregation.")
            result = await self._handle_aggregation_query(message, user_role)
            result["citations"] = [c.model_dump() if hasattr(c, 'model_dump') else c for c in result.get("citations", [])]
            final = await self._build_final_response(message, result)
            return {"short_circuit": True, "result": final}

        elif intent in ["PROBABILITY", "COMPARISON_MATCH", "SUMMARY"]:
            logger.info(f"App {app_id}: Analytical Intent '{intent}' detected.")
            result = await self._handle_analytical_query_with_data(
                query=message,
                intent_result=analytical_intent,
                raw_data_result=search_result,
                user_role=user_role,
                user_email=user_email
            )
            result["citations"] = [c.model_dump() if hasattr(c, 'model_dump') else c for c in result.get("citations", [])]
            final = await self._build_final_response(message, result)
            return {"short_circuit": True, "result": final}

        # ── NEEDS SYNTHESIS ───────────────────────────────────────────────────
        # Only strict synthesis reaches here — this is the path that benefits from streaming
        logger.info(f"App {app_id}: Using strict synthesis from index data.")
        return {
            "short_circuit": False,
            "app_name": app_name,
            "search_result": search_result,
            "analytical_intent": analytical_intent,
            "intent": intent,
            "user_role": user_role,
            "user_email": user_email,
        }

    async def process_chat(
        self,
        message: str,
        app_id: int,
        client_id: Optional[str] = None,
        user_id_token: Optional[str] = None,
        data_sources: Optional[List[str]] = None,
        debug_mode: bool = False,
        user_role: Optional[str] = None,
        user_email: Optional[str] = None,
        model_deployment: str = "o3-mini"
    ) -> Dict[str, Any]:
        """Orchestrates the chat process. Calls _prepare_chat_context() for all shared
        pre-processing, then runs the final LLM synthesis and returns a complete response."""
        try:
            ctx = await self._prepare_chat_context(
                message=message, app_id=app_id, client_id=client_id,
                user_id_token=user_id_token, data_sources=data_sources,
                debug_mode=debug_mode, user_role=user_role,
                user_email=user_email, model_deployment=model_deployment
            )

            # Short-circuit: result is already fully built, return it directly
            if ctx["short_circuit"]:
                return ctx["result"]

            # Synthesis path: run the LLM call and build final response
            result = await self._handle_strict_synthesis(message, ctx["search_result"])

            citations_list = result.get("citations", [])
            if citations_list:
                result["citations"] = [
                    c.model_dump() if hasattr(c, 'model_dump') else c for c in citations_list
                ]

            return await self._build_final_response(message, result)

        except Exception as e:
            logger.error(f"Chat processing error: {e}", exc_info=True)
            return self._build_error_response(str(e))

    async def process_chat_stream(
        self,
        message: str,
        app_id: int,
        client_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        user_id_token: Optional[str] = None,
        data_sources: Optional[List[str]] = None,
        debug_mode: bool = False,
        user_role: Optional[str] = None,
        user_email: Optional[str] = None,
        model_deployment: str = "o3-mini"
    ):
        """
        Streaming version of process_chat. Reuses _prepare_chat_context() for all
        pre-processing, then streams the final LLM synthesis chunk by chunk via SSE.

        SSE event types:
          {"type": "meta",  "citations": [...], "services_used": [...]}   <- before first token
          {"type": "chunk", "content": "..."}                             <- one per token
          {"type": "done",  "message_id": "...", "usage": {...}}          <- stream complete
          {"type": "error", "message": "..."}                             <- on failure
        """
        def _sse(payload: dict) -> str:
            return f"data: {json.dumps(payload)}\n\n"

        try:
            ctx = await self._prepare_chat_context(
                message=message, app_id=app_id, client_id=client_id,
                user_id_token=user_id_token, data_sources=data_sources,
                debug_mode=debug_mode, user_role=user_role,
                user_email=user_email, model_deployment=model_deployment
            )

            # Short-circuit: emit the pre-built result as SSE events, no streaming
            if ctx["short_circuit"]:
                result = ctx["result"]
                citations = [c.model_dump() if hasattr(c, 'model_dump') else c for c in result.get("citations", [])]
                yield _sse({
                    "type": "meta",
                    "citations": citations,
                    "services_used": result.get("services_used", []),
                    "is_visualization": result.get("is_visualization", False),
                    "visualization_suggestion": result.get("visualization_suggestion"),
                    "message_type": result.get("message_type"),
                    "audio_url": result.get("audio_url"),
                    "audio_topic": result.get("audio_topic"),
                    "audio_session": result.get("audio_session"),
                    "short_url": result.get("short_url"),
                    "short_title": result.get("short_title"),
                    "short_session": result.get("short_session"),
                    "shorts_list": result.get("shorts_list"),
                    "response": result.get("response"),
                })
                yield _sse({"type": "chunk", "content": result.get("response") or result.get("error") or ""})
                yield _sse({"type": "done", "message_id": None, "usage": None})
                return

            # Synthesis path: stream the LLM response token by token
            search_result = ctx["search_result"]
            citations = [c.model_dump() if hasattr(c, 'model_dump') else c for c in search_result.get("citations", [])]

            # Send citations and services BEFORE the first token arrives
            yield _sse({
                "type": "meta",
                "citations": citations,
                "services_used": search_result.get("services_used", [])
            })

            context = search_result.get("response", "") or search_result.get("content", "")
            system_content = prompts.STRICT_SYNTHESIS_PROMPT.format(context_text=context)

            # Stream the OpenAI call
            full_response = ""
            prompt_tokens = 0
            completion_tokens = 0

            async with await self.async_openai_client.chat.completions.create(
                model=self.intent_analyzer.current_deployment,
                messages=[
                    {"role": "system", "content": system_content},
                    {"role": "user", "content": message}
                ],
                stream=True
            ) as stream:
                async for chunk in stream:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta
                    if delta and delta.content:
                        text = delta.content
                        full_response += text
                        yield _sse({"type": "chunk", "content": text})
                    if hasattr(chunk, "usage") and chunk.usage:
                        prompt_tokens = chunk.usage.prompt_tokens or 0
                        completion_tokens = chunk.usage.completion_tokens or 0

            # Save to DB after stream is complete
            message_id = None
            if not debug_mode and user_id_token:
                if prompt_tokens:
                    pt, rt = prompt_tokens, completion_tokens
                else:
                    from App.Utils.common import count_tokens
                    pt = count_tokens(message)
                    rt = count_tokens(full_response)

                db_result = await self.chat_manager.insert_message(
                    user_id=user_id_token,
                    tenant_id=tenant_id or "",
                    client_id=client_id,
                    app_id=app_id,
                    user_message=message,
                    ai_response=full_response,
                    prompt_tokens=pt,
                    response_tokens=rt,
                    visibility="private"
                )
                if db_result.get("success"):
                    message_id = db_result.get("message_id")

            usage_data = {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens
            } if prompt_tokens else None

            yield _sse({"type": "done", "message_id": message_id, "usage": usage_data})

        except Exception as e:
            logger.error(f"Streaming chat error: {e}", exc_info=True)
            yield _sse({"type": "error", "message": str(e)})    


    @lru_cache(maxsize=128)
    def _get_app_name_from_db(self, app_id: int) -> str:
        """Fetches the application name to ensure environment-safe routing."""
        try:
            with config.get_sql_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT ApplicationName FROM dbo.Application WHERE AppId = ?", app_id)
                row = cursor.fetchone()
                return row.ApplicationName.lower() if row else "unknown"
        except Exception as e:
            logger.error(f"Error fetching app name for ID {app_id}: {e}")
            return "unknown"

    async def _handle_aggregation_query(self, query: str, user_role: Optional[str]) -> Dict[str, Any]:
        """Handles aggregation queries by calling the SQL manager for direct DB execution."""
        # logger.info("Handling as an aggregation query.")
        agg_params = await self.intent_analyzer.analyze_aggregation_query(query)
        if not agg_params.get("date_filter_field"):
            return {"success": False, "response": "I couldn't determine the parameters for your aggregation request. Please specify a time frame."}

        db_result = await self.sql_search_manager.perform_direct_db_aggregation(
            group_by_field=agg_params.get("group_by_field"),
            date_filter_field=agg_params.get("date_filter_field"),
            time_period=agg_params.get("time_period")
        )

        if not db_result.get("success"):
            return {"success": False, "response": f"Failed to perform aggregation: {db_result.get('error')}"}

        # Format the structured result into a user-friendly Markdown table
        if db_result["type"] == "simple":
            response_text = f"The total count is: **{db_result['data']['total_count']}**."
        else: # Grouped
            header = db_result["data"][0]['value'].capitalize() if db_result["data"] else "Category"
            response_text = f"Here is the breakdown by **{header}**:\n\n| {header} | Count |\n|---|---|\n"
            for item in db_result["data"]:
                response_text += f"| {item['value']} | {item['count']} |\n"

        return {
            "success": True, "response": response_text,
            "citations": [Citation(title="Aggregated from Recruitment DB", source_type="SQL")],
            "services_used": ["sql", "analytical_engine"]
        }

    async def _handle_standard_data_query(self, message: str, app_id: int, data_sources: List[str], user_role: str, user_email: str) -> Dict[str, Any]:
        """Handles searches strictly based on the App context."""
        tasks = []
        app_name = self._get_app_name_from_db(app_id)

        # --- FIX: Define what "all" means for each specific app ---
        search_sources = []
        if "all" in [ds.lower() for ds in data_sources]:
            if "policy" in app_name:
                search_sources = ["kalpitapolicy"] # Policy App "All" = Policy Index
            elif "recruit" in app_name:
                search_sources = ["sql", "sharepoint"] # Recruit App "All" = SQL + SP
        else:
            search_sources = data_sources
        
        for source in search_sources:
            if source == "sql":
                tasks.append(self.sql_search_manager.search_candidates(query=message, max_results=10,  app_id=app_id, user_role=user_role, user_email=user_email))
            
            elif source == "sharepoint":
                tasks.append(self.sharepoint_manager.search_documents(query=message, app_id=app_id, max_results=10))
            
            # --- THIS IS THE KEY ADDITION ---
            elif source == "kalpitapolicy":
                tasks.append(self.policy_manager.search_policies(
                    query=message,
                    app_id=app_id,
                    max_results=5,
                    # temperature=0.7
                ))
            elif source == "brave":
                tasks.append(self.brave_manager.search_web_general(
                    query=message,
                    max_results=5,
                    # temperature=0.5 
                ))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        # logger.info(f"results is {results}")
        combined_response = ""
        all_citations = []
        services_used = []
        for res in results:
        # Handle exceptions
            if isinstance(res, Exception):
                logger.error(f"Search task failed: {res}")
                continue

            # Normalize to dict: Handle Pydantic models and plain dicts
            if hasattr(res, 'model_dump'):
                res_dict = res.model_dump()
            elif isinstance(res, dict):
                res_dict = res
            else:
                logger.warning(f"Unexpected result type: {type(res)}, skipping.")
                continue

            if res_dict.get("success"):
                content = res_dict.get("content", "")
                if content:
                    combined_response += content.strip() + "\n\n"

                # Extract citations
                citations_from_manager = res_dict.get("citations", [])
                if citations_from_manager:
                    # Convert each item in the list to a dictionary
                    # This handles both Pydantic models and existing dicts safely
                    all_citations.extend(
                        c.model_dump() if hasattr(c, 'model_dump') else c for c in citations_from_manager
                    )

                # Extract services_used
                source_services = res_dict.get("services_used", [])
                if not source_services:
                    source_type = res_dict.get("source_type")
                    if source_type:
                        source_services = [source_type]
                    else:
                        source_services = ["unknown"]
                services_used.extend(source_services)

        # logger.info(f"Combined response:\n{combined_response}")
        logger.info(f"Collected {len(all_citations)} citations from {len(services_used)} services")

        if not combined_response.strip():
            return await self._handle_conversational_query(message)

        return {
            "success": True,
            "response": combined_response.strip(),
            "citations": all_citations,
            "services_used": list(set(services_used))
        }

    async def _handle_conversational_query(self, message: str) -> Dict[str, Any]:
        """Handles a purely conversational query using the LLM with a detailed system prompt."""
        response = self.openai_client.chat.completions.create(
            model=self.intent_analyzer.current_deployment,
            messages=[
                {"role": "system", "content": prompts.CONVERSATIONAL_PROMPT},
                {"role": "user", "content": message}
            ]
        )
        # logger.info ("response genrated")
        usage = TokenUsage.model_validate(response.usage.model_dump()) if response.usage else None
        return {"response": response.choices[0].message.content, "citations": [], "services_used": ["conversational"], "usage": usage}

    async def _build_final_response(self, original_message: str, result: Dict[str, Any]) -> Dict[str, Any]:
        """Assembles the final response object, adding follow-up questions."""
        citations_list = result.get("citations", [])
        
        # 2. Create a new list, converting every item into a dictionary.
        formatted_citations = [
            c.model_dump() if hasattr(c, 'model_dump') else c for c in citations_list
        ]
        
        # --- FIX START: Handle both 'response' and 'content' keys ---
        final_text = result.get("response") or result.get("content")
        # logger.info(f'data is:{final_text}')
        # --- FIX END ---

        follow_up_questions = await self.intent_analyzer.generate_follow_up_questions(
            query=original_message,
            response_summary=final_text, # Pass the resolved text here
            services_used=result.get("services_used", [])
        )
        
        return {
            "success": result.get("success", True), 
            "response": final_text, # Use the resolved text here
            "citations": formatted_citations, 
            "error": result.get("error"),
            "is_visualization": False, 
            "follow_up_questions": follow_up_questions,
            "services_used": result.get("services_used", []), 
            "usage": result.get("usage"),
            "message_type": result.get("message_type"),        # ← add this
            "audio_url": result.get("audio_url"),              # ← add this
            "audio_topic": result.get("audio_topic"),          # ← add this
            "audio_session": result.get("audio_session"),
            "short_url": result.get("short_url"),       # ← add here
            "short_title": result.get("short_title"),   # ← add here
            "short_session": result.get("short_session"),
            "shorts_list": result.get("shorts_list"),
        }

    # async def get_chats(self, **kwargs) -> Dict[str, Any]:
    #     """Service method to fetch chat history by delegating to the manager."""
    #     return await self.chat_manager.get_chats(**kwargs)

    async def update_feedback(self, **kwargs) -> Dict[str, Any]:
        """Service method to update chat feedback."""
        return await self.chat_manager.update_message_feedback(**kwargs)

    async def translate_text(self, text: str, to_language: str, from_language: Optional[str] = None) -> str:
        """Service method for translation."""
        return await self.translator_service.translate(text, to_language, from_language)

    # All public approval methods would go here, calling the corresponding chat_manager methods
    async def request_public_approval(self, **kwargs):
        return await self.chat_manager.request_public_approval(**kwargs)

    async def process_public_approval(self, **kwargs):
        return await self.chat_manager.process_public_approval(**kwargs)
        
    async def get_pending_public_approvals(self, **kwargs):
        return await self.chat_manager.get_pending_public_approvals(**kwargs)
    
    # Add to chat_service.py

    async def get_question_manager_chats(
        self,
        user_id: str,
        tenant_id: str,
        app_id: int,
        date_filter: Optional[str] = 'all',
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Retrieves chat history specifically for the Question Manager application.
        Delegates to the ChatManager which executes spGetFilteredPromptMessages with category='question_manager'.
        """
        try:
            # logger.info(f"Fetching Question Manager chats for user {user_id} in tenant {tenant_id}, app {app_id}")
            
            result = await self.chat_manager.get_chats(
                user_id=user_id,
                tenant_id=tenant_id,
                app_id=app_id,
                category='question_manager',
                date_filter=date_filter,
                start_date=start_date,
                end_date=end_date
            )
            
            if not result.get("success"):
                return result
                
            return {
                "success": True,
                "total_chats": result.get("total_chats", 0),
                "history": result.get("history", [])
            }
            
        except Exception as e:
            logger.error(f"Error in get_question_manager_chats: {str(e)}", exc_info=True)
            return {"success": False, "error": "Failed to retrieve Question Manager chats."}
    

    def _build_visualization_response(self, chart_type: str) -> Dict[str, Any]:
        """
        Builds the specific, structured response for a visualization request.

        This response format is designed to be interpreted by the frontend to
        trigger a separate API call to the visualization endpoint, passing along
        the original user query.

        Args:
            chart_type: The type of chart detected (e.g., 'bar', 'pie').

        Returns:
            A dictionary formatted for a visualization trigger.
        """
        # logger.info(f"Building visualization trigger response for chart type: {chart_type}")
        return {
            "success": True,
            "response": f"Understood. I will generate a {chart_type} chart for you. Please wait a moment while I prepare the visualization.",
            "citations": [],
            "is_visualization": True,
            "visualization_suggestion": f"chart_type:{chart_type}",
            "follow_up_questions": [],
            "services_used": ["visualization_intent"]
        }
    def _build_error_response(self, error_message: str) -> Dict[str, Any]:
        """Builds a standardized error response."""
        return {
            "success": False,
            "response": "I'm sorry, I encountered an error. Please try again later.",
            "citations": [], "error": f"Chat error: {error_message}",
            "is_visualization": False, "follow_up_questions": [], "services_used": []
        }
    async def _handle_analytical_query_with_data(self,query: str,intent_result: Dict,raw_data_result: Dict[str, Any],user_role: Optional[str],user_email: Optional[str]
    ) -> Dict[str, Any]:
        """
        Performs analytical reasoning (PROBABILITY, SUMMARY, etc.)
        using ALREADY FETCHED data from _handle_standard_data_query.
        No duplicate DB calls.
        """
        intent = intent_result.get("intent")
        entities = intent_result.get("entities", {})
        candidate_name = entities.get("candidate_name")
        requisition_id = entities.get("requisition_id")

        # Extract from pre-fetched result
        combined_text = raw_data_result.get("response", "")
        citations = raw_data_result.get("citations", [])
        services_used = raw_data_result.get("services_used", []).copy()
        services_used.append("analytical_engine")

        # Optional: Try to extract structured candidate/resume if needed
        # candidate_data = "Not extracted."
        # resume_data = "Not extracted."
        # jd_data = "Not extracted."

        # You can enhance this later with parsing logic if needed
        # For now, pass full context
        context_data = combined_text

        try:
            prompt_template = prompts.ANALYTICAL_PROMPTS.get(intent)
            if not prompt_template:
                return {
                    "success": False,
                    "response": "I recognized the intent but don't have a specialized response for it.",
                    "citations": citations,
                    "services_used": services_used
                }

            final_prompt = prompt_template.format(
                query=query,
                candidate_name=candidate_name or "N/A",
                context_data=context_data,
                requisition_id=requisition_id or "N/A"
            )

            # logger.info(f"Running analytical synthesis for intent: {intent}")
            response = self.openai_client.chat.completions.create(
                model=self.intent_analyzer.current_deployment,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a world-class recruitment analyst. Use ONLY the provided context. "
                                   "Structure your answer clearly. Do not hallucinate."
                    },
                    {"role": "user", "content": final_prompt}
                ],
                # temperature=0.4,
                # max_tokens=2000
            )

            return {
                "success": True,
                "response": response.choices[0].message.content,
                "citations": citations,
                "services_used": services_used,
                "usage": TokenUsage.model_validate(response.usage.model_dump()) if response.usage else None
            }

        except Exception as e:
            logger.error(f"Error in analytical synthesis: {e}", exc_info=True)
            return {
                "success": False,
                "response": "I couldn't complete the analysis due to an internal error.",
                "error": str(e),
                "citations": citations,
                "services_used": services_used
            }
        
    

    async def _handle_attendance_flow(self, query: str, app_id: int, user_email: str) -> Dict[str, Any]:
        try:

            full_roster = await self.policy_manager.get_flat_attendance_roster(user_email)
            if not full_roster:
                return {"success": True, "response": f"I couldn't find an employee profile for {user_email}."}
            

            extracted_start, extracted_end = None, None
            try:
                date_prompt = prompts.DATE_EXTRACTION_PROMPT.format(
                    current_date=datetime.date.today().strftime("%Y-%m-%d"), query=query
                )
                d_res = self.openai_client.chat.completions.create(model="o3-mini", messages=[{"role": "user", "content": date_prompt}])
                d_json = json.loads(d_res.choices[0].message.content.strip())
                extracted_start, extracted_end = d_json.get("start_date"), d_json.get("end_date")
            except: pass


            employees_for_sql = [{"EmployeeId": e["Employee Code"], "Name": e["Name"]} for e in full_roster]
            raw_logs = await asyncio.to_thread(
                self.attendance_db_manager.get_bulk_attendance,
                employees=employees_for_sql,
                start_date=extracted_start,
                end_date=extracted_end
            )

            # 4. ATTACH RAW LOGS
            for record in full_roster:
                log = next((a for a in raw_logs if a["EmployeeId"] == record["Employee Code"]), None)
                record["attendance_records"] = log["Data"] if log else []

            # Technical Fix: SQL Decimals -> Floats for JSON
            def dec_default(obj):
                if isinstance(obj, decimal.Decimal): return float(obj)
                raise TypeError

            final_prompt = prompts.ATTENDANCE_RESPONSE_PROMPT.replace(
                "{requester_email}", user_email
            ).replace(
                "{context_str}", json.dumps(full_roster, default=dec_default)
            )

            response = self.openai_client.chat.completions.create(
                model=config.AZURE_OPENAI_DEPLOYMENT_NAME,
                messages=[
                    {"role": "system", "content": final_prompt},
                    {"role": "user", "content": query}
                ]
            )

            return {
                "success": True,
                "response": response.choices[0].message.content,
                "citations": [],
                "services_used": ["raw_data_provider"]
            }

        except Exception as e:
            logger.error(f"Flow error: {e}", exc_info=True)
            return {"success": False, "response": "Error processing data."}
        

    async def _handle_strict_synthesis(self, query: str, raw_data: Dict[str, Any]) -> Dict[str, Any]:
        """Synthesizes a response using ONLY the provided context and strict rules."""
        context = raw_data.get("response", "") or raw_data.get("content", "")
        
        # Format the strict prompt from prompts.py
        system_content = prompts.STRICT_SYNTHESIS_PROMPT.format(context_text=context)

        response = self.openai_client.chat.completions.create(
            model=self.intent_analyzer.current_deployment,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": query}
            ],
            # temperature=0.0 # Force accuracy, no creativity
        )

        return {
            "success": True,
            "response": response.choices[0].message.content,
            "citations": raw_data.get("citations", []),
            "services_used": raw_data.get("services_used", []),
            "usage": TokenUsage.model_validate(response.usage.model_dump()) if response.usage else None
        }
    

    def _serialise(obj: Any) -> Any:
        """JSON serialiser that handles SQL Decimal types and Dates."""
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        return str(obj)

    def _parse_json(raw: str) -> Optional[Dict]:
        """Safe JSON parser that cleans LLM markdown tags."""
        try:
            clean = raw.strip().replace("```json", "").replace("```", "")
            return json.loads(clean)
        except Exception:
            return None
        
    async def _classify_training_intent(self, message: str) -> dict:
        """Classifies the training intent of a user message."""
        try:
            prompt = prompts.TRAINING_INTENT_CLASSIFIER_PROMPT.format(message=message)
            response = self.openai_client.chat.completions.create(
                model=self.intent_analyzer.current_deployment,
                messages=[{"role": "user", "content": prompt}]
            )
            raw = response.choices[0].message.content.strip()
            logger.info(f"Training classifier raw response: {raw}")
            clean = raw.replace("```json", "").replace("```", "").strip()
            return json.loads(clean)
        except Exception as e:
            logger.error(f"Training intent classification failed: {e}", exc_info=True)
            return {"intent": "OUT_OF_SCOPE"}


    async def _handle_training_query(self, message: str) -> dict:
        """Main router for all training department chat queries."""
        intent_data = await self._classify_training_intent(message)
        intent = intent_data.get("intent", "OUT_OF_SCOPE")
        topic = intent_data.get("topic")
        day_number = intent_data.get("day_number")
        trainer_name = intent_data.get("trainer_name")
        wants_overview = intent_data.get("wants_overview", False)

        logger.info(f"Training intent: {intent} | topic={topic} | day={day_number} | trainer={trainer_name}")

        if intent == "OUT_OF_SCOPE":
            return {
                "success": True,
                "response": "I can only answer questions based on the training sessions conducted at Kalpita Technologies. "
                            "Try asking me about a specific topic covered in the sessions, or ask what sessions are available.",
                "citations": [],
                "services_used": ["training_scope_guard"],
                "follow_up_questions": [
                    "What training sessions have been conducted?",
                    "What topics can you help me learn about?",
                ]
            }

        if intent == "CAPABILITY":
            result = await self.training_service.get_capability_overview()
            return {
                "success": True,
                "response": result["response"],
                "citations": [],
                "services_used": ["training_sharepoint"],
                "follow_up_questions": [
                    "What training sessions have been conducted?",
                    "Test me on a topic",
                ]
            }

        if intent == "LIST_SESSIONS":
            if wants_overview:
                result = await self.training_service.get_all_sessions_overview()
                return {
                    "success": True,
                    "response": result["response"],
                    "citations": [],
                    "services_used": ["training_sharepoint"],
                    "follow_up_questions": [
                        "Summarize a specific session in detail",
                        "What topics can I get quizzed on?",
                    ]
                }
            else:
                result = await self.training_service.get_all_video_list()
                sessions = result.get("sessions", [])
                if not sessions:
                    response_text = "No training sessions are available at the moment."
                else:
                    lines = [f"- {s['day']} — {s['trainer']}" for s in sessions]
                    response_text = "The following training sessions have been conducted at Kalpita:\n\n" + "\n".join(lines)
                return {
                    "success": True,
                    "response": response_text,
                    "citations": [],
                    "services_used": ["training_sharepoint"],
                    "follow_up_questions": [
                        "Give me a brief overview of what each session covers",
                        "What topics can you help me learn about?",
                    ]
                }

        if intent == "TOPIC_SEARCH":
            if not topic:
                return {
                    "success": True,
                    "response": "Could you clarify which topic you'd like to know about from the training sessions?",
                    "citations": [],
                    "services_used": [],
                    "follow_up_questions": ["What topics are available?"]
                }
            result = await self.training_service.search_topic_across_all(topic)
            return {
                "success": True,
                "response": result["response"],
                "citations": [],
                "services_used": ["training_sharepoint"],
                "follow_up_questions": [
                    f"Test my knowledge on {topic}",
                    "What other topics were covered in the training?",
                ]
            }

        if intent == "TOPIC_QUIZ":
            if not topic:
                return {
                    "success": True,
                    "response": "Which topic would you like to be quizzed on?",
                    "citations": [],
                    "services_used": [],
                    "follow_up_questions": ["What topics are available?"]
                }
            result = await self.training_service.get_topic_quiz(topic)
            return {
                "success": True,
                "response": result["response"],
                "citations": [],
                "services_used": ["training_sharepoint"],
                "follow_up_questions": [
                    f"Explain {topic} based on what was covered in the training",
                ]
            }

        if intent in ("SESSION_SUMMARY", "SESSION_QUIZ"):
            all_result = await self.training_service.get_all_video_list()
            all_folders = [s["display_name"] for s in all_result.get("sessions", [])]
            matched = self.training_service._match_folder_to_query(all_folders, day_number, trainer_name)

            if matched is None:
                return {
                    "success": True,
                    "response": "I couldn't identify which training session you're referring to. "
                                "Could you specify the day number or trainer name? "
                                "For example: 'Summarize Day 2' or 'Questions from Kamal's session'.",
                    "citations": [],
                    "services_used": [],
                    "follow_up_questions": ["What training sessions have been conducted?"]
                }

            if matched.startswith("AMBIGUOUS:"):
                ambiguous_folders = matched.replace("AMBIGUOUS:", "").split(",")
                options = "\n".join(f"- {f}" for f in ambiguous_folders)
                return {
                    "success": True,
                    "response": f"Multiple sessions match. Which one did you mean?\n\n{options}",
                    "citations": [],
                    "services_used": [],
                    "follow_up_questions": ambiguous_folders
                }

            if intent == "SESSION_SUMMARY":
                result = await self.training_service.get_summary_for_day(matched)
                follow_ups = ["Give me practice questions from this session", "What other sessions are available?"]
            else:
                result = await self.training_service.get_qa_for_day(matched)
                follow_ups = ["Summarize what was covered in this session", "Quiz me on a specific topic from this session"]

            return {
                "success": True,
                "response": result["response"],
                "citations": [],
                "services_used": ["training_sharepoint"],
                "follow_up_questions": follow_ups,
            }
        if intent == "AUDIO_REQUEST":
            if not topic:
                return {
                    "success": True,
                    "response": "Which topic would you like to listen to?",
                    "citations": [],
                    "services_used": [],
                    "follow_up_questions": ["What topics are available?"]
                }

            all_result = await self.training_service.get_all_video_list()
            all_folders = [s["display_name"] for s in all_result.get("sessions", [])]
            matched = self.training_service._match_folder_to_query(all_folders, day_number, trainer_name)

            audio_url = None
            audio_topic = None
            audio_session = None

            folders_to_search = []
            if matched and not matched.startswith("AMBIGUOUS:"):
                folders_to_search = [matched]
            else:
                folders_to_search = all_folders

            for folder in folders_to_search:
                metadata = self.training_service.sp.read_audio_metadata(folder)
                for entry in metadata:
                    if topic.lower() in entry.get("topic", "").lower() or topic.lower() in entry.get("filename", "").lower():
                        audio_url = f"/api/training/audio/stream?day_folder_name={quote(folder)}&filename={entry['filename']}"
                        audio_topic = entry.get("topic", topic)
                        audio_session = folder
                        break
                if audio_url:
                    break

            if not audio_url:
                return {
                    "success": True,
                    "response": f"Audio for '{topic}' hasn't been generated yet. Ask an admin to generate it.",
                    "citations": [],
                    "services_used": [],
                    "follow_up_questions": [f"Tell me about {topic}", f"Test my knowledge on {topic}"]
                }

            return {
                "success": True,
                "response": f"Here's the audio explanation for **{audio_topic}**:",
                "message_type": "audio",
                "audio_url": audio_url,
                "audio_topic": audio_topic,
                "audio_session": audio_session,
                "citations": [],
                "services_used": ["training_audio"],
                "follow_up_questions": [f"Tell me more about {topic}", f"Test my knowledge on {topic}"]
            }
        
        if intent == "SHORT_REQUEST":
            if not topic:
                return {
                    "success": True,
                    "response": "Which topic would you like to watch a short video on?",
                    "citations": [],
                    "services_used": [],
                    "follow_up_questions": ["What topics are available?"]
                }

            all_result = await self.training_service.get_all_video_list()
            all_folders = [s["display_name"] for s in all_result.get("sessions", [])]

            topic_lower = topic.lower()
            topic_words = set(w for w in topic_lower.split() if len(w) > 2)  # skip short words

            best_score = 0
            best_match = None

            for folder in all_folders:
                metadata = self.training_service.sp.read_shorts_metadata(folder)
                for entry in metadata:
                    entry_topic = entry.get("topic", "").lower()
                    entry_title = entry.get("title", "").lower()
                    combined = entry_topic + " " + entry_title

                    score = sum(1 for word in topic_words if word in combined)

                    if score > best_score:
                        best_score = score
                        best_match = {
                            "folder": folder,
                            "entry": entry
                        }

            if not best_match or best_score == 0:
                return {
                    "success": True,
                    "response": f"No video short found for '{topic}'. Shorts may not have been generated yet.",
                    "citations": [],
                    "services_used": [],
                    "follow_up_questions": [f"Tell me about {topic}", f"Test my knowledge on {topic}"]
                }

            folder = best_match["folder"]
            entry = best_match["entry"]
            short_url = f"/api/training/shorts/stream?day_folder_name={quote(folder)}&filename={entry['filename']}"
            short_title = entry.get("title", topic)
            short_session = folder

            return {
                "success": True,
                "response": f"Here's the video short on **{short_title}**:",
                "message_type": "short",
                "short_url": short_url,
                "short_title": short_title,
                "short_session": short_session,
                "citations": [],
                "services_used": ["training_shorts"],
                "follow_up_questions": [f"Tell me more about {topic}", f"Test my knowledge on {topic}"]
            }
        
        if intent == "SHORTS_LIST":
            all_result = await self.training_service.get_all_video_list()
            all_folders = [s["display_name"] for s in all_result.get("sessions", [])]
            matched = self.training_service._match_folder_to_query(all_folders, day_number, trainer_name)

            if not matched or matched.startswith("AMBIGUOUS:"):
                return {
                    "success": True,
                    "response": "Which day's shorts would you like to browse? Please specify a day number or trainer name.",
                    "citations": [],
                    "services_used": [],
                    "follow_up_questions": ["Show all shorts from Day 1", "Show all shorts from Day 3"]
                }

            metadata = self.training_service.sp.read_shorts_metadata(matched)
            if not metadata:
                return {
                    "success": True,
                    "response": f"No shorts found for {matched}.",
                    "citations": [],
                    "services_used": []
                }

            shorts = [
                {
                    "url": f"/api/training/shorts/stream?day_folder_name={quote(matched)}&filename={s['filename']}",
                    "title": s.get("title", ""),
                    "topic": s.get("topic", ""),
                    "duration_seconds": s.get("duration_seconds", 0),
                    "short_number": s.get("short_number", 0)
                }
                for s in metadata
            ]

            return {
                "success": True,
                "response": f"Here are all the shorts from **{matched}**:",
                "message_type": "shorts_list",
                "shorts_list": shorts,
                "short_session": matched,
                "citations": [],
                "services_used": ["training_shorts"],
                "follow_up_questions": [f"Summarize {matched}", f"Quiz me on {matched}"]
            }

    
        return {
            "success": True,
            "response": "I can only answer questions based on the training sessions conducted at Kalpita Technologies.",
            "citations": [],
            "services_used": [],
            "follow_up_questions": ["What training sessions have been conducted?"]
        }
    
    