import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, currentBranch, parseConversation } from '../src/conversation';
import { conversationId, type Conversation } from '../src/types';
const id = '00000000-0000-0000-0000-000000000000';
const conversation: Conversation = {
  current_node: 'answer-b', mapping: {
    root: { parent: null, children: ['question'] },
    question: { parent: 'root', children: ['answer-a', 'answer-b'], message: { author: { role: 'user' }, content: { parts: ['Hello'] } } },
    'answer-a': { parent: 'question', message: { author: { role: 'assistant' }, content: { parts: ['A'] } } },
    'answer-b': { parent: 'question', message: { author: { role: 'assistant' }, content: { parts: ['B', { asset_pointer: 'image' }] } } },
  },
};
test('current branch follows current_node and keeps multimodal data without sibling links', () => {
  const out = buildExport(conversation, id, 'current');
  assert.deepEqual(out.messages.map(message => message.text), ['Hello', 'B']);
  assert.deepEqual(out.conversation.mapping.question?.children, ['answer-b']);
  assert.deepEqual(out.conversation.mapping['answer-b']?.message?.content?.parts, ['B', { asset_pointer: 'image' }]);
  assert.equal(out.conversation.mapping['answer-a'], undefined);
  assert.equal(conversation.mapping.question?.children?.length, 2);
});
test('all branches retain every node, including disconnected nodes', () => {
  const input = { ...conversation, mapping: { ...conversation.mapping, orphan: { parent: 'missing' } } };
  assert.deepEqual(buildExport(input, id, 'all').conversation.mapping, input.mapping);
});
test('missing active nodes and cycles cannot silently select another branch', () => {
  assert.throws(() => currentBranch({ ...conversation, current_node: 'missing' }), /current branch/);
  assert.throws(() => currentBranch({ current_node: 'a', mapping: { a: { parent: 'b' }, b: { parent: 'a' } } }), /cycle/);
  assert.throws(() => currentBranch({ current_node: 'a', mapping: { a: { parent: 'missing' } } }), /incomplete/);
  assert.throws(() => parseConversation({ mapping: { a: null } }), /unexpected/);
});
test('only saved chatgpt.com conversation URLs are accepted', () => {
  assert.equal(conversationId(`https://chatgpt.com/g/project/c/${id}`), id);
  for (const url of [`https://example.com/c/${id}`, `https://chatgpt.com.evil.test/c/${id}`, `http://chatgpt.com/c/${id}`, `https://chatgpt.com/share/${id}`]) assert.equal(conversationId(url), null);
});
