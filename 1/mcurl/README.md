# mcurl

一個用 **Node.js 標準函式庫** 實作的 curl 風格命令列 HTTP 用戶端，不需要安裝任何第三方套件。

支援 HTTP/HTTPS、GET/POST/PUT/DELETE/HEAD 等方法、自訂 Header、表單與 JSON body、multipart 檔案上傳、Basic Auth、Cookie、重新導向、逾時、輸出檔案，以及類似 curl 的 `-w` 統計輸出與結束碼。

## 環境需求

- Node.js 18 以上（開發時使用 Node.js 24）

## 專案結構

```
mcurl/
├── bin/
│   └── mcurl.js          # 命令列入口
├── src/
│   ├── args.js           # 參數解析與說明文字
│   ├── cli.js            # 主流程、body/header 組裝、輸出
│   ├── client.js         # HTTP/HTTPS 請求、重新導向、逾時
│   └── errors.js         # 錯誤類型與 curl 相容結束碼
├── test/
│   └── mcurl.test.js     # 整合測試（內建本機 HTTP server）
├── mcurl.bat             # Windows 快速執行腳本
├── package.json
└── README.md
```

## 執行方式

不需要安裝套件，直接執行：

```bash
node bin/mcurl.js https://example.com
```

Windows 也可以使用：

```bat
mcurl.bat https://example.com
```

或是安裝成全域命令：

```bash
npm link
mcurl https://example.com
```

## 參數

| 參數 | 說明 |
| --- | --- |
| `-X, --request METHOD` | 指定 HTTP 方法（GET、POST、PUT、DELETE、HEAD、PATCH…） |
| `-H, --header "Key: value"` | 新增請求標頭，可重複使用 |
| `-d, --data DATA` | 表單 body，可重複使用並以 `&` 串接；會自動使用 POST；支援 `@file` |
| `--data-binary DATA` | 原始二進位 body，支援 `@file` |
| `-j, --json JSON` | JSON body，自動加上 `Content-Type: application/json` |
| `-F, --form name=value` | multipart/form-data 欄位；`name=@file` 可上傳檔案 |
| `-A, --user-agent STRING` | 設定 User-Agent |
| `-u, --user USER[:PASS]` | HTTP Basic 認證 |
| `-b, --cookie STRING\|FILE` | 送出 cookie，支援字串或 Netscape cookie 檔 |
| `-e, --referer URL` | 設定 Referer |
| `-o, --output FILE` | 將 body 寫入檔案（`-` 表示 stdout） |
| `-O, --remote-name` | 以 URL 最後一段作為輸出檔名 |
| `-i, --include` | 輸出 response headers |
| `-I, --head` | 送出 HEAD 並輸出 response headers |
| `-L, --location` | 跟隨 3xx 重新導向 |
| `--max-redirs NUM` | 最大重新導向次數（預設 50） |
| `-m, --max-time SECONDS` | 整個傳輸的最大秒數 |
| `--connect-timeout SECONDS` | 建立連線的最大秒數（預設 10） |
| `-k, --insecure` | 略過 TLS 憑證驗證 |
| `-f, --fail` | HTTP 狀態 >= 400 時以結束碼 22 結束，且不輸出 body |
| `-s, --silent` | 不顯示錯誤訊息 |
| `-S, --show-error` | 搭配 `-s` 時仍然顯示錯誤 |
| `-v, --verbose` | 在 stderr 顯示請求與回應細節 |
| `-w, --write-out FORMAT` | 在 body 之後輸出統計資訊 |
| `-h, --help` | 顯示說明 |
| `-V, --version` | 顯示版本 |

## 使用範例

```bash
# 基本 GET
node bin/mcurl.js https://example.com

# 顯示 response headers
node bin/mcurl.js -i https://example.com

# 只看 response headers
node bin/mcurl.js -I https://example.com

# POST 表單
node bin/mcurl.js -d "name=test" -d "value=123" https://httpbin.org/post

# POST JSON
node bin/mcurl.js -j '{"name":"test","value":123}' https://httpbin.org/post

# 自訂 Header 與 User-Agent
node bin/mcurl.js -H "Authorization: Bearer TOKEN" -A "MyAgent/1.0" https://httpbin.org/get

# Basic Auth + Cookie
node bin/mcurl.js -u "user:pass" -b "session=abc123" https://httpbin.org/get

# 上傳檔案（multipart）
node bin/mcurl.js -F "note=hello" -F "file=@./photo.jpg" https://httpbin.org/post

# 跟隨轉址並輸出到檔案
node bin/mcurl.js -L -o result.html https://example.com

# 依 URL 檔名儲存
node bin/mcurl.js -O https://example.com/logo.png

# 逾時與取消憑證驗證
node bin/mcurl.js -m 5 -k https://self-signed.example.com

# 自訂統計輸出
node bin/mcurl.js -w "HTTP %{http_code} | %{time_total}s | %{size_download} bytes\n" https://example.com

# 安靜模式
node bin/mcurl.js -s https://example.com
```

## `-w` 支援的變數

| 變數 | 說明 |
| --- | --- |
| `%{http_code}` | HTTP 狀態碼 |
| `%{http_version}` | HTTP 版本（目前為 1.1） |
| `%{time_total}` | 總耗時（秒） |
| `%{time_namelookup}` | DNS 解析耗時（秒） |
| `%{time_connect}` | TCP 連線耗時（秒） |
| `%{time_starttransfer}` | 收到第一個回應位元組的耗時（秒） |
| `%{size_download}` | 下載的 body 大小（bytes） |
| `%{size_header}` | response header 大小（bytes） |
| `%{url_effective}` | 最終請求的 URL |
| `%{remote_ip}` | 遠端 IP |
| `%{content_type}` | 最終回應的 Content-Type |
| `%{num_redirects}` | 重新導向次數 |
| `%{scheme}` | `http` 或 `https` |
| `%{filename_effective}` | 實際輸出檔名 |

格式中的 `\n`、`\r`、`\t`、`\\` 會轉成對應字元，`%%` 會輸出 `%`。

## 結束碼

| 結束碼 | 意義 |
| --- | --- |
| 0 | 成功 |
| 1 | 不支援的通訊協定 |
| 2 | 參數錯誤 |
| 3 | URL 格式錯誤 |
| 6 | 找不到主機 |
| 7 | 連線失敗 |
| 22 | HTTP 狀態 >= 400（搭配 `-f`） |
| 23 | 寫入檔案失敗 |
| 26 | 讀取檔案失敗 |
| 28 | 逾時 |
| 47 | 重新導向次數過多 |
| 60 | TLS 憑證問題 |

## 測試

```bash
npm test
```

測試會在隨機埠啟動本機 HTTP server，並以子行程實際執行 `bin/mcurl.js`，涵蓋 GET、headers、POST、JSON、multipart、認證、重新導向、逾時、錯誤碼與 `-w` 輸出等功能。

## 實作重點

- 只使用 `node:http`、`node:https`、`node:fs`、`node:url` 等標準函式庫。
- 重新導向由程式自行處理，因此可以精確控制 `-L`、最大次數，以及 301/302/303 改為 GET、307/308 保留方法與 body。
- 連線與整體逾時分開處理：`--connect-timeout` 控制建立連線，`-m` 控制整個傳輸。
- response body 以 Buffer 保存，能正確輸出二進位資料，也能同時供 `-o` 與 `-w` 使用。
- multipart body 自行組裝，檔案 Content-Type 依副檔名推測。
