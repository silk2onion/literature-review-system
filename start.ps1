# Literature Review System - One-Click Startup Script
# 启动前后端服务并显示访问地址

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "📚 Literature Review System - Starting..." -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

# Function to check if port is listening
function Test-PortListening {
    param([int]$port)
    $result = netstat -ano 2>$null | Select-String ":$port.*LISTENING"
    return $null -ne $result
}

# Start Backend
Write-Host "`n🚀 Starting Backend (Port 5444)..." -ForegroundColor Yellow
Set-Location "$projectRoot\backend"
Start-Process -NoNewWindow -FilePath "python" -ArgumentList "run.py" -PassThru | Out-Null

# Start Frontend
Write-Host "🚀 Starting Frontend (Port 5173)..." -ForegroundColor Yellow
Set-Location "$projectRoot\frontend"
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run dev" -PassThru | Out-Null

# Wait for services to start and verify
Write-Host "`n⏳ Waiting for services to start..." -ForegroundColor Cyan
$maxWait = 30
$elapsed = 0
$backendReady = $false
$frontendReady = $false

while (($elapsed -lt $maxWait) -and (-not ($backendReady -and $frontendReady))) {
    Start-Sleep -Seconds 1
    $elapsed++
    
    if (-not $backendReady) {
        $backendReady = Test-PortListening 5444
    }
    if (-not $frontendReady) {
        $frontendReady = Test-PortListening 5173
    }
}

Write-Host "`n================================================" -ForegroundColor Green
Write-Host "✅ Services Started Successfully!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green

Write-Host "`n📱 Frontend:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "⚙️  Backend:   http://localhost:5444" -ForegroundColor Cyan
Write-Host "📖 API Docs:  http://localhost:5444/api/docs" -ForegroundColor Cyan

Write-Host "`n💡 Tips:" -ForegroundColor Yellow
Write-Host "  - Backend logs will appear in a separate window" -ForegroundColor Gray
Write-Host "  - Frontend logs will appear in a separate window" -ForegroundColor Gray
Write-Host "  - Press Ctrl+C in each window to stop the service" -ForegroundColor Gray

Write-Host "`n📖 Opening Frontend in browser..." -ForegroundColor Cyan
Start-Sleep -Seconds 2
Start-Process "http://localhost:5173"

Write-Host ""
