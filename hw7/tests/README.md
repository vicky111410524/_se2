# 測試說明（tests/）

本目錄依測試層級分為 `unit/`、`system/`、`e2e/` 三個子目錄，分別對應單元測試、API 系統測試與端對端測試。各層測試彼此獨立，可單獨執行。

## 目錄與職責

```text
tests/
├── unit/
│   ├── server.test.js   # 後端純函式 validateTodoPayload / isValidDueDate
│   └── client.test.js   # 前端純函式與日期時間整理邏輯
├── system/
│   └── api.test.js      # Supertest 測試 Express API 路由
└── e2e/
    └── todo.spec.js     # Playwright 模擬使用者完整操作流程
```

## 執行方式

```bash
# 單元測試
npm run test:unit

# API 系統測試
npm run test:system

# E2E 測試（會自動啟動伺服器）
npm run test:e2e
```

E2E 首次執行前需安裝瀏覽器：

```bash
npx playwright install chromium
```

## 各層測試內容

### 1. 單元測試（`tests/unit/`）

- **`server.test.js`**：驗證 `app.js` 匯出的純函式。
  - `validateTodoPayload`：空白標題應回傳 `valid: false`；合法標題應回傳 `valid: true`。
  - `validateTodoPayload`：未提供 `dueDate` 視為合法；格式錯誤的 `dueDate` 應回傳 `valid: false` 與「截止時間格式不正確」。
  - `isValidDueDate`：接受合法的日期時間字串，拒絕非字串或無效日期。
- **`client.test.js`**：驗證 `public/clientUtils.js` 的純函式。
  - `formatTodoTitle` 去除首尾空白並轉大寫。
  - `isValidTitle` 拒絕少於 2 個字元的字串。
  - `isValidDueDate` 允許空值、接受合法日期、拒絕無效格式。
  - `formatDueDateTime`、`formatDateLabel`、`formatTimeLabel` 輸出統一的日期與時間格式。
  - `getDueStatus` 正確分辨逾期、今天到期、尚未到期與未設定。
  - `groupTodosByDate` 依日期分組、統計逾期數、找出最近截止時間，並將「未設定」排在最後。

單元測試不啟動伺服器、不建立 DOM，僅驗證純邏輯，執行速度最快。

### 2. 系統測試（`tests/system/api.test.js`）

透過 Supertest 直接對 `app` 發送 HTTP 請求，驗證：

- `GET /api/todos` 回傳 `200` 且內容為陣列。
- `POST /api/todos` 合法資料（含 `dueDate`）回傳 `201`、包含 `id`、正確 `title` 與 `dueDate`。
- `POST /api/todos` 未提供 `dueDate` 時回傳 `dueDate: null`。
- `POST /api/todos` 空標題回傳 `400` 且包含 `error`。
- `POST /api/todos` 無效 `dueDate` 回傳 `400` 且錯誤訊息為「截止時間格式不正確」。

因為 `app.js` 與 `server.js` 分離，測試不需實際 `listen`，速度快且不會有連接埠衝突。

### 3. E2E 測試（`tests/e2e/todo.spec.js`）

使用 Playwright 的 Headless Chromium 模擬真實使用者：

1. 開啟首頁並確認 `h1` 標題。
2. 在 `#todo-input` 輸入任務、在 `#todo-due` 設定截止時間，並點擊 `#add-btn`。
3. 確認清單中出現該任務，且顯示正確的截止時間。
4. 確認「時間整理」表格出現對應日期與最近截止時間。
5. 點擊刪除按鈕，確認該項目從畫面與時間表格中消失。

`playwright.config.js` 的 `webServer` 會在測試前自動執行 `npm start`，測試結束後關閉。

## 撰寫新測試的慣例

- **單元測試**：只匯入純函式，避免相依 Express、DOM 或網路；檔名使用 `*.test.js`。
- **系統測試**：使用 `request(app)`，斷言狀態碼與 response body；不要把 `app.listen` 寫進測試。
- **E2E 測試**：以使用者可見的文字、ID 或 class 定位元素，優先使用 `expect(locator).toBeVisible()` 等可自動等待的斷言，避免固定 `sleep`。
- **時間相關測試**：將 `now` 注入 `getDueStatus` / `groupTodosByDate`，避免依賴系統時鐘造成不穩定。
- 測試檔命名：Vitest 使用 `*.test.js`，Playwright 使用 `*.spec.js`，避免兩套工具互相撿到對方的測試檔。

## 注意事項

- `app.js` 的 `todos` 是模組層級的記憶體狀態，**同一個測試檔案內的請求會共用資料**。新增會修改資料的系統測試時，請避免依賴其他測試留下的狀態，或自行重置資料。
- 系統測試與 E2E 測試都會操作同一份記憶體資料，但 E2E 是透過獨立啟動的伺服器程序，不會與 Vitest 程序共享狀態。
- 初始範例任務的截止時間會在伺服器啟動時動態設為「隔天 18:00」，因此測試請勿依賴固定的初始日期。
- 若 E2E 測試失敗，Playwright 會在 `test-results/`（失敗時）與 `playwright-report/` 產出報告；這些目錄已列入 `.gitignore`。
