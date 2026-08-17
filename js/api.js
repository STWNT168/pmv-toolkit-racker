const Api = (() => {

  // Prevent the UI from waiting forever for Google Apps Script
  const REQUEST_TIMEOUT_MS = 10000;

  async function request(method, action, payload = {}) {

    if (!CONFIG.API_URL) {
      throw new Error("CONFIG.API_URL is not configured.");
    }

    const session = Auth.getSession();

    // -----------------------------
    // GET REQUEST
    // -----------------------------
    if (method === "GET") {

      const u = new URL(CONFIG.API_URL);

      u.searchParams.set("action", action);

      const data = { ...payload };

      if (session) {
        data.session = JSON.stringify(session);
      }

      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          u.searchParams.set(k, String(v));
        }
      });

      const controller = new AbortController();

      const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
      );

      try {

        const res = await fetch(u.toString(), {
          cache: "no-store",
          signal: controller.signal
        });

        return await parse(res);

      } catch (e) {

        if (e.name === "AbortError") {
          throw new Error(
            "Server response timed out. Please check your internet connection."
          );
        }

        throw e;

      } finally {
        clearTimeout(timeout);
      }
    }

    // -----------------------------
    // POST REQUEST
    // -----------------------------

    const body = {
      action,
      ...payload
    };

    if (action !== "login" && !body.session && session) {
      body.session = session;
    }

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {

      const res = await fetch(CONFIG.API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal
      });

      return await parse(res);

    } catch (e) {

      if (e.name === "AbortError") {
        throw new Error(
          "Server response timed out. Please check your internet connection."
        );
      }

      throw e;

    } finally {
      clearTimeout(timeout);
    }
  }


  // -----------------------------
  // RESPONSE PARSER
  // -----------------------------

  async function parse(res) {

    const text = await res.text();

    let body;

    try {
      body = JSON.parse(text);
    } catch (_) {
      throw new Error(
        `Server returned non-JSON response (HTTP ${res.status}).`
      );
    }

    if (typeof body.success === "undefined") {
      throw new Error("Malformed server response.");
    }

    return body;
  }


  // -----------------------------
  // PUBLIC API
  // -----------------------------

  return {

    login: (u, m) =>
      request("POST", "login", {
        userId: u,
        mobile: m
      }),

    logout: s =>
      request("POST", "logout", {
        session: s
      }),

    getUser: u =>
      request("GET", "getUser", {
        userId: u
      }),

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
      request("GET", "getAdminTodayUpdateStatus", {
        date: d
      }),

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
