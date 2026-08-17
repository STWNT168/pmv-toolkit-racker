const Api = (() => {
  const REQUEST_TIMEOUT_MS = 15000;

  async function request(method, action, payload = {}) {
    if (!CONFIG.API_URL) {
      throw new Error("CONFIG.API_URL is not configured.");
    }

    const session = Auth.getSession();

    if (method === "GET") {
      const u = new URL(CONFIG.API_URL);
      u.searchParams.set("action", action);

      const data = { ...payload };
      if (session) data.session = JSON.stringify(session);

      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          u.searchParams.set(k, String(v));
        }
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(u.toString(), {
          method: "GET",
          cache: "no-store",
          redirect: "follow",
          signal: controller.signal
        });
        return await parse(res, action);
      } catch (e) {
        if (e.name === "AbortError") {
          throw new Error(
            "Server response timed out. Please check the Apps Script deployment and internet connection."
          );
        }
        throw e;
      } finally {
        clearTimeout(timeout);
      }
    }

    const body = { action, ...payload };
    if (action !== "login" && !body.session && session) {
      body.session = session;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(CONFIG.API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(body),
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal
      });
      return await parse(res, action);
    } catch (e) {
      if (e.name === "AbortError") {
        throw new Error(
          "Server response timed out. Please check the Apps Script deployment and internet connection."
        );
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function parse(res, action) {
    const text = await res.text();
    const trimmed = text.trim();

    let body;
    try {
      body = JSON.parse(trimmed);
    } catch (_) {
      const preview = trimmed
        .replace(/\s+/g, " ")
        .slice(0, 300);

      throw new Error(
        `Server returned non-JSON response for "${action}" (HTTP ${res.status}). ` +
        `Response: ${preview || "[empty response]"}`
      );
    }

    if (typeof body.success === "undefined") {
      throw new Error(
        `Malformed server response for "${action}" (HTTP ${res.status}).`
      );
    }

    if (!res.ok && body.success !== false) {
      throw new Error(
        `Server HTTP ${res.status} while processing "${action}".`
      );
    }

    return body;
  }

  return {
    login: (u, m) =>
      request("POST", "login", { userId: u, mobile: m }),

    logout: s =>
      request("POST", "logout", { session: s }),

    getUser: u =>
      request("GET", "getUser", { userId: u }),

    getOfficeList: () =>
      request("GET", "getOfficeList"),

    getPreviousDay: (o, d) =>
      request("GET", "getPreviousDay", {
        officeId: o,
        date: d
      }),

    getOwnTodayRecord: () =>
      request("GET", "getOwnTodayRecord"),

    getAdminTodayUpdateStatus: d =>
      request("GET", "getAdminTodayUpdateStatus", { date: d }),

    submitDailyRecord: (r, s) =>
      request("POST", "submitDailyRecord", {
        record: r,
        session: s
      }),

    syncOfflineRecord: (r, s) =>
      request("POST", "syncOfflineRecord", {
        record: r,
        session: s
      }),

    updateDailyRecord: (r, s) =>
      request("POST", "updateDailyRecord", {
        record: r,
        session: s
      }),

    deleteOwnTodayRecord: id =>
      request("POST", "deleteOwnTodayRecord", {
        recordId: id
      })
  };
})();
