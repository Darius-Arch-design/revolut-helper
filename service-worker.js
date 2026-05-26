// service-worker.js
// Poboljšani Service Worker za SEPA Scan for Revolut PWA
// Verzija: v1.1 (dodan cache busting, više fajlova, bolja strategija)

const CACHE_NAME = 'sepa-scan-cache-v1.1';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icon-192.png'
  // Dodaj ovdje dodatne ikone ili druge statičke fajlove ako ih imaš (npr. /icon-512.png)
];

// Instalacija – cacheiraj sve navedene fajlove
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Aktivacija – ukloni stare cache-ove
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch – Cache First strategija (offline-first)
self.addEventListener('fetch', event => {
  // Preskoči ne-cacheable zahtjeve (npr. Chrome extension ili analytics)
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Vraćaj iz cache-a ako postoji
          return cachedResponse;
        }

        // Inače dohvati s mreže i cacheiraj
        return fetch(event.request)
          .then(networkResponse => {
            // Cacheiraj samo uspješne GET zahtjeve
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline fallback (ako trebaš – možeš dodati custom offline stranicu kasnije)
            return new Response('Offline – aplikacija radi bez interneta za većinu funkcija.', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// Opcionalno: omogući update bez reload-a (za buduće verzije)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
