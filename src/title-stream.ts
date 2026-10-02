import { isRecord } from './types';

export interface GeneratedTitle { conversationId: string; title: string }

// SSE lines can span network chunks, including the bytes of a Unicode title.
export async function readGeneratedTitle(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<GeneratedTitle | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) return null;
      pending += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end).trimEnd();
        pending = pending.slice(end + 1);
        if (!line.startsWith('data:')) continue;
        let event: unknown;
        try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (isRecord(event) && event.type === 'title_generation' &&
            typeof event.conversation_id === 'string' && typeof event.title === 'string' && event.title.trim()) {
          return { conversationId: event.conversation_id, title: event.title };
        }
      }
      if (pending.length > 2 * 1024 * 1024) throw new Error('Unexpected conversation stream format.');
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    // Cancel only our cloned branch. Never wait for or cancel ChatGPT's reader.
    cancel();
  }
}
