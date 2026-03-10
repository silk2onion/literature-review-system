import base64
import re
import os

file_path = r'c:\Users\zyh82\Desktop\literature 1\literature-review-system\backend\global_vals.txt'
output_path = r'c:\Users\zyh82\Desktop\literature 1\literature-review-system\backend\decoded_global.txt'

def process(key, data, out):
    out.write(f"--- Decoding {key} ---\n")
    try:
        data = data.strip()
        decoded = base64.b64decode(data)
        out.write(repr(decoded) + '\n')
        out.write("Possible strings found:\n")
        # Find sequences of printable ASCII characters
        matches = re.findall(b'[\x20-\x7E]{4,}', decoded)
        for m in matches:
            out.write(f"  {m.decode('utf-8', errors='ignore')}\n")
        out.write("\n")
    except Exception as e:
        out.write(f"Error decoding {key}: {e}\n\n")

if not os.path.exists(file_path):
    print(f"File not found: {file_path}")
    exit(1)

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

current_key = None
base64_data = ""

with open(output_path, 'w', encoding='utf-8') as out:
    for line in lines:
        if line.startswith("Key: "):
            if current_key and base64_data:
                process(current_key, base64_data, out)
            current_key = line.strip()[5:]
            base64_data = ""
        elif line.strip() == "---":
            continue
        else:
            base64_data += line.strip()

    # Handle the very last one
    if current_key and base64_data:
        process(current_key, base64_data, out)

print(f"Done. Decoded output written to {output_path}")
