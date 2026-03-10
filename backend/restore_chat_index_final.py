import sqlite3
import os
import re
import json
import base64

# Configuration
sync_data_file = r'c:\Users\zyh82\Desktop\literature 1\literature-review-system\backend\antigravityUnifiedStateSync.trajectorySummaries_decoded.txt'
workspace_db_path = 'C:/Users/zyh82/AppData/Roaming/Antigravity/User/workspaceStorage/f322a53140a274d66e911b2372eb1cf2/state.vscdb'

def extract_metadata():
    if not os.path.exists(sync_data_file):
        print(f"Sync data file not found: {sync_data_file}")
        return {}

    with open(sync_data_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find all UUIDs (prefixed by $ or in 1: "UUID" format)
    uuids = re.findall(r'([a-f0-9\-]{36})', content)
    conv_ids = sorted(list(set(uuids))) # Unique IDs
    
    print(f"Found {len(conv_ids)} potential conversation IDs.")
    
    id_to_title = {}
    for cid in conv_ids:
        # Search for title in a chunk around the ID
        pos = content.find(cid)
        if pos == -1: continue
        
        # Look forward 500 chars for a potential title blob
        chunk = content[pos:pos+1000]
        
        title = "Restored Chat"
        # Look for base64 blobs starting with Ch (common proto string header for title tag 1)
        title_blobs = re.findall(r'Ch[a-zA-Z0-9+/=]{10,}', chunk)
        
        for blob in title_blobs:
            try:
                # Add padding if needed
                missing_padding = len(blob) % 4
                if missing_padding:
                    blob += '=' * (4 - missing_padding)
                
                decoded_bytes = base64.b64decode(blob)
                if decoded_bytes.startswith(b'\x0a'):
                    # Proto tag 1 (Title)
                    # Next byte is length
                    length = decoded_bytes[1]
                    if length < len(decoded_bytes):
                        raw_title = decoded_bytes[2:2+length].decode('utf-8', errors='ignore')
                        if len(raw_title) > 2:
                            title = raw_title.strip()
                            break
            except:
                continue
        id_to_title[cid] = title
    
    return id_to_title

def restore():
    print("Starting chat restoration...")
    
    # 1. Get metadata
    id_to_title = extract_metadata()
    if not id_to_title:
        print("No metadata found.")
        return

    print(f"Found {len(id_to_title)} conversations in sync data.")

    # 2. Build index in v1 format (Dictionary-based)
    new_entries = {}
    for cid, title in id_to_title.items():
        # Use a consistent timestamp (current time approx)
        ts = 1772932633655 
        new_entries[cid] = {
            "id": cid,
            "title": title,
            "lastMessageTime": ts,
            "createdTime": ts
        }

    final_index = {
        "version": 1,
        "entries": new_entries
    }

    print(f"Constructed index wrapper for {len(new_entries)} entries.")

    # 3. Write to SQLite
    if not os.path.exists(workspace_db_path):
        print(f"Workspace DB not found: {workspace_db_path}")
        return

    try:
        conn = sqlite3.connect(workspace_db_path)
        cursor = conn.cursor()
        
        # Verify ItemTable exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'")
        if not cursor.fetchone():
            print("ItemTable not found in database.")
            conn.close()
            return

        # Insert/Replace the index key
        json_data = json.dumps(final_index)
        cursor.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('chat.ChatSessionStore.index', ?)", (json_data,))
        
        # Also clear global index to prevent conflicts if needed
        # (Optional, but let's stick to workspace for now)
        
        conn.commit()
        conn.close()
        print(f"Successfully wrote index to {workspace_db_path}")
        print("Done. Please restart Antigravity.")
    except Exception as e:
        print(f"Database error: {e}")

if __name__ == "__main__":
    restore()
