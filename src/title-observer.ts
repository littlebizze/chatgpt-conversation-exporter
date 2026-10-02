import { observeTitle } from './title-stream';
declare global { interface Window { forkTitleObserverInstalled?: boolean } }

// Only the newly created branch tab receives this MAIN-world script.
if (!window.forkTitleObserverInstalled) {
  window.forkTitleObserverInstalled = true;
  const original = window.fetch;
  const controller = new AbortController();
  const stop = () => {
    controller.abort();
    if (window.fetch === wrapped) window.fetch = original;
    window.removeEventListener('message', onMessage);
    window.removeEventListener('pagehide', stop);
    clearTimeout(timer);
    window.forkTitleObserverInstalled = false;
  };
  const onMessage = (event: MessageEvent) => {
    if (event.source === window && event.origin === location.origin && event.data?.type === 'fork-title-stop') stop();
  };
  const wrapped: typeof fetch = async (...args) => {
    const response = await original.apply(window, args);
    const url = new URL(args[0] instanceof Request ? args[0].url : String(args[0]), location.href);
    if (!controller.signal.aborted && url.origin === location.origin &&
        /^\/backend-api\/(?:f\/)?conversation$/.test(url.pathname) && response.ok && response.body &&
        response.headers.get('content-type')?.includes('text/event-stream')) {
      const body = observeTitle(response.body, title => {
        if (!controller.signal.aborted) window.postMessage({ type: 'fork-generated-title', ...title }, location.origin);
        stop();
      }, controller.signal);
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    return response;
  };
  const timer = setTimeout(stop, 10 * 60_000);
  window.addEventListener('message', onMessage);
  window.addEventListener('pagehide', stop, { once: true });
  window.fetch = wrapped;
}
