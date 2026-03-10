import sqlite3
import os

db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\workspaceStorage\f322a53140a274d66e911b2372eb1cf2\state.vscdb'
search_str = "4e03d4c5-26cd-42cf-b842-705952b1b3db"

if not os.path.exists(db_path):
    print(f"DB not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT key, value FROM ItemTable")
rows = cursor.fetchall()

found = False
for key, value in rows:
    if search_str in str(value):
        print(f"Key: {key}")
        # print(f"Value segment: {str(value)[:500]}...")
        print("---")
        found = True

if not found:
    print(f"String '{search_str}' not found in any value.")

conn.close()
