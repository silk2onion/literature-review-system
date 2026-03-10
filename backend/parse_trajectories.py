import re

file_path = r'c:\Users\zyh82\Desktop\literature 1\literature-review-system\backend\antigravityUnifiedStateSync.trajectorySummaries_decoded.txt'
workspace_uri = 'file:///c%3A/Users/zyh82/Desktop/literature%201'

with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Try to find IDs (UUID format) and Titles
# Based on the file preview, IDs are prefaced with $
# Titles are in the block following the ID
# Workspaces are also in that block

blocks = re.split(r'\$', content)
results = []

for block in blocks:
    if not block.strip():
        continue
    
    # ID is the first part
    match_id = re.match(r'^([a-f0-9\-]+)', block)
    if not match_id:
        continue
    
    conv_id = match_id.group(1)
    
    # Check if workspace URI is in this block
    if workspace_uri in block:
        # Try to find the title. 
        # Titles seem to follow "Ch" or similar prefixes in the binary-to-text decoding
        # Looking at the file, they are strings like "文献综述框架"
        # Since it's a messy decode, we'll look for strings that looks like titles
        
        # Let's search for "文献综述框架" as a test
        # Actually let's just find anything between "Ch" and some marker
        # or just extract all readable strings
        
        # Heuristic: Title is usually before the workspace URI in the trajectory object
        # Let's try to extract non-base64 looking strings longer than 4 chars
        readable_strings = re.findall(r'[^\x00-\x1F\x7F-\x9F]{4,}', block)
        title = "Unknown Title"
        for s in readable_strings:
            if s == conv_id: continue
            if workspace_uri in s: continue
            if 'http' in s: continue
            if '{' in s: continue # JSON
            if len(s) > 100: continue # Likely body content, not title
            title = s
            break
        
        results.append({'id': conv_id, 'title': title})

print(f"Found {len(results)} conversations for {workspace_uri}:")
for res in results:
    print(f"ID: {res['id']} | Title: {res['title']}")
