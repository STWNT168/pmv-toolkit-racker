const Sync=(()=>{let timer;
async function process(){if(!navigator.onLine)return;for(const r of await Storage.getPending()){try{const x=await Api.syncOfflineRecord(r,Auth.getSession());if(x.success||x.code==="DUPLICATE")await Storage.removePending(r.id)}catch{}}}
function init(cb){const update=()=>cb?.({online:navigator.onLine,syncing:false,pendingCount:0});window.addEventListener("online",()=>{update();process()});window.addEventListener("offline",update);update();clearInterval(timer);timer=setInterval(process,CONFIG.SYNC_RETRY_INTERVAL_MS);}
return{init,process};})();
