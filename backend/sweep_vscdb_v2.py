import sqlite3
import os
import shutil

search_root = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User'
search_terms = ['VCPChat', '8639b785', '4e03d4c5', '37141246']
temp_db_path = os.path.join(os.environ['TEMP'], 'sweep_copy_v2.vscdb')

for root, dirs, files in os.walk(search_root):
    for file in files:
        if file.endswith('.vscdb'):
            full_path = os.path.join(root, file)
            try:
                shutil.copy2(full_path, temp_db_path)
                conn = sqlite3.connect(temp_db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                tables = cursor.fetchall()
                for table in tables:
                    table_name = table[0]
                    try:
                        cursor.execute(f"SELECT key, value FROM {table_name}")
                        rows = cursor.fetchall()
                        for key, value in rows:
                            match = None
                            for term in search_terms:
                                if term in str(key) or term in str(value):
                                    match = term
                                    break
                            if match:
                                print(f"MATCH [{match}] in {full_path} | Table: {table_name} | Key: {key}")
                                # Print a snippet of value
                                val_str = str(value)
                                if len(val_str) > 100:
                                    print(f"Value Preview: {val_str[:100]}...")
                                else:
                                    print(f"Value: {val_str}")
                                print("-" * 20)
                    except:
                        pass
                conn.close()
            except:
                pass
            finally:
                if os.path.exists(temp_db_path):
                    os.remove(temp_db_path)
