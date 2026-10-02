import { isRecord } from './types';
export interface GeneratedTitle { conversationId: string; title: string }

export function titleParser(onTitle: (title: GeneratedTitle) => void) {
  const decoder = new TextDecoder();
  let pending = '';
  let skipping = false;
  let finished = false;
  return (bytes: Uint8Array) => {
    if (finished) return;
    const text = decoder.decode(bytes, { stream: true });
    let start = 0;
    while (start < text.length) {
      const end = text.indexOf('\n', start);
      const part = text.slice(start, end < 0 ? text.length : end);
      // Ignore large message events without retaining their contents. Title
      // events are small; the cap applies even when a line spans many chunks.
      if (!skipping) {
        if (pending.length + part.length > 65_536) { pending = ''; skipping = true; }
        else pending += part;
      }
      if (end < 0) break;
      const line = pending;
      pending = '';
      const ignored = skipping;
      skipping = false;
      start = end + 1;
      if (ignored || !line.startsWith('data:') || !line.includes('title_generation')) continue;
      let event: unknown;
      try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (isRecord(event) && event.type === 'title_generation' &&
          typeof event.conversation_id === 'string' && typeof event.title === 'string' && event.title.trim()) {
        finished = true;
        onTitle({ conversationId: event.conversation_id, title: event.title });
        return;
      }
    }
  };
}

// Pull only when the page reads: there is no cloned stream or background reader.
export function observeTitle(body: ReadableStream<Uint8Array>, onTitle: (title: GeneratedTitle) => void, signal: AbortSignal) {
  let parse: ReturnType<typeof titleParser> | undefined = titleParser(onTitle);
  const stop = () => { parse = undefined; };
  signal.addEventListener('abort', stop, { once: true });
  const reader = body.getReader();
  const cleanup = () => { stop(); signal.removeEventListener('abort', stop); };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) { cleanup(); reader.releaseLock(); controller.close(); return; }
        if (!signal.aborted) parse?.(value);
        controller.enqueue(value);
      } catch (error) { cleanup(); controller.error(error); }
    },
    cancel(reason) { cleanup(); return reader.cancel(reason); },
  }, { highWaterMark: 0 });
}
