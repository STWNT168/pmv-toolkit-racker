const AdminDashboardApi = (() => {
  async function getUpdateStatus(date) {
    const response = await Api.get("getAdminTodayUpdateStatus", { date });
    if (!response || !response.success) {
      throw new Error((response && response.message) || "Could not load Admin dashboard.");
    }
    return response.data || {};
  }

  async function getOfficeWiseReport(date) {
    const response = await Api.get("getOfficeWiseReport", { date });
    if (!response || !response.success) {
      throw new Error((response && response.message) || "Could not load office-wise report.");
    }
    return response.data || {};
  }

  return { getUpdateStatus, getOfficeWiseReport };
})();
