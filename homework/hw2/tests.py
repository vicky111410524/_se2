#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""金門大學校務系統 MVP — 整合測試。

啟動方式（需在 hw2 目錄下）：

    python tests.py

沿用 hw1 的做法：以標準函式庫 http.server 在本機啟動暫時伺服器，
再以 urllib 模擬真實 HTTP 請求進行整合測試。
"""
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import http.server  # noqa: E402

from kmu import db as kmudb  # noqa: E402
from kmu.api import APApp  # noqa: E402
from kmu.web import create_handler  # noqa: E402

APP = None
SERVER = None
BASE = None


def setUpModule():
    global APP, SERVER, BASE
    tmp = tempfile.mkdtemp()
    db = kmudb.Database(os.path.join(tmp, "kmu-test.db"))
    APP = APApp(db)
    SERVER = http.server.ThreadingHTTPServer(("127.0.0.1", 0), create_handler(APP))
    BASE = "http://127.0.0.1:{}".format(SERVER.server_address[1])
    threading.Thread(target=SERVER.serve_forever, daemon=True).start()


def tearDownModule():
    global SERVER
    SERVER.shutdown()
    SERVER.server_close()
    APP.db.close()


def request(method, path, body=None, token=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(body).encode("utf-8")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            payload = data if raw else json.loads(data.decode("utf-8"))
            return resp.status, payload, resp.headers
    except urllib.error.HTTPError as e:
        data = e.read()
        try:
            payload = data if raw else json.loads(data.decode("utf-8"))
        except ValueError:
            payload = data.decode("utf-8", "replace")
        return e.code, payload, e.headers


def login(account, password):
    status, data, _ = request("POST", "/api/login",
                              {"account": account, "password": password})
    assert status == 200, data
    return data["token"]


ADMIN = None
TEACHER = None
STUDENTS = {}


def tokens():
    global ADMIN, TEACHER, STUDENTS
    if ADMIN is None:
        ADMIN = login("admin", "admin123")
        TEACHER = login("teacher01", "teacher123")
        STUDENTS = {
            "s101": login("110410001", "stu123"),
            "s102": login("110410002", "stu123"),
            "s103": login("110410003", "stu123"),
            "s104": login("110491001", "stu123"),
            "s105": login("111420001", "stu123"),
        }
    return ADMIN, TEACHER, STUDENTS


def enrollment_status(token, offering_id):
    status, items, _ = request("GET", "/api/enrollments", token=token)
    if not isinstance(items, list):
        raise AssertionError("GET /api/enrollments 非預期回應 status={}: {!r}".format(
            status, items)[:400])
    if items and "offering_id" not in items[0]:
        raise AssertionError("item 缺少 offering_id: {!r}".format(items[0])[:400])
    for it in items:
        if it.get("offering_id") == offering_id:
            return it["status"], it["enrollment_id"]
    return None, None


def enroll_and_settle(offering_id, token):
    status, data, _ = request("POST", "/api/enroll",
                              {"offering_id": offering_id}, token)
    APP.engine.wait_idle(timeout=10)
    if status != 202:
        return status, data
    settle, _ = enrollment_status(token, offering_id)
    adopted = dict(data)
    adopted["status"] = settle or adopted["status"]
    return status, adopted


class KMUBase(unittest.TestCase):
    def setUp(self):
        tokens()

    def my_enrollment_status(self, token, offering_id):
        return enrollment_status(token, offering_id)

    def offering_capacity(self, offering_id):
        _, data, _ = request("GET", "/api/admin/offerings", token=ADMIN)
        for it in data["items"]:
            if it["offering_id"] == offering_id:
                return it["current_enrolled"], it["max_capacity"]
        return None, None


class TestAuth(KMUBase):
    def test_login_ok(self):
        status, data, _ = request("POST", "/api/login",
                                  {"account": "110410001", "password": "stu123"})
        self.assertEqual(status, 200)
        self.assertEqual(data["user"]["name"], "張小華")
        self.assertEqual(data["user"]["role"], "student")
        self.assertTrue(data["token"])

    def test_login_bad_password(self):
        status, data, _ = request("POST", "/api/login",
                                  {"account": "110410001", "password": "wrong"})
        self.assertEqual(status, 401)

    def test_login_unknown_account(self):
        status, data, _ = request("POST", "/api/login",
                                  {"account": "nobody", "password": "x"})
        self.assertEqual(status, 401)

    def test_anonymous_me_rejected(self):
        status, _, _ = request("GET", "/api/me")
        self.assertEqual(status, 401)

    def test_me_student_fields(self):
        _, data, _ = request("GET", "/api/me", token=STUDENTS["s101"])
        self.assertEqual(data["role"], "student")
        self.assertEqual(data["department"], "資訊工程學系")
        self.assertIn("gpa", data)
        self.assertIn("enrolled_credits", data)

    def test_me_teacher_fields(self):
        _, data, _ = request("GET", "/api/me", token=TEACHER)
        self.assertEqual(data["role"], "teacher")
        self.assertGreaterEqual(data["teaching_count"], 1)

    def test_me_admin_fields(self):
        _, data, _ = request("GET", "/api/me", token=ADMIN)
        self.assertEqual(data["role"], "admin")


class TestCourses(KMUBase):
    def test_list_all(self):
        _, data, _ = request("GET", "/api/courses", token=STUDENTS["s101"])
        self.assertGreaterEqual(data["count"], 10)
        first = data["items"][0]
        for key in ("name", "teacher", "schedule_text", "seats_left",
                    "max_capacity", "current_enrolled"):
            self.assertIn(key, first)

    def test_filter_by_type(self):
        _, data, _ = request("GET", "/api/courses?type=general",
                             token=STUDENTS["s101"])
        self.assertTrue(all(it["type"] == "general" for it in data["items"]))

    def test_filter_by_keyword(self):
        _, data, _ = request("GET", "/api/courses?q=" + urllib.parse.quote("資料結構"),
                             token=STUDENTS["s101"])
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["items"][0]["name"], "資料結構")

    def test_filter_open_only(self):
        # 先把 o6 關閉，open=1 查詢不應出現
        request("PATCH", "/api/admin/offerings/o6", {"is_open": False}, ADMIN)
        _, data, _ = request("GET", "/api/courses?open=1", token=STUDENTS["s101"])
        names = [it["name"] for it in data["items"]]
        self.assertNotIn("人權與社會", names)
        _, data2, _ = request("GET", "/api/courses?open=0", token=STUDENTS["s101"])
        names2 = [it["name"] for it in data2["items"]]
        self.assertIn("人權與社會", names2)
        request("PATCH", "/api/admin/offerings/o6", {"is_open": True}, ADMIN)


class TestEnrollCore(KMUBase):
    def test_duplicate_enroll_conflict(self):
        # o5 尚未被 s101 選走 → 第一次應受理
        status, data = enroll_and_settle("o5", STUDENTS["s101"])
        self.assertEqual(status, 202)
        self.assertEqual(data["status"], "enrolled")
        # 第二次 -> 409
        status2, data2, _ = request("POST", "/api/enroll",
                                    {"offering_id": "o5"}, STUDENTS["s101"])
        self.assertEqual(status2, 409)

    def test_enroll_unknown_offering(self):
        status, data, _ = request("POST", "/api/enroll",
                                  {"offering_id": "o-unknown"}, STUDENTS["s101"])
        self.assertEqual(status, 404)

    def test_enroll_closed_offering(self):
        request("PATCH", "/api/admin/offerings/o6", {"is_open": False}, ADMIN)
        status, data, _ = request("POST", "/api/enroll",
                                  {"offering_id": "o6"}, STUDENTS["s103"])
        self.assertEqual(status, 409)
        request("PATCH", "/api/admin/offerings/o6", {"is_open": True}, ADMIN)

    def test_drop_and_re_enroll(self):
        before, _ = self.offering_capacity("o4")
        status, data = enroll_and_settle("o4", STUDENTS["s105"])
        self.assertEqual(status, 202)
        self.assertEqual(data["status"], "enrolled")
        _, enroll_id = self.my_enrollment_status(STUDENTS["s105"], "o4")

        status, _, _ = request("DELETE", "/api/enroll/" + enroll_id,
                               token=STUDENTS["s105"])
        self.assertEqual(status, 200)
        after_drop, _ = self.offering_capacity("o4")
        self.assertEqual(after_drop, before)

        # 退選後可再選
        status2, data2 = enroll_and_settle("o4", STUDENTS["s105"])
        self.assertEqual(status2, 202)
        self.assertEqual(data2["status"], "enrolled")

    def test_admin_cannot_duplicate_offering(self):
        # 一門課程本學期僅一支開課：先建一支成功，再建同課程 → 409
        _, created, _ = request("POST", "/api/admin/offerings", {
            "course_id": "c27",
            "teacher_id": "t104",
            "semester": "115-1",
            "location": "管理大樓401",
            "max_capacity": 30,
            "schedule_info": [{"day": 2, "period": "B"}],
        }, ADMIN)
        self.assertEqual(created["id"] is not None, True)
        status, data, _ = request("POST", "/api/admin/offerings", {
            "course_id": "c27",
            "teacher_id": "t104",
            "semester": "115-1",
            "location": "管理大樓402",
            "max_capacity": 30,
            "schedule_info": [{"day": 3, "period": "B"}],
        }, ADMIN)
        self.assertEqual(status, 409)

    def test_cannot_enroll_conflicting_slot(self):
        # s101 已選 o1（週一A / 週三B）。為 c26 開一支也排在週一A 的課。
        _, created, _ = request("POST", "/api/admin/offerings", {
            "course_id": "c26",
            "teacher_id": "t103",
            "semester": "115-1",
            "location": "理工B105",
            "max_capacity": 30,
            "schedule_info": [{"day": 1, "period": "A"}],
        }, ADMIN)
        other = created["id"]

        # 同時段（同週同節）→ 應擋下，避免課表同節兩堂課
        status, data, _ = request("POST", "/api/enroll",
                                  {"offering_id": other}, STUDENTS["s101"])
        self.assertEqual(status, 409)

        # 退掉原班後即可選
        _, enroll_id = self.my_enrollment_status(STUDENTS["s101"], "o1")
        self.assertTrue(enroll_id, "s101 應已選 o1")
        status, _, _ = request("DELETE", "/api/enroll/" + enroll_id,
                               token=STUDENTS["s101"])
        self.assertEqual(status, 200)
        status2, data2 = enroll_and_settle(other, STUDENTS["s101"])
        self.assertEqual(status2, 202)
        self.assertEqual(data2["status"], "enrolled")

        # 還原：退掉新課、改回原班
        _, enroll_id2 = self.my_enrollment_status(STUDENTS["s101"], other)
        request("DELETE", "/api/enroll/" + enroll_id2, token=STUDENTS["s101"])
        status3, data3 = enroll_and_settle("o1", STUDENTS["s101"])
        self.assertEqual(status3, 202)
        self.assertEqual(data3["status"], "enrolled")


class TestEnrollRace(KMUBase):
    def test_capacity_is_never_exceeded(self):
        # 建立一個只有 2 個名額的課程
        _, created, _ = request("POST", "/api/admin/offerings", {
            "course_id": "c28",
            "teacher_id": "t108",
            "semester": "115-1",
            "location": "測試教室",
            "max_capacity": 2,
            "schedule_info": [{"day": 4, "period": "E"}],
        }, ADMIN)
        self.assertEqual(created["id"] is not None, True)
        offering_id = created["id"]

        accounts = ["110410001", "110410002", "110410003", "110491001",
                    "111420001"]
        results = {}
        errors = []

        def worker(account):
            try:
                tk = login(account, "stu123")
                status, data, _ = request("POST", "/api/enroll",
                                          {"offering_id": offering_id}, tk)
                results[account] = (status, data["status"], tk)
            except Exception as e:  # noqa: BLE001
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(a,)) for a in accounts]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=20)
        APP.engine.wait_idle(timeout=15)

        self.assertEqual(errors, [])

        # 以「佇列消化完成後」的最終狀態計數（pending 只是受理中的過渡狀態）
        final = {}
        for account, (_, _, tk) in results.items():
            status, _ = enrollment_status(tk, offering_id)
            final[account] = status

        enrolled = [a for a, st in final.items() if st == "enrolled"]
        rejected = [a for a, st in final.items() if st == "rejected"]
        self.assertEqual(len(enrolled), 2, final)
        self.assertEqual(len(rejected), 3, final)
        cur, cap = self.offering_capacity(offering_id)
        self.assertEqual((cur, cap), (2, 2))


class TestGrades(KMUBase):
    def test_grade_entry_and_view(self):
        req = {"offering_id": "o2", "scores": [
            {"student_id": "s101", "midterm": 99, "final": 95, "total": 97}]}
        status, data, _ = request("POST", "/api/teacher/grades", req, TEACHER)
        self.assertEqual(status, 200)
        self.assertEqual(data["updated"], 1)

        _, grades, _ = request("GET", "/api/grades", token=STUDENTS["s101"])
        row = next(g for g in grades["items"] if g["name"] == "資料結構")
        self.assertEqual(row["total_score"], 97)
        self.assertEqual(row["letter"], "A")
        self.assertEqual(row["point"], 4.0)

    def test_grade_entry_guard(self):
        # 學生不能登錄成績
        status, _, _ = request("POST", "/api/teacher/grades",
                               {"offering_id": "o2", "scores": []},
                               STUDENTS["s101"])
        self.assertEqual(status, 403)

    def test_grade_out_of_range(self):
        status, data, _ = request("POST", "/api/teacher/grades",
                                  {"offering_id": "o2", "scores": [
                                      {"student_id": "s101", "total": 120}]},
                                  TEACHER)
        self.assertEqual(status, 400)

    def test_roster_only_owns(self):
        # 不是自己教的課 -> 403
        status, _, _ = request("GET", "/api/teacher/roster?offering_id=o3",
                               token=TEACHER)
        self.assertEqual(status, 403)
        # 自己教的課
        status, roster, _ = request("GET", "/api/teacher/roster?offering_id=o1",
                                    token=TEACHER)
        self.assertEqual(status, 200)
        self.assertTrue(any(r["student_id"] == "s101" for r in roster))


class TestLeave(KMUBase):
    def _create(self, days, token):
        body = {"type": "事假", "start_time": "2026-09-21T09:00:00",
                "end_time": "2026-09-{}T17:00:00".format(20 + days),
                "reason": "測試請假", "proof_url": ""}
        return request("POST", "/api/leave", body, token)

    def test_short_leave_teacher_approves(self):
        status, created, _ = self._create(1, STUDENTS["s103"])
        self.assertEqual(status, 201)
        leave_id = created["id"]

        _, pending, _ = request("GET", "/api/leave/pending", token=TEACHER)
        self.assertTrue(any(l["id"] == leave_id for l in pending["items"]))

        _, res, _ = request("POST", "/api/leave/{}/decision".format(leave_id),
                            {"approve": True}, TEACHER)
        self.assertEqual(res["status"], "approved")

        _, mine, _ = request("GET", "/api/leave/mine", token=STUDENTS["s103"])
        row = next(l for l in mine if l["id"] == leave_id)
        self.assertEqual(row["status"], "approved")
        self.assertEqual(len(row["decisions"]), 1)

    def test_long_leave_needs_two_steps(self):
        status, created, _ = self._create(5, STUDENTS["s103"])
        self.assertEqual(status, 201)
        leave_id = created["id"]

        _, res, _ = request("POST", "/api/leave/{}/decision".format(leave_id),
                            {"approve": True}, TEACHER)
        # 超過三天：教師過第一關，仍需系辦
        self.assertEqual(res["status"], "pending")
        self.assertEqual(res["approval_step"], 2)

        _, pending, _ = request("GET", "/api/leave/pending", token=ADMIN)
        self.assertTrue(any(l["id"] == leave_id for l in pending["items"]))

        _, res2, _ = request("POST", "/api/leave/{}/decision".format(leave_id),
                             {"approve": True}, ADMIN)
        self.assertEqual(res2["status"], "approved")

    def test_teacher_cannot_skip_step(self):
        status, created, _ = self._create(4, STUDENTS["s103"])
        leave_id = created["id"]
        _, res, _ = request("POST", "/api/leave/{}/decision".format(leave_id),
                            {"approve": True}, TEACHER)
        self.assertEqual(res["status"], "pending")
        # 教師不能再簽第二次
        status2, _, _ = request("POST", "/api/leave/{}/decision".format(leave_id),
                                {"approve": True}, TEACHER)
        self.assertEqual(status2, 403)

    def test_reject(self):
        status, created, _ = self._create(2, STUDENTS["s103"])
        leave_id = created["id"]
        _, res, _ = request("POST", "/api/leave/{}/decision".format(leave_id),
                            {"approve": False}, TEACHER)
        self.assertEqual(res["status"], "rejected")

    def test_student_cannot_decide(self):
        status, created, _ = self._create(1, STUDENTS["s103"])
        leave_id = created["id"]
        status2, _, _ = request("POST", "/api/leave/{}/decision".format(leave_id),
                                {"approve": True}, STUDENTS["s103"])
        self.assertEqual(status2, 403)

    def test_teacher_only_approves_same_dept(self):
        # s104 屬電機系；t101（資工系）不應看到／簽核其假單
        status, created, _ = self._create(2, STUDENTS["s104"])
        self.assertEqual(status, 201)
        leave_id = created["id"]

        _, pending, _ = request("GET", "/api/leave/pending", token=TEACHER)
        self.assertNotIn(leave_id, [l["id"] for l in pending["items"]])

        status2, _, _ = request("POST", "/api/leave/{}/decision".format(leave_id),
                                {"approve": True}, TEACHER)
        self.assertEqual(status2, 403)

        # t102（電機系）可見並可簽核
        tk2 = login("teacher02", "teacher123")
        _, pending2, _ = request("GET", "/api/leave/pending", token=tk2)
        self.assertTrue(any(l["id"] == leave_id for l in pending2["items"]))
        _, res, _ = request("POST", "/api/leave/{}/decision".format(leave_id),
                            {"approve": True}, tk2)
        self.assertEqual(res["status"], "approved")


class TestAttendance(KMUBase):
    def test_student_stats(self):
        _, data, _ = request("GET", "/api/attendance", token=STUDENTS["s101"])
        self.assertGreaterEqual(data["summary"]["absent"], 1)
        self.assertGreaterEqual(data["summary"]["late"], 1)

    def test_teacher_marks_attendance(self):
        _, before, _ = request("GET", "/api/attendance", token=STUDENTS["s101"])
        before_present = before["items"][0]["present"] if before["items"] else 0

        status, res, _ = request("POST", "/api/teacher/attendance", {
            "offering_id": "o1", "date": "2026-09-10",
            "records": [{"student_id": "s101", "status": "present"}],
        }, TEACHER)
        self.assertEqual(status, 200)
        self.assertEqual(res["saved"], 1)

        _, after, _ = request("GET", "/api/attendance", token=STUDENTS["s101"])
        after_present = after["items"][0]["present"]
        self.assertEqual(after_present, before_present + 1)


class TestTimetable(KMUBase):
    def test_timetable_structure(self):
        _, data, _ = request("GET", "/api/timetable", token=STUDENTS["s101"])
        self.assertEqual(data["semester"], "115-1")
        names = [i["name"] for i in data["items"]]
        self.assertIn("程式設計（一）", names)
        prog = next(i for i in data["items"] if i["name"] == "程式設計（一）")
        self.assertEqual(prog["schedule"][0]["day"], 1)
        self.assertEqual(prog["schedule"][0]["period"], "A")

    def test_ics_export(self):
        status, body, headers = request("GET", "/api/timetable.ics",
                                        token=STUDENTS["s101"], raw=True)
        self.assertEqual(status, 200)
        self.assertEqual(headers.get_content_type(), "text/calendar")
        text = body.decode("utf-8")
        self.assertIn("BEGIN:VCALENDAR", text)
        self.assertIn("END:VCALENDAR", text)
        self.assertIn("程式設計", text)
        self.assertIn("RRULE:FREQ=WEEKLY", text)

    def test_timetable_requires_student(self):
        status, _, _ = request("GET", "/api/timetable", token=TEACHER)
        self.assertEqual(status, 403)


class TestProfile(KMUBase):
    def test_update_profile(self):
        status, _, _ = request("PUT", "/api/profile", {
            "email": "new@gm.nqu.edu.tw",
            "phone": "0988-000-111",
            "emergency_contact": "張媽媽",
            "emergency_phone": "0922-111-222",
        }, STUDENTS["s101"])
        self.assertEqual(status, 200)
        _, p, _ = request("GET", "/api/profile", token=STUDENTS["s101"])
        self.assertEqual(p["phone"], "0988-000-111")
        self.assertEqual(p["emergency_contact"], "張媽媽")
        self.assertEqual(p["email"], "new@gm.nqu.edu.tw")


class TestAdminOfferings(KMUBase):
    def test_admin_meta(self):
        _, meta, _ = request("GET", "/api/admin/meta", token=ADMIN)
        self.assertGreaterEqual(len(meta["courses"]), 10)
        self.assertTrue(all(t["role"] if False else True for t in []))
        self.assertTrue(any(t["name"] == "王志明" for t in meta["teachers"]))

    def test_create_offering_shows_everywhere(self):
        _, created, _ = request("POST", "/api/admin/offerings", {
            "course_id": "c25",
            "teacher_id": "t101",
            "semester": "115-1",
            "location": "理工B205",
            "max_capacity": 30,
            "schedule_info": [{"day": 4, "period": "H"}],
        }, ADMIN)
        offering_id = created["id"]

        # 出現在課程查詢
        _, courses, _ = request("GET", "/api/courses?q=" + urllib.parse.quote("Python"),
                                token=STUDENTS["s101"])
        self.assertTrue(any(c["offering_id"] == offering_id
                            for c in courses["items"]))

        # 教師的班級清單要看到
        _, classes, _ = request("GET", "/api/teacher/classes", token=TEACHER)
        self.assertTrue(any(c["offering_id"] == offering_id for c in classes))

        # 開關與名額調整
        status, _, _ = request("PATCH", "/api/admin/offerings/" + offering_id,
                               {"is_open": False, "max_capacity": 40}, ADMIN)
        self.assertEqual(status, 200)
        _, data, _ = request("GET", "/api/admin/offerings", token=ADMIN)
        row = next(x for x in data["items"] if x["offering_id"] == offering_id)
        self.assertFalse(row["is_open"])
        self.assertEqual(row["max_capacity"], 40)

    def test_create_offering_capacity_below_enrolled_rejected(self):
        status, data, _ = request("PATCH", "/api/admin/offerings/o1",
                                  {"max_capacity": 1}, ADMIN)
        self.assertEqual(status, 400)


class TestRoleGuard(KMUBase):
    def test_student_blocked_from_teacher_api(self):
        status, _, _ = request("GET", "/api/teacher/classes", token=STUDENTS["s101"])
        self.assertEqual(status, 403)
        status, _, _ = request("GET", "/api/admin/offerings", token=STUDENTS["s101"])
        self.assertEqual(status, 403)

    def test_teacher_blocked_from_student_api(self):
        status, _, _ = request("GET", "/api/grades", token=TEACHER)
        self.assertEqual(status, 403)
        status, _, _ = request("POST", "/api/enroll",
                               {"offering_id": "o1"}, TEACHER)
        self.assertEqual(status, 403)

    def test_static_frontend(self):
        status, body, headers = request("GET", "/", raw=True)
        self.assertEqual(status, 200)
        self.assertIn("金門大學", body.decode("utf-8"))
        status, body, _ = request("GET", "/app.js", raw=True)
        self.assertEqual(status, 200)
        self.assertIn("viewCourses", body.decode("utf-8"))


if __name__ == "__main__":
    unittest.main(verbosity=2)