'use client';

import { useEffect } from 'react';

export default function MswInit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    (async () => {
      try {
        // Ensure service worker file exists to avoid runtime errors
        const swUrl = '/mockServiceWorker.js';
        try {
          const res = await fetch(swUrl, { method: 'HEAD' });
          if (!res.ok) {
            // eslint-disable-next-line no-console
            console.warn('[MSW] mockServiceWorker.js not found. Run: npx msw init public --save');
            return;
          }
        } catch {
          // eslint-disable-next-line no-console
          console.warn('[MSW] mockServiceWorker.js not reachable. Run: npx msw init public --save');
          return;
        }

        const { startBrowserMsw } = await import('@/mocks');
        await startBrowserMsw();
        // eslint-disable-next-line no-console
        console.log('[MSW] worker started');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[MSW] failed to start', e);
      }
    })();
  }, []);
  return null;
}


