import sqlite3
import os
import shutil
import json

db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\globalStorage\state.vscdb'
temp_db_path = os.path.join(os.environ['TEMP'], 'global_state_copy.vscdb')
keys_to_extract = [
    'google.antigravity',
    'chat.ChatSessionStore.index',
    'antigravityUnifiedStateSync.sidebarWorkspaces',
    'antigravityUnifiedStateSync.trajectorySummaries'
]

try:
    shutil.copy2(db_path, temp_db_path)
    conn = sqlite3.connect(temp_db_path)
    cursor = conn.cursor()
    
    for key in keys_to_extract:
        cursor.execute("SELECT value FROM ItemTable WHERE key = ?", (key,))
        row = cursor.fetchone()
        if row:
            print(f"Key: {key}")
            val = row[0]
            if val and (val.startswith('{') or val.startswith('[')):
                try:
                    print(json.dumps(json.loads(val), indent=2))
                except:
                    print(val)
            else:
                print(val)
            print("-" * 40)
        else:
            print(f"Key: {key} not found.")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
finally:
    if os.path.exists(temp_db_path):
        os.remove(temp_db_path)
