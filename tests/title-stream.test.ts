import test from 'node:test';
import assert from 'node:assert/strict';
import { observeTitle, titleParser, type GeneratedTitle } from '../src/title-stream';

test('parser skips oversized messages and finds a Unicode title split across chunks', () => {
  const titles: GeneratedTitle[] = [];
  const parse = titleParser(title => titles.push(title));
  for (let i = 0; i < 100; i++) parse(new TextEncoder().encode('x'.repeat(65536)));
  parse(new TextEncoder().encode('\n'));
  const event = new TextEncoder().encode('data: {"type":"title_generation","conversation_id":"id","title":"Café ⎇"}\n');
  for (const byte of event) parse(Uint8Array.of(byte));
  assert.deepEqual(titles, [{ conversationId: 'id', title: 'Café ⎇' }]);
});

test('observer does not read ahead; cancellation removes observation without stopping page reads', async () => {
  let pulls = 0;
  const signal = new AbortController();
  const bytes = new TextEncoder().encode('data: {"type":"title_generation","conversation_id":"id","title":"Title"}\n');
  const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(bytes); } }, { highWaterMark: 0 });
  let events = 0;
  const observed = observeTitle(body, () => events++, signal.signal);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(pulls, 0);
  signal.abort();
  const reader = observed.getReader();
  assert.deepEqual((await reader.read()).value, bytes);
  assert.equal(pulls, 1);
  assert.equal(events, 0);
  await reader.cancel();
});
