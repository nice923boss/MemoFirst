# MemoFirst：停止伺服器
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $Root ".server.pid"
$stopped = $false

if (Test-Path $pidFile) {
  $srvPid = (Get-Content $pidFile | Select-Object -First 1).Trim()
  $proc = Get-Process -Id $srvPid -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq "node") {
    try { Stop-Process -Id $srvPid -Force -ErrorAction Stop; $stopped = $true } catch {
      Write-Host "[錯誤] 無法停止 PID $srvPid：$($_.Exception.Message)" -ForegroundColor Red
      Write-Host "若伺服器由開機自啟或其他登入階段啟動，請以系統管理員身分執行 stop.bat。" -ForegroundColor Yellow
      exit 1
    }
  }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

if (-not $stopped) {
  # 後備：找占用連接埠、且確定是 node 的進程（不動 tailscaled）
  $port = 28470
  $cfgPath = Join-Path $Root "config\platform.env"
  if (Test-Path $cfgPath) {
    foreach ($line in [IO.File]::ReadAllLines($cfgPath, [Text.Encoding]::UTF8)) {
      if ($line.Trim() -match "^PORT=(\d+)$") { $port = [int]$Matches[1] }
    }
  }
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalAddress -eq "127.0.0.1" }
  foreach ($c in $conn) {
    $owner = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($owner -and $owner.ProcessName -eq "node") {
      try { Stop-Process -Id $owner.Id -Force -ErrorAction Stop; $stopped = $true } catch {
        Write-Host "[錯誤] 無法停止連接埠 $port 上的進程：$($_.Exception.Message)" -ForegroundColor Red
        exit 1
      }
    }
  }
}

if ($stopped) { Write-Host "伺服器已停止。（tailscale serve 設定保持不變）" -ForegroundColor Green }
else { Write-Host "沒有發現執行中的伺服器。" -ForegroundColor Yellow }
