
import sys, os, json, asyncio
from datetime import datetime
sys.path.append(os.getcwd())

from app.database import SessionLocal
from app.models.pipeline_task import PipelineTask
from app.models.review import Review, ReviewPaper
from app.models.paper import Paper
from app.services.task_runner import PipelineTaskRunner, get_task
from app.services.reference_formatter import get_reference_formatter, CitationStyle

async def repair():
    db = SessionLocal()
    task_id = "79e92d04"
    
    # 1. Get task state
    task_state = get_task(task_id)
    if not task_state:
        print("Task state not found")
        return

    checkpoint = task_state.checkpoint_data
    render_cp = checkpoint.get("render", {})
    sections = render_cp.get("rendered_sections", [])
    
    if not sections:
        print("No sections found in render checkpoint")
        return

    # 2. Collect all potential papers for this task to help with string-to-id mapping
    evidence_cp = checkpoint.get("evidence", {})
    claim_table = evidence_cp.get("claim_table", {})
    all_potential_ids = set()
    for claim in claim_table.get("claims", []):
        all_potential_ids.update(claim.get("support_papers", []))
    
    potential_papers = db.query(Paper).filter(Paper.id.in_(list(all_potential_ids))).all()
    
    def get_citation_key(paper):
        authors = paper.authors or []
        year = paper.year or "n.d."
        if not authors: surname = "Unknown"
        elif len(authors) == 1: surname = authors[0].split()[-1] if authors[0] else "Unknown"
        elif len(authors) == 2:
            s1 = authors[0].split()[-1] if authors[0] else "Unknown"
            s2 = authors[1].split()[-1] if authors[1] else "Unknown"
            surname = f"{s1} and {s2}"
        else: surname = (authors[0].split()[-1] if authors[0] else "Unknown") + " et al."
        return f"({surname}, {year})"

    key_to_id = {get_citation_key(p): p.id for p in potential_papers}
    print(f"Mapped {len(key_to_id)} possible citation keys from evidence.")

    # 3. Process each section
    fixed_sections = []
    all_cited_ids = set()
    
    for sec in sections:
        text = sec.get("text", "")
        # Try to parse as JSON if it looks like it
        if text.strip().startswith("{"):
            try:
                data = json.loads(text)
                text = data.get("text", text)
                cit_map = data.get("citation_map", {})
            except:
                cit_map = sec.get("citation_map", {})
        else:
            cit_map = sec.get("citation_map", {})

        # Map string keys to IDs
        new_cit_map = {}
        for k, v in cit_map.items():
            if k in key_to_id:
                new_cit_map[k] = key_to_id[k]
                all_cited_ids.add(key_to_id[k])
            else:
                # Try partial match
                matched = False
                for exists_k, p_id in key_to_id.items():
                    if exists_k.strip("()") in k:
                        new_cit_map[k] = p_id
                        all_cited_ids.add(p_id)
                        matched = True
                        break
                if not matched:
                    new_cit_map[k] = v # keep as is
                    if isinstance(v, int): all_cited_ids.add(v)
        
        fixed_sections.append({
            "section_id": sec.get("section_id"),
            "section_title": sec.get("section_title"),
            "text": text,
            "citation_map": new_cit_map
        })

    print(f"Fixed {len(fixed_sections)} sections. Total unique papers cited: {len(all_cited_ids)}")

    # 4. Generate final markdown and links
    cited_papers = db.query(Paper).filter(Paper.id.in_(list(all_cited_ids))).all()
    cited_papers.sort(key=lambda p: (
        (p.authors[0].split()[-1].lower() if p.authors and p.authors[0] else "zzz"),
        p.year or 0,
    ))
    
    ref_formatter = get_reference_formatter()
    refs_md = ref_formatter.format_reference_list(cited_papers, style=CitationStyle.HARVARD)
    
    title = (task_state.framework or {}).get("title") or task_state.topic or "Literature Review"
    md_lines = [f"# {title}\n"]
    for sec in fixed_sections:
        md_lines.append(f"\n## {sec['section_title']}\n")
        md_lines.append(sec.get("text", ""))
    md_lines.append(f"\n## References\n")
    md_lines.append(refs_md)
    full_md = "\n".join(md_lines)

    # 5. Update Database Review & Task
    review = db.query(Review).filter(Review.id == task_state.review_id).first()
    if review:
        review.content = full_md
        review.paper_count = len(cited_papers)
        review.word_count = len(full_md)
        
        # Link papers
        db.query(ReviewPaper).filter(ReviewPaper.review_id == review.id).delete()
        for i, paper in enumerate(cited_papers):
            rp = ReviewPaper(review_id=review.id, paper_id=paper.id, order_index=i)
            db.add(rp)
        
        print(f"Updated Review #{review.id} in database.")
    
    # Update Task State
    task_state.full_markdown = full_md
    task_state.references_markdown = refs_md
    task_state.total_cited_papers = len(cited_papers)
    task_state.checkpoint_data["render"]["rendered_sections"] = fixed_sections
    
    # Persist Task State
    db_task = db.query(PipelineTask).filter(PipelineTask.task_id == task_id).first()
    if db_task:
        db_task.state_data = task_state.to_dict()
        db.commit()
        print("Updated Task state in database.")
    
    db.close()

if __name__ == "__main__":
    asyncio.run(repair())
