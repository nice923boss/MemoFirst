# MemoFirst

「文件先行、先讀後議」的會議協作工具。會前大家在同一份文件上共編、批註，開會時直接討論結論，減少無效會議時間。

- 資料全存在架站主機本機（SQLite），不經任何雲端服務
- 透過 [Tailscale](https://tailscale.com/) 私有網路分享給同事，免帳號、免密碼、免授權碼
- 免費、MIT 授權開源

## 功能

- 即時共編會議文件（Yjs CRDT + TipTap 編輯器），多人游標同步
- 文件段落批註、回覆、標記已解決
- 會議範本：週會進度同步、內容選題企劃、客戶需求評審、季度業績檢討等
- 會議儀表板：批註與參與狀況統計
- 匯出會議記錄：Markdown、Word、PDF
- 每場會議可設「加入密碼」
- 角色：管理者、成員、會議建立者

## 下載安裝包（不需安裝 Node.js）

1. 到 [Releases](../../releases) 下載 `MemoFirst-portable.zip`
2. 解壓到固定位置，例如 `C:\MemoFirst`
3. 雙擊 `install.bat`，依畫面完成 Tailscale 登入與架站
4. 把產生的 `網址.txt` 內的網址分享給同一個 tailnet 的同事

詳細步驟見安裝包內的 `安裝說明-管理者.md`。

## 從原始碼執行

### 需求

- Windows 10 以上
- [Node.js](https://nodejs.org/)（開發與測試使用 v24）
- [Tailscale](https://tailscale.com/download)，並在 tailnet 管理後台 DNS 頁開啟 MagicDNS 與 HTTPS Certificates

### 啟動

| 檔案 | 用途 |
|---|---|
| `start.bat` | 啟動伺服器（背景執行，綁定 `127.0.0.1:28470`）。第一次會自動安裝套件、建置前端、編譯後端 |
| `serve-setup.bat` | 掛上 `tailscale serve`，產生 `網址.txt`（只需執行一次） |
| `stop.bat` | 停止伺服器（不影響 Tailscale） |

主機本人用 `http://localhost:28470` 開啟即為管理者；同事用 `網址.txt` 的 https 網址開啟，系統自動以其 Tailscale 身分登入。

設定檔：複製 `.env.example` 為 `.env` 後修改（連接埠、管理者 email 名單）。

### 開發

```bash
npm install
npm run dev
```

後端以 `tsx watch` 跑在 `127.0.0.1:28470`，前端 Vite 開發伺服器在 `http://localhost:5173`（API 與 WebSocket 代理到後端）。

### 打包

雙擊 `deploy\make-package.bat`，會建置前後端、組裝內附 `node.exe` 的可攜安裝包、用獨立連接埠自我測試，最後輸出：

```
deploy\dist\MemoFirst\               安裝包資料夾
deploy\dist\MemoFirst-portable.zip   傳輸用壓縮檔
```

## 專案結構

```
client/          前端（React + Vite + TipTap + Tailwind）
server/          後端（Express + WebSocket + Yjs + sql.js）
scripts/         start / stop / serve-setup 的 PowerShell 腳本
deploy/          打包腳本與安裝包內容（payload/）
```

## 安全模型

- 伺服器只綁 `127.0.0.1`，由 `tailscale serve` 反向代理並注入 `Tailscale-User-Login` 標頭作為身分。
- 請勿把 `HOST` 改成 `0.0.0.0`：區網任何人都能直連並偽造身分標頭。
- 對外只走 `tailscale serve`（tailnet 內部），不要用 `tailscale funnel`（公開網際網路）。

## 資料備份

會議資料存在 `server\data\memofirst.db`（安裝包版為 `data\memofirst.db`）。先停止伺服器，再複製這個檔案即可備份。

## 授權

[MIT License](LICENSE) © 2026 黃政文
