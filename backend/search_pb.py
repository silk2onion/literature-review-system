import os

pb_file = r'C:\Users\zyh82\.gemini\antigravity\conversations\8639b785-cd71-4d36-a765-3fccca3c2ed2.pb'
search_terms = [b'literature', b'Desktop', b'literature 1', b'literature-review-system']

try:
    with open(pb_file, 'rb') as f:
        content = f.read()
        for term in search_terms:
            if term in content:
                print(f"Found {term} in {pb_file}")
            else:
                print(f"NOT Found {term} in {pb_file}")
except Exception as e:
    print(f"Error reading {pb_file}: {e}")
