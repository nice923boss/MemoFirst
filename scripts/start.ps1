# MemoFirst — start the app on 127.0.0.1 in the background.
# Identity comes from tailscale serve; run serve-setup once to publish the URL.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Resolve port from .env (default 28470)
$port = 28470
if (Test-Path '.env') {
  $m = Select-String -Path '.env' -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
  if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }
}

# Already running? Only the app's loopback listener counts (not tailscaled's tailnet-IP one).
$listening = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalAddress -eq '127.0.0.1' }
if ($listening) {
  Write-Host "MemoFirst already running on 127.0.0.1:$port"
  exit 0
}

# Ensure dependencies and builds
if (-not (Test-Path 'node_modules')) { Write-Host 'Installing dependencies...'; npm install }
if (-not (Test-Path 'client\dist\index.html')) { Write-Host 'Building client...'; npx vite build client }
if (-not (Test-Path 'server\dist\index.js')) { Write-Host 'Compiling server...'; npx tsc -p server\tsconfig.json }

# Launch node in the background (hidden), redirect logs, record PID
$node = (Get-Command node).Source
$proc = Start-Process -FilePath $node -ArgumentList 'server\dist\index.js' `
  -WorkingDirectory $root -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput 'server.log' -RedirectStandardError 'server.err.log'
$proc.Id | Out-File -FilePath '.server.pid' -Encoding ascii -NoNewline

Start-Sleep -Seconds 2
Write-Host ""
Write-Host "MemoFirst started (PID $($proc.Id))."
Write-Host "  Host maintenance      : http://localhost:$port"
if (Test-Path ([IO.Path]::Combine($root, "$([char]0x7DB2)$([char]0x5740).txt"))) {
  $urlFile = [IO.Path]::Combine($root, "$([char]0x7DB2)$([char]0x5740).txt")
  Write-Host "  Colleagues (Tailscale): $((Get-Content $urlFile -Raw).Trim())"
} else {
  Write-Host "  Colleagues            : run serve-setup.bat once to publish the Tailscale URL."
}
