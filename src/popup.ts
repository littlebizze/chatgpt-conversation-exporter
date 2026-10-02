import type { Notification } from './notifications';
import { conversationId, errorMessage, type ExportState } from './types';

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const branch = document.querySelector<HTMLButtonElement>('#branch')!;
const download = document.querySelector<HTMLButtonElement>('#export')!;
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!;
const activity = document.querySelector<HTMLElement>('#activity')!;
const indicator = document.querySelector<HTMLElement>('#indicator-slot')!;
const jobSpinner = document.querySelector<HTMLElement>('#job-spinner')!;
const notifications = document.querySelector<HTMLElement>('#notifications')!;
const progress = document.querySelector<HTMLProgressElement>('#progress')!;
const count = document.querySelector<HTMLElement>('#progress-count')!;
const actions = document.querySelector<HTMLElement>('#actions')!;
const feedback = document.querySelector<HTMLElement>('#feedback')!;
const unsupported = document.querySelector<HTMLElement>('#unsupported')!;
const main = document.querySelector('main')!;
let selected: { tabId: number; id: string } | undefined;
let jobTab: number | undefined;
let observedTab: number | undefined;
let observedConversation: string | null = null;
let busy = false;
let refreshPending = false;
let generation = 0;
let polling = false;
let notificationSnapshot = '';
let timer: ReturnType<typeof setTimeout> | undefined;

function render(state: ExportState) {
  busy = state.phase === 'running';
  actions.hidden = busy;
  main.classList.toggle('working', busy);
  main.setAttribute('aria-busy', String(busy));
  actions.inert = busy;
  actions.setAttribute('aria-hidden', String(busy));
  branch.disabled = download.disabled = busy || !selected;
  feedback.dataset.state = state.phase;
  feedback.classList.toggle('quiet', state.phase === 'idle' || state.phase === 'success');
  activity.hidden = busy;
  jobSpinner.hidden = !busy;
  if (busy) notifications.hidden = true;
  activity.dataset.state = selected ? 'ready' : 'error';
  activity.setAttribute('aria-label', selected ? 'Ready' : 'Unavailable');
  cancel.hidden = !busy;
  cancel.disabled = state.message === 'Canceling…';
  const quiet = Boolean(selected) && (state.phase === 'idle' || state.notified === true);
  status.textContent = quiet ? 'Ready to branch or download.' : state.message;
  status.classList.toggle('visually-hidden', quiet);
  status.dataset.state = state.phase;
  progress.hidden = !busy;
  if (state.total !== undefined && state.completed !== undefined) {
    progress.max = state.total; progress.value = state.completed;
    count.textContent = `${state.completed} of ${state.total} steps complete`;
  } else { progress.removeAttribute('value'); count.textContent = ''; }
  count.hidden = !busy || state.total === undefined;
}

async function background(type: string, data: Record<string, unknown> = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...data });
  if (!response || response.error) throw new Error(response?.error ?? 'The extension could not respond.');
  return response.value;
}
function showNotifications(items: Notification[]) {
  notifications.hidden = busy || unsupported.hidden === false || items.length === 0;
  // Keep focused and pressed buttons intact when tab events refresh the popup.
  const snapshot = JSON.stringify([observedConversation, items]);
  if (snapshot === notificationSnapshot) return;
  notificationSnapshot = snapshot;
  notifications.replaceChildren();
  for (const item of items) {
    const card = document.createElement('div'); card.className = 'toast';
    card.dataset.kind = item.kind ?? 'success';
    if (item.kind === 'error') card.setAttribute('role', 'alert');
    const text = document.createElement('p');
    if (item.title && item.url) {
      const isCurrent = conversationId(item.url) === observedConversation;
      if (isCurrent) {
        const currentNote = document.createElement('em');
        currentNote.textContent = 'You are viewing this conversation.';
        text.append(`Created ${item.title}. `, currentNote);
      } else {
        // An inline link can wrap within the sentence; a button is an atomic inline box.
        const link = document.createElement('a');
        link.href = item.url; link.className = 'chat-link'; link.textContent = item.title;
        link.addEventListener('click', event => {
          event.preventDefault();
          void background('notification-open', { id: item.id }).catch(showError);
        });
        text.append('Created ', link, ' in a new tab.');
      }
    } else text.textContent = item.message;
    const dismiss = document.createElement('button');
    dismiss.className = 'dismiss'; dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'Dismiss notification');
    dismiss.addEventListener('click', () => {
      void background('notification-dismiss', { id: item.id }).then(showNotifications).catch(showError);
    });
    card.append(text, dismiss); notifications.append(card);
  }
}
async function refreshNotifications() { showNotifications(await background('notification-list') as Notification[]); }
function showError(error: unknown) {
  const message = errorMessage(error);
  render({ phase: 'error', message });
  void background('notification-add', { completion: { message, kind: 'error' } }).then(async () => {
    render({ phase: 'error', message, notified: true }); await refreshNotifications();
  }).catch(() => {});
}
function setSupported(value: boolean) {
  unsupported.hidden = value; actions.hidden = feedback.hidden = indicator.hidden = !value;
  if (!value) notifications.hidden = true;
}
async function poll() {
  clearTimeout(timer);
  if (jobTab === undefined || polling) return;
  polling = true;
  try {
    const state: ExportState = await chrome.tabs.sendMessage(jobTab, { type: 'export-status' });
    if (!state || typeof state.message !== 'string') throw new Error('The chat tab stopped responding. Check any new chat before trying again.');
    render(state);
    if (busy) timer = setTimeout(() => { void poll(); }, 400);
    else {
      jobTab = undefined;
      await refreshNotifications();
      if (refreshPending) { refreshPending = false; polling = false; await refreshActive(); }
    }
  } catch (error) {
    jobTab = undefined; showError(error);
    if (refreshPending) { refreshPending = false; polling = false; await refreshActive(); }
  } finally { polling = false; }
}
async function refreshActive() {
  if (busy) { refreshPending = true; return; }
  const current = ++generation;
  clearTimeout(timer); selected = undefined;
  branch.disabled = download.disabled = true;
  setSupported(true); activity.hidden = false; jobSpinner.hidden = true;
  activity.dataset.state = 'loading'; activity.setAttribute('aria-label', 'Loading');
  main.setAttribute('aria-busy', 'true');
  try {
  const job = await background('job-status') as { tabId: number; state: ExportState } | null;
  if (current !== generation) return;
  if (job) {
    jobTab = job.tabId; refreshPending = true; render(job.state); await poll(); return;
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (current !== generation) return;
  observedTab = tab?.id;
  const id = conversationId(tab?.url ?? '');
  observedConversation = id ?? null;
  if (tab?.id === undefined || !id) {
    setSupported(false); main.setAttribute('aria-busy', 'false'); return;
  }
  if (tab.status === 'loading') { timer = setTimeout(() => { void refreshActive().catch(showError); }, 400); return; }
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  if (current !== generation) return;
  selected = { tabId: tab.id, id };
  jobTab = tab.id; await poll();
  } catch (error) { if (current === generation) showError(error); }
}
async function start(action: 'branch' | 'download') {
  if (!selected || busy) return;
  jobTab = selected.tabId;
  render({ phase: 'running', message: action === 'branch' ? 'Starting branch…' : 'Starting download…' });
  try {
    await chrome.tabs.sendMessage(jobTab, { type: 'export-conversation', conversationId: selected.id, action });
    await poll();
  } catch (error) { jobTab = undefined; showError(error); }
}
branch.addEventListener('click', () => { void start('branch'); });
download.addEventListener('click', () => { void start('download'); });
cancel.addEventListener('click', () => {
  if (jobTab === undefined) return;
  cancel.disabled = true;
  void chrome.tabs.sendMessage(jobTab, { type: 'export-cancel' }).then(poll).catch(showError);
});
// A running job stays attached to its source tab, even when the user switches tabs.
chrome.tabs.onActivated.addListener(() => { void refreshActive().catch(showError); });
chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) void refreshActive().catch(showError);
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if ((change.url || change.status === 'complete') && (tabId === observedTab || tabId === jobTab)) void refreshActive().catch(showError);
});
void refreshActive().catch(showError);
