/**
 * app.js
 * Application bootstrap, login/session restore, navigation and screen startup.
 */
(async function bootstrap() {
  registerServiceWorker();
  initSyncStatusUI();

  try { await Auth.restoreSession(); }
  catch (e) { console.error("Session restore failed:", e); UI.toast("Could not restore your session. Please sign in again.", "warning"); }

  if (Auth.isLoggedIn()) renderLoggedInShell();
  else showView("view-login");

  bindLoginForm();
  bindNav();
  Sync.init(updateConnectivityBadge);
})();

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
}

function bindLoginForm() {
  const form = document.getElementById("login-form");
  if (!form) return;
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const userId = document.getElementById("login-user-id").value.trim();
    const mobile = document.getElementById("login-mobile").value.trim();
    const btn = document.getElementById("login-submit");
    btn.disabled = true; btn.textContent = "Signing in...";
    try { await Auth.login(userId,mobile); UI.toast("Signed in successfully.","success"); renderLoggedInShell(); }
    catch(err){ UI.toast(err.message || "Login failed. Check your User ID and mobile number.","error"); }
    finally { btn.disabled=false; btn.textContent="SIGN IN"; }
  });
}

function bindNav() {
  const logoutBtn = document.getElementById("nav-logout");
  if (!logoutBtn) return;
  logoutBtn.addEventListener("click", async () => { await Auth.logout(); location.reload(); });
}

function renderLoggedInShell() {
  const session = Auth.getSession();
  if (!session) { showView("view-login"); return; }

  const nameEl=document.getElementById("nav-user-name");
  const roleEl=document.getElementById("nav-user-role");
  const shell=document.getElementById("app-shell");
  if(nameEl) nameEl.textContent=session.name||session.userId||"User";
  if(roleEl) roleEl.textContent=session.role||"—";
  if(shell) shell.classList.remove("hidden");

  const isFieldRole=session.role===CONFIG.ROLES.SPM;
  const isReportingRole=session.role===CONFIG.ROLES.DPS||session.role===CONFIG.ROLES.ADMIN;
  const entryBtn=document.getElementById("nav-btn-entry");
  const dashboardBtn=document.getElementById("nav-btn-dashboard");
  if(entryBtn) entryBtn.classList.toggle("hidden",!isFieldRole&&!isReportingRole);
  if(dashboardBtn) dashboardBtn.classList.toggle("hidden",!isReportingRole);

  bindScreenButtonsOnce();

  if(isFieldRole) switchScreen("entry");
  else if(isReportingRole) switchScreen("dashboard");
  else { UI.toast("Invalid role in your session. Contact the administrator.","error"); Auth.logout(); showView("view-login"); return; }

  showView("view-app");
}

let spmInitialized=false;
let dashboardInitialized=false;
let screenButtonsBound=false;

function bindScreenButtonsOnce(){
  if(screenButtonsBound) return;
  const entryBtn=document.getElementById("nav-btn-entry");
  const dashboardBtn=document.getElementById("nav-btn-dashboard");
  if(entryBtn) entryBtn.addEventListener("click",()=>switchScreen("entry"));
  if(dashboardBtn) dashboardBtn.addEventListener("click",()=>switchScreen("dashboard"));
  screenButtonsBound=true;
}

function switchScreen(name){
  const entry=document.getElementById("screen-entry");
  const dashboard=document.getElementById("screen-dashboard");
  const entryBtn=document.getElementById("nav-btn-entry");
  const dashboardBtn=document.getElementById("nav-btn-dashboard");
  if(entry) entry.classList.toggle("hidden",name!=="entry");
  if(dashboard) dashboard.classList.toggle("hidden",name!=="dashboard");
  if(entryBtn) entryBtn.classList.toggle("active",name==="entry");
  if(dashboardBtn) dashboardBtn.classList.toggle("active",name==="dashboard");

  if(name==="entry"&&!spmInitialized){
    spmInitialized=true;
    Promise.resolve(SPM.init()).catch(err=>{spmInitialized=false;console.error("SPM initialization error:",err);UI.toast("Daily Entry error: "+getAppErrorMessage(err),"error");});
  }

  if(name==="dashboard"&&!dashboardInitialized){
    dashboardInitialized=true;
    try { if(typeof AdminDashboard!=="undefined") AdminDashboard.init(); } catch(e) { console.error("Admin dashboard init:",e); }
    Promise.resolve(Dashboard.init()).catch(err=>{dashboardInitialized=false;console.error("Dashboard initialization error:",err);UI.toast("Dashboard error: "+getAppErrorMessage(err),"error");});
  }
}

function getAppErrorMessage(err){if(!err)return"Unknown error.";if(typeof err==="string")return err;return err.message||String(err);}
function showView(id){["view-login","view-app"].forEach(viewId=>{const el=document.getElementById(viewId);if(el)el.classList.toggle("hidden",viewId!==id);});}
function initSyncStatusUI(){updateConnectivityBadge({online:navigator.onLine,syncing:false,pendingCount:0});}
function updateConnectivityBadge({online,syncing,pendingCount}){
  const badge=document.getElementById("connectivity-badge"); if(!badge)return;
  if(!online){badge.textContent="OFFLINE";badge.className="connectivity-badge offline";}
  else if(syncing){badge.textContent="Syncing...";badge.className="connectivity-badge syncing";}
  else if(pendingCount>0){badge.textContent=`${pendingCount} pending sync`;badge.className="connectivity-badge pending";}
  else{badge.textContent="Online";badge.className="connectivity-badge online";}
}
