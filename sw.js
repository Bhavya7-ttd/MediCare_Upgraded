// MediCare Service Worker - PWA Offline Shell & Push Notifications
const CACHE_NAME = "medicare-cache-v6";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./404.html",
  "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap",
  "https://cdn.jsdelivr.net/npm/chart.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
];

// Install Event - Precache app shell
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("[Service Worker] Precaching app shell & assets");
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn("[Service Worker] Non-critical cache warning:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log("[Service Worker] Clearing old cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event (Network First for app assets, with Cache Fallback)
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || event.request.url.startsWith("chrome-extension://")) {
    return;
  }

  // Bypass cache for Firestore, Firebase Auth, Functions, and Gemini REST API
  if (
    event.request.url.includes("firestore.googleapis.com") ||
    event.request.url.includes("identitytoolkit.googleapis.com") ||
    event.request.url.includes("cloudfunctions.net") ||
    event.request.url.includes("generativelanguage.googleapis.com")
  ) {
    return;
  }

  // Network-First for core application files (index.html, script.js, style.css)
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("./index.html");
          }
        });
      })
  );
});


// Handle Background Push Notifications from FCM / Cloud Functions
self.addEventListener("push", event => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: "MediCare Notification", body: event.data.text() };
    }
  }

  const title = data.notification?.title || data.title || "💊 MediCare Reminder";
  const options = {
    body: data.notification?.body || data.body || "You have a new healthcare notification.",
    icon: "https://cdn-icons-png.flaticon.com/512/3004/3004458.png",
    badge: "https://cdn-icons-png.flaticon.com/512/3004/3004458.png",
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: [
      { action: "open", title: "Open App" },
      { action: "close", title: "Dismiss" }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click Event
self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "close") return;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        if (client.url.includes("index.html") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("./index.html");
      }
    })
  );
});
