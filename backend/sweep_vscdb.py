import sqlite3
import os
import shutil

search_root = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User'
search_term = 'VCPChat'
temp_db_path = os.path.join(os.environ['TEMP'], 'sweep_copy.vscdb')

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
                        cursor.execute(f"SELECT key FROM {table_name}")
                        rows = cursor.fetchall()
                        for row in rows:
                            if search_term in str(row[0]):
                                print(f"MATCH in KEY: {full_path} | Table: {table_name} | Key: {row[0]}")
                        
                        cursor.execute(f"SELECT value FROM {table_name}")
                        rows = cursor.fetchall()
                        for row in rows:
                            if search_term in str(row[0]):
                                print(f"MATCH in VALUE: {full_path} | Table: {table_name}")
                                break # Found in this table, move on
                    except:
                        pass
                conn.close()
            except:
                pass
            finally:
                if os.path.exists(temp_db_path):
                    os.remove(temp_db_path)
