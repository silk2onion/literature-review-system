import os
import sys
import json
from datetime import datetime

# Ensure backend path is in sys.path
sys.path.append(os.getcwd())

try:
    from app.database import SessionLocal
    from app.models.pipeline_task import PipelineTask
    db = SessionLocal()
    task_id = '01d99b31'
    t = db.query(PipelineTask).filter(PipelineTask.task_id == task_id).first()
    if t:
        print(f"DATABASE STATUS: {t.status}")
        print(f"UPDATED_AT: {t.updated_at}")
        if t.state_data:
            data = t.state_data
            steps = data.get("steps", [])
            print(f"LAST_COMPLETED_STEP: {data.get('last_completed_step')}")
            print(f"RESUME_COUNT: {data.get('resume_count', 0)}")
            
            for s in steps:
                if s['status'] != 'pending':
                    start_time = s.get('started_at')
                    start_str = datetime.fromtimestamp(start_time).strftime('%H:%M:%S') if start_time else "N/A"
                    print(f"STEP: {s['label']} | STATUS: {s['status']} | STARTED: {start_str} | ATTEMPT: {s.get('attempt')}")
    else:
        print("NOT_FOUND")
except Exception as e:
    print(f"ERROR: {e}")
finally:
    if 'db' in locals():
        db.close()
