import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { downloadFiles, uniqueFilename } from '../src/files';
import { contentRequest } from '../src/api';
const id = 'test-conversation';

test('filenames cannot escape the ZIP folder or overwrite another entry', () => {
  const used = new Set(['conversation.json']);
  assert.equal(uniqueFilename('conversation.json', used), 'conversation (2).json');
  assert.equal(uniqueFilename('CON.txt', used), '_CON.txt');
  assert.equal(uniqueFilename('../a.txt', used), '.._a.txt');
  assert.equal(uniqueFilename('A.TXT', used), 'A.TXT');
  assert.equal(uniqueFilename('a.txt', used), 'a (2).txt');
  assert.equal(uniqueFilename('x'.repeat(149) + '.suffix', used), 'x'.repeat(149));
});

test('combined ZIP contains every branch, file bytes and partial-failure report', async context => {
  let blob: Blob | undefined;
  context.mock.method(URL, 'createObjectURL', (value: Blob) => { blob = value; return 'blob:test'; });
  context.mock.method(globalThis, 'setTimeout', () => 0);
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ click() {}, remove() {} }), body: { append() {} },
  } });
  context.after(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument }));
  const requests: { url: string; init?: RequestInit }[] = [];
  context.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    const url = String(input); requests.push({ url, init });
    if (url.includes('/files?')) return Response.json({ items: [
      { file_id: 'one', file_name: 'conversation.json', file_size_bytes: 5 },
      { file_id: 'one', file_name: 'duplicate.json' },
      { file_id: 'bad', file_name: 'missing.txt' },
    ] });
    if (url.includes('/download/one')) return Response.json({ download_url: 'https://storage.example/file', status: 'success' });
    if (url.startsWith('https://storage.example')) return new Response('hello');
    return new Response('', { status: 404 });
  });
  const conversation = { mode: 'all', conversation: { mapping: { a: {}, b: {} } } };
  const message = await downloadFiles(id, 'secret-token', conversation);
  assert.match(message, /1 of 2 files/);
  assert.ok(blob);
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.deepEqual(JSON.parse(strFromU8(zip['conversation.json']!)), conversation);
  assert.equal(strFromU8(zip['conversation (2).json']!), 'hello');
  const report = JSON.parse(strFromU8(zip['export-report.json']!));
  assert.equal(report.results[1].ok, false);
  const storage = requests.find(request => request.url.startsWith('https://storage.example'))!;
  assert.equal(storage.init?.headers, undefined);
  assert.equal(storage.init?.credentials, 'omit');
  context.mock.method(globalThis, 'fetch', async () => Response.json({ items: [] }));
  assert.match(await downloadFiles(id, 'token', conversation), /0 of 0 files/);
  const emptyZip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.deepEqual(Object.keys(emptyZip).sort(), ['conversation.json', 'export-report.json']);
});

test('incomplete file lists and insecure download URLs are rejected', async context => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ items: [], has_more: true }));
  await assert.rejects(downloadFiles(id, 'token', {}), /incomplete/);
  assert.throws(() => contentRequest('http://storage.example/file', 'token'), /invalid file URL/);
});
