import { isRecord, type Conversation, type ConversationNode } from './types';

export function parseConversation(value: unknown): Conversation {
  if (!isRecord(value) || !isRecord(value.mapping) ||
      !Object.values(value.mapping).every(node => isRecord(node) &&
        (node.parent == null || typeof node.parent === 'string'))) {
    throw new Error('ChatGPT returned an unexpected conversation format.');
  }
  return value as Conversation;
}

export function currentBranch(conversation: Conversation): Record<string, ConversationNode> {
  const nodes: [string, ConversationNode][] = [];
  const seen = new Set<string>();
  let id = conversation.current_node;
  // The API selects the active branch. A guessed leaf can silently export another answer.
  if (!id || !conversation.mapping[id]) {
    throw new Error('ChatGPT did not identify the current branch. Use Export all branches.');
  }
  while (id) {
    if (seen.has(id)) throw new Error('The conversation contains a cycle. Use Export all branches.');
    const node: ConversationNode | undefined = conversation.mapping[id];
    if (!node) throw new Error('The current branch is incomplete. Use Export all branches.');
    seen.add(id);
    nodes.push([id, node]);
    id = node.parent ?? undefined;
  }
  return Object.fromEntries(nodes.reverse().map(([key, node]) => [key, {
    ...node, children: Array.isArray(node.children) ? node.children.filter(child => seen.has(child)) : [],
  }]));
}

export function buildExport(conversation: Conversation, id: string, mode: 'current' | 'all') {
  const mapping = mode === 'current' ? currentBranch(conversation) : conversation.mapping;
  // Keep the original nodes as well as readable text: images and tool results are not plain text.
  const messages = Object.entries(mapping).flatMap(([nodeId, node]) => {
    const message = node.message;
    if (!message || !['user', 'assistant'].includes(message.author?.role ?? '') ||
        message.metadata?.is_visually_hidden_from_conversation ||
        (message.recipient && message.recipient !== 'all')) return [];
    return [{ nodeId, role: message.author?.role,
      text: Array.isArray(message.content?.parts)
        ? message.content.parts.filter(part => typeof part === 'string').join('\n') : '' }];
  });
  return {
    schemaVersion: 1, exportedAt: new Date().toISOString(),
    conversationId: id, url: `https://chatgpt.com/c/${id}`, mode,
    title: conversation.title ?? 'ChatGPT conversation', messages,
    conversation: { ...conversation, mapping },
  };
}
