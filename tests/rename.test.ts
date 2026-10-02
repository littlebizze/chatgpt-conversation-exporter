import test from 'node:test';
import assert from 'node:assert/strict';
import { renameChat } from '../src/rename';

test('rename uses the dedicated POST route and stops on rate limiting', async context => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(url, 'https://chatgpt.com/backend-api/conversation/id/chat-id/rename');
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'include');
    assert.deepEqual(JSON.parse(init.body as string), { title: '⎇ 2 - Plan' });
    return new Response('', { status: calls === 1 ? 200 : 429 });
  });
  await renameChat('chat-id', '⎇ 2 - Plan', 'test-token', new AbortController().signal);
  await assert.rejects(renameChat('chat-id', '⎇ 2 - Plan', 'test-token', new AbortController().signal), /limiting requests/);
  assert.equal(calls, 2);
});
