import sqlite3
import os
import json

root = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\workspaceStorage'
output_path = r'c:\Users\zyh82\Desktop\literature 1\literature-review-system\backend\session_indices.txt'

found_indices = []

for d in os.listdir(root):
    dir_path = os.path.join(root, d)
    if not os.path.isdir(dir_path):
        continue
    db_path = os.path.join(dir_path, 'state.vscdb')
    if not os.path.exists(db_path):
        continue
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index'")
        val = cursor.fetchone()
        if val and val[0] != '{"version":1,"entries":{}}':
            found_indices.append(f"Workspace: {d}\nValue: {val[0]}\n")
        conn.close()
    except Exception as e:
        print(f"Error reading {db_path}: {e}")

with open(output_path, 'w', encoding='utf-8') as f:
    for item in found_indices:
        f.write(item + "---\n")

print(f"Done. Found {len(found_indices)} non-empty indices.")
