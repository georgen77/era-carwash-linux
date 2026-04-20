const CACHE_NAME = 'share-target-cache-v1';
const SHARED_IMAGE_KEY = 'shared-image';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle POST to /share-target from Web Share Target API
  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const mediaFile = formData.get('media');

          if (mediaFile && mediaFile instanceof File) {
            const cache = await caches.open(CACHE_NAME);
            // Store the image file as a Response in Cache API
            const response = new Response(mediaFile, {
              headers: { 'Content-Type': mediaFile.type }
            });
            await cache.put(SHARED_IMAGE_KEY, response);
          }

          // Also store text/title if present
          const text = formData.get('text');
          const title = formData.get('title');
          if (text || title) {
            const cache = await caches.open(CACHE_NAME);
            const meta = JSON.stringify({ text: text || '', title: title || '' });
            await cache.put('shared-meta', new Response(meta, {
              headers: { 'Content-Type': 'application/json' }
            }));
          }
        } catch (err) {
          console.error('[SW] Error handling share target:', err);
        }

        // Redirect to the share target page as GET
        return Response.redirect('/share-target', 303);
      })()
    );
    return;
  }

  // Pass through all other requests
  event.respondWith(fetch(event.request));
});
