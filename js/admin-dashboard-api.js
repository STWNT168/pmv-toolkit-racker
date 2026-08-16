const AdminDashboardApi = (() => {
  async function getUpdateStatus(date) {
    const response = await Api.get("getAdminTodayUpdateStatus", { date });
    if (!response || !response.success) {
      throw new Error((response && response.message) || "Could not load Admin dashboard.");
    }
    return response.data || {};
  }
  return { getUpdateStatus };
})();
