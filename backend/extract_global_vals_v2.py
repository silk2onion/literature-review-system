import sqlite3
import os

db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\globalStorage\state.vscdb'
keys = ['google.antigravity', 'chat.ChatSessionStore.index', 'antigravityUnifiedStateSync.trajectorySummaries']

if not os.path.exists(db_path):
    print(f"DB not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

for key in keys:
    cursor.execute("SELECT value FROM ItemTable WHERE key = ?", (key,))
    row = cursor.fetchone()
    if row:
        print(f"Key: {key}\nValue: {row[0]}\n---")
    else:
        print(f"Key: {key} not found.\n---")

conn.close()
