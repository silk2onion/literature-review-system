import sqlite3
import os

db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\globalStorage\state.vscdb'
output_path = r'c:\Users\zyh82\Desktop\literature 1\literature-review-system\backend\antigravity_global_full.json'

if not os.path.exists(db_path):
    print(f"DB not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT value FROM ItemTable WHERE key = 'google.antigravity'")
row = cursor.fetchone()

if row:
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(row[0])
    print(f"Done. Saved full value to {output_path}")
else:
    print("google.antigravity not found.")

conn.close()
