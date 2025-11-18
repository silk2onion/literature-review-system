from sqlalchemy import text
from app.database import engine

def add_archived_columns():
    with engine.connect() as conn:
        # Check if columns exist (SQLite specific check, or just try/except)
        # For simplicity in this script, we'll try to add them one by one.
        
        try:
            print("Adding is_archived column...")
            conn.execute(text("ALTER TABLE papers ADD COLUMN is_archived BOOLEAN DEFAULT 0"))
            print("Added is_archived column.")
        except Exception as e:
            print(f"Skipping is_archived (might exist): {e}")

        try:
            print("Adding archived_reason column...")
            conn.execute(text("ALTER TABLE papers ADD COLUMN archived_reason VARCHAR(500)"))
            print("Added archived_reason column.")
        except Exception as e:
            print(f"Skipping archived_reason (might exist): {e}")

        try:
            print("Adding archived_at column...")
            conn.execute(text("ALTER TABLE papers ADD COLUMN archived_at DATETIME"))
            print("Added archived_at column.")
        except Exception as e:
            print(f"Skipping archived_at (might exist): {e}")
            
        conn.commit()
        print("Done.")

if __name__ == "__main__":
    add_archived_columns()