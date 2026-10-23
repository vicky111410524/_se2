#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""金門大學校務系統 MVP（純 Python 標準函式庫實作）。

    python -m kmu            # 在本機啟動服務
"""
import os

from .db import CURRENT_SEMESTER, Database
from .api import APApp
from .web import create_handler, serve

__all__ = ["CURRENT_SEMESTER", "Database", "APApp", "create_handler", "serve"]


def main(argv=None):
    """CLI 進入點。"""
    import argparse

    parser = argparse.ArgumentParser(prog="python -m kmu",
                                     description="金門大學校務系統 MVP")
    parser.add_argument("--host", default="127.0.0.1", help="監聽位址")
    parser.add_argument("--port", type=int, default=8000, help="監聽埠")
    parser.add_argument("--db", default=os.path.join(os.getcwd(), "kmu.db"),
                        help="SQLite 資料庫檔案路徑")
    parser.add_argument("--reset", action="store_true",
                        help="啟動前刪除舊資料庫以重建種子資料")
    args = parser.parse_args(argv)

    if args.reset and os.path.exists(args.db):
        os.remove(args.db)
    return serve(args.host, args.port, args.db)


if __name__ == "__main__":
    import sys
    sys.exit(main())