import { baseTitle, findBranchTitle } from './branch-title';
import { pause } from './wait';
import { accessToken, apiRequest, readJson } from './api';
import { buildExport, parseConversation } from './conversation';
import { buildBundle } from './files';
import type { Completion } from './notifications';
import { download } from './download';
import { conversationId, errorMessage, isRecord, type ExportRequest, type ExportState, type ReportProgress } from './types';

declare global { interface Window { chatGptExporterInstalled?: boolean } }
const BRANCH_STEPS = 5;

async function sendBridge(type: string, payload?: Record<string, unknown>, jobId?: string): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const response = await Promise.race([
    chrome.runtime.sendMessage({ type, payload, jobId }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('The extension could not reach the new tab within 15 seconds. Check that tab before trying again.')), 15_000);
    }),
  ]).finally(() => clearTimeout(timer));
  if (!response || response.error) throw new Error(response?.error ?? 'The new tab could not be reached.');
  return response.value;
}
async function run(request: ExportRequest, report: ReportProgress, signal: AbortSignal, jobId: string): Promise<Completion> {
  const bridge = (type: string, payload?: Record<string, unknown>) => sendBridge(type, payload, jobId);
  const id = conversationId(location.href);
  if (!id || id !== request.conversationId) throw new Error('The conversation changed. Reopen the extension and try again.');
  const branch = request.action === 'branch';
  await bridge('branch-acquire');
  try {
    report({ message: 'Reading conversation…' });
    signal.throwIfAborted();
    const token = await accessToken(signal);
    const response = await apiRequest(`/backend-api/conversation/${id}`, token, signal);
    const data = buildExport(parseConversation(await readJson(response)), id);
    if (branch) {
      let node = data.conversation.current_node;
      const seen = new Set<string>();
      if (!node) throw new Error('The current branch could not be identified. Download the ZIP instead.');
      while (node) {
        if (seen.has(node) || !data.conversation.mapping[node]) throw new Error('The current branch has invalid links. Download the ZIP instead.');
        seen.add(node); node = data.conversation.mapping[node]?.parent ?? undefined;
      }
    }
    let total = 0;
    let requestedTitle = '';
    const bundle = await buildBundle(id, token, data, progress => {
      total = progress.total ?? total;
      report({ ...progress, total: progress.total === undefined ? undefined : progress.total + (branch ? BRANCH_STEPS : 0) });
    }, signal, branch ? async parent => {
      report({ message: 'Choosing the branch name…' });
      const rootTitle = parent?.rootTitle ?? baseTitle(data.title);
      const known = await bridge('branch-known-titles');
      if (!Array.isArray(known)) throw new Error('Could not read recent branch names.');
      if (parent) known.push(`⎇ ${parent.branchNumber} - ${rootTitle}`);
      requestedTitle = await findBranchTitle(rootTitle, token, signal, known);
      await bridge('branch-remember-title', { title: requestedTitle });
      return { rootConversationId: parent?.rootConversationId ?? id, rootTitle,
        parentConversationId: id, branchNumber: Number(/^⎇ (\d+) - /.exec(requestedTitle)?.[1]) };
    } : undefined);
    signal.throwIfAborted();
    if (!branch) {
      download(new Blob([bundle.bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), bundle.filename);
      return { message: `Started download: ${bundle.summary}` };
    }
    if (bundle.failures) throw new Error('Some files could not be retrieved. Use Download ZIP to see which files failed before you branch this chat.');
    if (bundle.bytes.length > 270 * 1024 * 1024) throw new Error('The ZIP is too large to attach. Download it instead.');
    report({ message: 'Opening a new tab…', completed: total, total: total + BRANCH_STEPS });
    signal.throwIfAborted();
    const tabId = await bridge('branch-create');
    if (typeof tabId !== 'number') throw new Error('The new tab could not be opened.');
    const deadline = Date.now() + 60_000;
    let ready = false;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      try {
        await bridge('branch-inject');
        const status = await bridge('branch-relay', { type: 'branch-target-status' });
        if (!isRecord(status)) throw new Error('The new tab is not ready.');
        ready = true; break;
      } catch { await pause(1000, signal); }
    }
    if (!ready) throw new Error('The new tab could not load. Check it and try again.');
    report({ message: 'Sending archive to new tab…', completed: total + 1, total: total + BRANCH_STEPS });
    // Chrome messages use JSON. Small base64 chunks avoid one huge message and keep
    // archive bytes out of persistent extension storage.
    for (let offset = 0; offset < bundle.bytes.length; offset += 192 * 1024) {
      signal.throwIfAborted();
      const bytes = bundle.bytes.subarray(offset, offset + 192 * 1024);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const result = await bridge('branch-relay', { type: 'branch-chunk', chunk: btoa(binary) });
      if (!isRecord(result) || !result.ok) throw new Error(isRecord(result) && typeof result.error === 'string' ? result.error : 'Could not transfer the archive.');
    }
    bundle.bytes = new Uint8Array();
    signal.throwIfAborted();
    await bridge('branch-relay', { type: 'branch-target-start', filename: bundle.filename, title: requestedTitle });
    // Each target stage has its own timeout. Keep ownership until it reports a
    // terminal result, so a slower target cannot keep running behind a retry.
    let lastMessageFailure = 0;
    let targetStep: unknown;
    let stageDeadline = Date.now() + 240_000;
    while (true) {
      signal.throwIfAborted();
      if (Date.now() > stageDeadline) throw new Error('The new chat stopped making progress. Check its tab for an upload error or limit before trying again.');
      let state: unknown;
      try {
        state = await bridge('branch-relay', { type: 'branch-target-status' });
        lastMessageFailure = 0;
      } catch (error) {
        lastMessageFailure ||= Date.now();
        if (Date.now() - lastMessageFailure > 30_000) throw error;
        await pause(1000, signal); continue;
      }
      if (!isRecord(state) || typeof state.message !== 'string') throw new Error('The new tab stopped responding. Check it before trying again.');
      if (state.phase === 'success') {
        if (typeof state.title !== 'string' || typeof state.url !== 'string') throw new Error('The new chat link is missing.');
        return { message: state.message, title: state.title, url: state.url, tabId };
      }
      if (state.step !== targetStep) { targetStep = state.step; stageDeadline = Date.now() + 240_000; }
      if (state.phase === 'error' || state.phase === 'canceled') throw new Error(state.message);
      const step = typeof state.step === 'number' ? Math.min(BRANCH_STEPS - 1, Math.max(2, Math.floor(state.step))) : 2;
      report({ message: state?.message ?? 'Waiting for new tab…', completed: total + step, total: total + BRANCH_STEPS });
      await pause(1000, signal);
    }
  } catch (error) {
    if (branch) await bridge('branch-cancel').catch(() => {});
    throw error;
  } finally {
    await bridge('branch-release').catch(() => {});
  }
}

// State lives in the tab so closing and reopening the popup does not interrupt an export.
if (!window.chatGptExporterInstalled && location.origin === 'https://chatgpt.com') {
  window.chatGptExporterInstalled = true;
  const idle: ExportState = { phase: 'idle', message: 'Ready.' };
  let state: ExportState = idle;
  let controller = new AbortController();
  let canceling = false;
  let jobId = '';
  function visibleState(): ExportState {
    if (state.conversationId === conversationId(location.href)) return state;
    return state.phase === 'running'
      ? { ...state, message: `Exporting another conversation. ${state.message}` }
      : idle;
  }
  chrome.runtime.onMessage.addListener((request: unknown, sender, reply: (state: ExportState) => void) => {
    if (sender.id !== chrome.runtime.id || !isRecord(request)) return;
    if (request.type === 'export-cancel' && state.phase === 'running') {
      if (canceling) { reply(state); return; }
      canceling = true;
      state = { ...state, message: 'Canceling…' }; reply(state);
      const jobController = controller;
      jobController.abort();
      void sendBridge('branch-cancel', undefined, jobId).catch(() => {});
      return;
    }
    if (request.type === 'export-status') {
      // A completed export belongs to its original conversation, even after in-page navigation.
      reply(visibleState());
      return;
    }
    if (request.type !== 'export-conversation' || typeof request.conversationId !== 'string') return;
    if (state.phase === 'running') { reply(visibleState()); return; }
    canceling = false;
    jobId = crypto.randomUUID();
    controller = new AbortController();
    state = { phase: 'running', conversationId: request.conversationId, message: 'Starting export…' };
    reply(state);
    void run({ type: 'export-conversation', conversationId: request.conversationId, action: request.action === 'branch' ? 'branch' : 'download' }, progress => {
      if (!canceling) state = { phase: 'running', conversationId: request.conversationId as string, ...progress };
    }, controller.signal, jobId).then(async completion => {
      state = { ...state, phase: 'success', message: completion.message, completed: state.total };
      const finishedState = state;
      const notice = await chrome.runtime.sendMessage({ type: 'notification-add', completion }).catch(() => null);
      if (state === finishedState) state = { ...state, notified: notice?.value === true };
    }).catch(async error => {
      const phase = controller.signal.aborted ? 'canceled' as const : 'error' as const;
      const message = phase === 'canceled' ? 'Canceled. Any new chat or uploaded file remains in ChatGPT.' : errorMessage(error);
      state = { ...state, phase, message };
      const finishedState = state;
      const notice = await chrome.runtime.sendMessage({ type: 'notification-add', completion: { message, kind: phase } }).catch(() => null);
      if (state === finishedState) state = { ...state, notified: notice?.value === true };
    });
  });
}
