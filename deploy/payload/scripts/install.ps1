# MemoFirst：一鍵安裝（由 install.bat 以系統管理員身分呼叫）
# 流程：檢查 Tailscale → 確認登入 → 自動填管理者 → 掛 serve 網址 → 啟動伺服器 → 顯示網址
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot

function Fail($msg) {
  Write-Host ""
  Write-Host "[錯誤] $msg" -ForegroundColor Red
  Write-Host "排除方式：開啟本資料夾的 CLAUDE-安裝提示詞.md，把內容貼給 Claude Code，它會協助你完成安裝。" -ForegroundColor Yellow
  exit 1
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Fail "請直接雙擊 install.bat 執行（會自動要求系統管理員權限）。" }

$cfgPath = Join-Path $Root "config\platform.env"

# 讀 / 寫 config\platform.env 的單一鍵值（以 UTF-8 讀寫，避免 CP950 損壞中文註解）
function Set-CfgKey([string]$key, [string]$val, [switch]$OnlyIfEmpty) {
  if (-not (Test-Path $cfgPath)) { return }
  $lines = [IO.File]::ReadAllLines($cfgPath, [Text.Encoding]::UTF8)
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$([regex]::Escape($key))\s*=(.*)$") {
      $found = $true
      if ($OnlyIfEmpty -and $Matches[1].Trim() -ne "") { return }
      $lines[$i] = "$key=$val"
    }
  }
  if (-not $found) { $lines += "$key=$val" }
  [IO.File]::WriteAllLines($cfgPath, $lines, (New-Object Text.UTF8Encoding($true)))
}

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  MemoFirst：一鍵安裝" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# 讀取連接埠（此埠同時是對外網址的埠：https://主機名:<PORT>/）
$port = 28470
if (Test-Path $cfgPath) {
  foreach ($line in [IO.File]::ReadAllLines($cfgPath, [Text.Encoding]::UTF8)) {
    if ($line.Trim() -match "^PORT=(\d+)$") { $port = [int]$Matches[1] }
  }
}

# ---------- 步驟 1/5：檢查 Tailscale ----------
Write-Host "[1/5] 檢查 Tailscale…"
$ts = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
if (-not (Test-Path $ts)) {
  $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
  if ($cmd) { $ts = $cmd.Source }
}
if (-not (Test-Path $ts)) {
  Write-Host "  未偵測到 Tailscale，嘗試自動安裝…" -ForegroundColor Yellow
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    & winget install --id Tailscale.Tailscale -e --silent --accept-package-agreements --accept-source-agreements
  }
  $ts = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
  if (-not (Test-Path $ts)) {
    Write-Host "  改用官方安裝程式（請依畫面指示完成安裝）…" -ForegroundColor Yellow
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      $setup = Join-Path $env:TEMP "tailscale-setup-latest.exe"
      Invoke-WebRequest -Uri "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe" -OutFile $setup -UseBasicParsing
      Start-Process -FilePath $setup -Wait
    } catch { }
  }
  $ts = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
  if (-not (Test-Path $ts)) {
    Fail "Tailscale 安裝未完成。請先到 https://tailscale.com/download/windows 手動安裝並登入，再重新執行 install.bat。"
  }
}
Write-Host "  Tailscale 已安裝：$ts" -ForegroundColor Green

# ---------- 步驟 2/5：確認登入狀態 ----------
Write-Host "[2/5] 檢查 Tailscale 登入狀態…"
function Get-TsStatus {
  # tailscale.exe 輸出固定為 UTF-8；中文版主控台 CP950 用管線接收會損壞含中文 DisplayName 的 JSON。
  # 改走暫存檔以 UTF-8 讀取。
  $tmp = Join-Path $env:TEMP ("ts-status-" + [Guid]::NewGuid().ToString("N") + ".json")
  try {
    Start-Process -FilePath $ts -ArgumentList "status", "--json" -NoNewWindow -Wait -RedirectStandardOutput $tmp
    $raw = [IO.File]::ReadAllText($tmp, (New-Object Text.UTF8Encoding($false)))
    if ($raw.Trim() -eq "") { return $null }
    return $raw | ConvertFrom-Json
  } catch { return $null }
  finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

$st = Get-TsStatus
if (-not $st) {
  try { Start-Service Tailscale -ErrorAction SilentlyContinue } catch { }
  Start-Sleep -Seconds 3
  $st = Get-TsStatus
}
if (-not $st) { Fail "無法取得 Tailscale 狀態，請確認 Tailscale 服務已啟動（工作列應有 Tailscale 圖示）。" }

if ($st.BackendState -ne "Running") {
  Write-Host "  這台電腦的 Tailscale 尚未登入或未連線，現在開啟登入流程…" -ForegroundColor Yellow
  Write-Host "  瀏覽器將開啟 Tailscale 登入頁，請用這台電腦要使用的帳號登入。" -ForegroundColor Yellow
  & $ts up
  Start-Sleep -Seconds 2
  $st = Get-TsStatus
  if (-not $st -or $st.BackendState -ne "Running") {
    Fail "Tailscale 登入未完成。請點工作列的 Tailscale 圖示完成登入後，重新執行 install.bat。"
  }
}
Write-Host "  Tailscale 已連線。" -ForegroundColor Green

# 偵測登入帳號，自動填為管理者（僅在 ADMIN_LOGINS 尚未設定時）
$login = $null
try {
  $uid = $st.Self.UserID
  $prop = $st.User.PSObject.Properties["$uid"]
  if ($prop) { $login = $prop.Value.LoginName }
} catch { }
if ($login) {
  Write-Host "  本機 Tailscale 帳號：$login" -ForegroundColor Green
  Set-CfgKey "ADMIN_LOGINS" $login -OnlyIfEmpty
  Write-Host "  已將 $login 設為管理者（之後可在 config\platform.env 增減）。" -ForegroundColor Green
} else {
  Write-Host "  無法自動偵測登入帳號，請稍後手動編輯 config\platform.env 的 ADMIN_LOGINS。" -ForegroundColor Yellow
}

# ---------- 步驟 3/5：設定對外網址（tailscale serve） ----------
Write-Host "[3/5] 設定對外網址（tailscale serve，連接埠 $port）…"
# 只關掉本平台這個埠的舊設定，不用 serve reset，才不會動到同機其他平台。
& $ts serve --https=$port off *> $null
& $ts serve --http=$port off *> $null
$scheme = "https"
& $ts serve --bg --https=$port $port
if ($LASTEXITCODE -ne 0) {
  Write-Host "  https 未能設定：這個 tailnet 尚未啟用 HTTPS 憑證，改用 http（同一個埠）繼續。" -ForegroundColor Yellow
  Write-Host "  升級方式：管理者到 https://login.tailscale.com/admin/dns 啟用 HTTPS Certificates，再重跑 install.bat。" -ForegroundColor Yellow
  & $ts serve --bg --http=$port $port
  if ($LASTEXITCODE -ne 0) {
    Fail "tailscale serve 設定失敗（結束碼 $LASTEXITCODE）。可能是 Tailscale 版本過舊，請先更新再重跑 install.bat。"
  }
  $scheme = "http"
  Write-Host "  http 網址（連接埠 $port）設定完成。" -ForegroundColor Green
} else {
  Write-Host "  https 網址（連接埠 $port）設定完成。" -ForegroundColor Green
}

# ---------- 步驟 4/5：取得網址並寫入設定 ----------
Write-Host "[4/5] 取得平台網址…"
$st2 = Get-TsStatus
$dns = ""
if ($st2 -and $st2.Self.DNSName) { $dns = $st2.Self.DNSName.TrimEnd(".") }
if ($dns -eq "") { Fail "無法取得 tailnet 網域名稱（MagicDNS 可能未啟用，請到 Tailscale 管理後台 DNS 頁啟用 MagicDNS）。" }

# 注意 ${scheme}：PowerShell 會把 "$scheme://" 的冒號當命名空間分隔，需用 ${} 界定變數名。
$portSuffix = if ($port -eq 443) { "" } else { ":$port" }
$url = "${scheme}://$dns$portSuffix/"

# 寫入 PUBLIC_URL 供首頁顯示（app 讀 process.env.PUBLIC_URL）
Set-CfgKey "PUBLIC_URL" $url

# 產生人類可讀的網址.txt
if ($scheme -eq "https") {
  $urlLines = @(
    "MemoFirst 連線網址（同一 tailnet 內的同事都可開啟）：",
    "  $url",
    "",
    "使用前提：同事電腦需安裝 Tailscale 並登入同一個 tailnet（邀請方式見 安裝說明-管理者.md）。",
    "產生時間：$(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  )
} else {
  $urlLines = @(
    "MemoFirst 連線網址（同一 tailnet 內的同事都可開啟；瀏覽器顯示「不安全」屬預期，流量仍在內網）：",
    "  $url",
    "",
    "升級為 https（去除「不安全」標示）：",
    "  管理者到 https://login.tailscale.com/admin/dns 啟用 HTTPS Certificates，再重跑 install.bat。",
    "",
    "使用前提：同事電腦需安裝 Tailscale 並登入同一個 tailnet。",
    "產生時間：$(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  )
}
[IO.File]::WriteAllLines((Join-Path $Root "網址.txt"), $urlLines, (New-Object Text.UTF8Encoding($true)))

# ---------- 步驟 5/5：啟動伺服器 ----------
Write-Host "[5/5] 啟動平台伺服器…"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "start.ps1")
if ($LASTEXITCODE -ne 0) { Fail "伺服器啟動失敗，請見上方錯誤訊息。" }

if ($scheme -eq "https") {
  Write-Host "  確認 https 憑證（首次簽發約需幾秒到一分鐘）…"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  for ($i = 0; $i -lt 12; $i++) {
    try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 | Out-Null; break }
    catch { Start-Sleep -Seconds 5 }
  }
}

# 開機自動啟動（預設建議開啟）
Write-Host ""
$ans = Read-Host "要設定開機自動啟動嗎？（伺服器重開機後自動恢復服務）[Y/n]"
if ($ans -eq "" -or $ans -match "^[Yy]") {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "autostart.ps1") -Mode on
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "  安裝完成！" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  MemoFirst 網址：$url" -ForegroundColor Cyan
Write-Host ""
Write-Host "  這個網址已存在「網址.txt」，可直接公告給同事。"
Write-Host "  給同事的使用教學：使用說明書.html"
Write-Host "  管理與維運手冊：安裝說明-管理者.md"
Write-Host "  日常操作：start.bat 啟動、stop.bat 停止"
Write-Host ""
