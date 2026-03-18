
import sys, os, json
sys.path.append(os.getcwd())
from app.database import SessionLocal
from app.models.review import Review
db = SessionLocal()
review = db.query(Review).filter(Review.id == 5).first()
if review:
    print(f"Review ID: {review.id}")
    print(f"Title: {review.title[:50]}...")
    print(f"Paper Count: {review.paper_count}")
    print(f"Word Count: {review.word_count}")
    print(f"Links: {len(review.review_papers)}")
    has_refs = "## References" in review.content
    print(f"Has References: {has_refs}")
    has_json = '{"text":' in review.content
    print(f"Has JSON Leak: {has_json}")
    if has_refs:
        lines = review.content.split("\n")
        print("\nLast 5 lines of content:")
        print("\n".join(lines[-10:]))
else:
    print("Review 5 not found")
db.close()
