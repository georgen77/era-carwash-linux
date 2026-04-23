const CACHE_NAME = 'era-v4';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// ─── Reminder store: persisted to IndexedDB so it survives SW restart ─────────
const DB_NAME = 'era-reminders-db';
const DB_STORE = 'reminders';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveReminder(reminder) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(reminder);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function deleteReminder(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function getAllReminders() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

// In-memory timers (rebuilt on SW restart via checkDueReminders)
const scheduledTimers = new Map();

function scheduleTimer(reminder) {
  const { id, title, message, remindAt } = reminder;
  const delay = new Date(remindAt).getTime() - Date.now();
  if (delay <= 0) {
    // Fire immediately
    fireReminder(id, title, message);
    return;
  }
  if (scheduledTimers.has(id)) clearTimeout(scheduledTimers.get(id));
  const timerId = setTimeout(() => fireReminder(id, title, message), delay);
  scheduledTimers.set(id, timerId);
}

async function fireReminder(id, title, message) {
  try {
    await self.registration.showNotification(title || '⏰ Напоминание ERA', {
      body: message || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `era-reminder-${id}`,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: { url: '/work-journal' },
      actions: [
        { action: 'open', title: '📖 Открыть' },
        { action: 'dismiss', title: '✕ Закрыть' },
      ],
    });
  } catch (err) {
    console.error('[SW] showNotification error:', err);
  }
  scheduledTimers.delete(id);
  await deleteReminder(id);
}

// On SW start: reschedule any persisted reminders
async function checkDueReminders() {
  try {
    const reminders = await getAllReminders();
    const now = Date.now();
    for (const r of reminders) {
      const t = new Date(r.remindAt).getTime();
      if (t <= now + 500) {
        // Already due
        await fireReminder(r.id, r.title, r.message);
      } else {
        scheduleTimer(r);
      }
    }
  } catch (err) {
    console.error('[SW] checkDueReminders error:', err);
  }
}

// Check on activation
self.addEventListener('activate', () => {
  checkDueReminders();
});

// Message handler
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SCHEDULE_REMINDER') {
    const { id, remindAt, title, message, delay } = event.data;
    if (!delay || delay <= 0 || delay > 30 * 24 * 60 * 60 * 1000) return;

    const reminder = { id, remindAt, title, message };

    // Persist + schedule
    event.waitUntil(
      (async () => {
        await saveReminder(reminder);
        scheduleTimer(reminder);
        event.source?.postMessage({ type: 'REMINDER_SCHEDULED', id, remindAt });
      })()
    );
  }

  if (event.data.type === 'CANCEL_REMINDER') {
    const { id } = event.data;
    if (scheduledTimers.has(id)) {
      clearTimeout(scheduledTimers.get(id));
      scheduledTimers.delete(id);
    }
    event.waitUntil(deleteReminder(id));
  }
  
  if (event.data.type === 'PING') {
    // Keep-alive ping from the app
    event.source?.postMessage({ type: 'PONG' });
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/work-journal';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Push event (server-sent pushes)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || '⏰ Напоминание ERA', {
        body: data.message || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: `era-push-${Date.now()}`,
        requireInteraction: true,
        vibrate: [200, 100, 200],
        data: { url: data.url || '/work-journal' },
      })
    );
  } catch { /* ignore */ }
});
