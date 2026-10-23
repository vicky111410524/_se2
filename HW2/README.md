# 金門大學校務系統（homework 2）

純 Python 標準函式庫實作的最小可行校務系統：SSO 登入、課程查詢與選課（高併發防塞車）、課表（含 iCalendar 匯出）、成績 / GPA、學籍資料、請假簽核、缺曠紀錄、行政開課管理，附行動優先（mobile-first）前端網頁。

## 執行方式

需要 Python 3（僅使用標準函式庫，無第三方相依）。

```bash
python3 -m kmu            # 預設 http://127.0.0.1:8000
python3 -m kmu --port 8090
python3 -m kmu --reset    # 重建資料庫（內建範例資料）
```

開啟瀏覽器進入首頁即可。第一啟動會自動建立 `kmu.db` 並寫入種子資料。

## 功能

| 角色 | 功能 |
| --- | --- |
| 學生 | 查詢課程（關鍵字 / 類型 / 是否開放篩選）、**選課 / 退選**、課表、.ics 匯出、成績與 GPA、學籍資料更新、請假（2 日內授課教師簽核；3 日以上需系辦第二關）、查看缺曠 |
| 教師 | 開課班級名單、成績登錄（僅能登錄自己課程）、請假簽核（**只能簽核所屬系所學生的假單**）、缺曠登錄 |
| 行政 | 開課管理（新增課程開課、調整容量 / 開放狀態 / 排課）、全系統總覽 |

選課規則：**一門課程本學期僅一支開課**（同課程不會在選課清單出現多個時段選項）；各課程名額各自計算；同一學生**不得重複選同一課程**，也**不能選與已選課程同時段（同週同節）的課**（衝突會回 409，需先退選原課），確保課表不會同節出現兩堂課。

## 防塞車設計（選課）

選課不是同步扣名額，而是「受理回覆 + 背景結算」，避免熱門課瞬間流量把伺服器卡死：

1. `POST /api/enroll` 立即以 `BEGIN IMMEDIATE` 建立一筆 `status='pending'` 的選課紀錄，回 **202「已受理」**，並投入背景佇列。
2. 背景 worker（`kmu/engine.py`）逐筆以**原子更新**結算：`UPDATE course_offerings SET current_enrolled = current_enrolled + 1, version = version + 1 WHERE id=? AND is_open=1 AND current_enrolled < max_capacity`。更新到 0 列表示額滿/停開，該筆選課即標為 `rejected`。
3. 前端輪詢 `GET /api/enrollments?after=<id>` 取得最終結果；`/api/enrollments?settled=1` 可確認所有佇列已完成。

遇到高併發，以多佇列、可持久化的模式（如 Redis Streams / RabbitMQ + 資料庫交易）取代記憶體佇列即可水平擴充，結算邏輯不變。

## 測試

40 個整合型測試以真實 HTTP 起 server 執行，含：選課併發 20 人搶 2 個名額「**絕不超賣**」、同課程重複選擋下、**時段衝堂擋下**、教師僅簽核同系學生的假單、退選後可重選、請假多關簽核、權限阻擋等。

```bash
python3 tests.py          # 直接執行
python3 -m unittest       # 或以 unittest 執行
```

### 示範帳號

| 帳號 | 密碼 | 角色 |
| --- | --- | --- |
| admin / admin2 / admin3 | admin123 | 行政（系統／教務處／學務處） |
| teacher01 … teacher08 | teacher123 | 教師（王志明、林雅婷、陳建宏、黃雅文、許佩琳、劉俊宏、楊美玲、張益誠；各屬不同系所） |
| 110410001~110410004、110491001~110491002、111420001~111420002 | stu123 | 資工／電機／企管學生 |
| 112510001、113610001、113710001 | stu123 | 應英／觀光／餐旅學生 |

種子資料共 29 門課程（涵蓋 7 個系所）、24 支開課、11 名學生、8 名教師、3 名行政。

## 專案結構

```
kmu/
  __init__.py      # 選擇入口（--reset、--port）
  __main__.py
  db.py            # SQLite schema、種子資料、BEGIN IMMEDIATE 交易
  auth.py          # pbkdf2 密碼雜湊、Bearer token session
  engine.py        # 選課背景佇列 worker
  api.py           # REST API
  web.py           # http.server 服務層、靜態檔
  static/          # index.html / app.css / app.js（手機優先）
tests.py           # 整合測試
```

## REST API 一覽

| Method | Path | 說明 |
| --- | --- | --- |
| POST | /api/login，POST /api/logout | SSO 登入 / 登出（Bearer token） |
| GET | /api/me; PUT /api/me | 取學籍 / 更新學籍 |
| GET | /api/courses | 課程清單（`q`、`type`、`open`、`semester`） |
| POST | /api/enroll; POST /api/drop | 選課（202 受理） / 退選 |
| GET | /api/enrollments | 我的選課（`settled`、`after`）並附排課時段 |
| GET | /api/timetable; /api/timetable.ics | 課表 / iCalendar 匯出 |
| GET | /api/grades | 成績與 GPA |
| GET/POST | /api/teacher/roster; /api/teacher/grades | 班級名單 / 成績登錄 |
| POST | /api/leave，GET /api/leave | 請假與簽核（POST /api/leave/{id}/decision） |
| GET/POST | /api/attendance | 缺曠紀錄 / 登錄 |
| GET/POST/PATCH | /api/admin/offerings | 開課管理 |