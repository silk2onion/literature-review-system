import sqlite3
import os
import base64
import json

db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\globalStorage\state.vscdb'
output_dir = r'c:\Users\zyh82\Desktop\literature 1\literature-review-system\backend'

keys = ['antigravityUnifiedStateSync.sidebarWorkspaces', 'antigravityUnifiedStateSync.trajectorySummaries']

if not os.path.exists(db_path):
    print(f"DB not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

for key in keys:
    cursor.execute("SELECT value FROM ItemTable WHERE key = ?", (key,))
    row = cursor.fetchone()
    if row:
        val = row[0]
        # Save raw
        with open(os.path.join(output_dir, f"{key}_raw.txt"), 'w', encoding='utf-8') as f:
            f.write(val)
        
        # Try to decode
        try:
            # Check if it's a JSON string containing a base64 value or just base64
            # Some VS Code sync values are "{\"version\":1,\"machineId\":\"...\",\"value\":\"BASE64\"}"
            if val.startswith('{'):
                data = json.loads(val)
                if 'entries' in data:
                    # Trajectory summaries might be an array of entries
                    with open(os.path.join(output_dir, f"{key}_decoded.json"), 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                elif 'value' in data:
                    inner_val = data['value']
                    decoded = base64.b64decode(inner_val).decode('utf-8', errors='ignore')
                    with open(os.path.join(output_dir, f"{key}_decoded.txt"), 'w', encoding='utf-8') as f:
                        f.write(decoded)
            else:
                decoded = base64.b64decode(val).decode('utf-8', errors='ignore')
                with open(os.path.join(output_dir, f"{key}_decoded.txt"), 'w', encoding='utf-8') as f:
                    f.write(decoded)
        except Exception as e:
            print(f"Failed to decode {key}: {e}")
    else:
        print(f"Key {key} not found.")

conn.close()
