/**
 * Session state.
 * UI role information is never treated as security; the backend verifies it.
 */
const Auth = (() => {
  let currentSession = null;

  async function restoreSession() {
    currentSession = await Storage.getSession();
    return currentSession;
  }

  function getSession() {
    return currentSession;
  }

  function isLoggedIn() {
    return !!(currentSession && currentSession.userId && currentSession.token);
  }

  function hasRole(...roles) {
    return !!(currentSession && roles.includes(currentSession.role));
  }

  async function login(userId, mobile) {
    const result = await Api.login(String(userId || "").trim(), String(mobile || "").trim());

    if (!result.success) {
      throw new Error(result.message || "Login failed.");
    }

    currentSession = {
      userId: result.data.userId,
      name: result.data.name,
      role: result.data.role,
      officeId: result.data.officeId,
      officeName: result.data.officeName,
      token: result.data.token,
      expiresAt: result.data.expiresAt,
      loginAt: new Date().toISOString()
    };

    await Storage.saveSession(currentSession);
    return currentSession;
  }

  async function logout() {
    const oldSession = currentSession;

    try {
      if (oldSession && navigator.onLine) {
        await Api.logout(oldSession);
      }
    } catch (e) {
      // Local logout must still happen if network is unavailable.
    }

    currentSession = null;
    await Storage.clearSession();
  }

  return {
    restoreSession,
    getSession,
    isLoggedIn,
    hasRole,
    login,
    logout
  };
})();
