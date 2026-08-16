const AdminDashboardApi = {
  getUpdateStatus: async date => {
    const r = await Api.getAdminTodayUpdateStatus(date);
    if (!r.success) throw new Error(r.message || "Could not load dashboard.");
    return r.data || {};
  }
};
