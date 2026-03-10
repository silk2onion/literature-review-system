import base64
import re

file_path = r'c:\Users\zyh82\Desktop\literature 1\literature-review-system\backend\global_vals.txt'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

current_key = None
base64_data = ""

for line in lines:
    if line.startswith("Key: "):
        if current_key and base64_data:
            print(f"--- Decoding {current_key} ---")
            try:
                decoded = base64.b64decode(base64_data)
                # Try to print as text, if it fails, print as repr
                try:
                    text = decoded.decode('utf-8')
                    print(text)
                except:
                    # Print as repr but try to find strings in it
                    print(repr(decoded))
                    # Extract anything that looks like a UUID or a path
                    matches = re.findall(b'[\x20-\x7E]{4,}', decoded)
                    if matches:
                        print("Possible strings found:")
                        for m in matches:
                            print(f"  {m.decode('utf-8', errors='ignore')}")
            except Exception as e:
                print(f"Error decoding: {e}")
            base64_data = ""
        current_key = line.strip()[5:]
    elif line.strip() == "---":
        pass
    else:
        base64_data += line.strip()

# Handle last key
if current_key and base64_data:
    print(f"--- Decoding {current_key} ---")
    try:
        decoded = base64.b64decode(base64_data)
        try:
            text = decoded.decode('utf-8')
            print(text)
        except:
            print(repr(decoded))
            matches = re.findall(b'[\x20-\x7E]{4,}', decoded)
            if matches:
                print("Possible strings found:")
                for m in matches:
                    print(f"  {m.decode('utf-8', errors='ignore')}")
    except Exception as e:
        print(f"Error decoding: {e}")
