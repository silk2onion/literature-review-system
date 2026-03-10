import sqlite3
import os
import json
import re
import base64

# Config
WORKSPACE_ID = "f322a53140a274d66e911b2372eb1cf2"
USER_DATA_ROOT = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User'
WORKSPACE_DB = os.path.join(USER_DATA_ROOT, 'workspaceStorage', WORKSPACE_ID, 'state.vscdb')
GLOBAL_DB = os.path.join(USER_DATA_ROOT, 'globalStorage', 'state.vscdb')
CONVERSATIONS_DIR = r'C:\Users\zyh82\.gemini\antigravity\conversations'

DECODED_GLOBAL = r'c:\Users\zyh82\Desktop\literature 1\literature-review-system\backend\decoded_global.txt'

def extract_metadata():
    print("Extracting metadata from decoded global storage...")
    metadata_map = {}
    
    if not os.path.exists(DECODED_GLOBAL):
        print("Decoded global file not found.")
        return {}

    with open(DECODED_GLOBAL, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Find all trajectory blocks (UUID followed by a title)
    # The pattern in decoded_global.txt seems to be:
    #   $212c6dd8-d67d-4390-bf99-99604e8ac176
    # followed by printable strings
    
    blocks = re.split(r'\$([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', content)
    
    for i in range(1, len(blocks), 2):
        uid = blocks[i]
        next_part = blocks[i+1]
        
        # Try to find the first meaningful string in the next part (the title)
        # Strings are indented with 2 spaces in my previous decoding script
        strings = re.findall(r'  ([^\n]{4,})', next_part)
        title = "Restored Conversation"
        for s in strings:
            s_clean = s.strip()
            # Ignore base64 looking long strings and UUIDs
            if len(s_clean) < 100 and not re.search(r'[0-9a-f]{8}-', s_clean) and not s_clean.startswith('I'): 
                title = s_clean
                break
        
        metadata_map[uid] = {"id": uid, "title": title}
    
    print(f"Extracted {len(metadata_map)} conversation titles from global storage.")
    return metadata_map

def restore():
    metadata = extract_metadata()
    if not metadata:
        # Fallback: use the physical files
        print("Falling back to physical file list...")
        for f in os.listdir(CONVERSATIONS_DIR):
            if f.endswith(".pb"):
                uid = f[:-3]
                metadata[uid] = {"id": uid, "title": "Restored Conversation"}

    # Build the index JSON
    # Format: {"version":1,"entries":{"<uuid>":{"id":"<uuid>","title":"<title>","lastMessageTime":<timestamp>}}}
    # We'll use a dummy timestamp or current time.
    import time
    now = int(time.time() * 1000)
    
    index_data = {"version": 1, "entries": {}}
    for uid, meta in metadata.items():
        # Check if physical file exists
        if os.path.exists(os.path.join(CONVERSATIONS_DIR, uid + ".pb")):
            index_data["entries"][uid] = {
                "id": uid,
                "title": meta["title"],
                "lastMessageTime": now,
                "createdTime": now
            }

    print(f"Reconstructed index with {len(index_data['entries'])} conversations.")
    
    # Update the workspace DB
    print(f"Updating {WORKSPACE_DB}...")
    conn = sqlite3.connect(WORKSPACE_DB)
    cursor = conn.cursor()
    
    index_json = json.dumps(index_data)
    
    # Check if key exists
    cursor.execute("SELECT key FROM ItemTable WHERE key = 'chat.ChatSessionStore.index'")
    if cursor.fetchone():
        cursor.execute("UPDATE ItemTable SET value = ? WHERE key = 'chat.ChatSessionStore.index'", (index_json,))
    else:
        cursor.execute("INSERT INTO ItemTable (key, value) VALUES (?, ?)", ('chat.ChatSessionStore.index', index_json))
        
    conn.commit()
    conn.close()
    print("Done! Restoration complete. Please restart Antigravity.")

if __name__ == "__main__":
    restore()
