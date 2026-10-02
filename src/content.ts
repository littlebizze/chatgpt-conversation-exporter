import { accessToken, apiRequest } from './api';
import { buildExport, parseConversation } from './conversation';
import { downloadFiles } from './files';
import { conversationId, errorMessage, isRecord, type ExportRequest, type ExportState, type ReportProgress } from './types';

declare global { interface Window { chatGptExporterInstalled?: boolean } }

async function run(request: ExportRequest, report: ReportProgress): Promise<string> {
  const id = conversationId(location.href);
  if (!id || id !== request.conversationId) throw new Error('The conversation changed. Reopen the extension and try again.');
  report({ message: 'Reading conversation…' });
  const token = await accessToken();
  const response = await apiRequest(`/backend-api/conversation/${id}`, token);
  const data = buildExport(parseConversation(await response.json()), id);
  return downloadFiles(id, token, data, report);
}

// State lives in the tab so closing and reopening the popup does not interrupt an export.
if (!window.chatGptExporterInstalled && location.origin === 'https://chatgpt.com') {
  window.chatGptExporterInstalled = true;
  const idle: ExportState = { phase: 'idle', message: 'Save all branches and files in one ZIP.' };
  let state: ExportState = idle;
  function visibleState(): ExportState {
    if (state.conversationId === conversationId(location.href)) return state;
    return state.phase === 'running'
      ? { ...state, message: `Exporting another conversation. ${state.message}` }
      : idle;
  }
  chrome.runtime.onMessage.addListener((request: unknown, sender, reply: (state: ExportState) => void) => {
    if (sender.id !== chrome.runtime.id || !isRecord(request)) return;
    if (request.type === 'export-status') {
      // A completed export belongs to its original conversation, even after in-page navigation.
      reply(visibleState());
      return;
    }
    if (request.type !== 'export-conversation' || typeof request.conversationId !== 'string') return;
    if (state.phase === 'running') { reply(visibleState()); return; }
    state = { phase: 'running', conversationId: request.conversationId, message: 'Starting export…' };
    reply(state);
    void run({ type: 'export-conversation', conversationId: request.conversationId }, progress => {
      state = { phase: 'running', conversationId: request.conversationId as string, ...progress };
    }).then(message => {
      state = { ...state, phase: 'success', message, completed: state.total };
    }, error => {
      state = { ...state, phase: 'error', message: errorMessage(error) };
    });
  });
}
