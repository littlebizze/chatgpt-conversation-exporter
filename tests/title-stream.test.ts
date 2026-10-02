import test from 'node:test';
import assert from 'node:assert/strict';
import { readGeneratedTitle } from '../src/title-stream';

test('recognizes the title event across UTF-8 and SSE chunk boundaries', async () => {
  const bytes = new TextEncoder().encode('data: {"type":"message_stream_complete"}\r\n\r\ndata: {"type":"title_generation","conversation_id":"chat-1","title":"Café ⎇"}\r\n\r\n');
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); },
    cancel() { canceled = true; },
  });
  assert.deepEqual(await readGeneratedTitle(body, new AbortController().signal), { conversationId: 'chat-1', title: 'Café ⎇' });
  assert.equal(canceled, true);
});

test('cancel interrupts a stalled title stream', async () => {
  const controller = new AbortController();
  const pending = readGeneratedTitle(new ReadableStream(), controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
