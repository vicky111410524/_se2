# 第 9 週作業報告：Cloud Native Todo & Notes App

> 一個可部署到 **Cloudflare Pages** 的全端 Web 應用程式：雲端待辦事項與筆記管理工具。

---

## 一、專案介紹

本專案為第 9 週作業，主題為「雲端待辦事項與筆記管理工具（Cloud Native Todo & Notes App）」。目標是實作一個具備完整前後端互動、可一鍵部署到 Cloudflare Pages 的現代化 SPA。

應用程式提供直覺的待辦清單管理介面，使用者可以新增、勾選完成、刪除待辦事項，資料即時暫存於瀏覽器 `LocalStorage`；同時前端會呼叫後端 Pages Function `/api/info`，取得伺服器端的部署環境、節點地區（Colo）、伺服器時間、執行時間與 Request ID 等資訊，用以驗證前後端 API 互動正常。

介面採用深色漸層玻璃擬態（Glassmorphism）風格，並具備完整響應式設計（RWD），在桌機、平板與手機上皆有良好體驗。

### 核心特色

- **無框架 SPA**：純 HTML5 / CSS3 / Vanilla JavaScript（ES6+），無需建置流程，載入即用。
- **本機優先（Local-first）**：待辦資料存於 `LocalStorage`，離線仍可操作。
- **後端 API 互動**：`GET /api/info` 回傳伺服器部署資訊與時間。
- **跨分頁同步**：透過 `storage` 事件同步多個瀏覽器分頁的清單狀態。
- **完整錯誤處理**：API 逾時（8 秒 AbortController）、錯誤提示與重試按鈕。
- **美化 UI/UX**：玻璃擬態卡片、漸層主視覺、動畫、Toast 通知、即時統計。
- **無障礙與可用性**：ARIA 標籤、`aria-live`、`prefers-reduced-motion` 支援。
- **可直接部署**：相容 Cloudflare Pages + Pages Functions，零設定即可上線。

---

## 二、技術棧（Tech Stack）

| 層級 | 技術 | 說明 |
| --- | --- | --- |
| 前端 | HTML5 | 語意化標籤、SPA 主介面 |
| 前端 | CSS3 | Grid / Flexbox、CSS Variables、Glassmorphism、RWD、動畫 |
| 前端 | JavaScript (ES6+) | 原生 DOM 操作、Fetch API、LocalStorage、AbortController |
| 後端 | Cloudflare Pages Functions | 以 `functions/` 目錄實作 Serverless API |
| 執行環境 | Cloudflare Workers Runtime | V8 Isolate，邊緣運算（Edge Computing） |
| 部署 / 工具 | Cloudflare Pages、Wrangler CLI | 靜態資源託管 + Functions 部署 |
| 資料儲存 | 瀏覽器 LocalStorage | 前端暫存，無需資料庫 |

---

## 三、功能需求與實作對照

| 需求 | 實作位置 | 說明 |
| --- | --- | --- |
| 新增待辦事項 | `public/index.html` → `addTodo()` | 表單送出或按 Enter，最多 200 字 |
| 切換完成狀態 | `toggleTodo()` | 點擊圓形勾選鈕切換，完成項目加上刪除線 |
| 刪除待辦事項 | `deleteTodo()` | 點擊垃圾桶圖示刪除 |
| 清除已完成 / 清空全部 | `clearDone()` / `clearAll()` | 批次操作，清空前列確認 |
| 呼叫 `/api/info` | `fetchInfo()` | Fetch API，含逾時處理與錯誤重試 |
| 伺服器資訊展示 | `renderInfo()` | 顯示環境、地區、時間、執行時間、Request ID |
| 資料暫存 | `loadTodos()` / `saveTodos()` | LocalStorage key：`cloud-tasks:v1` |
| 跨分頁同步 | `window.addEventListener("storage")` | 其他分頁變更時即時更新 |
| API 連線狀態 | `setApiStatus()` | 右上角狀態燈：連線中 / 已連線 / 離線 |

---

## 四、檔案結構

```text
HW9/
├── public/
│   └── index.html          # 前端主介面（HTML + CSS + JS 全整合）
├── functions/
│   └── api/
│       └── info.js         # Cloudflare Pages Function：GET /api/info
├── wrangler.toml           # Wrangler 基礎設定檔
└── README.md               # 本作業報告
```

### 路由對照

| 路由 | 方法 | 對應檔案 | 說明 |
| --- | --- | --- | --- |
| `/` | GET | `public/index.html` | SPA 主頁 |
| `/api/info` | GET | `functions/api/info.js` | 回傳伺服器部署資訊與時間 |
| `/api/info` | OPTIONS | `functions/api/info.js` | CORS 預檢請求 |

---

## 五、後端 API 說明

### `GET /api/info`

回傳 JSON 範例：

```json
{
  "ok": true,
  "message": "Hello from Cloudflare Pages Functions!",
  "service": "cloud-tasks-api",
  "environment": "production",
  "serverTime": "2026-01-01T00:00:00.000Z",
  "serverTimeLocal": "2026/1/1 上午08:00:00",
  "timeZone": "Asia/Taipei",
  "requestId": "8a1b2c3d4e5f6a7b",
  "colo": "TPE",
  "country": "TW",
  "path": "/api/info",
  "method": "GET",
  "userAgent": "Mozilla/5.0 ...",
  "responseTimeMs": 1,
  "functionPath": "/api/info",
  "timestamp": 1767225600000
}
```

回應標頭包含：

```text
Content-Type: application/json; charset=utf-8
Cache-Control: no-store, no-cache, must-revalidate
Access-Control-Allow-Origin: *
```

> 說明：`environment` 會依 Cloudflare 提供的 `CF_PAGES_BRANCH` / `CF_PAGES_URL` 或 `wrangler.toml` 的 `ENVIRONMENT` 變數自動判斷。

---

## 六、本地測試

### 前置需求

- 已安裝 **Node.js 18 或以上**（建議 20+）
- 具備網路連線（第一次執行 `npx` 會下載 Wrangler）

### 啟動本地開發伺服器

在專案根目錄執行：

```bash
npx wrangler pages dev public
```

啟動後終端機會顯示本地網址（預設通常為 `http://localhost:8788`），開啟瀏覽器即可使用。

> 重要：請使用 `wrangler pages dev public` 啟動，才能同時模擬 **靜態資源** 與 **`functions/` 的 Pages Functions**。若僅用 `python -m http.server` 或直接雙擊 `index.html`，`/api/info` 將無法回應。

### 驗證 API

```bash
curl http://localhost:8788/api/info
```

應可取得上述 JSON 內容。

### 其他常用指令

```bash
# 查看 Wrangler 版本
npx wrangler --version

# 預覽建置輸出（若日後加入建置流程）
npx wrangler pages dev public --port 8788
```

---

## 七、Cloudflare 部署步驟

### 方法 A：使用 Wrangler CLI 直接部署（最快）

1. 登入 Cloudflare 帳號：

   ```bash
   npx wrangler login
   ```

   瀏覽器會開啟授權頁面，登入並允許 Wrangler 存取。

2. 首次部署（建立 Pages 專案）：

   ```bash
   npx wrangler pages deploy public
   ```

   - 若尚未有專案，Wrangler 會詢問並建立一個新專案（例如 `cloud-tasks-app`）。
   - 部署完成後會輸出預覽網址，例如 `https://<project>.pages.dev`。

3. 後續更新：再次執行 `npx wrangler pages deploy public` 即可重新部署。

### 方法 B：串接 Git 儲存庫（自動化 CI/CD）

1. 將本專案推送至 GitHub / GitLab。
2. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
3. 選擇儲存庫，設定如下：

   | 設定項目 | 值 |
   | --- | --- |
   | Framework preset | None |
   | Build command | （留空） |
   | Build output directory | `public` |

4. 點擊 **Save and Deploy**。
5. 之後每次 push 到預設分支，Cloudflare 會自動重新部署；其他分支則產生 Preview 部署。

### 部署後驗證

- 開啟 `https://<project>.pages.dev` 應能看到完整介面。
- 開啟 `https://<project>.pages.dev/api/info` 應回傳 JSON。
- 前端右上角狀態燈應顯示「API 已連線」。

### 環境變數（選用）

非敏感變數可寫在 `wrangler.toml` 的 `[vars]`；機密資料請使用：

```bash
npx wrangler pages secret put MY_SECRET
```

或在 Cloudflare Dashboard → 專案 → **Settings** → **Environment variables** 設定。

---

## 八、設計與實作重點

### 1. 前端狀態管理

- 以單一 `todos` 陣列作為資料來源（Source of Truth）。
- 每次異動呼叫 `saveTodos()` 寫入 LocalStorage，並呼叫 `render()` 重繪清單與統計。
- 資料格式具備版本化 key（`cloud-tasks:v1`），欄位包含 `id`、`text`、`done`、`createdAt`。

### 2. 安全性

- 使用者輸入一律透過 `textContent` 或 `escapeHtml()` 處理，避免 XSS。
- API 僅回傳公開部署資訊，不涉及任何機密資料或個資。
- 回應標頭設定 `no-store`，避免快取過期資訊。

### 3. 錯誤處理與容錯

- LocalStorage 讀寫以 `try/catch` 包覆，避免隱私模式或容量不足導致白屏。
- API 請求使用 `AbortController`，8 秒逾時即中斷並提示。
- `res.ok` 檢查 HTTP 狀態，錯誤時顯示可重試的錯誤畫面。

### 4. 使用者體驗

- 深色漸層 + 玻璃擬態視覺，搭配 `backdrop-filter` 模糊效果。
- API 狀態燈（連線中 / 已連線 / 離線）即時反映後端狀態。
- 即時統計（總計 / 未完成 / 已完成）與項目數徽章。
- Toast 通知回饋操作結果。
- RWD 斷點：`820px`（平板，單欄）與 `480px`（手機，表單改為直向）。
- 支援 `prefers-reduced-motion`，尊重使用者動態效果偏好。

---

## 九、測試檢查清單

- [ ] 新增待辦事項後，項目立即出現在清單頂端。
- [ ] 點擊勾選鈕可切換完成 / 未完成，統計數字同步更新。
- [ ] 點擊垃圾桶可刪除單筆項目，並顯示 Toast。
- [ ] 「清除已完成」只移除已完成項目。
- [ ] 「清空全部」會先跳出確認視窗。
- [ ] 重新整理頁面後，清單資料仍存在（LocalStorage 持久化）。
- [ ] 開啟兩個分頁，於一分頁異動後另一分頁自動同步。
- [ ] `/api/info` 正常回傳 JSON，右側資訊卡正確顯示。
- [ ] 關閉網路或中斷 API 時，狀態燈轉為離線並顯示錯誤與重試按鈕。
- [ ] 在手機寬度下版面正確堆疊、可正常操作。

---

## 十、問題排除（Troubleshooting）

| 問題 | 可能原因 | 解決方式 |
| --- | --- | --- |
| `/api/info` 回傳 404 | 未透過 Wrangler 啟動，Functions 未載入 | 使用 `npx wrangler pages dev public` |
| 狀態燈顯示離線 | Pages Functions 未部署或路由錯誤 | 確認 `functions/api/info.js` 存在且函式名為 `onRequestGet` |
| 部署後資料不同步 | 資料只存在 LocalStorage，各裝置獨立 | 本作業設計為本機暫存，跨裝置需自行串接資料庫 |
| `wrangler login` 失敗 | 瀏覽器授權未完成或網路問題 | 重新執行 `npx wrangler login` |
| 中文顯示異常 | 瀏覽器字型或編碼問題 | 確認 `<meta charset="UTF-8">` 與系統中文字型 |

---

## 十一、結論與心得

本作業完整實作了「前端 SPA + 邊緣 Serverless API」的雲端應用架構。透過 Cloudflare Pages Functions，開發者無需自行維運伺服器，即可在邊緣節點提供低延遲 API；前端以原生技術實作，降低了框架與建置工具的相依性，也更容易理解瀏覽器端狀態管理、持久化與非同步請求的運作原理。

在實作過程中，特別強化了錯誤處理（API 逾時、LocalStorage 例外）、跨分頁同步、響應式版面與無障礙體驗，使應用不僅能「跑起來」，更接近可實際使用的小型產品。未來可進一步擴充：串接 Cloudflare KV / D1 實現跨裝置同步、加入筆記富文本編輯、標籤分類、搜尋與深色/淺色主題切換等功能。

---

## 十二、相關連結

- Cloudflare Pages 官方文件：<https://developers.cloudflare.com/pages/>
- Cloudflare Pages Functions：<https://developers.cloudflare.com/pages/functions/>
- Wrangler CLI 文件：<https://developers.cloudflare.com/workers/wrangler/>
- 線上範例（部署後可替換）：`https://<your-project>.pages.dev`

---

© 2026 Cloud Tasks · 第 9 週作業
