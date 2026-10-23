#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""選課引擎：非同步佇列 + 原子扣減容額，對應高併發選課的防塞車設計。

流程（與 README 的架構對照）：
  1. API 收到「選課」請求，先在 enrollments 表建立 status='pending' 的登記列，
     立刻回傳「受理中」（不等資料庫寫入完成）。
  2. 實際的容額扣減交給背景 Worker 依序處理（等同把請求送進 Message Queue）。
  3. Worker 在單一交易（BEGIN IMMEDIATE）內執行帶條件式的原子更新：

       UPDATE course_offerings
          SET current_enrolled = current_enrolled + 1, version = version + 1
        WHERE id = ? AND is_open = 1 AND current_enrolled < max_capacity

     rowcount 為 1 代表有名額可選（不會超賣）；否之則將登記改為 rejected。

這個設計不需要 Redis/RabbitMQ 也能在單機 MVP 內重現「先回登錄、後非同步消化、
庫存原子扣減」的核心行為；正式環境只要把 queue 換成 RabbitMQ、把容額熱資料放入
Redis 的 DECR 即可水平擴展。
"""
import json
import logging
import queue
import threading
from datetime import datetime

log = logging.getLogger("kmu.engine")


def _slots_of(schedule):
    """把排課時段轉成 (day, period) 集合，用於衝堂判斷。"""
    return {(int(i.get("day", 0)), str(i.get("period", "")))
            for i in (schedule or [])}


class EnrollmentEngine:
    def __init__(self, db, worker_count=1):
        self.db = db
        self._q = queue.Queue()
        self._lock = threading.Lock()
        self._cond = threading.Condition(self._lock)
        self._pending = 0
        self._workers = []
        for _ in range(max(1, worker_count)):
            t = threading.Thread(target=self._loop, daemon=True,
                                 name="enrollment-worker")
            t.start()
            self._workers.append(t)

    def submit(self, enrollment_id):
        with self._lock:
            self._pending += 1
            self._cond.notify_all()
        self._q.put(enrollment_id)

    def _loop(self):
        while True:
            enrollment_id = self._q.get()
            try:
                self._process(enrollment_id)
            except Exception:
                log.exception("選課處理失敗: %s", enrollment_id)
            finally:
                self._q.task_done()
                with self._lock:
                    self._pending -= 1
                    self._cond.notify_all()

    def _process(self, enrollment_id):
        now = datetime.now().isoformat(timespec="seconds")
        with self.db.tx() as conn:
            row = conn.execute(
                "SELECT student_id, offering_id FROM enrollments"
                " WHERE id=? AND status='pending'", (enrollment_id,)).fetchone()
            if row is None:
                return  # 已被其他流程（如退選）處理或不存在
            offering_id = row["offering_id"]
            off = conn.execute(
                "SELECT course_id, semester, schedule_info"
                " FROM course_offerings WHERE id=?",
                (offering_id,)).fetchone()
            if off is None:
                conn.execute(
                    "UPDATE enrollments SET status='rejected', enrolled_at=?"
                    " WHERE id=?", (now, enrollment_id))
                return
            # 同一門課不得同時選修不同時段（含併發撞在同一時刻的請求）
            dup = conn.execute(
                "SELECT e.id FROM enrollments e"
                " JOIN course_offerings o2 ON o2.id=e.offering_id"
                " WHERE e.student_id=? AND e.id<>? AND e.offering_id<>?"
                " AND e.status IN ('pending','enrolled')"
                " AND o2.course_id=? AND o2.semester=?",
                (row["student_id"], enrollment_id, offering_id,
                 off["course_id"], off["semester"])).fetchone()
            # 與已選課程同時段（同週同節）衝堂
            new_slots = _slots_of(json.loads(off["schedule_info"]))
            clash = conn.execute(
                "SELECT o.schedule_info FROM enrollments e"
                " JOIN course_offerings o ON o.id=e.offering_id"
                " WHERE e.student_id=? AND e.id<>? AND e.offering_id<>?"
                " AND e.status IN ('pending','enrolled')",
                (row["student_id"], enrollment_id, offering_id)).fetchall()
            if dup is not None or any(
                    _slots_of(json.loads(r["schedule_info"])) & new_slots
                    for r in clash):
                conn.execute(
                    "UPDATE enrollments SET status='rejected', enrolled_at=?"
                    " WHERE id=?", (now, enrollment_id))
                return
            cur = conn.execute(
                "UPDATE course_offerings"
                " SET current_enrolled = current_enrolled + 1, version = version + 1"
                " WHERE id=? AND is_open=1 AND current_enrolled < max_capacity",
                (offering_id,))
            if cur.rowcount == 1:
                conn.execute(
                    "UPDATE enrollments SET status='enrolled', enrolled_at=?"
                    " WHERE id=?", (now, enrollment_id))
            else:
                conn.execute(
                    "UPDATE enrollments SET status='rejected', enrolled_at=?"
                    " WHERE id=?", (now, enrollment_id))

    def stat(self):
        with self._lock:
            return {"queue_pending": self._pending, "workers": len(self._workers)}

    def wait_idle(self, timeout=10.0):
        """等待目前所有已提交的選課請求消化完成（供測試與管理使用）。"""
        with self._cond:
            ok = self._cond.wait_for(lambda: self._pending == 0, timeout=timeout)
            if not ok:
                raise TimeoutError("選課佇列未在限定時間內消化完畢")