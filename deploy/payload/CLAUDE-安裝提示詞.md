# MemoFirst 安裝排錯提示（貼給 Claude Code）

我在新電腦安裝 MemoFirst 可攜包時遇到問題，請依下列背景協助我排除。附上 `logs\server.err.log` 最後 30 行與我看到的錯誤訊息。

## 這是什麼

MemoFirst 是區網會議協作工具，採「Tailscale 免密架站」：伺服器只綁 `127.0.0.1:<PORT>`（預設 28470），由 `tailscale serve` 反代給 tailnet 並注入 `Tailscale-User-Login` 標頭當身分，全程免帳密。資料庫是 sql.js（純 JS，無原生模組，故無 ABI 問題）。

## 安裝包結構（解壓後）

```
MemoFirst\
  node.exe                     內附 Node（目標機不需裝 Node）
  app\
    server\dist\index.js       後端進入點（node.exe app\server\dist\index.js）
    server\package.json
    client\dist\               前端（Express static 提供）
    node_modules\             執行期依賴
  config\platform.env          PORT / ADMIN_LOGINS / PUBLIC_URL / DATA_DIR
  scripts\                     install/start/stop/autostart/upgrade .ps1
  install.bat start.bat stop.bat upgrade.bat autostart-on.bat autostart-off.bat
  data\ logs\                  首次啟動自動填
  網址.txt version.txt
```

啟動時 `scripts\start.ps1` 從 `config\platform.env` 讀設定，設環境變數 `HOST=127.0.0.1`、`PORT`、`DATA_DIR`（指向 app 外的根目錄 data）、`ADMIN_LOGINS`、`PUBLIC_URL`、`DEV_BYPASS_LOGIN=""`，隱藏視窗跑 `node.exe app\server\dist\index.js`（cwd=app），輪詢 `http://127.0.0.1:<PORT>/api/server-info` 健康檢查。

## 一鍵安裝六件事（install.ps1）

1. 檢查 / 安裝 Tailscale（winget 或官方安裝程式）
2. 確認登入（`tailscale status --json` 走暫存檔以 UTF-8 讀，避免 CP950 損壞中文）
3. 自動把本機登入帳號填進 `ADMIN_LOGINS`（僅在其為空時）
4. 掛 serve：先 `--https=<PORT> off` 與 `--http=<PORT> off` 清舊，再 `--bg --https=<PORT> <PORT>`；失敗退回同埠 http
5. 產生 `網址.txt` 並把 `PUBLIC_URL` 寫進 `config\platform.env`；https 首連暖機簽憑證
6. 詢問是否開機自啟（VBS 放「所有使用者」開機啟動資料夾）

## 常見問題

- 憑證簽不出來 / serve https 失敗：tailnet 未開 MagicDNS 或 HTTPS Certificates。到 https://login.tailscale.com/admin/dns 開啟，再重跑 install.bat。腳本會先退回 http。
- 同事開網址顯示「請透過 Tailscale 網址存取」：對方沒登入同一個 tailnet，或用了 IP/localhost 而非 ts.net 網址。
- start 卡「啟動中」約 30 秒後失敗：node 一起來就崩，真因在 `logs\server.err.log`。`EADDRINUSE`＝埠被占（先 stop.bat 或 autostart-off.bat 再 taskkill /F /IM node.exe，需系統管理員）。
- 解壓後 `scripts\*.ps1` 不見：防毒隔離。用 `tar -xf` 重解或加防毒排除。
- 埠檢查請一律綁 `127.0.0.1`：serve 掛上後 tailscaled 會 LISTEN 在 tailnet-IP:<PORT>，用裸埠比對會誤判佔用。

## 安全底線（不可違反）

- 伺服器只綁 `127.0.0.1`，嚴禁 `0.0.0.0`（否則區網任何人可直連並偽造身分標頭）。
- 對外一律走 `tailscale serve`，不用 funnel（那是公網）。
