# MemoFirst：啟動伺服器（由 start.bat 或 install.ps1 呼叫）
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot

function Read-PlatformConfig {
  $cfg = @{}
  $p = Join-Path $Root "config\platform.env"
  if (Test-Path $p) {
    foreach ($line in [IO.File]::ReadAllLines($p, [Text.Encoding]::UTF8)) {
      $t = $line.Trim()
      if ($t -eq "" -or $t.StartsWith("#")) { continue }
      $i = $t.IndexOf("=")
      if ($i -lt 1) { continue }
      $k = $t.Substring(0, $i).Trim()
      $v = $t.Substring($i + 1).Trim()
      if ($v -ne "") { $cfg[$k] = $v }
    }
  }
  return $cfg
}

$cfg = Read-PlatformConfig
$port = 28470
if ($cfg.ContainsKey("PORT")) { $port = [int]$cfg["PORT"] }

# 資料目錄：預設在安裝包根目錄（app 之外），升級換 app 資料夾不動資料
$dataDir = Join-Path $Root "data"
if ($cfg.ContainsKey("DATA_DIR")) {
  $dataDir = $cfg["DATA_DIR"]
  if (-not [IO.Path]::IsPathRooted($dataDir)) { $dataDir = Join-Path $Root $dataDir }
}
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs") | Out-Null

# 已在執行中就不重複啟動
$pidFile = Join-Path $Root ".server.pid"
if (Test-Path $pidFile) {
  $srvPid = (Get-Content $pidFile | Select-Object -First 1).Trim()
  $proc = Get-Process -Id $srvPid -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq "node") {
    Write-Host "伺服器已在執行中（PID $srvPid）。要重啟請先執行 stop.bat。" -ForegroundColor Yellow
    $urlFile = Join-Path $Root "網址.txt"
    if (Test-Path $urlFile) { Get-Content $urlFile | Write-Host }
    exit 0
  }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# 環境變數（信任模型：只綁 127.0.0.1，對外一律走 tailscale serve）
$env:HOST = "127.0.0.1"
$env:PORT = "$port"
$env:DATA_DIR = $dataDir
$env:DEV_BYPASS_LOGIN = ""
if ($cfg.ContainsKey("ADMIN_LOGINS")) { $env:ADMIN_LOGINS = $cfg["ADMIN_LOGINS"] } else { $env:ADMIN_LOGINS = "" }
if ($cfg.ContainsKey("PUBLIC_URL")) { $env:PUBLIC_URL = $cfg["PUBLIC_URL"] } else { $env:PUBLIC_URL = "" }

$nodeExe = Join-Path $Root "node.exe"
$serverJs = Join-Path $Root "app\server\dist\index.js"
if (-not (Test-Path $nodeExe)) { Write-Host "[錯誤] 找不到 $nodeExe" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $serverJs)) { Write-Host "[錯誤] 找不到 $serverJs" -ForegroundColor Red; exit 1 }

Write-Host "啟動中（連接埠 $port）…"
$p = Start-Process -FilePath $nodeExe -ArgumentList "`"$serverJs`"" `
  -WorkingDirectory (Join-Path $Root "app") -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $Root "logs\server.log") `
  -RedirectStandardError (Join-Path $Root "logs\server.err.log")
Set-Content -Path $pidFile -Value $p.Id

# 健康檢查（最多 30 秒）— /api/server-info 為公開端點，可不帶身分驗證
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/server-info" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -ge 200) { $ok = $true; break }
  } catch { }
}

if ($ok) {
  Write-Host "伺服器啟動成功（PID $($p.Id)，本機連接埠 $port）。" -ForegroundColor Green
  $urlFile = Join-Path $Root "網址.txt"
  if (Test-Path $urlFile) {
    Write-Host ""
    Get-Content $urlFile | Write-Host
  } else {
    Write-Host "尚未設定 tailscale serve 對外網址，請先執行 install.bat。" -ForegroundColor Yellow
  }
  exit 0
} else {
  Write-Host "[錯誤] 伺服器啟動失敗，最近的錯誤紀錄：" -ForegroundColor Red
  $errLog = Join-Path $Root "logs\server.err.log"
  if (Test-Path $errLog) { Get-Content $errLog -Tail 20 | Write-Host }
  Write-Host "可把上面訊息與 CLAUDE-安裝提示詞.md 一起貼給 Claude Code 協助排除。" -ForegroundColor Yellow
  exit 1
}
