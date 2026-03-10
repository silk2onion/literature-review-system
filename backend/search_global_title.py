import sqlite3
import os

db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\globalStorage\state.vscdb'
search_str = "文献综述框架"

if not os.path.exists(db_path):
    print(f"DB not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT key, value FROM ItemTable")
rows = cursor.fetchall()

found = False
for key, value in rows:
    # Try to decode if it's blob or just check string
    try:
        if search_str in str(value) or (isinstance(value, bytes) and search_str.encode('utf-8') in value):
            print(f"Key: {key}")
            print(f"Value segment: {str(value)[:500]}...")
            print("---")
            found = True
    except:
        pass

if not found:
    print(f"String '{search_str}' not found in any value.")

conn.close()
