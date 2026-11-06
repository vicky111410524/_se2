/**
 * Cloudflare Pages Function
 * Route: GET /api/info
 *
 * 回傳伺服器端的部署資訊與目前時間，供前端展示 API 互動結果。
 */
export async function onRequestGet(context) {
  const { request, env, functionPath } = context;
  const startedAt = Date.now();
  const url = new URL(request.url);

  const now = new Date();

  const requestId =
    (request.headers.get("cf-ray") ||
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`));

  const payload = {
    ok: true,
    message: "Hello from Cloudflare Pages Functions!",
    service: "cloud-tasks-api",
    environment:
      env?.CF_PAGES_BRANCH ? `preview:${env.CF_PAGES_BRANCH}` :
      env?.CF_PAGES_URL ? "pages" :
      env?.ENVIRONMENT || "development/local",
    serverTime: now.toISOString(),
    serverTimeLocal: now.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    requestId,
    colo: request.cf?.colo || "N/A",
    country: request.cf?.country || "N/A",
    path: url.pathname,
    method: request.method,
    userAgent: request.headers.get("user-agent") || "unknown",
    responseTimeMs: Date.now() - startedAt,
    functionPath: functionPath || "/api/info",
    timestamp: now.getTime()
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}

export async function onRequest(context) {
  if (context.request.method === "GET") {
    return onRequestGet(context);
  }
  if (context.request.method === "OPTIONS") {
    return onRequestOptions(context);
  }
  return new Response(
    JSON.stringify({ ok: false, error: "Method Not Allowed", allowed: ["GET", "OPTIONS"] }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Allow": "GET, OPTIONS"
      }
    }
  );
}
