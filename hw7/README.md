# Todo List Testing Demo

以 Node.js（Express）實作的輕量級待辦事項應用，支援截止日期與時間、任務統計、時間整理表格，並示範三層測試架構：

- **單元測試（Unit）**：Vitest
- **系統測試（System / API）**：Supertest + Vitest
- **端對端測試（E2E）**：Playwright（Headless Chromium）

核心設計是將 **Express App 邏輯（`app.js`）** 與 **伺服器啟動（`server.js`）** 分離，讓 Supertest 可以直接測試路由，不必實際監聽連接埠，測試更快也更穩定。

## 功能特色

- **截止日期與時間**：新增任務時可設定 `datetime-local` 截止時間，清單會顯示完整截止時間與狀態。
- **任務統計**：顯示總任務數、今日到期、已逾期與未設定時間的任務數量。
- **時間整理表格**：依截止日期分組，列出每日任務數、逾期數、最近截止時間與日期狀態。
- **狀態標示**：自動判斷「已逾期」、「今天到期」、「尚未到期」與「未設定」，並以不同顏色呈現。
- **響應式介面**：以卡片、漸層背景與玻璃質感面板設計，桌機與手機皆可舒適使用。

## 專案結構

```text
hw7/
├── package.json
├── app.js                 # Express 應用與 API 邏輯（不含 listen）
├── server.js              # 伺服器入口（負責 listen）
├── playwright.config.js   # Playwright 設定（自動啟動 Web Server）
├── public/
│   ├── index.html         # 前端介面
│   ├── style.css          # 前端樣式（卡片、統計、表格、響應式排版）
│   └── clientUtils.js     # 前端純邏輯工具函式
└── tests/
    ├── unit/              # 1. 單元測試（Server & Client）
    │   ├── server.test.js
    │   └── client.test.js
    ├── system/            # 2. 系統測試（Web API）
    │   └── api.test.js
    └── e2e/               # 3. E2E 測試（Playwright）
        └── todo.spec.js
```

## 環境需求

- Node.js 18 以上（本專案以 Node.js 24 驗證）
- npm

## 安裝

```bash
npm install
npx playwright install chromium
```

> `npx playwright install chromium` 會下載 E2E 測試所需的瀏覽器核心，只需執行一次（或瀏覽器版本更新後再執行）。

## 啟動應用

```bash
npm start
```

開啟 <http://localhost:3000> 即可使用。

## 測試指令

| 指令 | 說明 |
| --- | --- |
| `npm run test:unit` | 執行 `tests/unit` 的單元測試 |
| `npm run test:system` | 執行 `tests/system` 的 API 系統測試 |
| `npm run test:e2e` | 執行 `tests/e2e` 的 Playwright E2E 測試 |

E2E 測試會由 `playwright.config.js` 的 `webServer` 自動執行 `npm start` 並等待 <http://localhost:3000> 就緒，不需要手動先開伺服器。若本機已有服務佔用 3000 埠，Playwright 會重用既有伺服器（`reuseExistingServer`）。

## 測試分層

| 測試類型 | 測試對象 | 使用工具 | 測試重點 |
| --- | --- | --- | --- |
| 單元測試 | Pure Functions（前後端） | Vitest | 欄位驗證、日期格式化、狀態判斷、日期分組等純邏輯 |
| 系統測試 | Web API 介面 | Supertest + Vitest | HTTP 狀態碼、Request/Response JSON 格式與邊界條件 |
| E2E 測試 | 完整前端 + 無頭瀏覽器 | Playwright | 設定截止時間、新增任務、時間表格更新、刪除任務 |

## API 端點

| Method | Path | 說明 | 成功狀態碼 |
| --- | --- | --- | --- |
| `GET` | `/api/todos` | 取得所有待辦事項 | `200` |
| `POST` | `/api/todos` | 新增待辦事項（`title` 不可為空，`dueDate` 可省略） | `201` |
| `DELETE` | `/api/todos/:id` | 依 `id` 刪除待辦事項 | `200` |

`POST /api/todos` 的請求內容：

```json
{
  "title": "撰寫測試",
  "dueDate": "2026-12-31T18:30"
}
```

- `title`：必填字串，去除空白後不可為空。
- `dueDate`：選填，格式為 `YYYY-MM-DDTHH:mm`（即 `datetime-local` 的值）；未提供時儲存為 `null`。

若 `title` 缺少、非字串或去除空白後為空，會回傳 `400`：

```json
{ "error": "標題不能為空" }
```

若 `dueDate` 不是有效日期時間，會回傳 `400`：

```json
{ "error": "截止時間格式不正確" }
```

## 時間整理邏輯

前端透過 `public/clientUtils.js` 的純函式整理時間：

- `getDueStatus(dueDate, now)`：判斷任務為 `overdue`（已逾期）、`today`（今天到期）、`upcoming`（尚未到期）或 `none`（未設定）。
- `groupTodosByDate(todos, now)`：依截止日期分組，計算每組任務數、逾期數與最近截止時間，並將「未設定」排在最下方。
- `formatDueDateTime` / `formatDateLabel` / `formatTimeLabel`：統一日期與時間顯示格式。

`now` 可注入自訂時間，讓單元測試不依賴系統時鐘。

## 實作備註

- `app.js` 使用模組層級的記憶體陣列 `todos` 作為資料庫，**伺服器重新啟動後資料會重置**。
- 初始範例任務的截止時間會在伺服器啟動時設為「隔天 18:00」，方便直接看到時間整理表格的效果。
- 系統測試直接匯入 `app` 並透過 Supertest 發送請求，不會佔用實際連接埠。
- 前端使用 `textContent` 建立清單與表格內容，避免以 `innerHTML` 插入使用者輸入造成 XSS。
- 介面樣式集中於 `public/style.css`，HTML 僅保留結構與前端互動邏輯。
- `tests/` 目錄的測試說明請參考 [`tests/README.md`](./tests/README.md)。
