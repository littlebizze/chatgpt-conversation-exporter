import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExport } from '../src/conversation';
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
test('all branches retain every node, including disconnected nodes', () => {
  const input = { ...conversation, mapping: { ...conversation.mapping, orphan: { parent: 'missing' } } };
  assert.deepEqual(buildExport(input, id).conversation.mapping, input.mapping);
});
test('only saved chatgpt.com conversation URLs are accepted', () => {
  assert.equal(conversationId(`https://chatgpt.com/g/project/c/${id}`), id);
  for (const url of [`https://example.com/c/${id}`, `https://chatgpt.com.evil.test/c/${id}`, `http://chatgpt.com/c/${id}`, `https://chatgpt.com/share/${id}`]) assert.equal(conversationId(url), null);
});
