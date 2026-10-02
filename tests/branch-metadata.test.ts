import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';
import { readBranchMetadata, branchPrompt } from '../src/branch-metadata';
import { buildBundle } from '../src/files';
import { buildExport } from '../src/conversation';

test('fork of a fork carries its root from the attached ZIP despite a changed chat title', async context => {
  const parent = { rootConversationId: 'root', rootTitle: 'Original plan', parentConversationId: 'root', branchNumber: 2 };
  const attachment = zipSync({ 'branch-metadata.json': strToU8(JSON.stringify(parent)), 'nested.zip': new Uint8Array([1, 2, 3]) });
  context.mock.method(globalThis, 'fetch', async (url: string) => url.includes('/files?')
    ? Response.json({ items: [{ file_id: 'archive', file_name: 'export.zip' }] })
    : new Response(attachment));
  const conversation = buildExport({ title: 'Wrong automatic title', mapping: { user: { message: {
    author: { role: 'user' }, content: { parts: [branchPrompt()] }, metadata: { attachments: [{ name: 'export.zip' }] },
  } } } }, 'parent-chat');
  const bundle = await buildBundle('parent-chat', 'token', conversation, undefined, undefined, async recovered => {
    assert.deepEqual(recovered, parent);
    return { ...recovered!, parentConversationId: 'parent-chat', branchNumber: 3 };
  });
  const metadata = readBranchMetadata(bundle.bytes)!;
  assert.equal(metadata.rootConversationId, 'root');
  assert.equal(metadata.rootTitle, 'Original plan');
  assert.equal(metadata.branchNumber, 3);
  const json = JSON.parse(strFromU8(unzipSync(bundle.bytes)['conversation.json']!));
  assert.deepEqual(json.branch, metadata);
});

test('metadata extraction rejects oversized and invalid metadata', () => {
  assert.equal(readBranchMetadata(zipSync({ 'branch-metadata.json': strToU8(' '.repeat(20_000)) })), undefined);
  assert.equal(readBranchMetadata(zipSync({ 'branch-metadata.json': strToU8('{"branchNumber":0}') })), undefined);
});
