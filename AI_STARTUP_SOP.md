# AI 启动 SOP（最精简）

> 目标：让 Agent 在本机 **最快启动前后端**（Windows 本地开发模式）

## 0. 前置条件（仅首次确认）

- Python 3.10+
- Node.js 18+
- 已在仓库根目录：`literature-review-system`

---

## 1. 首次初始化（仅第一次需要）

### 1.1 后端依赖

在仓库根目录执行：

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

### 1.2 前端依赖

```powershell
Set-Location .\frontend
npm install
Set-Location ..
```

### 1.3（可选）最小后端配置

新建 `backend/.env`（如不配置也可启动，但调用 LLM 功能会失败）：

```env
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

---

## 2. 日常启动（两个终端）

## 终端 A：启动后端

```powershell
Set-Location .\backend
..\.venv\Scripts\python.exe run.py
```

后端地址：

- http://localhost:5444
- http://localhost:5444/api/docs

## 终端 B：启动前端

```powershell
Set-Location .\frontend
npm run dev
```

前端地址：

- http://localhost:5173

---

## 3. 一键重启（给 Agent 用，推荐）

在仓库根目录执行一条命令：

```powershell
$backendDir = "$PWD\backend"; $frontendDir = "$PWD\frontend"; $pythonExe = "$PWD\.venv\Scripts\python.exe"; foreach ($port in @(5444,5173)) { $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; if ($listeners) { $listeners | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } }; Start-Process -FilePath $pythonExe -ArgumentList "run.py" -WorkingDirectory $backendDir -WindowStyle Hidden; Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev" -WorkingDirectory $frontendDir -WindowStyle Hidden; Start-Sleep -Seconds 4; "Backend(5444): " + $(if(Get-NetTCPConnection -LocalPort 5444 -State Listen -ErrorAction SilentlyContinue){"UP"}else{"DOWN"}); "Frontend(5173): " + $(if(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue){"UP"}else{"DOWN"})
```

---

## 4. 快速自检

启动后检查：

- 打开 http://localhost:5173 能进入页面
- 打开 http://localhost:5444/api/docs 能看到 Swagger
- 若需要 AI 生成功能，先在前端设置页填入 API Key/模型

---

## 5. 常见故障（最短处理）

- 端口占用：先执行“3. 一键重启”
- 前端依赖异常：在 `frontend` 目录重新执行 `npm install`
- 后端依赖异常：激活 `.venv` 后重新执行 `pip install -r backend/requirements.txt`
