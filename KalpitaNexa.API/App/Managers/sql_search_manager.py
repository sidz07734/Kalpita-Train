# app/managers/sql_search_manager.py
from datetime import datetime, timedelta
import logging
import pyodbc
from functools import lru_cache
from typing import Any, Dict, List, Optional
from openai import AzureOpenAI
from azure.search.documents import SearchClient
from azure.core.credentials import AzureKeyCredential
from azure.search.documents.models import QueryType
from .. import config
from ..Models.search_models import SQLResponse, CandidateInfo
from ..Utils.prompts import SQL_GENERATION_PROMPT

logger = logging.getLogger(__name__)

class SqlSearchManager:
    def __init__(self, openai_client: AzureOpenAI):
        self.openai_client = openai_client
        # This will act as a cache for initialized search clients per app_id
        self._search_clients: Dict[int, SearchClient] = {}
        self._index_names: Dict[int, str] = {}

    @lru_cache(maxsize=32)
    def _get_index_name_for_app(self, app_id: int) -> Optional[str]:
        """
        Fetches the correct Azure Search index name from the database for a given app_id.
        This queries the correct tables to find the associated data source.
        """
        logger.info(f"DB LOOKUP: Fetching SQL index name for app_id: {app_id}")
        sql_query = """
            SELECT ds.DataSourceName
            FROM dbo.ApplicationDataSources ads
            JOIN dbo.DataSources ds ON ads.DataSourceId = ds.DataSourceId
            WHERE ads.AppId = ? AND ds.DataSourceType = 'AzureSearch' AND ads.IsActive = 1;
        """
        try:
            with config.get_sql_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(sql_query, app_id)
                row = cursor.fetchone()
                if row:
                    logger.info(f"Found index '{row.DataSourceName}' for app_id {app_id}")
                    return row.DataSourceName
                logger.warning(f"No active AzureSearch data source configured for app_id {app_id}")
                return None
        except pyodbc.Error as e:
            logger.error(f"DB error fetching SQL index name for app_id {app_id}: {e}", exc_info=True)
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching SQL index name for app_id {app_id}: {e}", exc_info=True)
            return None

    # def _get_search_client(self, app_id: int) -> Optional[SearchClient]:
    #     if app_id in self._search_clients:
    #         return self._search_clients[app_id]

    #     index_name = self._get_index_name_for_app(app_id) or config.AZURE_SEARCH_INDEX_NAME_SQL
    #     if not index_name:
    #         logger.error(f"No Azure Search index configured for AppId {app_id}")
    #         return None

    #     client = SearchClient(
    #         endpoint=config.AZURE_SEARCH_ENDPOINT,
    #         index_name=index_name,  # ← FIXED: use variable
    #         credential=AzureKeyCredential(config.AZURE_SEARCH_KEY)
    #     )

    #     self._search_clients[app_id] = client
        
    #     logger.info(f"Initialized search client for AppId {app_id} on index '{index_name}'")
    #     return client

    async def search_candidates(self, query: str, app_id: int, max_results: int, user_role: Optional[str], user_email: Optional[str]) -> SQLResponse:
        try:
            search_client = self._get_search_client(app_id)
            if not search_client:
                error_msg = f"SQL search is not configured for this application (AppId: {app_id})."
                logger.error(error_msg)
                return SQLResponse(success=False, content=error_msg, error=error_msg, query_processed=query)

            logger.info(f"Searching SQL index '{search_client._index_name}' for: '{query}' with role '{user_role}'")
            
            rbac_filter = self._get_rbac_filter(user_role, user_email)
            logger.info(f"Applying RBAC filter: {rbac_filter}")
            
            results = search_client.search(
                search_text=query,
                query_type=QueryType.SEMANTIC,
                #semantic_configuration_name="default",
                filter=rbac_filter,
                top=max_results,
                include_total_count=True
            )
            
            candidates = [self._map_result_to_candidate(r) for r in results]
            unique_candidates = self._deduplicate_candidates(candidates)

            if not unique_candidates:
                return SQLResponse(success=False, content="No candidates found.", query_processed=query)

            ai_content = await self._generate_ai_response(query, unique_candidates, user_role)
            
            return SQLResponse(
                success=True,
                content=ai_content,
                candidates=unique_candidates,
                candidate_count=len(unique_candidates),
                query_processed=query
            )
        except Exception as e:
            logger.error(f"SQL Search Manager Error: {e}", exc_info=True)
            return SQLResponse(success=False, error=str(e), content="Error searching candidate database.", query_processed=query)

    def _get_rbac_filter(self, user_role: Optional[str], user_email: Optional[str]) -> Optional[str]:
        if user_role == "Admin":
            return None
        if user_role == "Recruiter" and user_email:
            return f"RecruiterEmail eq '{user_email}'"
        if user_role == "Interviewer" and user_email:
            return f"InterviewerEmail eq '{user_email}'"
        if user_role == "Requester" and user_email:
            username = user_email.split('@')[0]
            return f"(RequestorName eq '{user_email}' or RequestorName eq '{username}')"
        
        # If role is unknown, apply NO filter, just like the old system.
        return None

    def _map_result_to_candidate(self, result: Dict) -> CandidateInfo:
        """
        Maps a raw dictionary result (from SQL/Search) to the CandidateInfo Pydantic model.
        """
        return CandidateInfo(
            # --- Core Fields ---
            name=result.get("CandidateName"),
            mobile=result.get("MobileNumber"),  # Check if "MobileNumber" or "Phone"
            email=result.get("Email"),
            skills=result.get("Skills"),
            experience=result.get("TotalExperience"),
            organization=result.get("CurrentOrganization"),
            designation=result.get("Designation"),
            location=result.get("Location"),  # Check if "CurrentLocation"
            ctc=result.get("CTC"),            # Check if "CurrentCTC"
            search_score=result.get('@search.score', 0),

            # --- Extended Fields ---
            sub_skills=result.get("SubSkills"),
            skill_set_rating=result.get("SkillSetRating"),
            education=result.get("Education"),
            relevant_experience=result.get("RelevantExperience"),
            preferred_location=result.get("PreferredLocation"),
            ectc=result.get("ECTC"),          # Check if "ExpectedCTC"
            if_holding_offer=result.get("IfHoldingOffer"),
            notice_period=result.get("NoticePeriod"),
            if_serving_notice_lwd=result.get("IfServingNoticeLWD"), # Check if just "LWD"
            comment=result.get("Comment"),
            communication_rating=result.get("CommunicationRating"),
            resume_url=result.get("ResumeUrl"),
            remarks=result.get("Remarks"),
            doj=result.get("DOJ"),            # Check if "DateOfJoining"
            working_status=result.get("WorkingStatus"),
            is_active=result.get("IsActive"),
            recruiter=result.get("Recruiter"),
            recruiter_email=result.get("RecruiterEmail"),
            is_candidate_flagged=result.get("IsCandidateFlagged"),
            flagged_reason=result.get("FlaggedReason"),
            source_name=result.get("SourceName"),
            dob=result.get("DOB"),            # Check if "DateOfBirth"

            # --- Requisition & Interview Fields ---
            requisition_id=result.get("RequisitionId"),
            job_description=result.get("JobDescription"),
            requestor_name=result.get("RequestorName"),
            interview_status=result.get("InterviewStatus"),
            interview_round_name=result.get("InterviewRoundName"),
            interview_round_comments=result.get("InterviewRoundComments"),
            interviewer_email=result.get("InterviewerEmail")
        )

    def _deduplicate_candidates(self, candidates: List[CandidateInfo]) -> List[CandidateInfo]:
        seen = set()
        unique = []
        for candidate in candidates:
            # Use email if available, otherwise name+mobile for uniqueness
            identifier = candidate.email if candidate.email else (candidate.name, candidate.mobile)
            if identifier and identifier not in seen:
                seen.add(identifier)
                unique.append(candidate)
        return unique

    async def _generate_ai_response(self, query: str, candidates: List[CandidateInfo], user_role: str) -> str:
        system_prompt = f"You are an AI assistant analyzing a candidate database for a user with the role '{user_role}'. Respond to the query based ONLY on the data below. Use citations [docX] for every piece of information.\n\n"
        for i, candidate in enumerate(candidates, 1):
            system_prompt += f"[doc{i}] Name: {candidate.name}, Skills: {candidate.skills}, Experience: {candidate.experience}, Score: {candidate.search_score}\n"
        
        response = self.openai_client.chat.completions.create(
            model=config.AZURE_OPENAI_DEPLOYMENT_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ],
            # temperature=temperature,
            # max_tokens=1500
        )
        return response.choices[0].message.content
    
    async def perform_direct_db_aggregation(self, group_by_field: str, date_filter_field: str, time_period: str) -> Dict[str, Any]:
        """
        Uses o3-mini to generate the SQL aggregation query directly using the prompt from prompts.py.
        """
        try:
            # 1. Get Current Date
            current_date = datetime.now().strftime("%Y-%m-%d")

            # 2. Handle missing time period
            time_filter_str = time_period if time_period else "None (Do not apply date filter)"

            # 3. Format the Prompt using the imported variable
            system_prompt = SQL_GENERATION_PROMPT.format(
                current_date=current_date,
                group_by_field=group_by_field,
                date_filter_field=date_filter_field,
                time_period=time_filter_str
            )

            user_message = "Generate the T-SQL query."

            # 4. Call o3-mini
            response = self.openai_client.chat.completions.create(
                model=config.AZURE_OPENAI_DEPLOYMENT_NAME, 
                messages=[
                    {"role": "developer", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ]
            )

            generated_sql = response.choices[0].message.content.strip()
            generated_sql = generated_sql.replace("```sql", "").replace("```", "").strip()

            logger.info(f"🚀 AI GENERATED AGGREGATION SQL: {generated_sql}")

            # 5. Execute Query
            with config.get_recruit_sql_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(generated_sql)
                columns = [column[0] for column in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]

            # 6. Format Data
            formatted_data = []
            total_count = 0
            
            # Determine if this was a grouped query or a simple total
            is_grouped = True if (group_by_field and group_by_field.lower() != 'none' and group_by_field.lower() != 'null') else False

            for row in results:
                # Find the column that contains the count
                count_val = next((v for k, v in row.items() if 'count' in k.lower()), 0)
                total_count += count_val
                
                if is_grouped:
                    # Get the first column that isn't the count
                    label_val = next((v for k, v in row.items() if 'count' not in k.lower()), "Unknown")
                    formatted_data.append({"value": str(label_val), "count": count_val})

            return {
                "success": True,
                "type": "grouped" if is_grouped else "simple",
                "data": formatted_data if is_grouped else {"total_count": total_count}
            }

        except Exception as e:
            logger.error(f"AI Aggregation error: {e}", exc_info=True)
            return {"success": False, "error": str(e)}