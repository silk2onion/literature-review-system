import os
import datetime

root = r'C:\Users\zyh82\AppData\Roaming\Antigravity\User\workspaceStorage'
workspaces = []

for d in os.listdir(root):
    path = os.path.join(root, d)
    if os.path.isdir(path):
        mtime = os.path.getmtime(path)
        workspaces.append((mtime, d))

workspaces.sort(key=lambda x: x[0], reverse=True)

for mtime, name in workspaces[:5]:
    dt = datetime.datetime.fromtimestamp(mtime)
    print(f"{dt} - {name}")
