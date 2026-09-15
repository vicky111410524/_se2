# JCurl

一個使用 Java 實作的 curl 風格 HTTP 用戶端命令列工具。支援 GET / POST / PUT / DELETE 等 HTTP 方法、自訂 Header、JSON 與 multipart body、Cookie、Basic Auth、HTTPS、redirect 追蹤等功能，並提供與 curl 相似的參數與輸出格式。

## 功能

| 功能 | 參數 | 說明 |
|------|------|------|
| HTTP 方法 | `-X <method>` | GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS（預設 GET） |
| 自訂 Header | `-H "Name: Value"` | 可設定多組 |
| Request Body | `-d <data>` / `--data-raw` | 以 `application/x-www-form-urlencoded` 送出 |
| 二進位 Body | `--data-binary <data>` | 以原始位元組送出 |
| JSON Body | `-j <json>` / `--json` | 自動加 `Content-Type: application/json` |
| 檔案上傳 | `-F "name=@file"` | multipart/form-data，自動依副檔名判斷 Content-Type |
| 表單欄位 | `-F "name=value"` | multipart 純文字欄位 |
| 輸出至檔案 | `-o <file>` | 將 response body 寫入指定檔案 |
| 遠端檔名儲存 | `-O` | 依 URL 路徑擷取檔名儲存 |
| Verbose 模式 | `-v` / `--verbose` | 顯示連線資訊與 request/response header |
| 顯示 Header | `-i` | response 輸出時一併顯示 header |
| 只看 Header | `-I` / `--head` | 使用 HEAD 方法 |
| Follow redirect | `-L` / `--location` | 自動跟隨 3xx redirect（預設不跟隨） |
| 忽略 SSL 驗證 | `-k` / `--insecure` | 跳過憑證與主機名稱驗證 |
| User-Agent | `-A <string>` | 設定 User-Agent |
| Basic Auth | `-u <user:pass>` | HTTP Basic 認證 |
| Cookie | `-b <string|file>` | 送出 cookie（字串或檔案） |
| 連線逾時 | `--connect-timeout <sec>` | 預設 10 秒 |
| 最大時間 | `-m <sec>` / `--max-time` | 連線後讀取逾時 |
| 自訂輸出 | `-w <format>` | 支援 `%{http_code}`、`%{time_total}`、`%{size_download}` 等變數 |
| Silent 模式 | `-s` / `--silent` | 不顯示錯誤與資訊 |
| 版本 | `--version` | 顯示版本號 |

## 環境需求

- JDK 11 以上
- 不需任何第三方 library（純 JDK 實作）

## 建置與執行

### 方式一：build.bat（Windows，自動偵測 JDK）

```bat
build.bat
```

產生 `jcurl.jar`。

### 方式二：手動編譯

```bat
javac -encoding UTF-8 -d build src\main\java\com\jcurl\*.java
jar cfe jcurl.jar com.jcurl.CurlApp -C build com/jcurl
```

### 執行程式

```bat
jcurl.bat <URL>
```

或直接：

```bat
java -jar jcurl.jar <args...>
```

## 使用範例

```bash
# 基本 GET
jcurl.bat https://httpbin.org/get

# 帶查詢參數的 GET
jcurl.bat "https://httpbin.org/get?name=test&page=1"

# POST 表單資料
jcurl.bat -X POST -d "name=test&val=123" https://httpbin.org/post

# POST JSON（自動設 Content-Type: application/json）
jcurl.bat -X POST -j "{\"name\":\"test\",\"value\":123}" https://httpbin.org/post

# 上傳檔案 + 表單欄位
jcurl.bat -F "field1=hello" -F "file=@./photo.jpg" https://upload.example.com

# 帶自訂 Header 與 User-Agent
jcurl.bat -A "MyAgent/1.0" -H "Authorization: Bearer TOKEN" https://api.example.com

# Basic Auth + Cookie
jcurl.bat -u "user:pass123" -b "session=abc123" https://api.example.com/data

# 跟隨 redirect 並輸出到檔案
jcurl.bat -L -o result.html https://example.com

# 使用遠端檔名儲存
jcurl.bat -O https://example.com/logo.png

# Verbose 模式顯示完整資訊
jcurl.bat -v https://httpbin.org/get

# 只看 response header
jcurl.bat -I https://httpbin.org/status/200

# 忽略 SSL 證書錯誤
jcurl.bat -k https://self-signed.example.com

# 自訂輸出格式
jcurl.bat -w "HTTP %{http_code} | time %{time_total}s | size %{size_download}B\n" https://httpbin.org/status/200

# Silent 模式（僅輸出 body）
jcurl.bat -s https://httpbin.org/get
```

## `-w` 支援的輸出變數

| 變數 | 說明 |
|------|------|
| `%{http_code}` | 最後一次請求的 HTTP 狀態碼 |
| `%{time_total}` | 總耗時（秒） |
| `%{time_connect}` | TCP 連線耗時（秒） |
| `%{time_namelookup}` | DNS 解析耗時（秒） |
| `%{time_starttransfer}` | 開始收到 Body 前的耗時（秒） |
| `%{size_download}` | 下載的 Body 大小（bytes） |
| `%{url_effective}` | 最終請求的 URL |
| `%{remote_ip}` | 遠端主機 IP |

`\n` 轉為換行、`\t` 轉為 tab。

## 專案結構

```
hw1/
├── pom.xml                    # Maven 設定（可選）
├── build.bat                  # 一鍵編譯 + 打包
├── jcurl.bat                  # 執行 wrapper
├── jcurl.jar                  # 已打包的可執行 JAR
└── src/main/java/com/jcurl/
    ├── CurlApp.java           # 主程式入口，整合各元件
    ├── CommandLineParser.java # 命令列參數解析
    ├── RequestConfig.java     # 請求配置 model
    ├── CurlClient.java        # 核心 HTTP 執行引擎
    └── ResponsePrinter.java   # verbose 資訊與統計輸出
```

## 實作重點

- 使用 JDK 內建 `HttpURLConnection` / `HttpsURLConnection`，無需外部依賴。
- Redirect 手動處理以支援 `-L` 開關與跳轉各方法（301/302/303 轉 GET）。
- response body 在 `execute()` 時完整讀入記憶體，`-o` / `-O` / `-w` 共用同一份資料，避免重複請求。
- multipart 手動組裝 `multipart/form-data`，依副檔名猜測 Content-Type。
- `-k` 使用自訂 `SSLContext`（trust-all）跳過憑證驗證。