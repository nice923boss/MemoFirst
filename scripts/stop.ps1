# MemoFirst — stop the background app. Leaves tailscale serve untouched.
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$port = 28470
if (Test-Path '.env') {
  $m = Select-String -Path '.env' -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
  if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }
}

$stopped = $false
if (Test-Path '.server.pid') {
  $serverPid = (Get-Content '.server.pid' -Raw).Trim()
  if ($serverPid) {
    $proc = Get-Process -Id ([int]$serverPid) -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq 'node') {
      Stop-Process -Id $proc.Id -Force
      $stopped = $true
    }
  }
  Remove-Item '.server.pid' -Force -ErrorAction SilentlyContinue
}

if (-not $stopped) {
  # Fallback: kill only the node listening on 127.0.0.1:port (never tailscaled).
  $conns = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalAddress -eq '127.0.0.1' }
  foreach ($c in $conns) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq 'node') { Stop-Process -Id $proc.Id -Force }
  }
}

Write-Host "MemoFirst stopped. (tailscale serve setting left untouched.)"
