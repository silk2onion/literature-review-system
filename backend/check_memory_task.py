import os
import sys
import asyncio
import json
from datetime import datetime

# Ensure backend path is in sys.path
sys.path.append(os.getcwd())

async def monitor():
    try:
        from app.services.task_runner import _task_store, _store_lock
        from app.database import SessionLocal
        from app.models.pipeline_task import PipelineTask
        
        task_id = '01d99b31'
        
        async with _store_lock:
            task = _task_store.get(task_id)
        
        if task:
            print(f"MEMORY_STATUS: {task.status}")
            print(f"LAST_COMPLETED_STEP: {task.last_completed_step}")
            for s in task.steps:
                if s.status != 'pending':
                    print(f"STEP: {s.label} | STATUS: {s.status} | ATTEMPT: {s.attempt} | ELAPSED: {s.elapsed()}s")
        else:
            print("TASK_NOT_IN_MEMORY - This means the background task might have crashed or was never started in this process instance.")
            
        # Check DB to see if any background persistence happened recently
        db = SessionLocal()
        t = db.query(PipelineTask).filter(PipelineTask.task_id == task_id).first()
        if t:
            print(f"DB_STATUS: {t.status}")
            print(f"DB_UPDATED_AT: {t.updated_at}")
        db.close()

    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    # We can't easily access the running process's memory from a new process.
    # But we can check if the 'run.py' process has child threads/tasks if we were in the same process.
    # Since we are running a separate script, we can only see the DB state.
    # To truly see the memory of the OTHER process, we'd need a debug hook.
    # Let's check the database one more time very carefully.
    import asyncio
    asyncio.run(monitor())
