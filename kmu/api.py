#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""API 層：所有 REST 端點、權限檢查與商務邏輯。"""
import json
import logging
import uuid
from datetime import date, datetime, timedelta

from .db import CURRENT_SEMESTER, verify_password
from .auth import AuthManager
from .engine import EnrollmentEngine

log = logging.getLogger("kmu.api")

PERIOD_TIMES = {
    "A": ("08:10", "09:00"), "B": ("09:10", "10:00"),
    "C": ("10:10", "11:00"), "D": ("11:10", "12:00"),
    "E": ("13:10", "14:00"), "F": ("14:10", "15:00"),
    "G": ("15:10", "16:00"), "H": ("16:10", "17:00"),
}
_DAY_CN = {1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "日"}
_TYPE_CN = {"required": "必修", "elective": "選修", "general": "通識"}
_GRADE_TABLE = [(90, "A", 4.0), (80, "B", 3.0), (70, "C", 2.0),
                (60, "D", 1.0), (0, "F", 0.0)]


def show_period(day, period):
    return "週{}{} ({}-{})".format(_DAY_CN.get(day, "?"), period,
                                   PERIOD_TIMES.get(period, ("??", "??"))[0],
                                   PERIOD_TIMES.get(period, ("??", "??"))[1])


def schedule_text(schedule):
    parts = [show_period(s.get("day"), s.get("period")) for s in schedule]
    return "、".join(parts) if parts else "未排課"


def letter_info(score):
    if score is None:
        return None, None
    for th, letter, point in _GRADE_TABLE:
        if score >= th:
            return letter, point
    return "F", 0.0


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class ApiResponse:
    def __init__(self, status, body, content_type="application/json; charset=utf-8"):
        self.status = status
        self.body = body
        self.content_type = content_type


def j(data, status=200):
    return ApiResponse(status, json.dumps(data, ensure_ascii=False).encode("utf-8"))


def text(body, status=200, content_type="text/plain; charset=utf-8"):
    return ApiResponse(status, body, content_type)


class APApp:
    def __init__(self, db):
        self.db = db
        self.auth = AuthManager()
        self.engine = EnrollmentEngine(db)

    # ------------------------------------------------------------------
    # 入口
    # ------------------------------------------------------------------
    def handle(self, method, path, query, body, headers):
        try:
            return self._dispatch(method, path, query, body, headers)
        except ApiError as e:
            return j({"error": e.message}, e.status)
        except Exception:
            log.exception("未處理的例外: %s %s", method, path)
            return j({"error": "伺服器內部錯誤"}, 500)

    def _dispatch(self, method, path, query, body, headers):
        seg = [s for s in path.split("/") if s]
        if not seg or seg[0] != "api":
            raise ApiError(404, "找不到資源")
        p = seg[1]

        # -- 登入 / 登出 / 我的資訊 --------------------------------
        if method == "POST" and p == "login":
            return self._login(self._json_body(body))
        if method == "POST" and p == "logout":
            return self._logout(headers)
        if method == "GET" and p == "me":
            return self._me(self._auth_user(headers))
        if method == "GET" and p == "departments":
            return self._departments()

        # -- 課程與選課 --------------------------------------------
        if method == "GET" and p == "courses":
            return self._list_courses(query, headers)
        if method == "POST" and p == "enroll":
            return self._enroll(self._json_body(body), headers)
        if method == "DELETE" and p == "enroll" and len(seg) == 3:
            return self._drop(seg[2], headers)
        if method == "GET" and p == "enrollments":
            return self._my_enrollments(headers)
        if method == "GET" and p == "timetable":
            return self._timetable(headers, ics=False)
        if method == "GET" and p == "timetable.ics":
            return self._timetable(headers, ics=True)
        if method == "GET" and p == "grades":
            return self._grades(headers)
        if method == "GET" and p == "profile":
            return self._profile_get(headers)
        if method == "PUT" and p == "profile":
            return self._profile_put(self._json_body(body), headers)
        if method == "GET" and p == "attendance":
            return self._attendance(headers)

        # -- 請假 (學生) --------------------------------------------
        if method == "GET" and p == "leave" and len(seg) == 3 and seg[2] == "mine":
            return self._my_leaves(headers)
        if method == "GET" and p == "leave" and len(seg) == 3 and seg[2] == "pending":
            return self._pending_leaves(headers)
        if method == "POST" and p == "leave" and len(seg) == 4 and seg[3] == "decision":
            return self._decide_leave(seg[2], self._json_body(body), headers)
        if method == "POST" and p == "leave" and len(seg) == 2:
            return self._create_leave(self._json_body(body), headers)

        # -- 教師 ------------------------------------------------
        if method == "GET" and p == "teacher" and len(seg) == 3 and seg[2] == "classes":
            return self._teacher_classes(headers)
        if method == "GET" and p == "teacher" and len(seg) == 3 and seg[2] == "roster":
            return self._teacher_roster(query, headers)
        if method == "POST" and p == "teacher" and len(seg) == 3 and seg[2] == "grades":
            return self._teacher_grades(self._json_body(body), headers)
        if method == "POST" and p == "teacher" and len(seg) == 3 and seg[2] == "attendance":
            return self._teacher_attendance(self._json_body(body), headers)

        # -- 行政 ------------------------------------------------
        if p == "admin" and len(seg) == 3 and seg[2] == "meta" and method == "GET":
            return self._admin_meta(headers)
        if p == "admin" and len(seg) == 3 and seg[2] == "offerings" and method == "GET":
            return self._admin_offerings(query, headers)
        if p == "admin" and len(seg) == 3 and seg[2] == "offerings" and method == "POST":
            return self._admin_create_offering(self._json_body(body), headers)
        if p == "admin" and len(seg) == 4 and seg[2] == "offerings" and method == "PATCH":
            return self._admin_update_offering(seg[3], self._json_body(body), headers)

        raise ApiError(404, "找不到資源")

    # ------------------------------------------------------------------
    # 工具
    # ------------------------------------------------------------------
    def _json_body(self, body):
        try:
            data = json.loads((body or b"{}").decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "JSON 格式錯誤")
        if not isinstance(data, dict):
            raise ApiError(400, "JSON 必須是物件")
        return data

    def _auth_user(self, headers):
        token = ""
        auth = headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[len("Bearer "):]
        user_id = self.auth.resolve(token)
        if not user_id:
            raise ApiError(401, "請先登入")
        return user_id

    def _user(self, user_id):
        row = self.db.get_conn().execute(
            "SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if not row:
            raise ApiError(401, "帳號不存在")
        return row

    def _require_role(self, row, *roles):
        if row["role"] not in roles:
            raise ApiError(403, "權限不足")

    def _student(self, user_id):
        row = self.db.get_conn().execute(
            "SELECT s.*, d.name AS dept_name, d.college "
            "FROM students s LEFT JOIN departments d ON d.id=s.department_id "
            "WHERE s.user_id=?", (user_id,)).fetchone()
        if not row:
            raise ApiError(403, "沒有學生資料")
        return row

    @staticmethod
    def _parse_schedule(raw):
        try:
            data = json.loads(raw) if raw else []
        except ValueError:
            return []
        return data if isinstance(data, list) else []

    @staticmethod
    def _letter_info(score):
        return letter_info(score)

    @staticmethod
    def _compute_gpa(conn, user_id):
        rows = conn.execute(
            "SELECT e.total_score, c.credits FROM enrollments e"
            " JOIN course_offerings o ON o.id=e.offering_id"
            " JOIN courses c ON c.id=o.course_id"
            " WHERE e.student_id=? AND e.status='enrolled'"
            " AND e.total_score IS NOT NULL", (user_id,)).fetchall()
        total_pts = 0.0
        total_credits = 0
        for r in rows:
            _, pt = letter_info(r["total_score"])
            total_pts += pt * r["credits"]
            total_credits += r["credits"]
        gpa = round(total_pts / total_credits, 2) if total_credits else 0.0
        return gpa, total_credits

    def _slots(self, schedule):
        return {(int(i.get("day", 0)), str(i.get("period", "")))
                for i in (schedule or [])}

    def _offering_summary(self, row, my_status=None):
        schedule = self._parse_schedule(row["schedule_info"])
        ms = my_status or {}
        return {
            "offering_id": row["offering_id"],
            "course_id": row["course_id"],
            "course_code": row["course_code"],
            "name": row["course_name"],
            "credits": row["credits"],
            "type": row["type"],
            "type_cn": _TYPE_CN.get(row["type"], row["type"]),
            "department": row["dept_name"] or "",
            "teacher": row["teacher"] or "",
            "semester": row["semester"],
            "location": row["location"],
            "schedule": schedule,
            "schedule_text": schedule_text(schedule),
            "max_capacity": row["max_capacity"],
            "current_enrolled": row["current_enrolled"],
            "seats_left": max(0, row["max_capacity"] - row["current_enrolled"]),
            "is_open": bool(row["is_open"]),
            "my_status": ms.get("status"),
            "my_enrollment_id": ms.get("enrollment_id"),
        }

    # ------------------------------------------------------------------
    # 登入 / 登出 / me
    # ------------------------------------------------------------------
    def _login(self, data):
        account = str(data.get("account") or "").strip()
        password = str(data.get("password") or "")
        row = self.db.get_conn().execute(
            "SELECT * FROM users WHERE account=?", (account,)).fetchone()
        if not row or not verify_password(password, row["password_hash"]):
            raise ApiError(401, "帳號或密碼錯誤")
        if row["status"] != "active":
            raise ApiError(403, "帳號已被停用")
        token = self.auth.issue(row["id"])
        return j({"token": token,
                  "user": {"id": row["id"], "account": row["account"],
                           "name": row["name"], "role": row["role"],
                           "email": row["email"]}})

    def _logout(self, headers):
        auth = headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            self.auth.revoke(auth[len("Bearer "):])
        return j({"ok": True})

    def _me(self, user_id):
        row = self._user(user_id)
        conn = self.db.get_conn()
        base = {"id": row["id"], "account": row["account"], "name": row["name"],
                "role": row["role"], "email": row["email"],
                "semester": CURRENT_SEMESTER}
        if row["role"] == "student":
            s = self._student(user_id)
            base.update({
                "department": s["dept_name"],
                "college": s["college"],
                "class_name": s["class_name"],
                "enrollment_year": s["enrollment_year"],
            })
            base["enrolled_credits"] = conn.execute(
                "SELECT COALESCE(SUM(c.credits),0) AS n FROM enrollments e"
                " JOIN course_offerings o ON o.id=e.offering_id"
                " JOIN courses c ON c.id=o.course_id"
                " WHERE e.student_id=? AND e.status='enrolled'"
                " AND o.semester=?", (user_id, CURRENT_SEMESTER)).fetchone()["n"]
            base["pending_leave_count"] = conn.execute(
                "SELECT COUNT(*) AS n FROM leave_requests"
                " WHERE student_id=? AND status='pending'",
                (user_id,)).fetchone()["n"]
            base["gpa"], base["total_credits"] = self._compute_gpa(conn, user_id)
        elif row["role"] == "teacher":
            dept = conn.execute(
                "SELECT d.name FROM users u"
                " LEFT JOIN departments d ON d.id=u.department_id"
                " WHERE u.id=?", (user_id,)).fetchone()
            base["department"] = dept["name"] if dept else ""
            base["teaching_count"] = conn.execute(
                "SELECT COUNT(*) AS n FROM course_offerings"
                " WHERE teacher_id=? AND semester=?",
                (user_id, CURRENT_SEMESTER)).fetchone()["n"]
            base["pending_leave_step1"] = conn.execute(
                "SELECT COUNT(*) AS n FROM leave_requests"
                " WHERE status='pending' AND approval_step=1").fetchone()["n"]
        elif row["role"] == "admin":
            base["pending_leave_step2"] = conn.execute(
                "SELECT COUNT(*) AS n FROM leave_requests"
                " WHERE status='pending' AND approval_step=2").fetchone()["n"]
            base["offering_count"] = conn.execute(
                "SELECT COUNT(*) AS n FROM course_offerings"
                " WHERE semester=?", (CURRENT_SEMESTER,)).fetchone()["n"]
        return j(base)

    def _departments(self):
        rows = self.db.get_conn().execute(
            "SELECT id, name, college FROM departments ORDER BY id").fetchall()
        return j([dict(r) for r in rows])

    # ------------------------------------------------------------------
    # 課程查詢 / 選課
    # ------------------------------------------------------------------
    def _list_courses(self, query, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        q = (query.get("q") or [""])[0].strip()
        ctype = (query.get("type") or [""])[0].strip()
        dept = (query.get("dept") or [""])[0].strip()
        semester = (query.get("semester") or [CURRENT_SEMESTER])[0].strip()
        only_open = query.get("open", ["1"])[0] == "1"

        sql = ("SELECT o.id AS offering_id, o.course_id, o.semester,"
               " o.location, o.max_capacity, o.current_enrolled, o.is_open,"
               " o.schedule_info,"
               " c.course_code, c.name AS course_name, c.credits, c.type,"
               " d.name AS dept_name, u.name AS teacher"
               " FROM course_offerings o"
               " JOIN courses c ON c.id=o.course_id"
               " LEFT JOIN departments d ON d.id=c.department_id"
               " JOIN users u ON u.id=o.teacher_id"
               " WHERE o.semester=?")
        params = [semester]
        if q:
            sql += (" AND (c.name LIKE ? OR c.course_code LIKE ?"
                    " OR u.name LIKE ?)")
            like = "%{}%".format(q)
            params += [like, like, like]
        if ctype:
            sql += " AND c.type=?"
            params.append(ctype)
        if dept:
            sql += " AND c.department_id=?"
            params.append(int(dept))
        if only_open:
            sql += " AND o.is_open=1"
        sql += " ORDER BY c.course_code"

        conn = self.db.get_conn()
        rows = conn.execute(sql, params).fetchall()

        my_status = {}
        if user["role"] == "student":
            for r in conn.execute(
                    "SELECT offering_id, status, id AS enrollment_id"
                    " FROM enrollments WHERE student_id=?",
                    (user_id,)).fetchall():
                my_status[r["offering_id"]] = {
                    "status": r["status"],
                    "enrollment_id": r["enrollment_id"],
                }

        items = [self._offering_summary(dict(r), my_status.get(r["offering_id"]))
                 for r in rows]
        return j({"semester": semester, "count": len(items), "items": items})

    def _enroll(self, data, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "student")
        offering_id = str(data.get("offering_id") or "").strip()
        conn = self.db.get_conn()

        off = conn.execute(
            "SELECT * FROM course_offerings WHERE id=? AND semester=?",
            (offering_id, CURRENT_SEMESTER)).fetchone()
        if not off:
            raise ApiError(404, "課程不存在或不在本學期")
        if not off["is_open"]:
            raise ApiError(409, "該課程目前未開放選課")

        existing = conn.execute(
            "SELECT id, status FROM enrollments"
            " WHERE student_id=? AND offering_id=?",
            (user_id, offering_id)).fetchone()
        if existing and existing["status"] in ("pending", "enrolled"):
            raise ApiError(409, "您已在選課處理中或已選上此課程")
        if existing and existing["status"] == "dropped":
            conn.execute("DELETE FROM enrollments WHERE id=?",
                         (existing["id"],))

        dup = conn.execute(
            "SELECT c.course_code, c.name AS course_name"
            " FROM enrollments e"
            " JOIN course_offerings o2 ON o2.id=e.offering_id"
            " JOIN courses c ON c.id=o2.course_id"
            " WHERE e.student_id=? AND e.offering_id<>?"
            " AND e.status IN ('pending','enrolled')"
            " AND o2.course_id=? AND o2.semester=?",
            (user_id, offering_id, off["course_id"], CURRENT_SEMESTER)).fetchone()
        if dup:
            raise ApiError(
                409, "您已選修「{}」（{}）的其他時段，請先退選再改選。".format(
                    dup["course_name"], dup["course_code"]))

        new_slots = self._slots(self._parse_schedule(off["schedule_info"]))
        cls = conn.execute(
            "SELECT o.schedule_info FROM enrollments e"
            " JOIN course_offerings o ON o.id=e.offering_id"
            " WHERE e.student_id=? AND e.offering_id<>?"
            " AND e.status IN ('pending','enrolled')",
            (user_id, offering_id)).fetchall()
        for r in cls:
            if self._slots(self._parse_schedule(r["schedule_info"])) & new_slots:
                raise ApiError(
                    409, "與您已選課程的時段衝堂（同週同節），請先退選衝突課程再選。")

        enrollment_id = uuid.uuid4().hex
        now = datetime.now().isoformat(timespec="seconds")
        conn.execute(
            "INSERT INTO enrollments"
            " (id, student_id, offering_id, status, created_at)"
            " VALUES (?,?,?,'pending',?)",
            (enrollment_id, user_id, offering_id, now))
        self.engine.submit(enrollment_id)

        status = conn.execute(
            "SELECT status FROM enrollments WHERE id=?",
            (enrollment_id,)).fetchone()["status"]
        return j({"enrollment_id": enrollment_id,
                  "offering_id": offering_id,
                  "status": status}, 202)

    def _drop(self, enrollment_id, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "student")
        conn = self.db.get_conn()
        row = conn.execute(
            "SELECT * FROM enrollments WHERE id=? AND student_id=?",
            (enrollment_id, user_id)).fetchone()
        if not row:
            raise ApiError(404, "找不到選課紀錄")

        status = row["status"]
        if status == "dropped":
            raise ApiError(409, "此課程已退選")
        with self.db.tx() as c:
            if status == "pending":
                c.execute("UPDATE enrollments SET status='dropped' WHERE id=?",
                          (enrollment_id,))
            elif status == "enrolled":
                c.execute(
                    "UPDATE course_offerings"
                    " SET current_enrolled = MAX(0, current_enrolled - 1),"
                    " version = version + 1 WHERE id=?",
                    (row["offering_id"],))
                c.execute("UPDATE enrollments SET status='dropped' WHERE id=?",
                          (enrollment_id,))
        return j({"status": "dropped", "offering_id": row["offering_id"]})

    def _my_enrollments(self, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "student")
        rows = self.db.get_conn().execute(
            "SELECT e.id AS enrollment_id, e.status, e.midterm_score,"
            " e.final_score, e.total_score, e.enrolled_at, e.created_at,"
            " o.id AS offering_id, o.semester, o.location, o.schedule_info,"
            " c.course_code, c.name AS course_name, c.credits, c.type,"
            " u.name AS teacher"
            " FROM enrollments e"
            " JOIN course_offerings o ON o.id=e.offering_id"
            " JOIN courses c ON c.id=o.course_id"
            " JOIN users u ON u.id=o.teacher_id"
            " WHERE e.student_id=?"
            " ORDER BY e.created_at DESC", (user_id,)).fetchall()
        items = [{
            "enrollment_id": r["enrollment_id"],
            "offering_id": r["offering_id"],
            "status": r["status"],
            "semester": r["semester"],
            "course_code": r["course_code"],
            "name": r["course_name"],
            "credits": r["credits"],
            "type_cn": _TYPE_CN.get(r["type"], r["type"]),
            "teacher": r["teacher"],
            "schedule_text": schedule_text(self._parse_schedule(r["schedule_info"])),
            "location": r["location"],
            "midterm_score": r["midterm_score"],
            "final_score": r["final_score"],
            "total_score": r["total_score"],
            "created_at": r["created_at"],
            "enrolled_at": r["enrolled_at"],
        } for r in rows]
        return j(items)

    # ------------------------------------------------------------------
    # 課表
    # ------------------------------------------------------------------
    def _timetable_rows(self, user_id):
        rows = self.db.get_conn().execute(
            "SELECT o.id AS offering_id, o.location, o.schedule_info,"
            " c.course_code, c.name AS course_name, c.credits,"
            " u.name AS teacher"
            " FROM enrollments e"
            " JOIN course_offerings o ON o.id=e.offering_id"
            " JOIN courses c ON c.id=o.course_id"
            " JOIN users u ON u.id=o.teacher_id"
            " WHERE e.student_id=? AND e.status='enrolled'"
            " AND o.semester=?", (user_id, CURRENT_SEMESTER)).fetchall()
        out = []
        for r in rows:
            schedule = self._parse_schedule(r["schedule_info"])
            out.append({
                "offering_id": r["offering_id"],
                "course_code": r["course_code"],
                "name": r["course_name"],
                "credits": r["credits"],
                "teacher": r["teacher"],
                "location": r["location"],
                "schedule": schedule,
            })
        return out

    def _timetable(self, headers, ics=False):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "student")
        rows = self._timetable_rows(user_id)
        if not ics:
            return j({"semester": CURRENT_SEMESTER, "items": rows})
        return text(self._build_ics(rows, user["name"]),
                    content_type="text/calendar; charset=utf-8")

    def _build_ics(self, rows, owner):
        lines = ["BEGIN:VCALENDAR", "VERSION:2.0",
                 "PRODID:-//KMU//Timetable 115-1//ZH-TW//EN",
                 "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
                 "X-WR-CALNAME:金門大學 {} 課表".format(owner)]
        stamp = datetime.now().strftime("%Y%m%dT%H%M%S")
        iso_day = {1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR"}
        today = date.today()
        for r in rows:
            for slot in r["schedule"]:
                day = slot.get("day")
                period = str(slot.get("period") or "A").upper()
                start_t, end_t = PERIOD_TIMES.get(period, ("09:00", "10:00"))
                offset = (int(day) - today.isoweekday()) % 7
                dt = today + timedelta(days=offset)
                ds = dt.strftime("%Y%m%d")
                uid = "{}-{}-{}-{}@kmu.nqu.edu.tw".format(
                    owner, r["offering_id"], day, period).replace(" ", "")
                lines.extend([
                    "BEGIN:VEVENT",
                    "UID:{}".format(uid),
                    "DTSTAMP:{}".format(stamp),
                    "DTSTART;TZID=Asia/Taipei:{}T{}00".format(ds, start_t.replace(":", "")),
                    "DTEND;TZID=Asia/Taipei:{}T{}00".format(ds, end_t.replace(":", "")),
                    "RRULE:FREQ=WEEKLY;BYDAY={}".format(iso_day.get(day, "MO")),
                    "SUMMARY:{}{}".format(r["name"], r["credits"] and ""),
                    "DESCRIPTION:{} / {} / {}".format(
                        r["course_code"], r["teacher"], r["location"]),
                    "LOCATION:{}".format(r["location"]),
                    "END:VEVENT",
                ])
        lines.append("END:VCALENDAR")
        return ("\r\n".join(lines) + "\r\n").encode("utf-8")

    # ------------------------------------------------------------------
    # 成績 / 學籍
    # ------------------------------------------------------------------
    def _grades(self, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "student")
        rows = self.db.get_conn().execute(
            "SELECT e.midterm_score, e.final_score, e.total_score,"
            " e.offering_id, o.semester, c.course_code, c.name AS course_name,"
            " c.credits, u.name AS teacher"
            " FROM enrollments e"
            " JOIN course_offerings o ON o.id=e.offering_id"
            " JOIN courses c ON c.id=o.course_id"
            " JOIN users u ON u.id=o.teacher_id"
            " WHERE e.student_id=? AND e.status='enrolled'"
            " AND e.total_score IS NOT NULL"
            " ORDER BY o.semester DESC, c.course_code", (user_id,)).fetchall()
        items = []
        for r in rows:
            letter, point = letter_info(r["total_score"])
            items.append({
                "offering_id": r["offering_id"],
                "semester": r["semester"],
                "course_code": r["course_code"],
                "name": r["course_name"],
                "credits": r["credits"],
                "teacher": r["teacher"],
                "midterm_score": r["midterm_score"],
                "final_score": r["final_score"],
                "total_score": r["total_score"],
                "letter": letter,
                "point": point,
            })
        gpa, total_credits = self._compute_gpa(self.db.get_conn(), user_id)
        return j({"gpa": gpa, "total_credits": total_credits, "items": items})

    def _profile_get(self, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "student")
        s = self._student(user_id)
        return j({"account": user["account"], "name": user["name"],
                  "email": user["email"], "role": user["role"],
                  "department": s["dept_name"], "college": s["college"],
                  "class_name": s["class_name"],
                  "enrollment_year": s["enrollment_year"],
                  "phone": s["phone"],
                  "emergency_contact": s["emergency_contact"],
                  "emergency_phone": s["emergency_phone"],
                  "registered": bool(s["registered"]),
                  "tuition_paid": bool(s["tuition_paid"])})

    def _profile_put(self, data, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "student")
        phone = str(data.get("phone") or "").strip()[:50]
        contact = str(data.get("emergency_contact") or "").strip()[:50]
        ephone = str(data.get("emergency_phone") or "").strip()[:50]
        email = str(data.get("email") or "").strip()[:100]
        conn = self.db.get_conn()
        conn.execute(
            "UPDATE students SET phone=?, emergency_contact=?,"
            " emergency_phone=? WHERE user_id=?",
            (phone, contact, ephone, user_id))
        conn.execute("UPDATE users SET email=? WHERE id=?", (email, user_id))
        return self._profile_get(headers)

    def _attendance(self, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "student")
        conn = self.db.get_conn()
        rows = conn.execute(
            "SELECT a.offering_id, a.status,"
            " c.name AS course_name, c.course_code"
            " FROM attendance a"
            " JOIN course_offerings o ON o.id=a.offering_id"
            " JOIN courses c ON c.id=o.course_id"
            " WHERE a.student_id=?"
            " ORDER BY c.course_code, a.date", (user_id,)).fetchall()
        by_off = {}
        for r in rows:
            key = r["offering_id"]
            item = by_off.setdefault(key, {
                "offering_id": key, "course_name": r["course_name"],
                "course_code": r["course_code"],
                "present": 0, "absent": 0, "late": 0, "total": 0})
            item[r["status"]] += 1
            item["total"] += 1
        summary = {"absent": 0, "late": 0}
        items = []
        for item in by_off.values():
            summary["absent"] += item["absent"]
            summary["late"] += item["late"]
            items.append(item)
        return j({"summary": summary, "items": items})

    # ------------------------------------------------------------------
    # 請假
    # ------------------------------------------------------------------
    _LEAVE_TYPES = ("病假", "事假", "公假", "喪假", "其他")

    def _create_leave(self, data, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "student")
        ltype = str(data.get("type") or "").strip()
        if ltype not in self._LEAVE_TYPES:
            raise ApiError(400, "請選擇正確的假別")
        try:
            start = datetime.fromisoformat(str(data.get("start_time") or ""))
            end = datetime.fromisoformat(str(data.get("end_time") or ""))
        except ValueError:
            raise ApiError(400, "請填寫正確的起訖時間")
        if end < start:
            raise ApiError(400, "結束時間不可早於開始時間")
        days = max(1, (end.date() - start.date()).days + 1)
        reason = str(data.get("reason") or "").strip()
        if not reason:
            raise ApiError(400, "請填寫請假事由")
        proof = str(data.get("proof_url") or "").strip()[:300]
        lid = uuid.uuid4().hex
        now = datetime.now().isoformat(timespec="seconds")
        self.db.get_conn().execute(
            "INSERT INTO leave_requests"
            " (id, student_id, type, start_time, end_time, days, reason,"
            "  proof_url, status, approval_step, decisions, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,'pending',1,'[]',?)",
            (lid, user_id, ltype, start.isoformat(timespec="seconds"),
             end.isoformat(timespec="seconds"), days, reason, proof, now))
        return j({"id": lid, "status": "pending", "approval_step": 1}, 201)

    def _my_leaves(self, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "student")
        rows = self.db.get_conn().execute(
            "SELECT * FROM leave_requests WHERE student_id=?"
            " ORDER BY created_at DESC", (user_id,)).fetchall()
        return j(self._leave_list(rows))

    def _leave_list(self, rows):
        out = []
        for r in rows:
            try:
                decisions = json.loads(r["decisions"])
            except ValueError:
                decisions = []
            names = {d["by"]: d.get("by_name", "") for d in decisions}
            out.append({
                "id": r["id"], "type": r["type"],
                "start_time": r["start_time"], "end_time": r["end_time"],
                "days": r["days"], "reason": r["reason"],
                "proof_url": r["proof_url"],
                "status": r["status"], "approval_step": r["approval_step"],
                "decisions": decisions,
                "approver_names": names,
                "created_at": r["created_at"],
            })
        return out

    def _pending_leaves(self, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        if user["role"] == "teacher":
            step = 1
        elif user["role"] == "admin":
            step = 2
        else:
            raise ApiError(403, "權限不足")
        sql = ("SELECT l.*, u.name AS student_name, s.class_name,"
               " s.department_id FROM leave_requests l"
               " JOIN users u ON u.id=l.student_id"
               " LEFT JOIN students s ON s.user_id=l.student_id"
               " WHERE l.status='pending' AND l.approval_step=?")
        params = [step]
        if user["role"] == "teacher":
            # 老師只能簽核所屬系所學生的假單
            sql += " AND s.department_id = (SELECT department_id FROM users WHERE id=?)"
            params.append(user_id)
        sql += " ORDER BY l.created_at"
        rows = self.db.get_conn().execute(sql, params).fetchall()
        items = []
        for r in rows:
            item = self._leave_list([r])[0]
            item["student_name"] = r["student_name"]
            item["class_name"] = r["class_name"]
            items.append(item)
        return j({"step": step, "items": items})

    def _decide_leave(self, leave_id, data, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        if user["role"] not in ("teacher", "admin"):
            raise ApiError(403, "權限不足")
        raw = data.get("approve")
        if isinstance(raw, bool):
            approve = raw
        else:
            approve = str(raw).lower() in ("1", "true", "yes", "on")
        with self.db.tx() as conn:
            row = conn.execute(
                "SELECT * FROM leave_requests WHERE id=?",
                (leave_id,)).fetchone()
            if not row:
                raise ApiError(404, "找不到請假單")
            if row["status"] != "pending":
                raise ApiError(409, "此請假單已處理")
            if user["role"] == "teacher" and row["approval_step"] != 1:
                raise ApiError(403, "此請假單不屬於您的簽核關卡")
            if user["role"] == "admin" and row["approval_step"] != 2:
                raise ApiError(403, "此請假單不需要系辦簽核")
            if user["role"] == "teacher":
                stu_dept = conn.execute(
                    "SELECT s.department_id FROM students s WHERE s.user_id=?",
                    (row["student_id"],)).fetchone()
                tea_dept = conn.execute(
                    "SELECT department_id FROM users WHERE id=?",
                    (user_id,)).fetchone()
                if not stu_dept or not tea_dept \
                        or stu_dept["department_id"] != tea_dept["department_id"]:
                    raise ApiError(403, "僅能簽核所屬系所學生的假單")

            decisions = json.loads(row["decisions"]) if row["decisions"] else []
            decisions.append({
                "by": user["id"], "by_name": user["name"], "role": user["role"],
                "approve": approve,
                "at": datetime.now().isoformat(timespec="seconds")})

            if not approve:
                status, step = "rejected", row["approval_step"]
            elif row["approval_step"] == 1:
                if row["days"] > 3:
                    status, step = "pending", 2   # 超過三天需再送系辦
                else:
                    status, step = "approved", 1
            else:
                status, step = "approved", 2

            conn.execute(
                "UPDATE leave_requests SET status=?, approval_step=?,"
                " decisions=? WHERE id=?",
                (status, step, json.dumps(decisions, ensure_ascii=False),
                 leave_id))
        return j({"id": leave_id, "status": status, "approval_step": step})

    # ------------------------------------------------------------------
    # 教師
    # ------------------------------------------------------------------
    def _teacher_classes(self, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "teacher")
        rows = self.db.get_conn().execute(
            "SELECT o.id AS offering_id, o.location, o.schedule_info,"
            " o.max_capacity, o.current_enrolled, o.is_open,"
            " c.course_code, c.name AS course_name, c.credits, c.type,"
            " (SELECT AVG(e.total_score) FROM enrollments e"
            "  WHERE e.offering_id=o.id AND e.status='enrolled'"
            "  AND e.total_score IS NOT NULL) AS avg_grade"
            " FROM course_offerings o"
            " JOIN courses c ON c.id=o.course_id"
            " WHERE o.teacher_id=? AND o.semester=?"
            " ORDER BY c.course_code", (user_id, CURRENT_SEMESTER)).fetchall()
        items = []
        for r in rows:
            items.append({
                "offering_id": r["offering_id"],
                "course_code": r["course_code"],
                "name": r["course_name"],
                "credits": r["credits"],
                "type_cn": _TYPE_CN.get(r["type"], r["type"]),
                "schedule_text": schedule_text(self._parse_schedule(r["schedule_info"])),
                "location": r["location"],
                "max_capacity": r["max_capacity"],
                "current_enrolled": r["current_enrolled"],
                "is_open": bool(r["is_open"]),
                "avg_grade": round(r["avg_grade"], 1) if r["avg_grade"] is not None else None,
            })
        return j(items)

    def _teacher_roster(self, query, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "teacher")
        offering_id = (query.get("offering_id") or [""])[0].strip()
        conn = self.db.get_conn()
        if not self._owns_offering(conn, offering_id, user_id):
            raise ApiError(403, "此課程非您所授")
        rows = conn.execute(
            "SELECT e.student_id, e.status, e.midterm_score, e.final_score,"
            " e.total_score, u.account, u.name, s.class_name"
            " FROM enrollments e"
            " JOIN users u ON u.id=e.student_id"
            " LEFT JOIN students s ON s.user_id=e.student_id"
            " WHERE e.offering_id=?"
            " ORDER BY u.account", (offering_id,)).fetchall()
        return j([{
            "student_id": r["student_id"], "account": r["account"],
            "name": r["name"], "class_name": r["class_name"] or "",
            "status": r["status"],
            "midterm_score": r["midterm_score"],
            "final_score": r["final_score"],
            "total_score": r["total_score"],
        } for r in rows])

    def _owns_offering(self, conn, offering_id, teacher_id):
        row = conn.execute(
            "SELECT id FROM course_offerings WHERE id=? AND teacher_id=?",
            (offering_id, teacher_id)).fetchone()
        return row is not None

    @staticmethod
    def _score(value):
        if value is None:
            return None
        try:
            v = float(value)
        except (TypeError, ValueError):
            raise ApiError(400, "成績格式錯誤")
        if v < 0 or v > 100:
            raise ApiError(400, "成績必須介於 0~100")
        return round(v, 1)

    def _teacher_grades(self, data, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "teacher")
        offering_id = str(data.get("offering_id") or "").strip()
        scores = data.get("scores") or []
        conn = self.db.get_conn()
        if not self._owns_offering(conn, offering_id, user_id):
            raise ApiError(403, "此課程非您所授")
        roster = {r["student_id"] for r in conn.execute(
            "SELECT student_id FROM enrollments"
            " WHERE offering_id=? AND status='enrolled'", (offering_id,))}
        updated = 0
        with self.db.tx() as c:
            for item in scores:
                sid = str(item.get("student_id") or "")
                if sid not in roster:
                    continue
                sets, params = [], []
                for col in ("midterm", "final", "total"):
                    if col in item:
                        sets.append("{}_score = ?".format(col))
                        params.append(self._score(item.get(col)))
                if not sets:
                    continue
                params.append(sid)
                params.append(offering_id)
                c.execute(
                    "UPDATE enrollments SET {} "
                    "WHERE student_id=? AND offering_id=?".format(
                        ", ".join(sets)), params)
                updated += 1
        return j({"updated": updated})

    def _teacher_attendance(self, data, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "teacher")
        offering_id = str(data.get("offering_id") or "").strip()
        date_str = str(data.get("date") or "").strip()
        records = data.get("records") or []
        conn = self.db.get_conn()
        if not self._owns_offering(conn, offering_id, user_id):
            raise ApiError(403, "此課程非您所授")
        if not records or not date_str:
            raise ApiError(400, "請提供日期與學生紀錄")
        valid = {"present", "absent", "late"}
        saved = 0
        with self.db.tx() as c:
            for item in records:
                sid = str(item.get("student_id") or "")
                status = str(item.get("status") or "")
                if status not in valid:
                    raise ApiError(400, "出缺席狀態不合法: " + status)
                c.execute(
                    "UPDATE attendance SET status=? WHERE"
                    " student_id=? AND offering_id=? AND date=?",
                    (status, sid, offering_id, date_str))
                if c.execute("SELECT changes() AS n").fetchone()["n"] == 0:
                    c.execute(
                        "INSERT INTO attendance"
                        " (id, student_id, offering_id, date, status)"
                        " VALUES (?,?,?,?,?)",
                        (uuid.uuid4().hex, sid, offering_id, date_str, status))
                saved += 1
        return j({"saved": saved})

    # ------------------------------------------------------------------
    # 行政
    # ------------------------------------------------------------------
    def _admin_only(self, headers):
        user_id = self._auth_user(headers)
        user = self._user(user_id)
        self._require_role(user, "admin")
        return user_id

    def _admin_meta(self, headers):
        self._admin_only(headers)
        conn = self.db.get_conn()
        courses = [dict(r) for r in conn.execute(
            "SELECT id, course_code, name, credits, type FROM courses"
            " ORDER BY course_code").fetchall()]
        teachers = [dict(r) for r in conn.execute(
            "SELECT id, name FROM users WHERE role='teacher' ORDER BY name"
        ).fetchall()]
        return j({"courses": courses, "teachers": teachers})

    def _admin_offerings(self, query, headers):
        self._admin_only(headers)
        semester = (query.get("semester") or [CURRENT_SEMESTER])[0].strip()
        rows = self.db.get_conn().execute(
            "SELECT o.id AS offering_id, o.course_id, o.semester, o.location,"
            " o.schedule_info, o.max_capacity, o.current_enrolled, o.is_open,"
            " o.version, c.course_code, c.name AS course_name, c.credits, c.type,"
            " d.name AS dept_name, u.name AS teacher"
            " FROM course_offerings o"
            " JOIN courses c ON c.id=o.course_id"
            " LEFT JOIN departments d ON d.id=c.department_id"
            " JOIN users u ON u.id=o.teacher_id"
            " WHERE o.semester=?"
            " ORDER BY c.course_code", (semester,)).fetchall()
        items = []
        for r in rows:
            items.append(self._offering_summary(dict(r)))
            items[-1]["version"] = r["version"]
        return j({"semester": semester, "items": items})

    def _admin_create_offering(self, data, headers):
        self._admin_only(headers)
        course_id = str(data.get("course_id") or "").strip()
        teacher_id = str(data.get("teacher_id") or "").strip()
        semester = str(data.get("semester") or CURRENT_SEMESTER).strip()
        location = str(data.get("location") or "").strip()
        schedule = data.get("schedule_info") or []
        try:
            max_capacity = int(data.get("max_capacity") or 0)
        except (TypeError, ValueError):
            raise ApiError(400, "人數上限必須是整數")
        if max_capacity < 1:
            raise ApiError(400, "人數上限必須 >= 1")
        if not isinstance(schedule, list):
            raise ApiError(400, "上課時間格式錯誤")
        conn = self.db.get_conn()
        if not conn.execute("SELECT id FROM courses WHERE id=?",
                            (course_id,)).fetchone():
            raise ApiError(404, "課程不存在")
        if conn.execute(
                "SELECT id FROM course_offerings"
                " WHERE course_id=? AND semester=?",
                (course_id, semester)).fetchone():
            raise ApiError(409, "該課程本學期已有開課，一門課程以單一時段為原則。")
        t = conn.execute(
            "SELECT role FROM users WHERE id=? AND role='teacher'",
            (teacher_id,)).fetchone()
        if not t:
            raise ApiError(404, "授課教師不存在")
        oid = uuid.uuid4().hex
        conn.execute(
            "INSERT INTO course_offerings"
            " (id, course_id, semester, teacher_id, schedule_info, location,"
            "  max_capacity, current_enrolled, version, is_open)"
            " VALUES (?,?,?,?,?,?,?,0,0,1)",
            (oid, course_id, semester, teacher_id,
             json.dumps(schedule, ensure_ascii=False), location,
             max_capacity))
        return j({"id": oid}, 201)

    def _admin_update_offering(self, offering_id, data, headers):
        self._admin_only(headers)
        conn = self.db.get_conn()
        row = conn.execute("SELECT * FROM course_offerings WHERE id=?",
                           (offering_id,)).fetchone()
        if not row:
            raise ApiError(404, "找不到開課")
        updates, params = [], []
        if "is_open" in data:
            updates.append("is_open=?")
            params.append(1 if data["is_open"] else 0)
        if "max_capacity" in data:
            cap = int(data["max_capacity"])
            if cap < row["current_enrolled"]:
                raise ApiError(400, "人數上限不可低於已選人數")
            updates.append("max_capacity=?")
            params.append(cap)
        if not updates:
            raise ApiError(400, "沒有可更新的欄位")
        params.append(offering_id)
        conn.execute(
            "UPDATE course_offerings SET {} WHERE id=?".format(
                ", ".join(updates)), params)
        return j({"id": offering_id, "ok": True})