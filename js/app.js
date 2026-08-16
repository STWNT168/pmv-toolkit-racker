(async function(){
  if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
  try{await Auth.restoreSession()}catch(e){console.error(e)}
  if(Auth.isLoggedIn())renderLoggedInShell();else showView("view-login");
  bindLogin();bindNav();Sync.init(updateConnectivity);
})();
let initializedEntry=false,initializedDash=false;
function bindLogin(){document.getElementById("login-form").addEventListener("submit",async e=>{e.preventDefault();const b=document.getElementById("login-submit");b.disabled=true;try{await Auth.login(document.getElementById("login-user-id").value,document.getElementById("login-mobile").value);renderLoggedInShell()}catch(x){UI.toast(x.message||"Login failed","error")}finally{b.disabled=false}})}
function bindNav(){document.getElementById("nav-logout").onclick=async()=>{await Auth.logout();location.reload()}}
function renderLoggedInShell(){const s=Auth.getSession();if(!s)return;document.getElementById("app-shell").classList.remove("hidden");document.getElementById("nav-user-name").textContent=s.name||s.userId;document.getElementById("nav-user-role").textContent=s.role;const field=s.role===CONFIG.ROLES.SPM,report=s.role===CONFIG.ROLES.DPS||s.role===CONFIG.ROLES.ADMIN;document.getElementById("nav-btn-entry").classList.toggle("hidden",!field&&!report);document.getElementById("nav-btn-dashboard").classList.toggle("hidden",!report);document.getElementById("nav-btn-entry").onclick=()=>switchScreen("entry");document.getElementById("nav-btn-dashboard").onclick=()=>switchScreen("dashboard");switchScreen(field?"entry":"dashboard");showView("view-app")}
function switchScreen(name){document.getElementById("screen-entry").classList.toggle("hidden",name!=="entry");document.getElementById("screen-dashboard").classList.toggle("hidden",name!=="dashboard");if(name==="entry"&&!initializedEntry){initializedEntry=true;SPM.init().catch(e=>{initializedEntry=false;UI.toast(e.message||"Daily Entry error","error")})}if(name==="dashboard"&&!initializedDash){initializedDash=true;AdminDashboard.init()}}
function showView(id){for(const x of ["view-login","view-app"])document.getElementById(x).classList.toggle("hidden",x!==id)}
function updateConnectivity({online}){const b=document.getElementById("connectivity-badge");if(b){b.textContent=online?"Online":"OFFLINE";b.className=online?"connectivity-badge online":"connectivity-badge offline"}}
