import { isRecord, type Conversation } from './types';

export function parseConversation(value: unknown): Conversation {
  if (!isRecord(value) || !isRecord(value.mapping) ||
      !Object.values(value.mapping).every(node => isRecord(node) &&
        (node.parent == null || typeof node.parent === 'string'))) {
    throw new Error('ChatGPT returned an unexpected conversation format.');
  }
  return value as Conversation;
}

export function buildExport(conversation: Conversation, id: string) {
  const mapping = conversation.mapping;
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
    conversationId: id, url: `https://chatgpt.com/c/${id}`, mode: 'all' as const,
    title: typeof conversation.title === 'string' ? conversation.title : 'ChatGPT conversation', messages,
    conversation: { ...conversation, mapping },
  };
}
