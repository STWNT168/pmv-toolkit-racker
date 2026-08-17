const CACHE="pmv-toolkit-v5.0.7";
const ASSETS=[
  "./","./index.html","./manifest.json",
  "./css/style.css","./css/admin-dashboard.css","./css/spm-notification.css",
  "./js/config.js","./js/calculations.js","./js/validation.js","./js/storage.js",
  "./js/api.js","./js/auth.js","./js/sync.js","./js/ui.js","./js/spm.js",
  "./js/admin-dashboard-api.js","./js/admin-dashboard.js"
];

self.addEventListener("install",e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())
));

self.addEventListener("activate",e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(
    keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim())
));

self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;

  e.respondWith(
    fetch(e.request).then(r=>{
      const copy=r.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy));
      return r;
    }).catch(()=>caches.match(e.request))
  );
});
