const Auth = (() => {
  let currentSession=null;
  async function restoreSession(){currentSession=await Storage.getSession();return currentSession;}
  function getSession(){return currentSession;}
  function setSession(s){currentSession=s;return Storage.saveSession(s);}
  function isLoggedIn(){return !!(currentSession?.userId&&currentSession?.token);}
  async function login(userId,mobile){
    const r=await Api.login(String(userId||"").trim(),String(mobile||"").trim());
    if(!r.success)throw new Error(r.message||"Login failed.");
    currentSession={...r.data,loginAt:new Date().toISOString()};
    await Storage.saveSession(currentSession);return currentSession;
  }
  async function logout(){try{if(currentSession&&navigator.onLine)await Api.logout(currentSession)}catch{}currentSession=null;await Storage.clearSession();}
  return {restoreSession,getSession,setSession,isLoggedIn,login,logout};
})();
