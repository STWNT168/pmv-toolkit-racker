/**
 * app.js
 * Application entry point: registers the service worker, restores session,
 * and routes between the login screen, SPM entry screen, and DPS dashboard
 * based on the logged-in user's role.
 */

(async function bootstrap() {
  registerServiceWorker();
  initSyncStatusUI();

  await Auth.restoreSession();

  if (Auth.isLoggedIn()) {
    renderLoggedInShell();
  } else {
    showView("view-login");
  }

  bindLoginForm();
  bindNav();

  Sync.init(updateConnectivityBadge);
})();

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        // Non-fatal: app still works online without offline caching
      });
    });
  }
}

function bindLoginForm() {
  const form = document.getElementById("login-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = document.getElementById("login-user-id").value;
    const mobile = document.getElementById("login-mobile").value;
    const btn = document.getElementById("login-submit");
    btn.disabled = true;
    btn.textContent = "Signing in...";

    try {
      await Auth.login(userId, mobile);
      UI.toast("Signed in successfully.", "success");
      renderLoggedInShell();
    } catch (err) {
      UI.toast(err.message || "Login failed. Check your User ID and mobile number.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "SIGN IN";
    }
  });
}

function bindNav() {
  document.getElementById("nav-logout").addEventListener("click", async () => {
    await Auth.logout();
    location.reload();
  });
}

function renderLoggedInShell() {
  const session = Auth.getSession();
  document.getElementById("nav-user-name").textContent = session.name;
  document.getElementById("nav-user-role").textContent = session.role;
  document.getElementById("app-shell").classList.remove("hidden");

  const isFieldRole = session.role === CONFIG.ROLES.SPM;
  const isReportingRole = session.role === CONFIG.ROLES.DPS || session.role === CONFIG.ROLES.ADMIN;

  document.getElementById("nav-btn-entry").classList.toggle("hidden", !isFieldRole && !isReportingRole);
  document.getElementById("nav-btn-dashboard").classList.toggle("hidden", !isReportingRole);

  document.getElementById("nav-btn-entry").addEventListener("click", () => switchScreen("entry"));
  document.getElementById("nav-btn-dashboard").addEventListener("click", () => switchScreen("dashboard"));

  if (isFieldRole) {
    switchScreen("entry");
  } else {
    switchScreen("dashboard");
  }

  showView("view-app");
}

let spmInitialized = false;
let dashboardInitialized = false;

function switchScreen(name) {
  document.getElementById("screen-entry").classList.toggle("hidden", name !== "entry");
  document.getElementById("screen-dashboard").classList.toggle("hidden", name !== "dashboard");

  document.getElementById("nav-btn-entry").classList.toggle("active", name === "entry");
  document.getElementById("nav-btn-dashboard").classList.toggle("active", name === "dashboard");

  if (name === "entry" && !spmInitialized) {
    spmInitialized = true;
    SPM.init();
  }
  if (name === "dashboard" && !dashboardInitialized) {
    dashboardInitialized = true;
    Dashboard.init();
  }
}

function showView(id) {
  ["view-login", "view-app"].forEach(v => document.getElementById(v).classList.toggle("hidden", v !== id));
}

function initSyncStatusUI() {
  updateConnectivityBadge({ online: navigator.onLine, pendingCount: 0 });
}

function updateConnectivityBadge({ online, syncing, pendingCount }) {
  const badge = document.getElementById("connectivity-badge");
  if (!badge) return;
  if (!online) {
    badge.textContent = "OFFLINE";
    badge.className = "connectivity-badge offline";
  } else if (syncing) {
    badge.textContent = "Syncing...";
    badge.className = "connectivity-badge syncing";
  } else if (pendingCount > 0) {
    badge.textContent = `${pendingCount} pending sync`;
    badge.className = "connectivity-badge pending";
  } else {
    badge.textContent = "Online";
    badge.className = "connectivity-badge online";
  }
}
