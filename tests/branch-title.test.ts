import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBranchTitle, findBranchTitle } from '../src/branch-title';

test('branch numbering uses the highest exact match and removes an existing prefix', () => {
  assert.equal(nextBranchTitle('Plan', []), '⎇ 1 - Plan');
  assert.equal(nextBranchTitle('⎇ 3 - Plan', [
    '⎇ 7 - Plan', '⎇ 6 - Plan', '⎇ 5 - Plan', '⎇ 50 - Plans', '⎇ 0 - Plan', '⎇ 04 - Plan',
  ]), '⎇ 8 - Plan');
});

test('title search uses ChatGPT search before the full conversation list', async context => {
  const urls: string[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url);
    return Response.json({ items: [{ title: '⎇ 12 - Plan' }, { title: 'Other' }], cursor: null });
  });
  assert.equal(await findBranchTitle('Plan', 'token'), '⎇ 13 - Plan');
  assert.equal(urls.length, 1);
  assert.ok(urls[0]?.includes('/backend-api/conversations/search?'));
});

test('rate limiting stops title lookup without retries or a history scan', async context => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response('{"detail":"Too many requests"}', { status: 429 });
  });
  await assert.rejects(findBranchTitle('Plan', 'token'), /limiting requests/);
  assert.equal(calls, 1);
});

test('a second branch advances even when search has not indexed the first rename', async context => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ items: [{ title: 'Plan' }] }));
  assert.equal(await findBranchTitle('Plan', 'token', undefined, ['⎇ 1 - Plan']), '⎇ 2 - Plan');
});
