import sqlite3
import os

db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\globalStorage\state.vscdb'
search_titles = ["文献综述框架", "Restarting Frontend and Backend", "RDP Attack Investigation"]

if not os.path.exists(db_path):
    print(f"DB not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

found = False
for title in search_titles:
    print(f"Searching for: {title}")
    cursor.execute("SELECT key, value FROM ItemTable WHERE value LIKE ?", (f'%{title}%',))
    rows = cursor.fetchall()
    if rows:
        found = True
        for row in rows:
            print(f"Found in key: {row[0]}")
            # print(f"Value Preview: {row[1][:200]}...")

if not found:
    print("No matches found for any title.")

conn.close()
