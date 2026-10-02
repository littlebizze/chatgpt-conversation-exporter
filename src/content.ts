import { accessToken, apiRequest } from './api';
import { buildExport, parseConversation } from './conversation';
import { download } from './download';
import { downloadFiles } from './files';
import { conversationId, errorMessage, isRecord, type ExportRequest, type ExportResult } from './types';

declare global { interface Window { chatGptExporterInstalled?: boolean } }

async function run(request: ExportRequest): Promise<ExportResult> {
  const id = conversationId(location.href);
  if (!id || id !== request.conversationId) throw new Error('The conversation changed. Reopen the extension and try again.');
  const token = await accessToken();
  if (request.mode === 'files') return { ok: true, message: await downloadFiles(id, token) };
  const response = await apiRequest(`/backend-api/conversation/${id}`, token);
  const data = buildExport(parseConversation(await response.json()), id, request.mode === 'full' ? 'all' : request.mode);
  if (request.mode === 'full') return { ok: true, message: await downloadFiles(id, token, data) };
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `chatgpt-${id}-${request.mode}.json`);
  return { ok: true, message: `Started download: ${data.messages.length} messages.` };
}

// The popup can reopen during a download. Register once in Chrome's isolated content-script world.
if (!window.chatGptExporterInstalled && location.origin === 'https://chatgpt.com') {
  window.chatGptExporterInstalled = true;
  let running = false;
  chrome.runtime.onMessage.addListener((request: unknown, sender, reply: (result: ExportResult) => void) => {
    if (sender.id !== chrome.runtime.id || !isRecord(request) || request.type !== 'export-conversation' ||
        !['current', 'all', 'files', 'full'].includes(String(request.mode)) || typeof request.conversationId !== 'string') return;
    if (running) { reply({ ok: false, message: 'An export is already running in this tab.' }); return; }
    running = true;
    void run(request as unknown as ExportRequest)
      .then(reply, error => reply({ ok: false, message: errorMessage(error) }))
      .finally(() => { running = false; });
    // Returning true keeps Chrome's reply channel open while the asynchronous export runs.
    return true;
  });
}
