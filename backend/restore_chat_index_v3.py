import sqlite3
import os
import re
import json

# Paths
decoded_trajectories_path = r'c:\Users\zyh82\Desktop\literature 1\literature-review-system\backend\antigravityUnifiedStateSync.trajectorySummaries_decoded.txt'
workspace_db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\workspaceStorage\da1ed6263520f922659e992be7bc0e45\sqlite\state.vscdb'
workspace_uri = 'file:///c%3A/Users/zyh82/Desktop/literature%201'

if not os.path.exists(decoded_trajectories_path):
    print(f"Decoded trajectories not found: {decoded_trajectories_path}")
    exit(1)

with open(decoded_trajectories_path, 'r', encoding='utf-8', errors='ignore') as f:
    raw_content = f.read()

# The file contains blocks starting with $ followed by a UUID.
# Each block contains the workspace URI and potentially the title.
blocks = re.split(r'\$', raw_content)
restoration_data = []

for block in blocks:
    if not block.strip():
        continue
    
    match_id = re.match(r'^([a-f0-9\-]{36})', block)
    if not match_id:
        continue
    
    conv_id = match_id.group(1)
    
    # Check if this conversation belongs to our workspace
    if workspace_uri in block:
        # Extract title. Titles are often in the form of human-readable strings.
        # We saw "文献综述框架" in the user's history.
        # Let's try to find it.
        
        # Searching for strings that look like titles (not IDs, not URIs, not JSON)
        readable_strings = re.findall(r'[^\x00-\x1F\x7F-\x9F]{4,}', block)
        title = "Restored Conversation"
        for s in readable_strings:
            if s == conv_id: continue
            if workspace_uri in s: continue
            if 'http' in s: continue
            if '{' in s: continue
            if len(s) > 80: continue # Titles aren't that long
            # Skip common noise
            if s in ['trajectorySummaries', 'sidebarWorkspaces', 'antigravityUnifiedStateSync']: continue
            title = s
            break
        
        restoration_data.append({'id': conv_id, 'title': title})

if not restoration_data:
    print("No conversations found for this workspace in the trajectory summaries.")
    # Fallback: maybe the URI is slightly different?
    # Let's list all IDs found just in case.
    exit(1)

print(f"Found {len(restoration_data)} conversations to restore.")

# Connect to workspace DB
conn = sqlite3.connect(workspace_db_path)
cursor = conn.cursor()

# Get existing index
cursor.execute("SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index'")
row = cursor.fetchone()
current_index = []
if row:
    try:
        current_index = json.loads(row[0])
    except:
        pass

indexed_ids = {item['id'] for item in current_index if 'id' in item}

added_count = 0
for item in restoration_data:
    if item['id'] not in indexed_ids:
        # Append to index
        current_index.append({
            "id": item["id"],
            "title": item["title"],
            "isLocked": False
        })
        indexed_ids.add(item['id'])
        added_count += 1
        print(f"Adding: {item['id']} - {item['title']}")

if added_count > 0:
    new_index_json = json.dumps(current_index)
    cursor.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('chat.ChatSessionStore.index', ?)", (new_index_json,))
    conn.commit()
    print(f"Successfully added {added_count} conversations to the workspace index.")
else:
    print("All conversations are already in the index.")

conn.close()
