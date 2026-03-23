@echo off
REM Literature Review System - One-Click Startup Batch File
REM 保证虚拟环境已激活并启动前后端

setlocal enabledelayedexpansion

cd /d "%~dp0"

REM Activate virtual environment and start services
call .venv\Scripts\activate.bat

echo.
echo ================================================
echo 📚 Literature Review System - Starting...
echo ================================================
echo.

REM Start Backend in a new window
echo 🚀 Starting Backend Server (Port 5444)...
start "Literature Review - Backend" cmd /k "cd backend && python run.py"

REM Wait a moment for backend to start
timeout /t 2 /nobreak

REM Start Frontend in a new window
echo 🚀 Starting Frontend Server (Port 5173)...
start "Literature Review - Frontend" cmd /k "cd frontend && npm run dev"

REM Wait for services to be ready
echo.
echo ⏳ Waiting for services to start...
timeout /t 5 /nobreak

echo.
echo ================================================
echo ✅ Services Started!
echo ================================================
echo.
echo 📱 Frontend:  http://localhost:5173
echo ⚙️  Backend:   http://localhost:5444
echo 📖 API Docs:  http://localhost:5444/api/docs
echo.
echo 💡 Tips:
echo    - Each service opens in its own window
echo    - Press Ctrl+C in each window to stop
echo    - Close this window to finish
echo.
echo 🌐 Opening frontend in browser...
timeout /t 2 /nobreak
start http://localhost:5173

echo.
pause
