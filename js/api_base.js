// ================== api_base.js ==================
// Shared API base URL helper.
// Set window.CONTROL_ROOM_API_BASE (e.g. https://control-room-proxy.<subdomain>.workers.dev)
// to route all internal API calls through a hosted proxy.

(function bootstrapApiBase() {
  const defaultHostedProxy = "https://control-room-proxy.ben-wilson2092.workers.dev";
  const localDevProxy = "http://localhost:8000";
  const host = String(window.location?.hostname || "").toLowerCase();
  const protocol = String(window.location?.protocol || "").toLowerCase();
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1";
  const isFile = protocol === "file:";
  // Local builds should default to the dev proxy so API routes work even when
  // UI is served by a plain static server (e.g. 127.0.0.1:5500).
  const localDefault = localDevProxy;
  const raw = String(
    window.CONTROL_ROOM_API_BASE ||
    ((isLocal || isFile) ? localDefault : defaultHostedProxy)
  ).trim();
  const normalized = raw.replace(/\/+$/, "");
  window.__CONTROL_ROOM_API_BASE = normalized;
  window.__CONTROL_ROOM_API_BASE_FALLBACKS = [localDevProxy, defaultHostedProxy]
    .map((v) => String(v || "").trim().replace(/\/+$/, ""))
    .filter(Boolean);
  window.__CONTROL_ROOM_API_BASE_SOURCE = isFile ? "file-local-default" : (isLocal ? "same-origin-default" : "hosted-default");
})();

function apiUrl(path) {
  const p = String(path || "");
  if (!p) return p;
  if (/^https?:\/\//i.test(p)) return p;
  const base = window.__CONTROL_ROOM_API_BASE || "";
  if (!base) return p;
  const withSlash = p.startsWith("/") ? p : `/${p}`;
  return `${base}${withSlash}`;
}

function apiCandidateBases() {
  const out = [];
  const seen = new Set();
  const current = String(window.__CONTROL_ROOM_API_BASE || "").trim().replace(/\/+$/, "");
  const fallbacks = Array.isArray(window.__CONTROL_ROOM_API_BASE_FALLBACKS)
    ? window.__CONTROL_ROOM_API_BASE_FALLBACKS
    : [];
  for (const base of [current, ...fallbacks]) {
    const normalized = String(base || "").trim().replace(/\/+$/, "");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function shouldRetryStatus(status) {
  return status === 404 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504;
}

async function apiFetch(path, options) {
  const p = String(path || "");
  if (!p) return fetch(p, options);
  if (/^https?:\/\//i.test(p)) return fetch(p, options);
  const withSlash = p.startsWith("/") ? p : `/${p}`;
  const bases = apiCandidateBases();
  let lastResponse = null;
  let lastError = null;

  for (const base of bases) {
    const url = `${base}${withSlash}`;
    try {
      const resp = await fetch(url, options);
      if (resp.ok) {
        window.__CONTROL_ROOM_API_BASE = base;
        return resp;
      }
      lastResponse = resp;
      if (!shouldRetryStatus(resp.status)) return resp;
    } catch (err) {
      lastError = err;
    }
  }
  if (lastResponse) return lastResponse;
  if (lastError) throw lastError;
  return fetch(apiUrl(withSlash), options);
}
