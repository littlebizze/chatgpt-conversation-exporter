import test from 'node:test';
import assert from 'node:assert/strict';

test('old cleanup cannot release a newer job and only its source can reserve titles', async () => {
  let listener: (message: unknown, sender: unknown, reply: (value: any) => void) => void;
  const storage: Record<string, unknown> = {};
  const original = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
    runtime: { id: 'test', getURL: (path: string) => `chrome-extension://test/${path}`, onMessage: { addListener(fn: typeof listener) { listener = fn; } } },
    storage: { session: {
      async get(key: string) { return { [key]: storage[key] }; },
      async set(values: Record<string, unknown>) { Object.assign(storage, values); },
      async remove(key: string) { delete storage[key]; },
    } },
    tabs: { async create() { return { id: 9 }; }, onRemoved: { addListener() {} } },
  } });
  try {
    await import('../src/background');
    const send = (type: string, jobId: string, tabId = 1, extra = {}) => new Promise<any>(resolve => {
      listener({ type, jobId, ...extra }, { id: 'test', url: 'https://chatgpt.com/', tab: { id: tabId, windowId: 1 } }, resolve);
    });
    assert.equal((await send('branch-acquire', 'first')).value, true);
    await send('branch-release', 'first');
    await send('branch-acquire', 'second');
    await send('branch-create', 'second');
    assert.match((await send('branch-release', 'first')).error, /ended/);
    assert.equal((storage.owner as { jobId: string }).jobId, 'second');
    assert.ok((await send('branch-remember-title', 'second', 9, { payload: { title: '⎇ 1 - Plan' } })).error);
    assert.equal((await send('branch-remember-title', 'second', 1, { payload: { title: '⎇ 1 - Plan' } })).value, true);
    assert.deepEqual((await send('branch-known-titles', 'second', 1)).value, ['⎇ 1 - Plan']);
  } finally {
    if (original) Object.defineProperty(globalThis, 'chrome', original);
    else Reflect.deleteProperty(globalThis, 'chrome');
  }
});
