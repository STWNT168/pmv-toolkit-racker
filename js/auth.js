/**
 * auth.js
 * Handles login and session state. Frontend role info is ONLY used to
 * decide what UI to show — the backend independently re-checks role and
 * office ownership on every request, since frontend claims can't be trusted.
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
    return !!(currentSession && currentSession.userId);
  }

  function hasRole(...roles) {
    return currentSession && roles.includes(currentSession.role);
  }

  async function login(userId, mobile) {
    const result = await Api.login(userId.trim(), mobile.trim());
    if (!result.success) {
      throw new Error(result.message || "Login failed.");
    }
    currentSession = {
      userId: result.data.userId,
      name: result.data.name,
      role: result.data.role,
      officeId: result.data.officeId,
      officeName: result.data.officeName,
      token: result.data.token, // opaque session token issued by backend
      loginAt: new Date().toISOString()
    };
    await Storage.saveSession(currentSession);
    return currentSession;
  }

  async function logout() {
    currentSession = null;
    await Storage.clearSession();
  }

  return { restoreSession, getSession, isLoggedIn, hasRole, login, logout };
})();
