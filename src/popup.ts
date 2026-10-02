import { conversationId, errorMessage, type ExportState } from './types';
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const button = document.querySelector<HTMLButtonElement>('#export')!;
const spinner = document.querySelector<HTMLElement>('#spinner')!;
const progress = document.querySelector<HTMLProgressElement>('#progress')!;
const count = document.querySelector<HTMLElement>('#progress-count')!;
const main = document.querySelector('main')!;
let timer: ReturnType<typeof setTimeout> | undefined;

function render(state: ExportState) {
  const busy = state.phase === 'running';
  button.disabled = busy;
  spinner.hidden = !busy;
  main.setAttribute('aria-busy', String(busy));
  status.textContent = state.message;
  status.dataset.state = state.phase;
  progress.hidden = !busy;
  if (state.total !== undefined && state.completed !== undefined) {
    progress.max = state.total;
    progress.value = state.completed;
    count.textContent = `${state.completed} of ${state.total} steps complete`;
  } else {
    progress.removeAttribute('value');
    count.textContent = '';
  }
  count.hidden = !busy || state.total === undefined;
}

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const id = conversationId(tab?.url ?? '');
  if (tab?.id === undefined || !id) {
    render({ phase: 'idle', message: 'Open a saved conversation on chatgpt.com first.' });
    button.disabled = true;
    return;
  }
  const tabId = tab.id;
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  async function update(type: 'export-status' | 'export-conversation') {
    clearTimeout(timer);
    try {
      const state: ExportState = await chrome.tabs.sendMessage(tabId, { type, conversationId: id });
      if (!state || typeof state.message !== 'string') throw new Error('Reload the ChatGPT tab and try again.');
      render(state);
      // Poll only while this popup is open. Each request finishes before scheduling the next.
      if (state.phase === 'running') timer = setTimeout(() => { void update('export-status'); }, 400);
    } catch (error) {
      render({ phase: 'error', message: errorMessage(error) });
    }
  }
  button.addEventListener('click', () => {
    render({ phase: 'running', message: 'Starting export…' });
    void update('export-conversation');
  });
  await update('export-status');
}
void initialize().catch(error => {
  render({ phase: 'error', message: errorMessage(error) });
  button.disabled = true;
});
