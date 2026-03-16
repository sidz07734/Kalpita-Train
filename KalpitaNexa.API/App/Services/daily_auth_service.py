import logging
import json
from openai import AzureOpenAI
from ..Managers.daily_auth_manager import DailyAuthManager
from ..Models.daily_auth_models import DailyAuthResult, DashboardWidget
from ..Utils import daily_auth_prompts
from .. import config

logger = logging.getLogger(__name__)

class DailyAuthService:
    def __init__(self, openai_client: AzureOpenAI):
        self.openai_client = openai_client
        self.manager = DailyAuthManager()

    async def process_natural_language_query(self, query: str, tenant_id: str, app_id: int) -> DailyAuthResult:
        # STEP 1: Strict Tenant Verification
        is_op_tenant = await self.manager.verify_tenant_name_match(tenant_id, "Optimized Payments")
    
        if not is_op_tenant:
            logger.warning(f"Unauthorized access attempt to Daily Auth by Tenant ID: {tenant_id}")
            return DailyAuthResult(
                success=False, 
                response_text="Access Denied: Your organization does not have access to this dashboard.", 
                widgets=[]
            )

        # STEP 2: App Context Validation
        is_valid_app = await self.manager.verify_app_tenant_mapping(app_id, tenant_id)
        if not is_valid_app:
            logger.warning(f"Inconsistent IDs: App {app_id} does not belong to Tenant {tenant_id}")
            return DailyAuthResult(
                success=False, 
                response_text="Invalid application context.", 
                widgets=[]
            )

        # STEP 3: Generate SQL and Widget Definitions
        kpi_context = self.manager.get_kpi_context_string(tenant_id)
        system_prompt = daily_auth_prompts.MASTER_SQL_PROMPT.replace("{kpi_context}", kpi_context)
        
        try:
            model_name = config.AZURE_OPENAI_DEPLOYMENT_NAME_GPT35

            api_args = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": system_prompt}, 
                    {"role": "user", "content": query}
                ]
            }

            if "o1" not in model_name and "o3" not in model_name:
                api_args["temperature"] = 0

            llm_response = self.openai_client.chat.completions.create(**api_args)
            content = llm_response.choices[0].message.content.replace("```json", "").replace("```", "").strip()
            
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                return DailyAuthResult(success=False, response_text=content, widgets=[])
            
            sql = parsed.get("sql", "")
            summary = parsed.get("summary", "Here are your results.")
            widget_defs = parsed.get("widgets", [])
            follow_ups = parsed.get("followup_questions", [])
            if not follow_ups:
                follow_ups = ["Show me the daily trend", "Top 5 Acquirers", "Show declined transactions"]

            if sql in ["CLARIFY", "NONE"] or not sql:
                return DailyAuthResult(success=True, response_text=summary, widgets=[], follow_up_questions=follow_ups)

            # STEP 4: Execute SQL
            raw_data = await self.manager.execute_dynamic_sql(sql, tenant_id)
            
            if not raw_data:
                return DailyAuthResult(
                    success=True,
                    response_text="I searched the database but found no records matching your criteria.",
                    widgets=[],
                    follow_up_questions=follow_ups
                )
            
            # STEP 5: Build Widgets and Insights
            widgets = self._build_widgets(raw_data, widget_defs)
            try:
                insights = self._generate_data_insights(query, raw_data, model_name)
                if insights:
                    summary = insights
            except Exception as e:
                logger.error(f"Insight generation failed: {e}")
            
            return DailyAuthResult(success=True, response_text=summary, widgets=widgets, follow_up_questions=follow_ups)
            
        except Exception as e:
            logger.error(f"Service Error: {e}", exc_info=True)
            return DailyAuthResult(success=False, response_text="An error occurred.", error=str(e))

    def _generate_data_insights(self, query: str, data: list, model_name: str) -> str:
        data_preview = data[:25] 
        data_context_str = json.dumps(data_preview, default=str)
        prompt = daily_auth_prompts.DATA_INSIGHTS_PROMPT.replace("{query}", query).replace("{data_context}", data_context_str)
        api_args = {"model": model_name, "messages": [{"role": "system", "content": "You are a helpful data analyst."}, {"role": "user", "content": prompt}]}
        if "o1" not in model_name and "o3" not in model_name: api_args["temperature"] = 0.3
        response = self.openai_client.chat.completions.create(**api_args)
        return response.choices[0].message.content.strip()

    def _build_widgets(self, data: list, widget_defs: list) -> list:
        widgets = []
        if not widget_defs:
            widgets.append(DashboardWidget(type="table", title="Results", data=data))
            return widgets

        for definition in widget_defs:
            raw_type = definition.get("type", "table").lower().replace(" ", "_").replace("-", "_")
            w_type = "table"
            if "line" in raw_type: w_type = "line_chart"
            elif "bar" in raw_type: w_type = "bar_chart"
            elif "pie" in raw_type: w_type = "pie_chart"
            elif "kpi" in raw_type: w_type = "kpi_card"

            layout_config = {
                "x_axis": definition.get("x_axis", "time_label"),
                "y_axis": definition.get("metrics", []),
                "series": definition.get("series", None)
            }
            widgets.append(DashboardWidget(type=w_type, title=definition.get("title", "Chart"), data=data, layout=layout_config))
        return widgets