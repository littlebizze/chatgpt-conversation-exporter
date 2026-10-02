import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveFilename } from '../src/filename';

test('archive filenames use local date and time with zero padding', () => {
  assert.equal(archiveFilename('Planning', new Date(2026, 0, 2, 0, 5)), '20260102-00-05 Planning.zip');
  assert.equal(archiveFilename('Planning', new Date(2026, 11, 31, 23, 59)), '20261231-23-59 Planning.zip');
});
test('title characters unsafe on Windows are removed and empty titles have a fallback', () => {
  const date = new Date(2026, 9, 2, 9, 5);
  assert.equal(archiveFilename('  Plan: A/B\\C? "draft" <v1>|*\x00... ', date), '20261002-09-05 Plan ABC draft v1.zip');
  assert.equal(archiveFilename('?:/... ', date), '20261002-09-05 ChatGPT conversation.zip');
});
test('long Unicode titles fit byte limits without splitting characters', () => {
  const name = archiveFilename('😀'.repeat(200));
  assert.ok(new TextEncoder().encode(name).length < 255);
  assert.ok(!name.includes('\ufffd'));
  assert.equal(name.match(/😀/gu)?.length, 45);
});
