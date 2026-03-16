import logging
import decimal
from datetime import date, datetime
from typing import List, Dict, Any
from .. import config
from functools import lru_cache 

logger = logging.getLogger(__name__)

class DailyAuthManager:
    def _get_auth_conn(self):
        return config.get_sql_connection()

    def _get_data_conn(self):
        return config.get_windows_auth_sql_connection()

    async def verify_tenant_name_match(self, tenant_id: str, expected_name: str) -> bool:
        """Strict name lookup for isolation."""
        sql = "SELECT TenantName FROM dbo.Tenants WHERE TenantId = ? AND IsActive = 1"
        try:
            with self._get_auth_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(sql, tenant_id)
                row = cursor.fetchone()
                return row and row[0].strip().lower() == expected_name.lower()
        except Exception as e:
            logger.error(f"Error verifying tenant: {e}")
            return False

    async def verify_app_tenant_mapping(self, app_id: int, tenant_id: str) -> bool:
        """Ensures App belongs to Tenant."""
        sql = "SELECT COUNT(*) FROM dbo.Application WHERE AppId = ? AND TenantId = ? AND IsActive = 1"
        try:
            with self._get_auth_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(sql, (app_id, tenant_id))
                return cursor.fetchone()[0] > 0
        except Exception as e:
            logger.error(f"Error verifying app mapping: {e}")
            return False

    @lru_cache(maxsize=1)
    def get_kpi_context_string(self, tenant_id: str = None) -> str:
        sql = "SELECT kpi_key, kpi_name, sql_formula FROM HARMONIZE_DEMO.KPI_DEFINITIONS"
        context_lines = []
        try:
            with self._get_data_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(sql)
                for row in cursor.fetchall():
                    key, name, formula = row
                    context_lines.append(f"   - Column '{key}': ISNULL({formula}, 0)")
            return "\n".join(context_lines)
        except Exception as e:
            logger.error(f"KPI Context Error: {e}")
            return ""

    async def execute_dynamic_sql(self, sql: str, tenant_id: str) -> List[Dict[str, Any]]:
        clean_sql = sql.replace("```sql", "").replace("```", "").strip()
        if not clean_sql.lower().startswith(("select", "with")):
            return []
        try:
            with self._get_data_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(clean_sql)
                columns = [col[0] for col in cursor.description]
                results = []
                for row in cursor.fetchall():
                    item = {}
                    for i, val in enumerate(row):
                        if isinstance(val, decimal.Decimal): item[columns[i]] = float(val)
                        elif isinstance(val, (date, datetime)): item[columns[i]] = val.isoformat()
                        else: item[columns[i]] = val
                    results.append(item)
                return results
        except Exception as e:
            logger.error(f"SQL Execution Error: {e}")
            return []