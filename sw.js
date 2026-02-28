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

const ICON = 'https://raw.githubusercontent.com/conalepchihuahua/Plantel-CONALEP-207.-Ciudad-Juarez-ll/refs/heads/main/Chihuahua/Logotipos%20del%20Estado/favicon-96x96.png';
const CACHE = 'conalep-v2';

/* ── Ciclo de vida ── */
self.addEventListener('install', e => {
  console.log('[SW] install');
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  console.log('[SW] activate');
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch (cache) ── */
self.addEventListener('fetch', e => {
  // No interceptar peticiones FCM/googleapis internas
  const url = new URL(e.request.url);
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('gstatic.com')) return;

  if (url.origin !== location.origin) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

/* ── Push en background (Firebase SDK) ── */
messaging.onBackgroundMessage(payload => {
  console.log('[SW] onBackgroundMessage recibido:', JSON.stringify(payload));

  const title = payload.notification?.title
    ?? payload.data?.title
    ?? 'CONALEP Plantel 207';

  const body = payload.notification?.body
    ?? payload.data?.body
    ?? '';

  self.registration.showNotification(title, {
    body,
    icon: ICON,
    badge: ICON,
    data: payload.data ?? {}
  });
});

/* ── Fallback: push crudo (por si Firebase SDK no intercepta) ── */
self.addEventListener('push', e => {
  console.log('[SW] push event raw:', e.data?.text());

  // Si Firebase SDK ya lo manejó, no duplicar
  if (!e.data) return;

  let payload = {};
  try { payload = e.data.json(); } catch {}

  // Solo mostrar si el SDK de Firebase NO lo mostró ya
  // (El SDK lo muestra automáticamente si onBackgroundMessage está definido)
  // Este bloque es solo para mensajes tipo "data-only" sin notification
  if (!payload.notification && payload.data) {
    const title = payload.data.title ?? 'CONALEP Plantel 207';
    const body  = payload.data.body ?? '';
    e.waitUntil(
      self.registration.showNotification(title, { body, icon: ICON })
    );
  }
});

/* ── Clic en notificación ── */
self.addEventListener('notificationclick', e => {
  console.log('[SW] notificationclick');
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('conalepchihuahua.github.io') && 'focus' in client)
          return client.focus();
      }
      if (clients.openWindow)
        return clients.openWindow('https://conalepchihuahua.github.io/Plantel-CONALEP-207.-Ciudad-Juarez-ll/');
    })
  );
});