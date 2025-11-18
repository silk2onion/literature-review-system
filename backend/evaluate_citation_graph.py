import asyncio
import logging
import sys
from typing import List, Set

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Paper, PaperCitation
from app.services.crawler import search_across_sources
from app.services.semantic_search import get_semantic_search_service

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_internal_citations(db: Session, paper_ids: List[int]) -> List[PaperCitation]:
    """Get all citations where both source and target are in the paper_ids list."""
    # Ensure paper_ids are integers
    safe_ids = [int(pid) for pid in paper_ids if pid is not None]
    if not safe_ids:
        return []
        
    return db.query(PaperCitation).filter(
        PaperCitation.citing_paper_id.in_(safe_ids),
        PaperCitation.cited_paper_id.in_(safe_ids)
    ).all()

async def evaluate_query(query: str, limit: int = 50, use_rag: bool = False):
    """
    Evaluate the citation graph properties for a given query.
    """
    db = SessionLocal()
    try:
        logger.info(f"Evaluating query: '{query}' (Limit: {limit}, RAG: {use_rag})")
        
        papers = []
        if use_rag:
            logger.info("Using Semantic Search (RAG)...")
            semantic_service = get_semantic_search_service()
            hits, _ = await semantic_service.search(db=db, keywords=[query], limit=limit)
            papers = [hit.paper for hit in hits]
        else:
            logger.info("Using Online Search...")
            # Note: search_across_sources returns dicts or objects depending on implementation
            # We need to ensure they are in the DB to have IDs for citation graph
            # For this evaluation script, we assume we are analyzing what's in the DB
            # or we'd need to ingest them first. 
            # To keep it simple and safe, let's search the LOCAL DB for papers matching the keyword
            # This simulates "what if we retrieved these papers"
            papers = db.query(Paper).filter(Paper.title.ilike(f"%{query}%")).limit(limit).all()
            
            if not papers:
                logger.warning("No local papers found matching query. Please run a crawl first.")
                return

        if not papers:
            logger.warning("No papers found.")
            return

        paper_ids = []
        for p in papers:
            pid = getattr(p, "id", None)
            if pid is not None:
                paper_ids.append(int(pid))
                
        num_nodes = len(paper_ids)
        logger.info(f"Retrieved {num_nodes} papers.")

        # 1. Internal Citations
        internal_citations = get_internal_citations(db, paper_ids)
        num_edges = len(internal_citations)
        
        # 2. Density
        # Density = E / (V * (V - 1)) for directed graph
        density = 0.0
        if num_nodes > 1:
            density = num_edges / (num_nodes * (num_nodes - 1))
            
        # 3. Average Degree (Internal)
        avg_degree = 0.0
        if num_nodes > 0:
            avg_degree = num_edges / num_nodes

        # 4. Global Impact (Average Global Citations)
        total_global_citations = sum(p.citations_count or 0 for p in papers)
        avg_global_citations = total_global_citations / num_nodes if num_nodes > 0 else 0

        # 5. Connectivity (Simple Component Count)
        # Build adjacency list
        adj = {pid: [] for pid in paper_ids}
        for cit in internal_citations:
            u, v = cit.citing_paper_id, cit.cited_paper_id
            if u in adj: adj[u].append(v)
            if v in adj: adj[v].append(u) # Treat as undirected for component count
            
        visited = set()
        num_components = 0
        for pid in paper_ids:
            if pid not in visited:
                num_components += 1
                stack = [pid]
                visited.add(pid)
                while stack:
                    curr = stack.pop()
                    for neighbor in adj.get(curr, []):
                        if neighbor not in visited:
                            visited.add(neighbor)
                            stack.append(neighbor)

        print("\n" + "="*40)
        print(f"EVALUATION REPORT: '{query}'")
        print("="*40)
        print(f"Nodes (Papers):       {num_nodes}")
        print(f"Edges (Internal Cits): {num_edges}")
        print(f"Graph Density:        {density:.4f}")
        print(f"Avg Internal Degree:  {avg_degree:.2f}")
        print(f"Avg Global Citations: {avg_global_citations:.1f}")
        print(f"Connected Components: {num_components}")
        print("-" * 40)
        
        if num_edges == 0:
            print("Observation: No internal citations found. The retrieved set is disconnected.")
        elif density < 0.01:
            print("Observation: Sparse graph. Papers are loosely connected.")
        else:
            print("Observation: Dense graph. High degree of cross-referencing.")
            
        print("="*40 + "\n")

    except Exception as e:
        logger.error(f"Evaluation failed: {e}", exc_info=True)
    finally:
        db.close()

if __name__ == "__main__":
    # Example usage
    import sys
    query = "Urban Design"
    if len(sys.argv) > 1:
        query = sys.argv[1]
    
    asyncio.run(evaluate_query(query, limit=100, use_rag=True))