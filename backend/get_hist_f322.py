import sqlite3
import os
import shutil
import json

db_path = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\workspaceStorage\f322a53140a274d66e911b2372eb1cf2\state.vscdb'
temp_db_path = os.path.join(os.environ['TEMP'], 'state_copy_f322.vscdb')

try:
    shutil.copy2(db_path, temp_db_path)
    conn = sqlite3.connect(temp_db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM ItemTable WHERE key = 'antigravity.history'")
    row = cursor.fetchone()
    if row:
        print(f"Key: {row[0]}")
        print(f"Value: {row[1]}")
    else:
        print("antigravity.history key not found in this DB.")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
finally:
    if os.path.exists(temp_db_path):
        os.remove(temp_db_path)
