/**
 * api.js replacement for V5.0.4
 * Adds the two SPM current-day endpoints directly to Api.
 */
const Api = (() => {
  async function get(action, params = {}) {
    if (!CONFIG.API_URL) throw new Error("CONFIG.API_URL is not configured.");
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set("action", action);
    const session = Auth.getSession();
    if (session) params = { ...params, session: JSON.stringify(session) };
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    });
    const res = await fetch(url.toString(), { method:"GET", cache:"no-store" });
    return parseResponse(res);
  }

  async function post(action, payload = {}) {
    if (!CONFIG.API_URL) throw new Error("CONFIG.API_URL is not configured.");
    const body = { action, ...payload };
    if (action !== "login" && !body.session) {
      const session = Auth.getSession();
      if (session) body.session = session;
    }
    const res = await fetch(CONFIG.API_URL, {
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify(body),
      cache:"no-store"
    });
    return parseResponse(res);
  }

  async function parseResponse(res) {
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); }
    catch(e) { throw new Error("Server returned a non-JSON response (HTTP " + res.status + "). Check Apps Script deployment."); }
    if (!body || typeof body.success === "undefined") throw new Error("Malformed server response from Apps Script.");
    return body;
  }

  const getOfficeList = () => get("getOfficeList");
  const getUser = userId => get("getUser", { userId });
  const getPreviousDay = (officeId, date) => get("getPreviousDay", { officeId, date });
  const getHistory = (officeId, from, to) => get("getHistory", { officeId, from, to });
  const getDashboardData = params => get("getDashboardData", params || {});
  const getAdminTodayUpdateStatus = date => get("getAdminTodayUpdateStatus", { date });
  const getOwnTodayRecord = () => get("getOwnTodayRecord");
  const deleteOwnTodayRecord = (recordId) => post("deleteOwnTodayRecord", { recordId });

  const submitDailyRecord = (record, session) => post("submitDailyRecord", { record, session });
  const syncOfflineRecord = (record, session) => post("syncOfflineRecord", { record, session });
  const updateDailyRecord = (record, session) => post("updateDailyRecord", { record, session });
  const login = (userId, mobile) => post("login", { userId, mobile });
  const logout = session => post("logout", { session });

  return {
    getOfficeList, getUser, getPreviousDay, getHistory, getDashboardData,
    getAdminTodayUpdateStatus, getOwnTodayRecord, deleteOwnTodayRecord,
    submitDailyRecord, syncOfflineRecord, updateDailyRecord, login, logout, get, post
  };
})();
