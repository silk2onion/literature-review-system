import sqlite3
import os

db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\workspaceStorage\f322a53140a274d66e911b2781cc3777\state.vscdb'

if not os.path.exists(db_path):
    print(f"DB not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT key FROM ItemTable WHERE key LIKE '%history%' OR key LIKE '%chat%' OR key LIKE '%antigravity%'")
rows = cursor.fetchall()
for row in rows:
    print(row[0])
conn.close()
