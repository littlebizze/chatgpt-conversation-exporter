// ChatGPT can add fields to its raw nodes. Describe our envelope and branch links,
// while allowing those raw fields to remain intact in the archive.
export const conversationSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'ChatGPT conversation export', type: 'object',
  required: ['schemaVersion', 'exportedAt', 'conversationId', 'url', 'title', 'messages', 'conversation'],
  properties: {
    schemaVersion: { const: 1 }, exportedAt: { type: 'string', format: 'date-time' },
    conversationId: { type: 'string' }, url: { type: 'string', format: 'uri' },
    title: { type: 'string' },
    messages: { type: 'array', items: { type: 'object', required: ['nodeId', 'role', 'text'], properties: {
      nodeId: { type: 'string' }, role: { enum: ['user', 'assistant'] }, text: { type: 'string' },
    } } },
    conversation: { type: 'object', required: ['mapping'], properties: {
      current_node: { type: ['string', 'null'], description: 'Follow parent links from this node to identify the current branch.' },
      mapping: { type: 'object', additionalProperties: { type: 'object', properties: {
        parent: { type: ['string', 'null'] }, children: { type: 'array', items: { type: 'string' } },
        message: { type: ['object', 'null'] },
      } } },
    } },
  },
};
