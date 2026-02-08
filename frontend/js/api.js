(() => {
  const RAW_BASE = window.API_BASE_URL || "";
  const API_BASE = String(RAW_BASE).replace(/\/+$/, "");

  function hasBase() {
    return !!API_BASE;
  }

  function buildUrl(path) {
    if (!path) return API_BASE;
    if (/^https?:\/\//i.test(path)) return path;
    if (!API_BASE) return path;
    return path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
  }

  function withTimeout(signal, ms) {
    if (!ms) return null;
    return setTimeout(() => {
      try {
        signal.abort();
      } catch {}
    }, ms);
  }

  async function apiFetch(path, opts = {}) {
    if (!API_BASE) {
      const err = new Error("API base URL is not configured.");
      err.code = "API_BASE_MISSING";
      throw err;
    }

    const url = buildUrl(path);
    const headers = new Headers(opts.headers || {});

    const isFormData =
      typeof FormData !== "undefined" && opts.body instanceof FormData;
    if (!headers.has("Content-Type") && !isFormData) {
      headers.set("Content-Type", "application/json");
    }

    const controller = new AbortController();
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 12000;
    const timer = withTimeout(controller, timeoutMs);

    try {
      return await fetch(url, {
        ...opts,
        headers,
        signal: controller.signal,
        credentials: opts.credentials ?? "include",
        cache: opts.cache ?? "no-store",
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function getJson(path, opts = {}) {
    const res = await apiFetch(path, { method: "GET", ...opts });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data, res };
  }

  async function postJson(path, payload, opts = {}) {
    const body = payload != null ? JSON.stringify(payload) : "{}";
    const res = await apiFetch(path, { method: "POST", body, ...opts });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data, res };
  }

  window.MC_API = {
    API_BASE,
    hasBase,
    buildUrl,
    apiFetch,
    getJson,
    postJson,
  };
})();
