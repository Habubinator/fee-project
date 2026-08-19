importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Config is injected by the dashboard at registration time via a query string.
// The SW reads it from its own URL on activate.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'FIREBASE_CONFIG') {
        firebase.initializeApp(event.data.config);
        firebase.messaging();
    }
});

// Background message handler — shows notification when app is not in focus
self.addEventListener('push', (event) => {
    if (!event.data) return;
    try {
        const payload = event.data.json();
        const title   = payload.notification?.title ?? 'App';
        const body    = payload.notification?.body  ?? '';
        event.waitUntil(
            self.registration.showNotification(title, { body, icon: '/favicon.svg' })
        );
    } catch {
        // non-JSON push
    }
});
