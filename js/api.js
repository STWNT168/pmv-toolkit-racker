/**
 * api.js
 * Google Apps Script API wrapper.
 *
 * Fixes:
 * - GET requests always carry the current authenticated session.
 * - POST requests automatically carry the current session unless a session
 *   is explicitly supplied (login is the exception).
 * - Server error messages are preserved.
 * - Non-JSON responses produce a useful deployment/API error.
 */

const Api = (() => {
  async function get(action, params = {}) {
    if (!CONFIG.API_URL) {
      throw new Error("CONFIG.API_URL is not configured.");
    }

    const url = new URL(CONFIG.API_URL);
    url.searchParams.set("action", action);

    const session = Auth.getSession();

    if (session) {
      params = { ...params, session: JSON.stringify(session) };
    }

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });

    const res = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store"
    });

    return parseResponse(res);
  }

  async function post(action, payload = {}) {
    if (!CONFIG.API_URL) {
      throw new Error("CONFIG.API_URL is not configured.");
    }

    const body = { action, ...payload };

    // Every authenticated POST gets the current session automatically.
    // Explicit payload.session remains supported for login/logout/sync calls.
    if (action !== "login" && !body.session) {
      const session = Auth.getSession();
      if (session) body.session = session;
    }

    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(body),
      cache: "no-store"
    });

    return parseResponse(res);
  }

  async function parseResponse(res) {
    let text = "";

    try {
      text = await res.text();
    } catch (e) {
      throw new Error("Could not read the server response.");
    }

    let body;

    try {
      body = JSON.parse(text);
    } catch (e) {
      const status = res.status ? ` (HTTP ${res.status})` : "";
      throw new Error(
        "Server returned a non-JSON response" +
        status +
        ". Check that the Apps Script Web App deployment is active."
      );
    }

    if (!body || typeof body.success === "undefined") {
      throw new Error("Malformed server response from Apps Script.");
    }

    if (!res.ok && body.success !== false) {
      throw new Error(`Server HTTP error ${res.status}.`);
    }

    return body;
  }

  const getOfficeList = () => get("getOfficeList");

  const getUser = userId => get("getUser", { userId });

  const getPreviousDay = (officeId, date) =>
    get("getPreviousDay", { officeId, date });

  const getHistory = (officeId, from, to) =>
    get("getHistory", { officeId, from, to });

  const getDashboardData = params =>
    get("getDashboardData", params || {});

  const submitDailyRecord = (record, session) =>
    post("submitDailyRecord", { record, session });

  const syncOfflineRecord = (record, session) =>
    post("syncOfflineRecord", { record, session });

  const updateDailyRecord = (record, session) =>
    post("updateDailyRecord", { record, session });

  const login = (userId, mobile) =>
    post("login", { userId, mobile });

  const logout = session =>
    post("logout", { session });

  return {
    getOfficeList,
    getUser,
    getPreviousDay,
    getHistory,
    getDashboardData,
    submitDailyRecord,
    syncOfflineRecord,
    updateDailyRecord,
    login,
    logout
  };
})();
