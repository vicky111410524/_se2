#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Web 層：HTTP 伺服器、靜態檔服務與啟動程序（僅標準函式庫）。"""
import http.server
import mimetypes
import os
import sys
import urllib.parse

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


def _mime(path):
    _, ext = os.path.splitext(path)
    return MIME.get(ext.lower(), "application/octet-stream")


def create_handler(app):
    """回傳綁定 app 的 BaseHTTPRequestHandler 子類別。"""
    class Handler(http.server.BaseHTTPRequestHandler):
        server_version = "KMU-HW2/1.0"
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):
            pass

        def _read_body(self):
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = 0
            if length <= 0:
                return b""
            return self.rfile.read(length)

        def _send(self, status, body, ctype, extra=None):
            if isinstance(body, str):
                body = body.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            for key, value in (extra or {}).items():
                self.send_header(key, value)
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionAbortedError,
                    ConnectionResetError):
                pass

        def _serve_api(self, method):
            parsed = urllib.parse.urlsplit(self.path)
            path = urllib.parse.unquote(parsed.path)
            query = {}
            for key, value in urllib.parse.parse_qsl(
                    parsed.query, keep_blank_values=True):
                query.setdefault(key, []).append(value)
            body = self._read_body()
            res = self.app.handle(
                method, path, query, body, {k: v for k, v in self.headers.items()})
            self._send(res.status, res.body, res.content_type)

        def _serve_static(self):
            parsed = urllib.parse.urlsplit(self.path)
            rel = urllib.parse.unquote(parsed.path)
            if rel == "/":
                rel = "/index.html"
            if "/" not in rel or rel.startswith("/api/") or ".." in rel:
                self._send(404, "Not Found", "text/plain; charset=utf-8")
                return
            base = os.path.realpath(STATIC_DIR)
            full = os.path.realpath(os.path.join(STATIC_DIR, rel.lstrip("/")))
            if not full.startswith(base + os.sep) or not os.path.isfile(full):
                self._send(404, "Not Found", "text/plain; charset=utf-8")
                return
            self._send(200, _read_file(full), _mime(full))

        def _safe(self, fn):
            try:
                fn()
            except Exception:  # noqa: BLE001 - 印出詳細錯誤而非直接斷線
                import traceback
                sys.stderr.write("==== 請求處理失敗: {} {} ====\n".format(
                    self.command, self.path))
                traceback.print_exc()
                try:
                    self._send(500, "Internal Server Error",
                               "text/plain; charset=utf-8")
                    self.close_connection = True
                except Exception:  # noqa: BLE001
                    pass

        def do_GET(self):
            if urllib.parse.urlsplit(self.path).path.startswith("/api/"):
                self._safe(lambda: self._serve_api("GET"))
            else:
                self._safe(self._serve_static)

        def do_POST(self):
            self._safe(lambda: self._serve_api("POST"))

        def do_PUT(self):
            self._safe(lambda: self._serve_api("PUT"))

        def do_PATCH(self):
            self._safe(lambda: self._serve_api("PATCH"))

        def do_DELETE(self):
            self._safe(lambda: self._serve_api("DELETE"))

    Handler.app = app
    return Handler


def _read_file(path):
    with open(path, "rb") as f:
        return f.read()


DEMO_ACCOUNTS = [
    ("admin", "admin123", "行政人員"),
    ("teacher01", "teacher123", "教師（王志明）"),
    ("110410001", "stu123", "學生（張小華）"),
    ("110410002", "stu123", "學生（李大同）"),
    ("110410003", "stu123", "學生（陳小美）"),
    ("110491001", "stu123", "學生（王俊傑）"),
    ("111420001", "stu123", "學生（吳品潔）"),
    ("teacher02", "teacher123", "教師（林雅婷）"),
]


def serve(host, port, db_path):
    from .db import Database
    from .api import APApp

    db = Database(db_path)
    app = APApp(db)
    handler = create_handler(app)
    server = http.server.ThreadingHTTPServer((host, port), handler)
    url = "http://{}:{}/".format(host, port)
    print("=" * 56)
    print("  金門大學校務系統 MVP 已啟動")
    print("  網址: {}".format(url))
    print("  學期: {}（db: {}）".format(__import__("kmu").CURRENT_SEMESTER, db_path))
    print("-" * 56)
    print("  示範帳號（學號 / 密碼）:")
    for account, pw, note in DEMO_ACCOUNTS:
        print("    {:<12} {:<10} {}".format(account, pw, note))
    print("  Ctrl+C 結束")
    print("=" * 56)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        db.close()
    return 0