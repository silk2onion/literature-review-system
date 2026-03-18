"""Quick test: semantic search pipeline"""
import asyncio
from app.database import SessionLocal
from app.models.paper import Paper
from app.services.embedding_service import get_embedding_service
from app.services.semantic_search import SemanticSearchService


async def main():
    db = SessionLocal()
    emb = get_embedding_service()

    # 1. Test embedding generation
    q_vec = await emb.embed_text("transit oriented development TOD urban planning")
    print(f"Query vec dim: {len(q_vec) if q_vec else 'None'}")

    if not q_vec:
        print("ERROR: embed_text returned None!")
        db.close()
        return

    # 2. Manual cosine similarity check
    papers = db.query(Paper).filter(Paper.embedding.isnot(None)).limit(5).all()
    for p in papers:
        vec = [float(x) for x in p.embedding]
        sim = SemanticSearchService._cosine_similarity(q_vec, vec)
        print(f"  ID={p.id} sim={sim:.4f} dim={len(vec)} title={p.title[:70]}")

    # 3. Full search via service
    svc = SemanticSearchService()
    hits, debug = await svc.search(
        db=db,
        keywords=["transit oriented development", "TOD"],
        limit=10,
        source="test_script",
    )
    print(f"\nFull search: {len(hits)} hits, candidates={debug.total_candidates}")
    for h in hits[:5]:
        print(f"  score={h.score:.4f} title={h.paper.title[:70]}")

    db.close()


if __name__ == "__main__":
    asyncio.run(main())