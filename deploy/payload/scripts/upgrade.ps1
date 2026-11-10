# MemoFirst：就地升級（由 upgrade.bat 以系統管理員身分呼叫，在「新版解壓包」內執行）
# 保留既有 data（會議資料）與 config（管理者名單、連接埠、網址），只換程式與 node.exe。
$ErrorActionPreference = "Continue"
$NewRoot = Split-Path -Parent $PSScriptRoot

function Fail($m) { Write-Host "[錯誤] $m" -ForegroundColor Red; exit 1 }

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  MemoFirst：升級到新版" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "此程式在「新版解壓包」內執行，會把新版套用到你「既有安裝」資料夾，"
Write-Host "保留既有 data 與 config。"
Write-Host ""

$target = (Read-Host "請輸入既有 MemoFirst 安裝資料夾路徑（例如 C:\MemoFirst）").Trim('"').Trim()
if (-not (Test-Path $target)) { Fail "找不到資料夾：$target" }
if (-not (Test-Path (Join-Path $target "app\server\dist\index.js"))) { Fail "$target 不是 MemoFirst 安裝資料夾（缺 app\server\dist\index.js）。" }
if ((Resolve-Path $target).Path -eq (Resolve-Path $NewRoot).Path) { Fail "目標不能是新版解壓包本身，請指定既有安裝資料夾。" }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

# 讀取目標埠
$port = 28470
$cfg = Join-Path $target "config\platform.env"
if (Test-Path $cfg) {
  foreach ($line in [IO.File]::ReadAllLines($cfg, [Text.Encoding]::UTF8)) {
    if ($line.Trim() -match "^PORT=(\d+)$") { $port = [int]$Matches[1] }
  }
}

# 1) 關開機自啟避免升級中被重新拉起，再停舊服務，最後清掉仍占埠的 node
Write-Host "[1/5] 停止既有服務…"
$ta = Join-Path $target "scripts\autostart.ps1"
if (Test-Path $ta) { & powershell -NoProfile -ExecutionPolicy Bypass -File $ta -Mode off | Out-Null }
$tstop = Join-Path $target "scripts\stop.ps1"
if (Test-Path $tstop) { & powershell -NoProfile -ExecutionPolicy Bypass -File $tstop | Out-Null }
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq "127.0.0.1" }
foreach ($c in $conn) {
  $o = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
  if ($o -and $o.ProcessName -eq "node") { Stop-Process -Id $o.Id -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 2

# 2) 備份 data + config
Write-Host "[2/5] 備份 data 與 config…"
$backup = Join-Path $target "_backup\$stamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null
if (Test-Path (Join-Path $target "data")) { robocopy (Join-Path $target "data") (Join-Path $backup "data") /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null }
if (Test-Path (Join-Path $target "config")) { robocopy (Join-Path $target "config") (Join-Path $backup "config") /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null }
Write-Host "  已備份到：$backup" -ForegroundColor Green

# 3) 換 app（舊 app 保留為 app.old-<時戳> 供回滾）
Write-Host "[3/5] 套用新版程式…"
$oldKept = Join-Path $target "app.old-$stamp"
$appDir = Join-Path $target "app"
if (Test-Path $appDir) { Rename-Item -Path $appDir -NewName "app.old-$stamp" -ErrorAction Stop }
robocopy (Join-Path $NewRoot "app") $appDir /E /XJD /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "複製新版 app 失敗（$LASTEXITCODE）。舊版保留在 $oldKept。" }
if (-not (Test-Path (Join-Path $appDir "server\dist\index.js"))) { Fail "新版 app 複製不完整。舊版保留在 $oldKept。" }

# 4) 換 node.exe 與腳本（config 與 data 不動）
Write-Host "[4/5] 更新 node.exe 與腳本…"
Copy-Item (Join-Path $NewRoot "node.exe") (Join-Path $target "node.exe") -Force
robocopy (Join-Path $NewRoot "scripts") (Join-Path $target "scripts") /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null
foreach ($f in @("install.bat", "start.bat", "stop.bat", "upgrade.bat", "autostart-on.bat", "autostart-off.bat", "使用說明書.html", "安裝說明-管理者.md", "CLAUDE-安裝提示詞.md", "version.txt")) {
  $src = Join-Path $NewRoot $f
  if (Test-Path $src) { Copy-Item $src (Join-Path $target $f) -Force }
}

# 5) 啟動
Write-Host "[5/5] 啟動新版…"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $target "scripts\start.ps1")
if ($LASTEXITCODE -ne 0) {
  Write-Host "[警告] 啟動失敗。可回滾：刪除新 app，將 $oldKept 改名回 app，再執行 start.bat。" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "升級完成。舊版程式保留在：$oldKept（確認正常後可刪）。" -ForegroundColor Green
Write-Host "資料與設定備份在：$backup" -ForegroundColor Green
Write-Host "若之前有開機自啟，請重新雙擊 autostart-on.bat 開啟。" -ForegroundColor Yellow
