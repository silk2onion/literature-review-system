
import sys, os, json, asyncio
from datetime import datetime
sys.path.append(os.getcwd())

from app.database import SessionLocal
from app.services.task_runner import get_task, PipelineTaskRunner

async def full_resurrection():
    db = SessionLocal()
    task_id = "79e92d04"
    
    # 1. Get task state
    task_state = get_task(task_id)
    if not task_state:
        print("Task state not found")
        return

    runner = PipelineTaskRunner(task_state, db)
    
    # Since we want to re-run from evidence step (inclusive)
    # we need to make sure the runner has the dependencies from previous steps (framework, auto_search, claims)
    # The checkpoints should already be in the DB, so we can use the runner's restore logic
    # But for a "forced" re-run of specific steps, we'll manually restore then call the methods.
    
    print(f"Resurrecting task {task_id} from 'evidence' step onwards...")
    runner._restore_checkpoint("evidence") # This will restore framework, paper_ids, and claim_table
    
    try:
        # Step 4: Attach Evidence (Fixed with LLM fallback for non-embedded papers)
        await runner._step_attach_evidence()
        
        # Step 5: Render (Fixed with complete_json and citation mapping)
        await runner._step_render_all()
        
        # Step 6: Assemble (Fixed with ReviewPaper database linking)
        await runner._step_assemble()
        
        print("Resurrection complete. Task 79e92d04 should now have correct citations and references.")
    except Exception as e:
        print(f"Resurrection failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(full_resurrection())
