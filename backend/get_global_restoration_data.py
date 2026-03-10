import sqlite3
import os

db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\globalStorage\state.vscdb'
keys = ['google.antigravity', 'chat.ChatSessionStore.index']

if not os.path.exists(db_path):
    print(f"DB not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

for key in keys:
    cursor.execute("SELECT value FROM ItemTable WHERE key = ?", (key,))
    row = cursor.fetchone()
    print(f"Key: {key}")
    if row:
        print(f"Value: {row[0]}")
    else:
        print("Value: None")
    print("---")

conn.close()
