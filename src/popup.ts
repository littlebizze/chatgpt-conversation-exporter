import { conversationId, errorMessage, type ExportMode, type ExportResult } from './types';
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[data-mode]')];
function setStatus(message: string, state = '') { status.textContent = message; status.dataset.state = state; }
async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const id = conversationId(tab?.url ?? '');
  if (tab?.id === undefined || !id) { setStatus('Open a saved conversation on chatgpt.com first.'); return; }
  const tabId = tab.id;
  for (const button of buttons) {
    button.disabled = false;
    button.addEventListener('click', async () => {
      buttons.forEach(item => { item.disabled = true; });
      setStatus('Exporting… Keep this tab open.');
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        const result: ExportResult = await chrome.tabs.sendMessage(tabId, {
          type: 'export-conversation', mode: button.dataset.mode as ExportMode, conversationId: id,
        });
        if (!result || typeof result.message !== 'string') throw new Error('No export response. Reload the ChatGPT tab and try again.');
        setStatus(result.message, result.ok ? 'success' : 'error');
      } catch (error) { setStatus(errorMessage(error), 'error'); }
      finally { buttons.forEach(item => { item.disabled = false; }); }
    });
  }
  setStatus('Choose an export. Files are saved separately as a ZIP.');
}
void initialize().catch(error => setStatus(errorMessage(error), 'error'));
