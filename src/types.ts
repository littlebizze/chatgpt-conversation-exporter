export interface ExportRequest { type: 'export-conversation'; conversationId: string; action: 'branch' | 'download' }
export interface ExportProgress { message: string; completed?: number; total?: number }
export interface ExportState extends ExportProgress {
  phase: 'idle' | 'running' | 'success' | 'error' | 'canceled';
  conversationId?: string;
  notified?: boolean;
}
export type ReportProgress = (progress: ExportProgress) => void;
export interface ConversationNode {
  parent?: string | null;
  children?: string[];
  message?: {
    id?: string;
    author?: { role?: string };
    content?: { content_type?: string; parts?: unknown[] };
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}
export interface Conversation {
  title?: string;
  current_node?: string;
  mapping: Record<string, ConversationNode>;
  [key: string]: unknown;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function conversationId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://chatgpt.com') return null;
    return parsed.pathname.match(/(?:^|\/)c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)?.[1] ?? null;
  } catch { return null; }
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The export failed. Reload the page and try again.';
}
