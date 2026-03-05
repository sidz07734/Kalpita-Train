# App/Managers/attendance_db_manager.py
import logging
import pyodbc
import datetime
from typing import List, Dict, Any
from .. import config

logger = logging.getLogger(__name__)

class AttendanceDbManager:
    def __init__(self):
        self.connection_string = config.HR_DATABASE_CONNECTION_STRING

    def get_bulk_attendance(self, employees: List[Dict[str, Any]], start_date: str = None, end_date: str = None) -> List[Dict[str, Any]]:
        results = []
        
        # Default to current month
        if not start_date or not end_date:
            today = datetime.date.today()
            start_date = today.replace(day=1).strftime('%Y-%m-%d')
            end_date = today.strftime('%Y-%m-%d')

        conn = None
        try:
            conn = pyodbc.connect(self.connection_string)
            cursor = conn.cursor()

            for emp in employees:
                emp_code = emp.get("EmployeeId") # This comes from PolicyManager
                emp_name = emp.get("Name")

                if not emp_code: continue

                try:
                    # CALL THE SP
                    query = "{CALL GetEmployeeAttendanceHours (?, ?, ?, ?)}"
                    params = (emp_code, start_date, end_date, 'day') # group_by 'day' for details
                    
                    cursor.execute(query, params)
                    
                    if cursor.description:
                        columns = [column[0] for column in cursor.description]
                        rows = cursor.fetchall()
                        
                        records = []
                        for row in rows:
                            rec = dict(zip(columns, row))
                            # Safe serialization
                            for k, v in rec.items():
                                if isinstance(v, (datetime.date, datetime.datetime)):
                                    rec[k] = v.isoformat()
                                if isinstance(v, (float, int)) and "hours" in k:
                                    rec[k] = float(v)
                            records.append(rec)

                        # if records:
                    results.append({
                        "Name": emp_name,
                        "EmployeeId": emp_code,
                        "Role": "Manager" if emp.get("IsManager") else "Reportee",
                        "Data": records # AI will now see empty data for absent employees
                    })
                except Exception as inner:
                    logger.error(f"Error for {emp_code}: {inner}")
            
            return results
        except Exception as e:
            logger.error(f"DB Connection Error: {e}")
            return []
        finally:
            if conn: conn.close()