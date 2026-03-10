import sqlite3
import json
import os

db_path = 'C:/Users/zyh82/AppData/Roaming/Antigravity/User/workspaceStorage/f322a53140a274d66e911b2372eb1cf2/state.vscdb'

if not os.path.exists(db_path):
    print(f"DB not found: {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index'")
    row = cursor.fetchone()
    if row:
        data = json.loads(row[0])
        print(f"Index Version: {data.get('version')}")
        entries = data.get('entries', {})
        print(f"Number of entries: {len(entries)}")
        # Print first few IDs as sample
        sample_ids = list(entries.keys())[:5]
        print(f"Sample IDs: {sample_ids}")
    else:
        print("Key 'chat.ChatSessionStore.index' not found.")
    conn.close()
