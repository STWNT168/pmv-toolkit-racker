/**
 * Apps Script API wrapper.
 * GET requests now include the authenticated session as JSON.
 * POST requests use text/plain to avoid Apps Script CORS preflight.
 */
const Api = (() => {
  async function get(action, params = {}) {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set("action", action);

    const session = Auth.getSession();
    if (session) params = { ...params, session: JSON.stringify(session) };

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
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

  const getOfficeList = () => get("getOfficeList");
  const getUser = userId => get("getUser", { userId });
  const getPreviousDay = (officeId, date) => get("getPreviousDay", { officeId, date });
  const getHistory = (officeId, from, to) => get("getHistory", { officeId, from, to });
  const getDashboardData = params => get("getDashboardData", params || {});

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
