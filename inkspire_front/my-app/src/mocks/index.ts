export async function startBrowserMsw() {
  if (typeof window === 'undefined') return;
  const { worker } = await import('./browser');
  
  // Load real scaffold data before starting worker
  // This ensures the data is available when handlers are called
  try {
    // Import handlers to trigger the loadRealScaffolds() call
    await import('./handlers');
    console.log('[MSW] Real scaffold data loaded');
  } catch (error) {
    console.warn('[MSW] Failed to load handlers:', error);
  }
  
  await worker.start({
    serviceWorker: { url: '/mockServiceWorker.js' },
    onUnhandledRequest: (request: Request) => {
      // Log unhandled requests for debugging
      console.warn('[MSW] Unhandled request:', request.method, request.url);
      // Use 'bypass' to let requests through if not handled
      return;
    },
  });
  const handlerCount = worker.listHandlers().length;
  console.log('[MSW] Worker started successfully. Handlers registered:', handlerCount);
  
  // Log all registered handlers for debugging
  const handlers = worker.listHandlers();
  console.log('[MSW] Registered handlers:', handlers.map((h: any) => {
    const info = h.info || {};
    return `${info.method || '?'} ${info.path || '?'}`;
  }).slice(0, 10)); // Log first 10 handlers
}


