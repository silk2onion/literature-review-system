import hashlib

def get_workspace_hash(uri):
    # VS Code / Antigravity usually uses a simple hash of the URI
    # For local files, it's often a hex md5 of the lowercased URI or similar
    uri_lower = uri.lower()
    return hashlib.md5(uri_lower.encode('utf-8')).hexdigest()

uri = "file:///c%3A/Users/zyh82/Desktop/literature%201"
print(f"MD5 (raw): {hashlib.md5(uri.encode('utf-8')).hexdigest()}")
print(f"MD5 (lower): {hashlib.md5(uri.lower().encode('utf-8')).hexdigest()}")

# Try with unencoded path too
# path = "c:\Users\zyh82\Desktop\literature 1"
# uri_alt = "file:///c:/Users/zyh82/Desktop/literature 1"
# ...
