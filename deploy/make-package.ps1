# MemoFirst：產生可攜安裝包（deploy\dist\MemoFirst + zip）
# 用法：雙擊 deploy\make-package.bat（不影響正在執行的正式服務）
$ErrorActionPreference = "Continue"
$Deploy = $PSScriptRoot
$Proj = Split-Path -Parent $Deploy

function Fail($msg) { Write-Host "[錯誤] $msg" -ForegroundColor Red; exit 1 }

Write-Host "[1/6] 建置前端與編譯後端…" -ForegroundColor Cyan
Push-Location $Proj
& cmd /c "npm run build"
$b1 = $LASTEXITCODE
if (Test-Path (Join-Path $Proj "server\dist")) { Remove-Item (Join-Path $Proj "server\dist") -Recurse -Force -ErrorAction SilentlyContinue }
& cmd /c "npx tsc -p server\tsconfig.json"
$b2 = $LASTEXITCODE
Pop-Location
if ($b1 -ne 0) { Fail "前端建置失敗（結束碼 $b1）" }
if ($b2 -ne 0) { Fail "後端 tsc 編譯失敗（結束碼 $b2）" }
if (-not (Test-Path (Join-Path $Proj "server\dist\index.js"))) { Fail "找不到 server\dist\index.js" }
if (-not (Test-Path (Join-Path $Proj "client\dist\index.html"))) { Fail "找不到 client\dist\index.html" }
Write-Host "  前端與後端建置完成。" -ForegroundColor Green

Write-Host "[2/6] 組裝安裝包…" -ForegroundColor Cyan
$dist = Join-Path $Deploy "dist\MemoFirst"
# 停掉任何從 dist 執行的 node（避免鎖檔與把 dist\data 打進包造成資料外洩）
Get-Process node -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -and $_.Path.StartsWith($dist, [StringComparison]::OrdinalIgnoreCase) } |
  ForEach-Object { Write-Host "  停止從 dist 執行的 node（PID $($_.Id)）…" -ForegroundColor Yellow; Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path $dist) { Fail "無法清除舊的 dist（$dist）：仍有程序佔用檔案。請關閉後重試。" }
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$appDst = Join-Path $dist "app"
New-Item -ItemType Directory -Force -Path (Join-Path $appDst "server") | Out-Null

# 後端編譯輸出 + package.json
robocopy (Join-Path $Proj "server\dist") (Join-Path $appDst "server\dist") /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "複製 server\dist 失敗（$LASTEXITCODE）" }
Copy-Item (Join-Path $Proj "server\package.json") (Join-Path $appDst "server\package.json") -Force

# 前端建置輸出
robocopy (Join-Path $Proj "client\dist") (Join-Path $appDst "client\dist") /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "複製 client\dist 失敗（$LASTEXITCODE）" }

# 執行期 node_modules（來自專案根）。/XJD 跳過 workspace 連結（memofirst-client/server junction），避免壞連結。
Write-Host "  複製 node_modules（檔案多，需要一點時間）…"
robocopy (Join-Path $Proj "node_modules") (Join-Path $appDst "node_modules") /E /XJD /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "複製 node_modules 失敗（$LASTEXITCODE）" }

# 結構驗證：執行期關鍵依賴必須就位
foreach ($need in @("server\dist\index.js", "client\dist\index.html", "node_modules\express\package.json", "node_modules\sql.js\dist\sql-asm.js", "node_modules\yjs\package.json", "node_modules\ws\package.json")) {
  if (-not (Test-Path (Join-Path $appDst $need))) { Fail "打包結構異常：缺少 app\$need" }
}
# 洩漏防呆：主機資料與環境檔絕不進包
foreach ($leak in @("server\data", ".env", "server\.env")) {
  if (Test-Path (Join-Path $appDst $leak)) { Fail "偵測到不該進包的項目 app\$leak，中止打包" }
}

# 內附 node.exe
$nodeSrc = (Get-Command node).Source
Copy-Item $nodeSrc (Join-Path $dist "node.exe") -Force
# 安裝腳本與文件
Copy-Item (Join-Path $Deploy "payload\*") -Destination $dist -Recurse -Force
# 空資料目錄
foreach ($d in @("data", "logs")) { New-Item -ItemType Directory -Force -Path (Join-Path $dist $d) | Out-Null }

# 版本資訊（讀 package.json 一律以 UTF-8，避免 CP950 損壞中文 author）
$pkgRaw = [IO.File]::ReadAllText((Join-Path $Proj "package.json"), [Text.Encoding]::UTF8)
$pkg = $pkgRaw | ConvertFrom-Json
$nodeVer = (& $nodeSrc -v)
$verLines = @("app_version=$($pkg.version)", "node_version=$nodeVer", "built_at=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "built_from=$Proj")
[IO.File]::WriteAllLines((Join-Path $dist "version.txt"), $verLines, (New-Object Text.UTF8Encoding($true)))
Write-Host "  組裝完成：$dist" -ForegroundColor Green

Write-Host "[3/6] 腳本編碼正規化（ps1 補 UTF-8 BOM、bat 轉 ASCII+CRLF）…" -ForegroundColor Cyan
$utf8bom = New-Object Text.UTF8Encoding($true)
foreach ($f in Get-ChildItem -Path $dist -Recurse -Include "*.ps1") {
  $t = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) -replace "`r`n", "`n" -replace "`n", "`r`n"
  [IO.File]::WriteAllText($f.FullName, $t, $utf8bom)
}
foreach ($f in Get-ChildItem -Path $dist -Recurse -Include "*.bat") {
  $t = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::ASCII) -replace "`r`n", "`n" -replace "`n", "`r`n"
  [IO.File]::WriteAllText($f.FullName, $t, [Text.Encoding]::ASCII)
}
Write-Host "  編碼正規化完成。" -ForegroundColor Green

Write-Host "[4/6] 開站自我測試（連接埠 28471，用包內 node.exe 與獨立暫存資料目錄）…" -ForegroundColor Cyan
$tmp = Join-Path $env:TEMP ("memofirst-test-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Force -Path (Join-Path $tmp "data") | Out-Null
$env:HOST = "127.0.0.1"; $env:PORT = "28471"; $env:DATA_DIR = (Join-Path $tmp "data"); $env:DEV_BYPASS_LOGIN = ""
$p = Start-Process -FilePath (Join-Path $dist "node.exe") -ArgumentList "`"$(Join-Path $dist 'app\server\dist\index.js')`"" `
  -WorkingDirectory (Join-Path $dist "app") -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $tmp "out.log") -RedirectStandardError (Join-Path $tmp "err.log")
$ok = $false; $status = 0
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:28471/api/server-info" -UseBasicParsing -TimeoutSec 2; $status = $r.StatusCode; $ok = $true; break } catch { }
}
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
foreach ($k in @("HOST", "PORT", "DATA_DIR", "DEV_BYPASS_LOGIN")) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
if (-not $ok) {
  Write-Host "  err.log 內容：" -ForegroundColor Yellow
  if (Test-Path (Join-Path $tmp "err.log")) { Get-Content (Join-Path $tmp "err.log") -Tail 30 | Write-Host }
  Fail "自我測試失敗：包內伺服器 30 秒內沒有回應"
}
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "  自我測試通過：HTTP $status（/api/server-info）。" -ForegroundColor Green

# 洩漏防呆（頂層）：壓 zip 前確認 dist\data、dist\logs 無殘留
if (Get-ChildItem (Join-Path $dist "data") -File -Recurse -ErrorAction SilentlyContinue) { Fail "dist\data 有殘留檔，恐把資料打進包。" }
if (Get-ChildItem (Join-Path $dist "logs") -File -Recurse -ErrorAction SilentlyContinue) { Fail "dist\logs 有殘留 log。" }

Write-Host "[5/6] 壓縮 zip…" -ForegroundColor Cyan
$zip = Join-Path $Deploy "dist\MemoFirst-portable.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
& tar.exe -a -cf $zip -C (Join-Path $Deploy "dist") "MemoFirst"
if ($LASTEXITCODE -ne 0) { Fail "tar 壓縮失敗（結束碼 $LASTEXITCODE）" }
$zipMb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "  zip 完成：$zip（$zipMb MB）" -ForegroundColor Green

Write-Host "[6/6] 完成" -ForegroundColor Cyan
Write-Host ""
Write-Host "  安裝包資料夾：$dist"
Write-Host "  傳輸用壓縮檔：$zip（$zipMb MB）"
Write-Host ""
Write-Host "  部署到新電腦：複製 zip 過去，解壓到例如 C:\MemoFirst，雙擊 install.bat。" -ForegroundColor Green
Write-Host "  詳細流程見包內：安裝說明-管理者.md" -ForegroundColor Green
