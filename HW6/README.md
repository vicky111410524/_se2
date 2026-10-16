# 🐋 HW6 — Docker 微服務系統

以 Docker 建立的微服務系統，使用 **nginx** 作為 Web Server / 反向代理，
**PostgreSQL** 作為資料庫，並以 **Node.js / Python / Rust** 三種語言各自提供一個微服務，
最後提供一個簡易的 Web 介面來展示整個系統。

---

## 📌 系統架構

```
                         ┌─────────────────────────────┐
            瀏覽器 ─────▶│  nginx (:8080 → :80)         │
                         │  - 靜態網頁 (frontend)        │
                         │  - 反向代理 /api /py /rust    │
                         └───────────┬─────────────────┘
                                     │ backend 網路
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
      ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
      │ node-api :3000│     │python-api:8000│     │ rust-api:8002 │
      │ Express + pg  │     │   Flask       │     │   Axum        │
      └───────┬───────┘     └───────────────┘     └───────────────┘
              │
              ▼
      ┌───────────────┐
      │ postgres :5432│  ← volume: pgdata (資料持久化)
      └───────────────┘
```

| 服務 | 映像 / 技術 | 內部埠 | 角色 |
| --- | --- | --- | --- |
| `nginx` | `nginx:1.27-alpine` | 80（對外 8080） | Web Server、反向代理 |
| `postgres` | `postgres:16-alpine` | 5432 | 資料庫 |
| `node-api` | `node:20-alpine` + Express | 3000 | 主要 API，CRUD 存取 PostgreSQL |
| `python-api` | `python:3.12-slim` + Flask | 8000 | 展示 Python 執行環境 |
| `rust-api` | `rust:1.85-slim`（多階段建置）+ Axum | 8002 | 展示 Rust 執行環境 |

---

## 📁 專案結構

```
HW6/
├── docker-compose.yml        # 定義所有服務、網路與資料卷
├── .dockerignore
├── README.md
├── db/
│   └── init.sql              # PostgreSQL 初始化與種子資料
├── nginx/
│   ├── Dockerfile
│   └── nginx.conf            # 反向代理設定
├── frontend/                 # 由 nginx 提供的靜態網頁
│   ├── index.html
│   ├── style.css
│   └── app.js
├── node-api/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── python-api/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app.py
└── rust-api/
    ├── Dockerfile
    ├── Cargo.toml
    └── src/main.rs
```

---

## 🚀 啟動方式

> 需要先安裝並啟動 Docker Desktop（Windows / macOS）或 Docker Engine（Linux）。

```bash
# 在 HW6 目錄下

# 1. 建置映像並啟動所有服務（背景執行）
docker compose up -d --build

# 2. 查看服務狀態
docker compose ps

# 3. 查看日誌
docker compose logs -f
```

啟動後開啟瀏覽器：**http://localhost:8080**

### 停止與清理

```bash
# 停止並移除容器與網路
docker compose down

# 連同資料卷一起刪除（徹底重置資料庫）
docker compose down -v
```

---

## 🖥️ Web 介面展示的功能

1. **服務狀態**：前端分別呼叫 `/api/health`、`/py/health`、`/rust/health`，
   透過 nginx 反向代理檢查三個微服務是否存活。
2. **留言板**：表單經 nginx → `node-api` → 寫入 PostgreSQL，再讀回顯示（含刪除），
   展示 nginx / Node.js / PostgreSQL 的完整資料流。
3. **跨語言服務**：按鈕呼叫 `/py/info`（回傳 Python 版本、容器 hostname）與
   `/rust/fib?n=20`（由 Rust 計算 Fibonacci），展示多語言微服務。

---

## 🔀 nginx 反向代理路由

| 對外路徑 | 轉發目標 | 說明 |
| --- | --- | --- |
| `/` | 容器內 `/usr/share/nginx/html` | 靜態前端網頁 |
| `/api/*` | `http://node-api:3000/*` | Node.js API（已去掉 `/api` 前綴） |
| `/py/*` | `http://python-api:8000/*` | Python 服務 |
| `/rust/*` | `http://rust-api:8002/*` | Rust 服務 |

Docker Compose 會建立內部 `backend` 網路，容器之間以**服務名稱**作為 DNS 互相連線
（例如 nginx 連 `node-api`、node 連 `postgres`）。

---

## 🧪 驗證（不開瀏覽器也能測）

```bash
# nginx 首頁
curl http://localhost:8080/

# 透過反向代理檢查各服務
curl http://localhost:8080/api/health
curl http://localhost:8080/py/info
curl http://localhost:8080/rust/fib?n=20

# 新增與讀取留言
curl -X POST http://localhost:8080/api/messages \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"vicky\",\"content\":\"Hello Docker\"}"
curl http://localhost:8080/api/messages
```

---

## 🐳 常用 Docker 指令

```bash
docker ps                     # 查看執行中的容器
docker ps -a                  # 查看所有容器（含已停止）
docker images                 # 查看映像
docker exec -it hw6-postgres psql -U demo -d demo   # 進入資料庫
docker exec -it hw6-node-api sh                     # 進入容器終端機
docker logs -f hw6-nginx                            # 查看日誌
docker compose up -d --build  # 重新建置並啟動
docker compose down -v        # 停止並清除資料卷
docker system prune -a        # 清理未使用的映像與容器
```

---

## 📝 學習重點

* **微服務拆分**：每個服務只負責一件事，透過網路互相呼叫。
* **反向代理**：以 nginx 統一對外入口，並分派到不同後端服務。
* **容器網路**：自訂 bridge 網路讓容器以服務名稱互相解析。
* **資料持久化**：使用 named volume `pgdata` 保存資料庫資料。
* **多階段建置**：Rust 服務先編譯再複製到精簡映像，縮小體積。
* **服務健康檢查**：`postgres` 以 `pg_isready` healthcheck，確保 node 服務在資料庫就緒後才啟動。
