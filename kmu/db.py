#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""資料庫層：Schema 建立、種子資料、連線與交易管理。

僅使用標準函式庫（sqlite3、hashlib、secrets…），不依賴任何第三方套件。
資料表設計對應 README 中的「五個核心模組」：

  users / departments / students            -> 帳號與學籍
  courses / course_offerings                -> 課程與開課
  enrollments                               -> 選課與成績
  leave_requests                            -> 請假與簽核
  attendance                                -> 缺曠與請假統計
"""
import hashlib
import json
import secrets
import sqlite3
import threading
from contextlib import contextmanager

CURRENT_SEMESTER = "115-1"

_PW_ROUNDS = 120_000


# --------------------------------------------------------------------------
# 密碼雜湊（PBKDF2-HMAC-SHA256，長度可對齊系統需求）
# --------------------------------------------------------------------------
def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(8)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"),
                                 salt.encode("ascii"), _PW_ROUNDS)
    return "{}${}".format(salt, digest.hex())


def verify_password(password, stored):
    try:
        salt, _ = stored.split("$", 1)
    except ValueError:
        return False
    return secrets.compare_digest(hash_password(password, salt), stored)


# --------------------------------------------------------------------------
# Schema
# --------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS departments (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  college TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  account       TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student','teacher','admin')),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  department_id INTEGER REFERENCES departments(id),   -- 教師所屬系所
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','graduated'))
);

CREATE TABLE IF NOT EXISTS students (
  user_id           TEXT PRIMARY KEY REFERENCES users(id),
  department_id     INTEGER REFERENCES departments(id),
  enrollment_year   INTEGER NOT NULL,
  class_name        TEXT NOT NULL,
  phone             TEXT NOT NULL DEFAULT '',
  emergency_contact TEXT NOT NULL DEFAULT '',
  emergency_phone   TEXT NOT NULL DEFAULT '',
  registered        INTEGER NOT NULL DEFAULT 1,
  tuition_paid      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS courses (
  id            TEXT PRIMARY KEY,
  course_code   TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  credits       INTEGER NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('required','elective','general')),
  department_id INTEGER REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS course_offerings (
  id               TEXT PRIMARY KEY,
  course_id        TEXT NOT NULL REFERENCES courses(id),
  semester         TEXT NOT NULL,
  teacher_id       TEXT NOT NULL REFERENCES users(id),
  schedule_info    TEXT NOT NULL DEFAULT '[]',   -- JSON: [{"day":1,"period":"A"}, ...]
  location         TEXT NOT NULL DEFAULT '',
  max_capacity     INTEGER NOT NULL,
  current_enrolled INTEGER NOT NULL DEFAULT 0,
  version          INTEGER NOT NULL DEFAULT 0,   -- 樂觀鎖版本號
  is_open          INTEGER NOT NULL DEFAULT 1    -- 是否開放選課
);
CREATE INDEX IF NOT EXISTS idx_offer_semester ON course_offerings(semester);
CREATE INDEX IF NOT EXISTS idx_offer_teacher  ON course_offerings(teacher_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_course_sem ON course_offerings(course_id, semester);

CREATE TABLE IF NOT EXISTS enrollments (
  id            TEXT PRIMARY KEY,
  student_id    TEXT NOT NULL REFERENCES users(id),
  offering_id   TEXT NOT NULL REFERENCES course_offerings(id),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','enrolled','dropped','rejected')),
  midterm_score REAL,
  final_score   REAL,
  total_score   REAL,
  enrolled_at   TEXT,
  created_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_enroll_stu_off ON enrollments(student_id, offering_id);
CREATE INDEX IF NOT EXISTS idx_enroll_off ON enrollments(offering_id);

CREATE TABLE IF NOT EXISTS leave_requests (
  id             TEXT PRIMARY KEY,
  student_id     TEXT NOT NULL REFERENCES users(id),
  type           TEXT NOT NULL,
  start_time     TEXT NOT NULL,
  end_time       TEXT NOT NULL,
  days           INTEGER NOT NULL,
  reason         TEXT NOT NULL,
  proof_url      TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  approval_step  INTEGER NOT NULL DEFAULT 1,      -- 1=授課教師, 2=系主任/行政
  decisions      TEXT NOT NULL DEFAULT '[]',      -- JSON: [{by, role, approve, at}]
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status, approval_step);

CREATE TABLE IF NOT EXISTS attendance (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id),
  offering_id TEXT NOT NULL REFERENCES course_offerings(id),
  date        TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('present','absent','late'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_att_stu_off_date
  ON attendance(student_id, offering_id, date);
"""


def now_iso():
    from datetime import datetime
    return datetime.now().isoformat(timespec="seconds")


def schedule_to_text(schedule):
    """例如 [{'day':1,'period':'A'}] -> '週一 A (08:10-09:00)'"""
    from .api import show_period  # 延遲引入避免環狀 import
    parts = [show_period(item.get("day"), item.get("period"))
             for item in schedule]
    return "、".join(parts) if parts else "未排課"


# --------------------------------------------------------------------------
# 種子資料
# --------------------------------------------------------------------------
def _seed(conn):
    def ins(table, cols, values):
        sql = "INSERT INTO {} ({}) VALUES ({})".format(
            table, ",".join(cols), ",".join("?" for _ in cols))
        if isinstance(values, (list, tuple)) and values and isinstance(values[0], (list, tuple)):
            conn.executemany(sql, values)
        else:
            conn.execute(sql, values)

    pw = {
        "admin123": hash_password("admin123"),
        "teacher123": hash_password("teacher123"),
        "stu123": hash_password("stu123"),
    }
    ins("departments", ("id", "name", "college"), [
        (1, "資訊工程學系", "理工學院"),
        (2, "電機工程學系", "理工學院"),
        (3, "企業管理學系", "管理學院"),
        (4, "通識教育中心", "通識中心"),
        (5, "應用英語學系", "人文社會學院"),
        (6, "觀光管理學系", "管理學院"),
        (7, "餐旅管理學系", "管理學院"),
    ])
    ins("users", ("id", "account", "password_hash", "role", "name", "email", "department_id"), [
        ("u101", "admin",     pw["admin123"],   "admin",   "系統管理員", "admin@nqu.edu.tw", None),
        ("u102", "admin2",    pw["admin123"],   "admin",   "教務處 陳雅筑", "oaa@nqu.edu.tw", None),
        ("u103", "admin3",    pw["admin123"],   "admin",   "學務處 林俊宏", "osa@nqu.edu.tw", None),
        ("t101", "teacher01", pw["teacher123"], "teacher", "王志明",     "wangcm@nqu.edu.tw", 1),
        ("t102", "teacher02", pw["teacher123"], "teacher", "林雅婷",     "linyt@nqu.edu.tw", 2),
        ("t103", "teacher03", pw["teacher123"], "teacher", "陳建宏",     "chenjh@nqu.edu.tw", 1),
        ("t104", "teacher04", pw["teacher123"], "teacher", "黃雅文",     "huangyw@nqu.edu.tw", 3),
        ("t105", "teacher05", pw["teacher123"], "teacher", "許佩琳",     "hsupl@nqu.edu.tw", 5),
        ("t106", "teacher06", pw["teacher123"], "teacher", "劉俊宏",     "liuch@nqu.edu.tw", 6),
        ("t107", "teacher07", pw["teacher123"], "teacher", "楊美玲",     "yangml@nqu.edu.tw", 7),
        ("t108", "teacher08", pw["teacher123"], "teacher", "張益誠",     "changyc@nqu.edu.tw", 2),
        ("s101", "110410001", pw["stu123"], "student", "張小華", "110410001@gm.nqu.edu.tw", None),
        ("s102", "110410002", pw["stu123"], "student", "李大同", "110410002@gm.nqu.edu.tw", None),
        ("s103", "110410003", pw["stu123"], "student", "陳小美", "110410003@gm.nqu.edu.tw", None),
        ("s104", "110491001", pw["stu123"], "student", "王俊傑", "110491001@gm.nqu.edu.tw", None),
        ("s105", "111420001", pw["stu123"], "student", "吳品潔", "111420001@gm.nqu.edu.tw", None),
        ("s106", "110410004", pw["stu123"], "student", "鄭宇翔", "110410004@gm.nqu.edu.tw", None),
        ("s107", "110490002", pw["stu123"], "student", "郭佩珊", "110490002@gm.nqu.edu.tw", None),
        ("s108", "110420002", pw["stu123"], "student", "賴冠廷", "110420002@gm.nqu.edu.tw", None),
        ("s109", "112510001", pw["stu123"], "student", "蔡孟璇", "112510001@gm.nqu.edu.tw", None),
        ("s110", "113610001", pw["stu123"], "student", "邱鈺婷", "113610001@gm.nqu.edu.tw", None),
        ("s111", "113710001", pw["stu123"], "student", "許育誠", "113710001@gm.nqu.edu.tw", None),
    ])
    ins("students", ("user_id", "department_id", "enrollment_year",
                     "class_name", "phone", "emergency_contact", "emergency_phone"), [
        ("s101", 1, 110, "資工二甲", "0912-345-101", "張爸爸", "0910-100-101"),
        ("s102", 1, 110, "資工二甲", "0912-345-102", "李媽媽", "0910-100-102"),
        ("s103", 1, 110, "資工二甲", "0912-345-103", "陳爸爸", "0910-100-103"),
        ("s104", 2, 110, "電機一甲", "0912-345-104", "王媽媽", "0910-100-104"),
        ("s105", 3, 111, "企管一甲", "0912-345-105", "吳先生", "0910-100-105"),
        ("s106", 1, 110, "資工二甲", "0912-345-106", "鄭爸爸", "0910-100-106"),
        ("s107", 2, 110, "電機二甲", "0912-345-107", "郭媽媽", "0910-100-107"),
        ("s108", 3, 110, "企管二甲", "0912-345-108", "賴爸爸", "0910-100-108"),
        ("s109", 5, 112, "應英一甲", "0912-345-109", "蔡媽媽", "0910-100-109"),
        ("s110", 6, 113, "觀光一甲", "0912-345-110", "邱爸爸", "0910-100-110"),
        ("s111", 7, 113, "餐旅一甲", "0912-345-111", "許媽媽", "0910-100-111"),
    ])
    ins("courses", ("id", "course_code", "name", "credits", "type", "department_id"), [
        ("c1",  "C0101", "程式設計（一）",       3, "required", 1),
        ("c2",  "C0201", "資料結構",             3, "required", 1),
        ("c3",  "C0301", "作業系統",             3, "required", 1),
        ("c4",  "D0101", "線性代數",             3, "required", 1),
        ("c5",  "E0101", "網頁程式設計",         2, "elective", 1),
        ("c6",  "G0101", "人權與社會",           2, "general",  4),
        ("c7",  "G0102", "海洋環境與生態教育",   2, "general",  4),
        ("c8",  "C0401", "資料庫系統",           3, "required", 1),
        ("c9",  "E0302", "設計思考與生活",       2, "elective", 4),
        ("c10", "C0501", "計算機網路",           3, "required", 1),
        ("c11", "C0102", "微積分（一）",         3, "required", 1),
        ("c12", "C0701", "人工智慧導論",         3, "required", 1),
        ("c13", "D0102", "電路學（一）",         3, "required", 2),
        ("c14", "D0103", "信號與系統",           3, "required", 2),
        ("c15", "M0101", "管理學",               3, "required", 3),
        ("c16", "M0102", "會計學（一）",         3, "required", 3),
        ("c17", "L0101", "英文寫作",             2, "elective", 5),
        ("c18", "L0102", "口譯入門",             2, "elective", 5),
        ("c19", "T0101", "觀光學概論",           3, "required", 6),
        ("c20", "T0102", "旅行業管理",           2, "elective", 6),
        ("c21", "H0101", "餐旅管理概論",         3, "required", 7),
        ("c22", "H0102", "烘焙實務",             2, "elective", 7),
        ("c23", "G0103", "服務學習",             2, "general",  4),
        ("c24", "G0104", "體育（一）",           2, "general",  4),
        ("c25", "C0601", "Python 程式實務",      2, "elective", 1),
        ("c26", "G0105", "媒體素養",             2, "general",  4),
        ("c27", "M0103", "供應鏈管理",           2, "elective", 3),
        ("c28", "D0201", "嵌入式系統導論",       2, "elective", 2),
        ("c29", "T0103", "旅館實務實習",         2, "elective", 6),
    ])
    ins("course_offerings",
        ("id", "course_id", "semester", "teacher_id", "schedule_info", "location",
         "max_capacity", "current_enrolled", "version", "is_open"), [
        ("o1",  "c1",  "115-1", "t101", json.dumps([{"day": 1, "period": "A"}, {"day": 3, "period": "B"}], ensure_ascii=False), "理工A101", 60, 12, 12, 1),
        ("o2",  "c2",  "115-1", "t101", json.dumps([{"day": 1, "period": "C"}, {"day": 4, "period": "A"}], ensure_ascii=False), "理工A203", 55, 14, 14, 1),
        ("o3",  "c3",  "115-1", "t102", json.dumps([{"day": 2, "period": "A"}, {"day": 5, "period": "B"}], ensure_ascii=False), "理工A205", 50, 8, 8, 1),
        ("o4",  "c4",  "115-1", "t102", json.dumps([{"day": 2, "period": "B"}, {"day": 4, "period": "C"}], ensure_ascii=False), "理工B108", 55, 18, 18, 1),
        ("o5",  "c5",  "115-1", "t101", json.dumps([{"day": 3, "period": "D"}, {"day": 5, "period": "A"}], ensure_ascii=False), "資工館305", 40, 5, 5, 1),
        ("o6",  "c6",  "115-1", "t101", json.dumps([{"day": 1, "period": "E"}, {"day": 4, "period": "D"}], ensure_ascii=False), "通識大樓101", 100, 30, 30, 1),
        ("o7",  "c7",  "115-1", "t102", json.dumps([{"day": 3, "period": "A"}, {"day": 5, "period": "C"}], ensure_ascii=False), "通識大樓102", 80, 12, 12, 1),
        ("o8",  "c8",  "115-1", "t101", json.dumps([{"day": 2, "period": "C"}, {"day": 4, "period": "B"}], ensure_ascii=False), "理工A310", 60, 3, 3, 1),
        ("o9",  "c9",  "115-1", "t102", json.dumps([{"day": 5, "period": "E"}, {"day": 5, "period": "F"}], ensure_ascii=False), "通識大樓203", 45, 6, 6, 1),
        ("o10", "c10", "115-1", "t102", json.dumps([{"day": 3, "period": "B"}, {"day": 5, "period": "D"}], ensure_ascii=False), "理工B205", 50, 9, 9, 1),
        ("o11", "c11", "115-1", "t103", json.dumps([{"day": 1, "period": "E"}, {"day": 3, "period": "F"}], ensure_ascii=False), "理工B101", 55, 20, 20, 1),
        ("o12", "c12", "115-1", "t103", json.dumps([{"day": 2, "period": "D"}, {"day": 4, "period": "F"}], ensure_ascii=False), "理工B102", 45, 15, 15, 1),
        ("o13", "c13", "115-1", "t102", json.dumps([{"day": 1, "period": "D"}, {"day": 3, "period": "E"}], ensure_ascii=False), "理工C201", 50, 16, 16, 1),
        ("o14", "c14", "115-1", "t108", json.dumps([{"day": 2, "period": "E"}, {"day": 5, "period": "D"}], ensure_ascii=False), "理工C202", 50, 10, 10, 1),
        ("o15", "c15", "115-1", "t104", json.dumps([{"day": 4, "period": "B"}, {"day": 5, "period": "C"}], ensure_ascii=False), "管理大樓301", 60, 22, 22, 1),
        ("o16", "c16", "115-1", "t104", json.dumps([{"day": 1, "period": "F"}, {"day": 3, "period": "G"}], ensure_ascii=False), "管理大樓302", 55, 18, 18, 1),
        ("o17", "c17", "115-1", "t105", json.dumps([{"day": 2, "period": "F"}, {"day": 4, "period": "E"}], ensure_ascii=False), "人文B101", 40, 14, 14, 1),
        ("o18", "c18", "115-1", "t105", json.dumps([{"day": 1, "period": "G"}, {"day": 5, "period": "E"}], ensure_ascii=False), "人文B102", 35, 8, 8, 1),
        ("o19", "c19", "115-1", "t106", json.dumps([{"day": 3, "period": "C"}, {"day": 5, "period": "A"}], ensure_ascii=False), "觀光大樓201", 55, 19, 19, 1),
        ("o20", "c20", "115-1", "t106", json.dumps([{"day": 4, "period": "G"}, {"day": 5, "period": "G"}], ensure_ascii=False), "觀光大樓202", 40, 11, 11, 1),
        ("o21", "c21", "115-1", "t107", json.dumps([{"day": 2, "period": "A"}, {"day": 4, "period": "C"}], ensure_ascii=False), "餐旅大樓101", 55, 21, 21, 1),
        ("o22", "c22", "115-1", "t107", json.dumps([{"day": 5, "period": "F"}, {"day": 5, "period": "G"}], ensure_ascii=False), "餐旅實習廚房", 25, 9, 9, 1),
        ("o23", "c23", "115-1", "t102", json.dumps([{"day": 3, "period": "E"}, {"day": 5, "period": "B"}], ensure_ascii=False), "通識大樓103", 50, 7, 7, 1),
        ("o24", "c24", "115-1", "t103", json.dumps([{"day": 2, "period": "G"}, {"day": 4, "period": "E"}], ensure_ascii=False), "綜合體育館", 60, 24, 24, 1),
    ])
    ins("enrollments",
        ("id", "student_id", "offering_id", "status",
         "midterm_score", "final_score", "total_score", "enrolled_at", "created_at"), [
        ("e101", "s101", "o1", "enrolled", 90, 86, 88, "2026-09-02T10:00:00", "2026-09-01T09:00:00"),
        ("e102", "s101", "o2", "enrolled", 95, 90, 92, "2026-09-02T10:01:00", "2026-09-01T09:01:00"),
        ("e103", "s101", "o3", "enrolled", 62, 68, 65, "2026-09-02T10:02:00", "2026-09-01T09:02:00"),
        ("e104", "s101", "o4", "enrolled", 70, 80, 76, "2026-09-02T10:03:00", "2026-09-01T09:03:00"),
        ("e105", "s102", "o1", "enrolled", 80, 90, 85, "2026-09-02T10:04:00", "2026-09-01T09:04:00"),
        ("e106", "s102", "o3", "enrolled", 88, 92, 90, "2026-09-02T10:05:00", "2026-09-01T09:05:00"),
        ("e107", "s102", "o6", "enrolled", 65, 75, 70, "2026-09-02T10:06:00", "2026-09-01T09:06:00"),
        ("e108", "s103", "o3", "enrolled", 85, 90, 88, "2026-09-02T10:07:00", "2026-09-01T09:07:00"),
        ("e109", "s103", "o4", "enrolled", 70, 74, 72, "2026-09-02T10:08:00", "2026-09-01T09:08:00"),
        ("e110", "s104", "o10", "enrolled", 55, 61, 58, "2026-09-02T10:09:00", "2026-09-01T09:09:00"),
        ("e111", "s105", "o6", "enrolled", 80, 84, 82, "2026-09-02T10:10:00", "2026-09-01T09:10:00"),
        ("e112", "s105", "o9", "enrolled", 88, 91, 90, "2026-09-02T10:11:00", "2026-09-01T09:11:00"),
        ("e113", "s106", "o11", "enrolled", 82, 88, 85, "2026-09-02T10:12:00", "2026-09-01T09:12:00"),
        ("e114", "s106", "o12", "enrolled", 75, 80, 78, "2026-09-02T10:13:00", "2026-09-01T09:13:00"),
        ("e115", "s106", "o8", "enrolled", 68, 72, 70, "2026-09-02T10:14:00", "2026-09-01T09:14:00"),
        ("e116", "s107", "o13", "enrolled", 79, 85, 82, "2026-09-02T10:15:00", "2026-09-01T09:15:00"),
        ("e117", "s107", "o14", "enrolled", 66, 70, 68, "2026-09-02T10:16:00", "2026-09-01T09:16:00"),
        ("e118", "s107", "o7", "enrolled", 90, 88, 89, "2026-09-02T10:17:00", "2026-09-01T09:17:00"),
        ("e119", "s108", "o15", "enrolled", 84, 90, 87, "2026-09-02T10:18:00", "2026-09-01T09:18:00"),
        ("e120", "s108", "o16", "enrolled", 72, 78, 75, "2026-09-02T10:19:00", "2026-09-01T09:19:00"),
        ("e121", "s108", "o6", "enrolled", 60, 66, 63, "2026-09-02T10:20:00", "2026-09-01T09:20:00"),
        ("e122", "s109", "o17", "enrolled", 88, 92, 90, "2026-09-02T10:21:00", "2026-09-01T09:21:00"),
        ("e123", "s109", "o18", "enrolled", 85, 87, 86, "2026-09-02T10:22:00", "2026-09-01T09:22:00"),
        ("e124", "s109", "o7", "enrolled", 78, 82, 80, "2026-09-02T10:23:00", "2026-09-01T09:23:00"),
        ("e125", "s110", "o19", "enrolled", 81, 85, 83, "2026-09-02T10:24:00", "2026-09-01T09:24:00"),
        ("e126", "s110", "o20", "enrolled", 92, 90, 91, "2026-09-02T10:25:00", "2026-09-01T09:25:00"),
        ("e127", "s110", "o6", "enrolled", 70, 74, 72, "2026-09-02T10:26:00", "2026-09-01T09:26:00"),
        ("e128", "s111", "o21", "enrolled", 76, 82, 79, "2026-09-02T10:27:00", "2026-09-01T09:27:00"),
        ("e129", "s111", "o22", "enrolled", 89, 93, 91, "2026-09-02T10:28:00", "2026-09-01T09:28:00"),
        ("e130", "s111", "o2", "enrolled", 74, 80, 77, "2026-09-02T10:29:00", "2026-09-01T09:29:00"),
    ])
    att = [("a101", "s101", "o1", "2026-09-07", "present"),
           ("a102", "s101", "o1", "2026-09-09", "absent"),
           ("a103", "s101", "o1", "2026-09-14", "late"),
           ("a104", "s101", "o1", "2026-09-16", "present"),
           ("a105", "s102", "o1", "2026-09-07", "present"),
           ("a106", "s102", "o1", "2026-09-09", "present"),
           ("a107", "s102", "o1", "2026-09-14", "absent"),
           ("a108", "s102", "o1", "2026-09-16", "late"),
           ("a109", "s103", "o4", "2026-09-08", "present")]
    conn.executemany(
        "INSERT INTO attendance (id, student_id, offering_id, date, status)"
        " VALUES (?,?,?,?,?)", att)

    ins("leave_requests",
        ("id", "student_id", "type", "start_time", "end_time", "days", "reason",
         "proof_url", "status", "approval_step", "decisions", "created_at"), [
        ("l1", "s102", "病假", "2026-09-21T09:00:00", "2026-09-21T12:00:00", 1,
         "感冒發燒，需就醫", "", "pending", 1, "[]", "2026-09-20T08:00:00"),
        ("l2", "s104", "事假", "2026-09-23T00:00:00", "2026-09-25T23:59:00", 3,
         "家中婚禮，需返鄉", "", "pending", 1, "[]", "2026-09-20T09:00:00"),
        ("l3", "s105", "公假", "2026-09-17T08:00:00", "2026-09-17T17:00:00", 1,
         "代表學校參加越野賽", "", "approved", 1,
         json.dumps([{"by": "t102", "role": "teacher", "approve": True,
                      "at": "2026-09-16T10:00:00"}], ensure_ascii=False),
         "2026-09-16T08:00:00"),
    ])


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------
class Database:
    """每個執行緒各自持有自己的 sqlite3 連線（thread-local）。"""

    def __init__(self, path):
        self.path = path
        self._local = threading.local()
        self._init_schema()
        self._seed_if_empty()

    def get_conn(self):
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(self.path, check_same_thread=False,
                                   timeout=15, isolation_level=None)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute("PRAGMA journal_mode=WAL")
            except sqlite3.DatabaseError:
                pass
            conn.execute("PRAGMA busy_timeout=15000")
            conn.execute("PRAGMA synchronous=NORMAL")
            self._local.conn = conn
        return conn

    def _init_schema(self):
        conn = self.get_conn()
        conn.executescript(SCHEMA)

    def _seed_if_empty(self):
        conn = self.get_conn()
        count = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
        if count:
            return
        try:
            conn.execute("BEGIN IMMEDIATE")
            _seed(conn)
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise

    @contextmanager
    def tx(self):
        conn = self.get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.execute("COMMIT")
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise

    def close(self):
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            conn.close()
            self._local.conn = None