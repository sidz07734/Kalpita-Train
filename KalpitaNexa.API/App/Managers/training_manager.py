import logging
from typing import Dict, Any
from .. import config

logger = logging.getLogger(__name__)

class TrainingManager:
    def _get_connection(self):
        return config.get_sql_connection()

    def save_quiz_result(self, user_id: str, user_email: str, topic: str, score: int, total_questions: int, tenant_id: str = None, app_id: int = None, questions_json: str = None, prompt_used: str = None) -> Dict[str, Any]:
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO TrainingQuizResult 
                        (UserId, UserEmail, Topic, Score, TotalQuestions, TenantId, AppId, QuestionsJson, PromptUsed)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (user_id, user_email, topic, score, total_questions, tenant_id, app_id, questions_json, prompt_used))
                conn.commit()
            return {"success": True}
        except Exception as e:
            logger.error(f"Error saving quiz result: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
        


    def get_quiz_results(self, tenant_id: str = None) -> Dict[str, Any]:
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                if tenant_id:
                    cursor.execute("""
                        SELECT Id, UserId, UserEmail, Topic, Score, TotalQuestions, TakenAt, TenantId, AppId
                        FROM TrainingQuizResult
                        WHERE TenantId = ?
                        ORDER BY TakenAt DESC
                    """, (tenant_id,))
                else:
                    cursor.execute("""
                        SELECT Id, UserId, UserEmail, Topic, Score, TotalQuestions, TakenAt, TenantId, AppId
                        FROM TrainingQuizResult
                        ORDER BY TakenAt DESC
                    """)
                columns = [col[0] for col in cursor.description]
                rows = []
                for row in cursor.fetchall():
                    d = dict(zip(columns, row))
                    rows.append({
                        "id": d.get("Id"),
                        "user_email": d.get("UserEmail"),
                        "topic": d.get("Topic"),
                        "score": d.get("Score"),
                        "total_questions": d.get("TotalQuestions"),
                        "taken_at": str(d.get("TakenAt")) if d.get("TakenAt") else None,
                    })
            return {"success": True, "results": rows}
        except Exception as e:
            logger.error(f"Error fetching quiz results: {e}", exc_info=True)
            return {"success": False, "error": str(e), "results": []}