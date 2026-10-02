import { zipSync, strToU8 } from 'fflate';
import { apiRequest, contentRequest, readJson, RateLimitError } from './api';
import { errorMessage, isRecord, type ReportProgress } from './types';
import { conversationSchema } from './schema';
import { archiveFilename } from './filename';
import type { buildExport } from './conversation';

export function uniqueFilename(value: string, used: Set<string>): string {
  const base = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 150).replace(/[. ]+$/g, '') || 'file';
  const safe = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base) ? `_${base}` : base;
  const dot = safe.lastIndexOf('.');
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const extension = dot > 0 ? safe.slice(dot) : '';
  let name = safe;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem} (${n})${extension}`;
  used.add(name.toLowerCase());
  return name;
}

export async function buildBundle(id: string, token: string, conversation: ReturnType<typeof buildExport>, report: ReportProgress = () => {}, signal?: AbortSignal): Promise<{ bytes: Uint8Array; filename: string; summary: string; failures: number }> {
  report({ message: 'Finding files…' });
  const response = await apiRequest(`/backend-api/conversations/${encodeURIComponent(id)}/files?limit=200`, token, signal);
  const list: unknown = await readJson(response);
  if (!isRecord(list) || !Array.isArray(list.items)) throw new Error('ChatGPT returned an unexpected file list.');
  if (list.has_more || list.next_cursor || list.items.length >= 200) {
    throw new Error('The file list may be incomplete (200-file limit). This conversation cannot be archived safely.');
  }
  const archive: Record<string, Uint8Array> = Object.create(null);
  const used = new Set(['export-report.json', 'conversation.json', 'conversation.schema.json']);
  archive['conversation.schema.json'] = strToU8(JSON.stringify(conversationSchema, null, 2));
  archive['conversation.json'] = strToU8(JSON.stringify(conversation, null, 2));
  const seen = new Set<string>();
  const results: { name: string; ok: boolean; error?: string }[] = [];
  const files = list.items.filter((item): item is Record<string, unknown> => {
    if (!isRecord(item)) throw new Error('ChatGPT returned an invalid file entry.');
    const fileId = typeof item.file_id === 'string' ? item.file_id : item.id;
    if (typeof fileId !== 'string') throw new Error('ChatGPT returned a file without an ID.');
    if (seen.has(fileId)) return false;
    seen.add(fileId);
    return true;
  });
  // The total is known after listing files: conversation, file list, each file, and the ZIP.
  const total = files.length + 3;
  report({ message: files.length ? `Downloading ${files.length} ${files.length === 1 ? 'file' : 'files'}…` : 'No files to download.', completed: 2, total });
  let totalBytes = 0;
  // Sequential requests keep rate limiting simple and avoid buffering several large responses at once.
  for (const item of files) {
    const fileId = (typeof item.file_id === 'string' ? item.file_id : item.id) as string;
    const name = uniqueFilename(typeof item.file_name === 'string' ? item.file_name : `${fileId}.bin`, used);
    try {
      let fileResponse = await apiRequest(`/backend-api/files/download/${encodeURIComponent(fileId)}?inline=true&download_intent=false&check_context_scopes_for_conversation_id=${encodeURIComponent(id)}`, token, signal);
      let expectedSize = typeof item.file_size_bytes === 'number' ? item.file_size_bytes : null;
      if (fileResponse.headers.get('content-type')?.includes('json')) {
        // A JSON attachment and a download descriptor share a MIME type. Inspect a clone to preserve file bytes.
        const descriptor: unknown = await readJson(fileResponse.clone(), fileResponse).catch(() => null);
        if (isRecord(descriptor) && 'download_url' in descriptor) {
          if (typeof descriptor.download_url !== 'string' || !descriptor.download_url ||
              (descriptor.status && descriptor.status !== 'success')) throw new Error('The file download link is unavailable.');
          if (typeof descriptor.file_size_bytes === 'number') expectedSize = descriptor.file_size_bytes;
          fileResponse = await contentRequest(descriptor.download_url, token, signal);
        }
      }
      const bytes = await readLimited(fileResponse, 250 * 1024 * 1024 - totalBytes);
      if (expectedSize !== null && bytes.length !== expectedSize) throw new Error('The file size does not match its metadata.');
      totalBytes += bytes.length;
      if (totalBytes > 250 * 1024 * 1024) throw new Error('The archive exceeds the 250 MB memory limit.');
      archive[name] = bytes;
      results.push({ name, ok: true });
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof RateLimitError) throw error;
      results.push({ name, ok: false, error: errorMessage(error) });
    }
    report({ message: `Processed ${results.length} of ${files.length} files…`, completed: results.length + 2, total });
  }
  const saved = results.filter(result => result.ok).length;
  archive['export-report.json'] = strToU8(JSON.stringify({ conversationId: id, results }, null, 2));
  report({ message: 'Building ZIP…', completed: total - 1, total });
  signal?.throwIfAborted();
  const zip = zipSync(archive, { level: 0 });
  return { bytes: zip, filename: archiveFilename(conversation.title, new Date(conversation.exportedAt)),
    failures: results.length - saved,
    summary: `All branches and ${saved} of ${results.length} files.${saved < results.length ? ' See export-report.json for failures.' : ''}` };

}

async function readLimited(response: Response, remaining: number): Promise<Uint8Array> {
  if (!response.body) throw new Error('The file response is empty.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('The file download stalled. Try again.')), 60_000);
        }),
      ]).finally(() => clearTimeout(timer));
      const { done, value } = next;
      if (done) break;
      size += value.length;
      if (size > remaining) throw new Error('The archive exceeds the 250 MB memory limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
