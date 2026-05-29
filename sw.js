const CACHE='eland-cro-v2';
const STATIC=[
  './',
  './index.html',
  './login.html',
  './style.css',
  './app.js',
  './favicon.svg',
  './manifest.json'
];

self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e=>{
  if(e.request.method!=='GET') return;
  const url=new URL(e.request.url);

  // Supabase, CDN, Anthropic 등 외부/동적 요청은 기본 동작 (네트워크)
  if(url.origin!==location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached=>{
      if(cached){
        // 백그라운드에서 최신본 갱신 (stale-while-revalidate)
        fetch(e.request).then(resp=>{
          if(resp && resp.status===200){
            const clone=resp.clone();
            caches.open(CACHE).then(c=>c.put(e.request, clone));
          }
        }).catch(()=>{});
        return cached;
      }
      return fetch(e.request).then(resp=>{
        if(resp && resp.status===200){
          const clone=resp.clone();
          caches.open(CACHE).then(c=>c.put(e.request, clone));
        }
        return resp;
      }).catch(()=>caches.match('./index.html'));
    })
  );
});
