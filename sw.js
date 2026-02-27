importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCZpIknDfy3KsV-XtPCkU9s0jDjd9o7nD8",
  authDomain: "conalep-chihuahua.firebaseapp.com",
  databaseURL: "https://conalep-chihuahua-default-rtdb.firebaseio.com",
  projectId: "conalep-chihuahua",
  storageBucket: "conalep-chihuahua.firebasestorage.app",
  messagingSenderId: "848130047778",
  appId: "1:848130047778:web:c7cef212c226d08806ef7b"
});

const messaging = firebase.messaging();

const CACHE = 'conalep-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (url.origin !== location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
      )
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

messaging.onBackgroundMessage(payload => {
  self.registration.showNotification(
    payload.notification?.title ?? 'CONALEP',
    {
      body: payload.notification?.body ?? '',
      icon: 'https://raw.githubusercontent.com/conalepchihuahua/Plantel-CONALEP-207.-Ciudad-Juarez-ll/refs/heads/main/Chihuahua/Logotipos%20del%20Estado/favicon-96x96.png'
    }
  );
});
