import sqlite3
import os
import base64

db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\globalStorage\state.vscdb'
keys = ['antigravityUnifiedStateSync.sidebarWorkspaces', 'antigravityUnifiedStateSync.trajectorySummaries']

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
        val = row[0]
        print(f"Raw Value (first 100 chars): {val[:100]}...")
        # many VS Code mementos are stored as JSON strings that might be base64 encoded if they are "sync" data
        # but usually sync data keys are just JSON.
        # Let's see if it looks like base64
        try:
            decoded = base64.b64decode(val).decode('utf-8', errors='ignore')
            print(f"Decoded (first 500 chars): {decoded[:500]}...")
        except:
            print("Value is not base64 or decoding failed.")
    else:
        print("Value: None")
    print("---")

conn.close()
