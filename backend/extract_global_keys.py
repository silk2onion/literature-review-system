import sqlite3
import os

db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\globalStorage\state.vscdb'
output_path = r'c:\Users\zyh82\Desktop\literature 1\literature-review-system\backend\global_keys_all_v2.txt'

if not os.path.exists(db_path):
    print(f"DB not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT key FROM ItemTable")
rows = cursor.fetchall()

with open(output_path, 'w', encoding='utf-8') as f:
    for row in rows:
        f.write(row[0] + "\n")

print(f"Done. Extracted {len(rows)} keys to {output_path}")
conn.close()
