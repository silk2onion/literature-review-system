import sqlite3
import os

db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\workspaceStorage\f322a53140a274d66e911b2372eb1cf2\state.vscdb'
output_path = r'c:\Users\zyh82\Desktop\literature 1\literature-review-system\backend\workspace_items.txt'

if not os.path.exists(db_path):
    print(f"DB not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT key, value FROM ItemTable")
rows = cursor.fetchall()

with open(output_path, 'w', encoding='utf-8') as f:
    for row in rows:
        f.write(f"Key: {row[0]}\nValue: {row[1]}\n---\n")

print(f"Done. Extracted {len(rows)} items to {output_path}")
conn.close()
