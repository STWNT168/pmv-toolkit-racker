/**
 * api.js
 * Thin wrapper around fetch() for talking to the Google Apps Script backend.
 * No credentials or secrets live here — the deployed Web App URL is public
 * by design, and Code.gs enforces all real authorization.
 *
 * IMPORTANT: Apps Script Web Apps don't support custom request headers well
 * with CORS, so POST bodies are sent as text/plain (avoids a CORS preflight)
 * and parsed as JSON server-side.
 */

const Api = (() => {

  async function get(action, params = {}) {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const res = await fetch(url.toString(), { method: "GET" });
    return parseResponse(res);
  }

  async function post(action, payload = {}) {
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload })
    });
    return parseResponse(res);
  }

  async function parseResponse(res) {
    let body;
    try {
      body = await res.json();
    } catch (e) {
      throw new Error("Server returned an unreadable response.");
    }
    if (!body || typeof body.success === "undefined") {
      throw new Error("Malformed server response.");
    }
    return body;
  }

  // ---- Named endpoint helpers (mirrors backend/Code.gs) ----

  const getOfficeList = () => get("getOfficeList");
  const getUser = (userId) => get("getUser", { userId });
  const getPreviousDay = (officeId, date) => get("getPreviousDay", { officeId, date });
  const getHistory = (officeId, from, to) => get("getHistory", { officeId, from, to });
  const getDashboardData = (params) => get("getDashboardData", params);

  const submitDailyRecord = (record, session) => post("submitDailyRecord", { record, session });
  const updateDailyRecord = (record, session) => post("updateDailyRecord", { record, session });
  const syncOfflineRecord = (record, session) => post("syncOfflineRecord", { record, session });
  const login = (userId, mobile) => post("login", { userId, mobile });

  return {
    getOfficeList,
    getUser,
    getPreviousDay,
    getHistory,
    getDashboardData,
    submitDailyRecord,
    updateDailyRecord,
    syncOfflineRecord,
    login
  };
})();
