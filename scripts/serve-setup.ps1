# MemoFirst — attach tailscale serve so the tailnet can reach 127.0.0.1:PORT over
# HTTPS, then write the public URL to the URL file. Run once (persists across reboots).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$port = 28470
if (Test-Path '.env') {
  $m = Select-String -Path '.env' -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
  if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }
}

$ts = 'C:\Program Files\Tailscale\tailscale.exe'
if (-not (Test-Path $ts)) {
  $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
  if ($cmd) { $ts = $cmd.Source }
  else { Write-Host 'Tailscale not found. Install from https://tailscale.com/download and log in first.'; exit 1 }
}

function Invoke-Ts([string[]] $ArgList) {
  $errFile = Join-Path $env:TEMP ('tsserve-' + [Guid]::NewGuid().ToString('N') + '.err')
  $p = Start-Process -FilePath $ts -ArgumentList $ArgList -NoNewWindow -Wait -PassThru -RedirectStandardError $errFile
  $msg = ''
  if (Test-Path $errFile) { $msg = (Get-Content $errFile -Raw); Remove-Item $errFile -Force -ErrorAction SilentlyContinue }
  return [pscustomobject]@{ Code = $p.ExitCode; Err = $msg }
}

# Clear any previous mapping on this port, then attach https (fallback http)
Invoke-Ts @('serve', '--https', "$port", 'off') | Out-Null
Invoke-Ts @('serve', '--http', "$port", 'off') | Out-Null

$scheme = 'https'
$r = Invoke-Ts @('serve', '--bg', '--https', "$port", "$port")
if ($r.Code -ne 0) {
  Write-Host "HTTPS serve failed, falling back to HTTP. Detail: $($r.Err.Trim())"
  $scheme = 'http'
  $r = Invoke-Ts @('serve', '--bg', '--http', "$port", "$port")
}
if ($r.Code -ne 0) {
  Write-Host "tailscale serve failed: $($r.Err.Trim())"
  exit 1
}

# Resolve MagicDNS name via UTF-8 temp file (avoid CP950 pipeline corruption)
$tmp = Join-Path $env:TEMP ('tsstatus-' + [Guid]::NewGuid().ToString('N') + '.json')
Start-Process -FilePath $ts -ArgumentList 'status', '--json' -NoNewWindow -Wait -RedirectStandardOutput $tmp
$raw = [IO.File]::ReadAllText($tmp, (New-Object Text.UTF8Encoding($false)))
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

$dns = ''
try { $dns = ($raw | ConvertFrom-Json).Self.DNSName.TrimEnd('.') } catch { }

if ($dns) {
  $sep = if ($port -eq 443) { '' } else { ":$port" }
  $url = "${scheme}://${dns}${sep}/"
  $urlFile = [IO.Path]::Combine($root, "$([char]0x7DB2)$([char]0x5740).txt")
  [IO.File]::WriteAllText($urlFile, $url, (New-Object Text.UTF8Encoding($false)))
  Write-Host ""
  Write-Host "Tailscale serve attached ($scheme). Public URL saved to the URL file:"
  Write-Host "  $url"
  Write-Host "Share this URL with colleagues (they must be on the same tailnet)."
} else {
  Write-Host "Serve attached on $scheme port $port, but could not read the MagicDNS name."
  Write-Host "Run 'tailscale status' to verify you are logged in and MagicDNS is enabled."
}
