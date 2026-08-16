const Storage = (() => {
  let dbp;
  function db(){
    if(dbp)return dbp;
    dbp=new Promise((resolve,reject)=>{
      const r=indexedDB.open(CONFIG.DB_NAME,CONFIG.DB_VERSION);
      r.onupgradeneeded=()=>{const d=r.result;
        if(!d.objectStoreNames.contains(CONFIG.STORE_DRAFTS))d.createObjectStore(CONFIG.STORE_DRAFTS,{keyPath:"key"});
        if(!d.objectStoreNames.contains(CONFIG.STORE_PENDING_SYNC))d.createObjectStore(CONFIG.STORE_PENDING_SYNC,{keyPath:"id"});
        if(!d.objectStoreNames.contains(CONFIG.STORE_HISTORY_CACHE))d.createObjectStore(CONFIG.STORE_HISTORY_CACHE,{keyPath:"key"});
        if(!d.objectStoreNames.contains(CONFIG.STORE_SESSION))d.createObjectStore(CONFIG.STORE_SESSION,{keyPath:"id"});
      };
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });return dbp;
  }
  async function tx(store,mode,fn){const d=await db();return new Promise((res,rej)=>{const t=d.transaction(store,mode),s=t.objectStore(store);let out;try{out=fn(s)}catch(e){rej(e);return}t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);});}
  const key=(date,office)=>`${date}|${office}`;
  async function put(store,v){return tx(store,"readwrite",s=>s.put(v));}
  async function get(store,k){return tx(store,"readonly",s=>new Promise((r,j)=>{const q=s.get(k);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)}));}
  async function del(store,k){return tx(store,"readwrite",s=>s.delete(k));}
  return {
    saveSession:s=>put(CONFIG.STORE_SESSION,{id:"current",...s}),
    getSession:async()=>{const x=await get(CONFIG.STORE_SESSION,"current");if(x)delete x.id;return x||null},
    clearSession:()=>del(CONFIG.STORE_SESSION,"current"),
    saveDraft:(d,o,v)=>put(CONFIG.STORE_DRAFTS,{key:key(d,o),...v}),
    clearDraft:(d,o)=>del(CONFIG.STORE_DRAFTS,key(d,o)),
    queueRecord:r=>put(CONFIG.STORE_PENDING_SYNC,r),
    getPending:()=>tx(CONFIG.STORE_PENDING_SYNC,"readonly",s=>new Promise((res,rej)=>{const a=[];const q=s.openCursor();q.onsuccess=()=>{const c=q.result;if(c){a.push(c.value);c.continue()}else res(a)};q.onerror=()=>rej(q.error)})),
    removePending:id=>del(CONFIG.STORE_PENDING_SYNC,id),
    cacheHistory:(k,v)=>put(CONFIG.STORE_HISTORY_CACHE,{key:k,value:v}),
    getCachedHistory:async k=>(await get(CONFIG.STORE_HISTORY_CACHE,k))?.value||null
  };
})();
