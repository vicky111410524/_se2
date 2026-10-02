"use strict";

/* ================================================================
 * 金門大學校務系統 MVP — 前端（純原生 JS，無任何依賴）
 * ================================================================ */

const state = {
  token: sessionStorage.getItem("kmu_token") || "",
  user: null,
  semester: "",
  adminMeta: null,
  newSched: [],
  rosterOffering: null,
};

const ROLE_CN = { student: "學生", teacher: "教師", admin: "行政" };
const TYPE_CN = { required: "必修", elective: "選修", general: "通識" };
const STATUS_CN = {
  pending: "處理中", enrolled: "已選上", dropped: "已退選", rejected: "未中選",
};
const STATUS_CLS = {
  pending: "pending", enrolled: "enrolled", dropped: "dropped", rejected: "rejected",
};
const PERIODS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const DEMO_ACCOUNTS = [
  { group: "行政", acc: "admin", pw: "admin123", note: "系統管理員" },
  { group: "行政", acc: "admin2", pw: "admin123", note: "教務處 陳雅筑" },
  { group: "行政", acc: "admin3", pw: "admin123", note: "學務處 林俊宏" },
  { group: "教師", acc: "teacher01", pw: "teacher123", note: "王志明（資工）" },
  { group: "教師", acc: "teacher02", pw: "teacher123", note: "林雅婷（電機）" },
  { group: "教師", acc: "teacher03", pw: "teacher123", note: "陳建宏（資工）" },
  { group: "教師", acc: "teacher04", pw: "teacher123", note: "黃雅文（企管）" },
  { group: "教師", acc: "teacher05", pw: "teacher123", note: "許佩琳（應英）" },
  { group: "教師", acc: "teacher06", pw: "teacher123", note: "劉俊宏（觀光）" },
  { group: "教師", acc: "teacher07", pw: "teacher123", note: "楊美玲（餐旅）" },
  { group: "教師", acc: "teacher08", pw: "teacher123", note: "張益誠（電機）" },
  { group: "學生", acc: "110410001", pw: "stu123", note: "張小華（資工二甲）" },
  { group: "學生", acc: "110410002", pw: "stu123", note: "李大同（資工二甲）" },
  { group: "學生", acc: "110410003", pw: "stu123", note: "陳小美（資工二甲）" },
  { group: "學生", acc: "110410004", pw: "stu123", note: "鄭宇翔（資工二甲）" },
  { group: "學生", acc: "110491001", pw: "stu123", note: "王俊傑（電機一甲）" },
  { group: "學生", acc: "110490002", pw: "stu123", note: "郭佩珊（電機二甲）" },
  { group: "學生", acc: "111420001", pw: "stu123", note: "吳品潔（企管一甲）" },
  { group: "學生", acc: "110420002", pw: "stu123", note: "賴冠廷（企管二甲）" },
  { group: "學生", acc: "112510001", pw: "stu123", note: "蔡孟璇（應英一甲）" },
  { group: "學生", acc: "113610001", pw: "stu123", note: "邱鈺婷（觀光一甲）" },
  { group: "學生", acc: "113710001", pw: "stu123", note: "許育誠（餐旅一甲）" },
];

const NAV = {
  student: [
    { hash: "#/home", label: "首頁" },
    { hash: "#/tt", label: "課表" },
    { hash: "#/courses", label: "選課" },
    { hash: "#/leave", label: "請假" },
    { hash: "#/my", label: "我的" },
  ],
  teacher: [
    { hash: "#/home", label: "首頁" },
    { hash: "#/classes", label: "我的班級" },
    { hash: "#/approvals", label: "待簽核" },
  ],
  admin: [
    { hash: "#/home", label: "首頁" },
    { hash: "#/offerings", label: "開課管理" },
    { hash: "#/approvals", label: "待簽核" },
  ],
};

/* ----------------------------------------------------------------
 * 工具函式
 * ---------------------------------------------------------------- */
const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, "0");

function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

function isoLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function currentView() {
  const h = (location.hash || "#/home").replace(/^#\/?/, "");
  return h.split("?")[0] || "home";
}

function qp(key, def) {
  const p = new URLSearchParams((location.hash.split("?")[1] || "").split("&").join("&"));
  const v = p.get(key);
  return v == null ? def : v;
}

/* ----------------------------------------------------------------
 * API
 * ---------------------------------------------------------------- */
async function api(method, path, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(body);
  }
  if (state.token) opt.headers["Authorization"] = "Bearer " + state.token;
  const res = await fetch(path, opt);
  const ct = res.headers.get("content-type") || "";
  let data;
  if (ct.includes("json")) data = await res.json();
  else data = await res.text();

  if (res.status === 401) {
    sessionStorage.removeItem("kmu_token");
    state.token = "";
    state.user = null;
    render();
    throw new Error("請先登入");
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `HTTP ${res.status}`);
  }
  return data;
}

function throwMsg(e, view) {
  const v = $(view || "#view");
  if (v) v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`;
}

function setBusy(btn, busy, text) {
  if (!btn) return;
  if (busy) { btn.dataset.orig = btn.textContent; btn.disabled = true; btn.textContent = text || "處理中…"; }
  else { btn.disabled = false; if (btn.dataset.orig) btn.textContent = btn.dataset.orig; }
}

/* ----------------------------------------------------------------
 * 首頁路由
 * ---------------------------------------------------------------- */
function render() {
  if (!state.user) { showLogin(); return; }

  const active = currentView();
  const nav = NAV[state.user.role] || [];
  $("#app").innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">金門大學<small>校務系統 MVP</small></div>
        <span class="role-badge">${ROLE_CN[state.user.role] || ""}</span>
        <span class="who">${esc(state.user.name)}</span>
        <button class="btn ghost" data-action="logout">登出</button>
      </header>
      <main id="view"><p class="muted">載入中…</p></main>
      <nav class="tabbar">${nav.map((n) =>
        `<a href="${n.hash}" class="${n.hash === "#/" + active ? "active" : ""}"><span class="ico">●</span>${n.label}</a>`
      ).join("")}<a class="logout-link" data-action="logout" href="#">登出</a></nav>
    </div>`;
  loadView(active);
}

async function loadView(name) {
  const view = $("#view");
  view.innerHTML = `<p class="muted">載入中…</p>`;
  const map = {
    home: viewHome, tt: viewTT, courses: viewCourses, grades: viewGrades,
    attendance: viewAttendance, leave: viewLeave, profile: viewProfile,
    my: viewMy, classes: viewClasses, approvals: viewApprovals,
    offerings: viewOfferings,
  };
  try {
    await map[name](view);
  } catch (e) {
    view.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`;
  }
}

/* ----------------------------------------------------------------
 * 登入
 * ---------------------------------------------------------------- */
function showLogin() {
  renderLogin();
}

function renderLogin() {
  $("#app").innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <h1>金門大學校務系統</h1>
        <div class="sub">MVP · 單一入口整合教務 / 學務</div>
        <div class="error-box" id="login-err"></div>
        <form data-form="login" novalidate>
          <div class="field">
            <label>帳號（學號 / 教職員帳號）</label>
            <input name="account" autocomplete="username" required>
          </div>
          <div class="field">
            <label>密碼</label>
            <input name="password" type="password" autocomplete="current-password" required>
          </div>
          <button class="btn block" type="submit" id="login-btn">登入</button>
        </form>
        <div class="demo-list">
          <h2>快速填入示範帳號</h2>
          <select data-action="pick-demo" class="demo-select">
            <option value="">選擇身分 / 帳號…</option>
            ${["行政", "教師", "學生"].map((g) =>
              `<optgroup label="${g}">` +
              DEMO_ACCOUNTS.filter((d) => d.group === g).map((d) =>
                `<option value="${d.acc}" data-pw="${d.pw}">${d.acc} — ${esc(d.note)}</option>`
              ).join("") + `</optgroup>`).join("")}
          </select>
          <p class="muted demo-hint">選擇後會自動填入帳號與密碼,再按「登入」。</p>
        </div>
      </div>
    </div>`;
}

async function doLogin(account, password, btn) {
  setBusy(btn, true, "登入中…");
  try {
    const data = await api("POST", "/api/login", { account, password });
    state.token = data.token;
    state.user = data.user;
    sessionStorage.setItem("kmu_token", state.token);
    location.hash = "#/home";
    render();
  } catch (e) {
    const box = $("#login-err");
    if (box) box.style.display = "block";
    if (box) box.textContent = e.message;
    setBusy(btn, false);
  }
}

async function doLogout() {
  try { await api("POST", "/api/logout"); } catch (e) { /* ignore */ }
  state.token = ""; state.user = null;
  sessionStorage.removeItem("kmu_token");
  location.hash = "#/login";
  render();
}

/* ----------------------------------------------------------------
 * 首頁儀表板
 * ---------------------------------------------------------------- */
async function viewHome(view) {
  const me = await api("GET", "/api/me");
  state.user = { ...state.user, ...me };
  state.semester = me.semester || "";

  if (me.role === "student") {
    const leaves = await api("GET", "/api/leave/mine");
    const pending = (leaves || []).filter((l) => l.status === "pending").slice(0, 3);
    view.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="num">${esc(me.gpa ?? "—")}</div><div class="lbl">GPA</div></div>
        <div class="stat"><div class="num">${esc(me.enrolled_credits)}</div><div class="lbl">已選學分</div></div>
        <div class="stat"><div class="num">${esc(me.pending_leave_count)}</div><div class="lbl">待簽核請假</div></div>
        <div class="stat"><div class="num">${esc(me.semester)}</div><div class="lbl">本學期</div></div>
      </div>
      <div class="card">
        <h3>${esc(me.name)} 同學<span class="muted"> · ${esc(me.department)} ${esc(me.class_name)}</span></h3>
        <div class="chips">
          <span class="chip strong">學號 ${esc(me.account)}</span>
          <span class="chip">入學 ${esc(me.enrollment_year)} 學年度</span>
        </div>
        <div class="row" style="margin-top:14px">
          <a class="btn" href="#/courses">去選課</a>
          <a class="btn plain" href="#/tt">本週課表</a>
          <a class="btn plain" href="#/grades">成績查詢</a>
        </div>
      </div>
      ${pending.length ? `<div class="card"><h3>進行中的請假申請</h3>
        ${pending.map((l) => `<div class="approve-item">
          <b>${esc(l.type)}</b> · ${esc(l.start_time)} ～ ${esc(l.end_time)}
          <span class="badge ${STATUS_CLS[l.status] || ""}">${STATUS_CN[l.status] || l.status}</span>
          <div class="muted">${esc(l.reason)}</div>
        </div>`).join("")}</div>` : ""}`;
  } else if (me.role === "teacher") {
    view.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="num">${esc(me.teaching_count)}</div><div class="lbl">授課班級</div></div>
        <div class="stat"><div class="num">${esc(me.pending_leave_step1)}</div><div class="lbl">待簽請假單</div></div>
        <div class="stat"><div class="num">${esc(me.semester)}</div><div class="lbl">本學期</div></div>
        <div class="stat"><div class="num">${esc(me.name)}</div><div class="lbl">教師</div></div>
      </div>
      <div class="card">
        <h3>${esc(me.name)} 老師，${esc(me.semester)} 學期</h3>
        <div class="row">
          <a class="btn" href="#/classes">進入我的班級</a>
          <a class="btn plain" href="#/approvals">簽核請假單</a>
        </div>
      </div>`;
  } else {
    view.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="num">${esc(me.offering_count)}</div><div class="lbl">本學期課程</div></div>
        <div class="stat"><div class="num">${esc(me.pending_leave_step2)}</div><div class="lbl">待系辦簽核</div></div>
        <div class="stat"><div class="num">115-1</div><div class="lbl">學期</div></div>
        <div class="stat"><div class="num">${esc(me.name)}</div><div class="lbl">管理員</div></div>
      </div>
      <div class="card">
        <h3>行政儀表板</h3>
        <div class="row">
          <a class="btn" href="#/offerings">開課管理</a>
          <a class="btn plain" href="#/approvals">系辦簽核</a>
        </div>
        <p class="muted small" style="margin-top:12px">
          選課採「非同步佇列 + 原子扣減容額」設計：送出即受理、背景消化，避免選課高峰塞爆資料庫。
        </p>
      </div>`;
  }
}

/* ----------------------------------------------------------------
 * 課表
 * ---------------------------------------------------------------- */
async function viewTT(view) {
  const data = await api("GET", "/api/timetable");
  const items = data.items || [];
  const days = [1, 2, 3, 4, 5];
  const dayCN = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五" };
  const used = [...new Set(items.flatMap((i) => (i.schedule || []).map((s) => s.period)))]
    .sort((a, b) => PERIODS.indexOf(a) - PERIODS.indexOf(b));

  let html = `<div class="card">
      <h3>${esc(state.user.name)} · 本學期課表<span class="spacer"></span>
        <button class="btn plain" data-action="ics-download">匯出 ICS</button></h3>
      <table class="grid"><tr><th></th>${days.map((d) => `<th>週${dayCN[d]}</th>`).join("")}</tr>`;
  for (const per of used) {
    html += `<tr><td class="period">${per}</td>`;
    for (const d of days) {
      const chips = items.filter((i) => (i.schedule || []).some((s) => s.day === d && s.period === per));
      html += `<td>${chips.map((c) =>
        `<div class="course-chip" title="${esc(c.location)}">${esc(c.name)}<br><span class="muted">${esc(c.teacher)}</span></div>`
      ).join("")}</td>`;
    }
    html += `</tr>`;
  }
  html += `</table>
      <p class="muted small" style="margin-top:10px">支援匯出至 Google Calendar / Apple Calendar（.ics 格式，每週重複）。</p>
    </div>`;
  view.innerHTML = html;
}

async function downloadICS() {
  try {
    const text = await api("GET", "/api/timetable.ics");
    const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `金大課表_${state.semester || "115-1"}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) { alert(e.message); }
}

/* ----------------------------------------------------------------
 * 選課
 * ---------------------------------------------------------------- */
async function viewCourses(view) {
  view.innerHTML = `
    <div class="card">
      <h3>課程查詢與選課</h3>
      <form data-form="courses-filter" class="filter-grid">
        <input name="q" class="wide" placeholder="關鍵字：課名 / 課號 / 教師" style="grid-column:1/-1">
        <select name="type"><option value="">全部類別</option>
          <option value="required">必修</option><option value="elective">選修</option><option value="general">通識</option></select>
        <select name="dept" id="dept-filter"><option value="">全部系所</option></select>
        <button class="btn" type="submit">查詢</button>
      </form>
      <p class="muted small">不明確．即時選課將進入非同步佇列：先回「受理成功」，背景完成容額扣減後再更新狀態。</p>
    </div>
    <div id="course-list"><p class="muted">正在載入課程…</p></div>`;

  const deptRes = await api("GET", "/api/departments");
  $("#dept-filter").innerHTML += (deptRes || []).map((d) =>
    `<option value="${d.id}">${esc(d.name)}</option>`).join("");

  await loadCourses();
}

async function loadCourses() {
  const list = $("#course-list");
  if (!list) return;
  const q = escVal($("input[name=q]")),
    type = escVal($("select[name=type]")),
    dept = escVal($("select[name=dept]"));
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (type) query.set("type", type);
  if (dept) query.set("dept", dept);
  query.set("open", "1");
  list.innerHTML = `<p class="muted">查詢中…</p>`;
  try {
    const data = await api("GET", "/api/courses?" + query.toString());
    const items = data.items || [];
    if (!items.length) { list.innerHTML = `<div class="card"><p class="muted">沒有符合條件的課程。</p></div>`; return; }
    const activeCourses = new Set(items.filter((c) =>
      c.my_status === "enrolled" || c.my_status === "pending")
      .map((c) => c.course_id));
    list.innerHTML = items.map((c) => {
      const status = c.my_status;
      const soldout = c.seats_left <= 0;
      let action;
      if (status === "enrolled")
        action = `<span class="badge enrolled">已選上</span>
                  <button class="btn plain" data-action="drop" data-id="${c.my_enrollment_id}">退選</button>`;
      else if (status === "pending")
        action = `<span class="badge pending">處理中</span>`;
      else if (activeCourses.has(c.course_id))
        action = `<span class="badge pending">已選本課程其他時段</span>`;
      else if (status === "dropped" || status === "rejected" || !status)
        action = (c.is_open && !soldout)
          ? `<button class="btn" data-action="enroll" data-id="${c.offering_id}">選課</button>`
          : `<span class="badge ${soldout ? "dropped" : ""}">${soldout ? "已額滿" : "未開放"}</span>`;
      return `<div class="card course-item">
        <h4>${esc(c.name)} <span class="muted small">${esc(c.course_code)}</span></h4>
        <div class="meta">
          ${TYPE_CN[c.type] || c.type} · ${c.credits} 學分 · ${esc(c.department)} ·
          授課：${esc(c.teacher)}<br>
          ${esc(c.schedule_text)} · ${esc(c.location)}
        </div>
        <div class="meta">已選 <span class="seat ${soldout ? "soldout" : ""}">${esc(c.current_enrolled)} / ${esc(c.max_capacity)}</span> 人</div>
        <div class="bar row">${action}</div>
      </div>`;
    }).join("");
  } catch (e) {
    list.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`;
  }
}

function escVal(v) {
  return v ? v.value.trim() : "";
}

async function doEnroll(offeringId, btn) {
  setBusy(btn, true, "送件中…");
  try {
    await api("POST", "/api/enroll", { offering_id: offeringId });
  } catch (e) {
    setBusy(btn, false);
    alert(e.message);
    await loadCourses();
    return;
  }
  setBusy(btn, false);
  btn.textContent = "已受理，等待佇列更新…";
  btn.disabled = true;
  for (let i = 0; i < 12; i++) {
    await sleep(500);
    const mine = await api("GET", "/api/enrollments");
    if (!(mine || []).some((x) => x.status === "pending")) break;
  }
  await loadCourses();
}

async function doDrop(enrollmentId, btn) {
  setBusy(btn, true, "退選中…");
  try {
    await api("DELETE", "/api/enroll/" + enrollmentId);
    await loadCourses();
  } catch (e) {
    setBusy(btn, false);
    alert(e.message);
  }
}

/* ----------------------------------------------------------------
 * 成績
 * ---------------------------------------------------------------- */
async function viewGrades(view) {
  const data = await api("GET", "/api/grades");
  const items = data.items || [];
  view.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="num">${esc(data.gpa)}</div><div class="lbl">累積 GPA</div></div>
      <div class="stat"><div class="num">${esc(data.total_credits)}</div><div class="lbl">已修畢學分</div></div>
      <div class="stat"><div class="num">${items.length}</div><div class="lbl">科目數</div></div>
      <div class="stat"><div class="num">${esc(state.semester || "115-1")}</div><div class="lbl">學期</div></div>
    </div>
    <div class="card">
      <h3>歷年成績</h3>
      ${items.length ? `<table class="list">
        <tr><th>課號</th><th>課程</th><th>學分</th><th>期中</th><th>期末</th><th>總成績</th><th>等第</th></tr>
        ${items.map((g) => `<tr>
          <td>${esc(g.course_code)}</td><td>${esc(g.name)}</td><td>${g.credits}</td>
          <td>${g.midterm_score == null ? "—" : esc(g.midterm_score)}</td>
          <td>${g.final_score == null ? "—" : esc(g.final_score)}</td>
          <td><b>${g.total_score}</b></td><td>${esc(g.letter)} (${g.point})</td>
        </tr>`).join("")}</table>`
      : `<p class="muted">尚無成績資料。</p>`}
    </div>`;
}

/* ----------------------------------------------------------------
 * 出缺席
 * ---------------------------------------------------------------- */
async function viewAttendance(view) {
  const data = await api("GET", "/api/attendance");
  const items = data.items || [];
  const s = data.summary || { absent: 0, late: 0 };
  view.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="num">${esc(s.absent)}</div><div class="lbl">缺課</div></div>
      <div class="stat"><div class="num">${esc(s.late)}</div><div class="lbl">遲到</div></div>
      <div class="stat"><div class="num">${items.length}</div><div class="lbl">課程</div></div>
    </div>
    ${s.absent >= 1 ? `<div class="alert warn">提醒：缺課超過授課時數 1/3 者將不予扣考資格，請留意。</div>` : ""}
    <div class="card"><h3>缺曠統計</h3>
      ${items.length ? items.map((it) => `
        <div class="approve-item">
          <b>${esc(it.course_name)}</b> <span class="muted small">${esc(it.course_code)}</span>
          <div class="muted">出席 ${it.present} · 缺席 ${it.absent} · 遲到 ${it.late}（共 ${it.total} 次點名）</div>
        </div>`).join("")
      : `<p class="muted">尚無缺曠資料。</p>`}
    </div>`;
}

/* ----------------------------------------------------------------
 * 請假
 * ---------------------------------------------------------------- */
async function viewLeave(view) {
  if (state.user.role === "teacher") { loadView("approvals"); return; }
  if (state.user.role === "admin") { location.hash = "#/approvals"; return; }
  const leaves = await api("GET", "/api/leave/mine");
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  view.innerHTML = `
    <div class="card">
      <h3>線上請假申請</h3>
      <form data-form="leave">
        <div class="field"><label>假別</label>
          <select name="type"><option>病假</option><option>事假</option><option>公假</option><option>喪假</option><option>其他</option></select>
        </div>
        <div class="two-col">
          <div class="field"><label>開始時間</label><input type="datetime-local" name="start" value="${isoLocal(d).slice(0, 16)}"></div>
          <div class="field"><label>結束時間</label><input type="datetime-local" name="end" value="${isoLocal(new Date(Date.now() + 24 * 3600 * 1000 + 3600 * 1000)).slice(0, 16)}"></div>
        </div>
        <div class="field"><label>事由</label><textarea name="reason" placeholder="請說明請假原因"></textarea></div>
        <div class="field"><label>證明文件 URL（如診斷證明照片上傳後取得的網址）</label><input name="proof" placeholder="選填"></div>
        <button class="btn block" type="submit">送出申請</button>
      </form>
    </div>
    <div class="card">
      <h3>我的請假紀錄</h3>
      ${(leaves || []).map((l) => `
        <div class="approve-item">
          <div class="row">
            <b>${esc(l.type)}</b>（${l.days} 天）
            <span class="badge ${STATUS_CLS[l.status] || ""}">${STATUS_CN[l.status] || l.status}</span>
          </div>
          <div class="muted">${esc(l.start_time)} ～ ${esc(l.end_time)}</div>
          <div class="small">事由：${esc(l.reason)}</div>
          ${(l.decisions || []).length ? `<ol class="timeline">${l.decisions.map((dc) =>
            `<li>${esc(dc.role === "teacher" ? "授課教師" : "系辦")} ${esc(dc.by_name)}
               ${dc.approve ? "核准" : "退回"}（${esc(dc.at)}）</li>`).join("")}</ol>` : ""}
          ${l.status === "pending" ? `<div class="muted small">目前關卡：${l.approval_step === 1 ? "授課教師" : "系辦"}簽核</div>` : ""}
        </div>`).join("") || `<p class="muted">尚無請假紀錄。</p>`}
    </div>`;
}

async function submitLeave(form) {
  const data = {
    type: form.type.value,
    start_time: form.start.value,
    end_time: form.end.value,
    reason: form.reason.value,
    proof_url: form.proof.value,
  };
  if (!data.reason) { alert("請填寫事由"); return; }
  const btn = form.querySelector("button[type=submit]");
  setBusy(btn, true, "送出中…");
  try {
    await api("POST", "/api/leave", data);
    await loadView("leave");
  } catch (e) {
    setBusy(btn, false);
    alert(e.message);
  }
}

/* ----------------------------------------------------------------
 * 簽核（教師 / 系辦）
 * ---------------------------------------------------------------- */
async function viewApprovals(view) {
  const data = await api("GET", "/api/leave/pending");
  const items = data.items || [];
  const stepName = data.step === 1 ? "授課教師簽核" : "系辦簽核";
  view.innerHTML = `<div class="card"><h3>待簽核請假單（${stepName}）</h3>
    ${items.length ? items.map((l) => `
      <div class="approve-item">
        <div class="row">
          <b>${esc(l.student_name)}</b><span class="muted small">${esc(l.class_name)}</span>
          <span class="badge pending">${esc(l.type)} ${l.days} 天</span>
        </div>
        <div class="muted">${esc(l.start_time)} ～ ${esc(l.end_time)}</div>
        <div class="small">事由：${esc(l.reason)}${l.proof_url ? `（<a href="${esc(l.proof_url)}" target="_blank" rel="noopener">證明</a>）` : ""}</div>
        <div class="row" style="margin-top:10px">
          <button class="btn ok" data-action="decision" data-id="${l.id}" data-approve="1">核准</button>
          <button class="btn danger" data-action="decision" data-id="${l.id}" data-approve="0">退回</button>
        </div>
      </div>`).join("")
    : `<p class="muted">目前沒有待簽核的請假單。</p>`}</div>`;
}

async function decision(id, approve, btn) {
  setBusy(btn, true);
  try {
    await api("POST", `/api/leave/${id}/decision`, { approve });
    await loadView("approvals");
  } catch (e) {
    setBusy(btn, false);
    alert(e.message);
  }
}

/* ----------------------------------------------------------------
 * 教師：我的班級
 * ---------------------------------------------------------------- */
async function viewClasses(view) {
  if (state.user.role !== "teacher") { location.hash = "#/home"; return; }
  const classes = await api("GET", "/api/teacher/classes");

  view.innerHTML = `
    <div class="card">
      <h3>我的班級（本學期 ${classes.length} 門）</h3>
      <div class="tabs-row">
        ${classes.map((c) =>
          `<button class="tab-btn ${state.rosterOffering === c.offering_id ? "active" : ""}"
             data-action="open-roster" data-id="${c.offering_id}">${esc(c.name)}</button>`).join("")}
      </div>
    </div>
    <div id="roster-box">
      ${state.rosterOffering ? `<p class="muted">載入點名與成績…</p>` : `<p class="muted">請選擇一個班級來登錄成績或點名。</p>`}
    </div>`;

  if (state.rosterOffering) await loadRoster($("#roster-box"), state.rosterOffering);
}

async function loadRoster(box, offeringId) {
  const roster = await api("GET", "/api/teacher/roster?offering_id=" + offeringId);
  const enrolled = roster.filter((r) => r.status === "enrolled");
  box.innerHTML = `
    <div class="card">
      <h3>成績登錄（班級 ${esc(offeringId)}）</h3>
      <table class="list">
        <tr><th>學號</th><th>姓名</th><th>期中</th><th>期末</th><th>總成績</th></tr>
        ${enrolled.map((r) => `<tr>
          <td>${esc(r.account)}</td><td>${esc(r.name)}</td>
          <td><input type="number" min="0" max="100" data-sid="${r.student_id}" data-col="midterm" value="${r.midterm_score == null ? "" : r.midterm_score}"></td>
          <td><input type="number" min="0" max="100" data-sid="${r.student_id}" data-col="final" value="${r.final_score == null ? "" : r.final_score}"></td>
          <td><input type="number" min="0" max="100" data-sid="${r.student_id}" data-col="total" value="${r.total_score == null ? "" : r.total_score}"></td>
        </tr>`).join("")}
      </table>
      <div style="margin-top:12px">
        <button class="btn" data-action="save-grades" data-id="${offeringId}">儲存成績</button>
      </div>
    </div>
    <div class="card">
      <h3>點名</h3>
      <div class="row" style="margin-bottom:10px">
        <label class="small">日期</label>
        <input type="date" id="att-date" class="fill" value="${todayStr()}">
      </div>
      <table class="list">
        <tr><th>學號</th><th>姓名</th><th>狀態</th></tr>
        ${enrolled.map((r) => `<tr>
          <td>${esc(r.account)}</td><td>${esc(r.name)}</td>
          <td><select data-sid="${r.student_id}">
            <option value="present">出席</option><option value="absent">缺席</option><option value="late">遲到</option>
          </select></td>
        </tr>`).join("")}
      </table>
      <div style="margin-top:12px"><button class="btn" data-action="save-attendance" data-id="${offeringId}">儲存點名</button></div>
    </div>`;
}

async function saveGrades(offeringId, btn) {
  const scores = [];
  $("#roster-box").querySelectorAll("input[data-sid][data-col]").forEach((inp) => {
    if (!inp.value || inp.value === "") return;
    scores.push({ student_id: inp.dataset.sid, [inp.dataset.col]: parseFloat(inp.value) });
  });
  if (!scores.length) { alert("沒有要儲存的成績"); return; }
  setBusy(btn, true, "儲存中…");
  try {
    const res = await api("POST", "/api/teacher/grades", { offering_id: offeringId, scores });
    alert(`已更新 ${res.updated} 筆成績`);
    setBusy(btn, false);
  } catch (e) { setBusy(btn, false); alert(e.message); }
}

async function saveAttendance(offeringId, btn) {
  const date = $("#att-date").value;
  if (!date) { alert("請選擇日期"); return; }
  const records = [];
  $("#roster-box").querySelectorAll("select[data-sid]").forEach((sel) => {
    records.push({ student_id: sel.dataset.sid, status: sel.value });
  });
  setBusy(btn, true, "儲存中…");
  try {
    const res = await api("POST", "/api/teacher/attendance", { offering_id: offeringId, date, records });
    alert(`已記錄 ${res.saved} 筆`);
    setBusy(btn, false);
  } catch (e) { setBusy(btn, false); alert(e.message); }
}

/* ----------------------------------------------------------------
 * 行政：開課管理
 * ---------------------------------------------------------------- */
async function viewOfferings(view) {
  if (state.user.role !== "admin") { location.hash = "#/home"; return; }
  if (!state.adminMeta) state.adminMeta = await api("GET", "/api/admin/meta");
  const meta = state.adminMeta;

  view.innerHTML = `
    <div class="card">
      <h3>新增開課</h3>
      <form data-form="offering">
        <div class="two-col">
          <div class="field"><label>課程</label>
            <select name="course_id">${meta.courses.map((c) =>
              `<option value="${c.id}">${esc(c.course_code)} ${esc(c.name)}（${c.credits} 學分）</option>`).join("")}</select>
          </div>
          <div class="field"><label>授課教師</label>
            <select name="teacher_id">${meta.teachers.map((t) =>
              `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select>
          </div>
        </div>
        <div class="two-col">
          <div class="field"><label>學期</label><input name="semester" value="${state.semester || "115-1"}"></div>
          <div class="field"><label>人數上限</label><input name="max_capacity" type="number" min="1" value="50"></div>
        </div>
        <div class="field"><label>教室</label><input name="location" placeholder="如 理工A101"></div>
        <div class="field">
          <label>上課時間</label>
          <div class="row" style="margin-bottom:8px">
            <select id="sched-day">${[1, 2, 3, 4, 5].map((d) => `<option value="${d}">週${"一二三四五"[d - 1]}</option>`).join("")}</select>
            <select id="sched-per">${PERIODS.map((p) => `<option value="${p}">${p} 節</option>`).join("")}</select>
            <button class="btn plain" type="button" data-action="add-sched">＋ 加入</button>
          </div>
          <div class="chips" id="sched-chips"></div>
        </div>
        <button class="btn block" type="submit">建立開課</button>
      </form>
    </div>
    <div class="card">
      <h3>本學期開課列表</h3>
      <div id="offering-list"><p class="muted">載入中…</p></div>
    </div>`;
  await loadOfferings();
}

async function loadOfferings() {
  const list = $("#offering-list");
  if (!list) return;
  try {
    const data = await api("GET", "/api/admin/offerings");
    const items = data.items || [];
    list.innerHTML = items.map((o) => `
      <div class="approve-item">
        <div class="row">
          <b>${esc(o.name)}</b><span class="muted small">${esc(o.course_code)}</span>
          <span class="badge ${o.is_open ? "enrolled" : "pending"}">${o.is_open ? "開放選課" : "已關閉"}</span>
        </div>
        <div class="muted">${esc(o.schedule_text)} · ${esc(o.location)} · 授課 ${esc(o.teacher)}</div>
        <div class="muted">已選 <b>${o.current_enrolled}</b> / ${o.max_capacity} 人（v${o.version}）</div>
        <div class="row" style="margin-top:8px">
          <button class="btn plain" data-action="toggle-offering" data-id="${o.offering_id}" data-open="${o.is_open ? 0 : 1}">
            ${o.is_open ? "關閉選課" : "開放選課"}</button>
          <button class="btn plain" data-action="edit-capacity" data-id="${o.offering_id}" data-cur="${o.max_capacity}">調整名額</button>
        </div>
      </div>`).join("") || `<p class="muted">尚無開課。</p>`;
  } catch (e) {
    list.innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}

async function addSched() {
  const day = $("#sched-day").value, period = $("#sched-per").value;
  const chip = document.createElement("span");
  chip.className = "chip strong";
  chip.innerHTML = `週${"一二三四五"[day - 1]} ${period}節 <a href="#" data-action="del-sched" data-d="${day}-${period}">✕</a>`;
  $("#sched-chips").appendChild(chip);
  state.newSched.push({ day: +day, period });
}

function removeSched(day, period) {
  state.newSched = state.newSched.filter((s) => !(s.day === +day && s.period === period));
  $("#sched-chips").querySelectorAll("a").forEach((a) => {
    if (a.dataset.d === `${day}-${period}`) a.closest("span").remove();
  });
}

async function submitOffering(form) {
  if (!state.newSched.length) { alert("請先加入至少一個上課時段"); return; }
  const btn = form.querySelector("button[type=submit]");
  setBusy(btn, true, "建立中…");
  try {
    await api("POST", "/api/admin/offerings", {
      course_id: form.course_id.value,
      teacher_id: form.teacher_id.value,
      semester: form.semester.value,
      location: form.location.value,
      max_capacity: parseInt(form.max_capacity.value, 10),
      schedule_info: state.newSched,
    });
    state.newSched = [];
    $("#sched-chips").innerHTML = "";
    await loadOfferings();
    alert("已建立開課");
    setBusy(btn, false);
  } catch (e) { setBusy(btn, false); alert(e.message); }
}

/* ----------------------------------------------------------------
 * 個人資料
 * ---------------------------------------------------------------- */
async function viewProfile(view) {
  const p = await api("GET", "/api/profile");
  view.innerHTML = `
    <div class="card">
      <h3>基本學籍資料</h3>
      <form data-form="profile">
        <div class="two-col">
          <div class="field"><label>姓名</label><input value="${esc(p.name)}" disabled></div>
          <div class="field"><label>學號</label><input value="${esc(p.account)}" disabled></div>
        </div>
        <div class="two-col">
          <div class="field"><label>系所</label><input value="${esc(p.department)} ${esc(p.class_name)}" disabled></div>
          <div class="field"><label>入學年度</label><input value="${esc(p.enrollment_year)}" disabled></div>
        </div>
        <div class="field"><label>學校信箱</label><input name="email" value="${esc(p.email)}"></div>
        <div class="field"><label>聯絡電話</label><input name="phone" value="${esc(p.phone)}" placeholder="手機"></div>
        <div class="two-col">
          <div class="field"><label>緊急聯絡人</label><input name="emergency_contact" value="${esc(p.emergency_contact)}"></div>
          <div class="field"><label>緊急聯絡電話</label><input name="emergency_phone" value="${esc(p.emergency_phone)}"></div>
        </div>
        <fieldset class="row" style="border:1px solid var(--line);border-radius:10px;padding:12px;margin:0 0 14px">
          <legend class="small">註冊狀態</legend>
          <span class="chip ${p.registered ? "strong" : ""}">${p.registered ? "已註冊" : "未註冊"}</span>
          <span class="chip ${p.tuition_paid ? "strong" : ""}">${p.tuition_paid ? "已完成繳費" : "尚有欠費"}</span>
        </fieldset>
        <button class="btn block" type="submit">儲存</button>
      </form>
    </div>`;
}

async function submitProfile(form) {
  const btn = form.querySelector("button[type=submit]");
  setBusy(btn, true, "儲存中…");
  try {
    await api("PUT", "/api/profile", {
      email: form.email.value,
      phone: form.phone.value,
      emergency_contact: form.emergency_contact.value,
      emergency_phone: form.emergency_phone.value,
    });
    alert("已儲存");
    setBusy(btn, false);
  } catch (e) { setBusy(btn, false); alert(e.message); }
}

/* ----------------------------------------------------------------
 * 我的（學生）
 * ---------------------------------------------------------------- */
async function viewMy(view) {
  view.innerHTML = `
    <a class="list-link" href="#/grades"><span class="lbl">歷年成績與 GPA</span><span class="arrow">›</span></a>
    <a class="list-link" href="#/attendance"><span class="lbl">缺曠紀錄</span><span class="arrow">›</span></a>
    <a class="list-link" href="#/leave"><span class="lbl">請假申請與紀錄</span><span class="arrow">›</span></a>
    <a class="list-link" href="#/profile"><span class="lbl">個人學籍資料</span><span class="arrow">›</span></a>
    <button class="btn block plain" data-action="ics-download">匯出課表至行事曆（.ics）</button>`;
}

/* ----------------------------------------------------------------
 * 事件綁定
 * ---------------------------------------------------------------- */
document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-action]");
  if (!el) return;
  const act = el.dataset.action;

  if (act === "logout") { ev.preventDefault(); return doLogout(); }
  if (act === "fill-demo") {
    const f = $("#app form[data-form=login]");
    if (f) { f.account.value = el.dataset.account; f.password.value = el.dataset.pw; }
    return;
  }
  if (act === "enroll") return doEnroll(el.dataset.id, el);
  if (act === "drop") { return doDrop(el.dataset.id, el); }
  if (act === "ics-download") return downloadICS();
  if (act === "decision") return decision(el.dataset.id, el.dataset.approve === "1", el);
  if (act === "open-roster") { state.rosterOffering = el.dataset.id; loadView("classes"); return; }
  if (act === "save-grades") return saveGrades(el.dataset.id, el);
  if (act === "save-attendance") return saveAttendance(el.dataset.id, el);
  if (act === "toggle-offering") {
    try {
      await api("PATCH", "/api/admin/offerings/" + el.dataset.id, { is_open: el.dataset.open === "1" });
      await loadOfferings();
    } catch (e) { alert(e.message); }
    return;
  }
  if (act === "edit-capacity") {
    const cur = el.dataset.cur;
    const next = prompt("調整人數上限，目前：" + cur, cur);
    if (next === null) return;
    await api("PATCH", "/api/admin/offerings/" + el.dataset.id, { max_capacity: parseInt(next, 10) })
      .then(loadOfferings).catch((e) => alert(e.message));
    return;
  }
  if (act === "add-sched") { ev.preventDefault(); addSched(); return; }
  if (act === "del-sched") { ev.preventDefault(); removeSched(el.dataset.d.split("-")[0], el.dataset.d.split("-")[1]); return; }
});

document.addEventListener("change", (ev) => {
  const el = ev.target.closest("[data-action=pick-demo]");
  if (!el) return;
  const opt = el.selectedOptions[0];
  const f = $("#app form[data-form=login]");
  if (f && opt && opt.value) {
    f.account.value = opt.value;
    f.password.value = opt.dataset.pw;
  }
});

document.addEventListener("submit", async (ev) => {
  const form = ev.target.closest("form[data-form]");
  if (!form) return;
  ev.preventDefault();
  const key = form.dataset.form;
  if (key === "login") return doLogin(form.account.value, form.password.value, $("#login-btn"));
  if (key === "courses-filter") return loadCourses();
  if (key === "leave") return submitLeave(form);
  if (key === "profile") return submitProfile(form);
  if (key === "offering") return submitOffering(form);
});

/* —— 啟動 —— */
async function boot() {
  if (state.token) {
    try {
      const me = await api("GET", "/api/me");
      state.user = me;
      render();
      return;
    } catch (e) {
      /* token 失效 → 顯示登入 */
    }
  }
  state.token = "";
  state.user = null;
  render();
}
boot();
window.addEventListener("hashchange", render);