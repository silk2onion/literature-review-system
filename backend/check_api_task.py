import requests
import json

try:
    r = requests.get('http://localhost:5444/api/reviews/phd/tasks')
    data = r.json()
    tasks = data.get('tasks', [])
    found = False
    for t in tasks:
        if t.get('task_id') == '01d99b31':
            found = True
            print(f"ID: {t['task_id']}")
            print(f"STATUS: {t['status']}")
            print(f"ERROR: {t.get('error')}")
            print("STEPS:")
            for s in t.get('steps', []):
                print(f"  - {s['label']}: {s['status']} ({s.get('message')})")
    if not found:
        print("Task not found in API list.")
except Exception as e:
    print(f"ERROR: {e}")
