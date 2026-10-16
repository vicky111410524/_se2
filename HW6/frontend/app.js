const $ = (id) => document.getElementById(id);

async function getJSON(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

async function mark(el, url) {
  try {
    const data = await getJSON(url);
    el.classList.remove("down");
    el.classList.add("up");
    return data;
  } catch (err) {
    el.classList.remove("up");
    el.classList.add("down");
    return { error: err.message };
  }
}

async function checkStatus() {
  const results = await Promise.all([
    mark($("st-node"), "/api/health"),
    mark($("st-python"), "/py/health"),
    mark($("st-rust"), "/rust/health"),
  ]);
  $("status-json").textContent = JSON.stringify(
    { "node-api": results[0], "python-api": results[1], "rust-api": results[2] },
    null,
    2
  );
}

async function loadMessages() {
  try {
    const rows = await getJSON("/api/messages");
    $("msg-list").innerHTML = rows.length
      ? rows
          .map(
            (m) => `<li>
              <span class="who">${escapeHtml(m.name)}<span class="when">${new Date(
              m.created_at
            ).toLocaleString()}</span></span>
              <span class="txt">${escapeHtml(m.content)}</span>
              <button data-id="${m.id}">刪除</button>
            </li>`
          )
          .join("")
      : '<li><span class="txt">尚無留言</span></li>';

    document.querySelectorAll("#msg-list button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await getJSON(`/api/messages/${btn.dataset.id}`, { method: "DELETE" });
        loadMessages();
      });
    });
  } catch (err) {
    $("msg-list").innerHTML = `<li><span class="txt">讀取失敗：${escapeHtml(
      err.message
    )}</span></li>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

$("msg-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("name").value.trim();
  const content = $("content").value.trim();
  if (!content) return;
  try {
    await getJSON("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content }),
    });
    $("content").value = "";
    loadMessages();
  } catch (err) {
    alert("送出失敗：" + err.message);
  }
});

$("btn-refresh").addEventListener("click", checkStatus);

async function loadService(url, el) {
  el.textContent = `loading ${url} …`;
  try {
    el.textContent = JSON.stringify(await getJSON(url), null, 2);
  } catch (err) {
    el.textContent = `error: ${err.message}`;
  }
}

$("btn-py").addEventListener("click", () => loadService("/py/info", $("svc-json")));
$("btn-rust").addEventListener("click", () =>
  loadService("/rust/fib?n=20", $("svc-json"))
);

checkStatus();
loadMessages();
setInterval(checkStatus, 15000);
