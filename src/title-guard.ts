import { apiRequest, request, readJson } from './api';
import { isRecord } from './types';
import { pause } from './wait';

export async function renameChat(id: string, title: string, token: string, signal: AbortSignal) {
  await request(`https://chatgpt.com/backend-api/conversation/${id}`, {
    signal, method: 'PATCH', credentials: 'include', redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

// ChatGPT can assign its title after a long first response. Wait on the local
// page, not the API, then check twice to allow for delayed automatic naming.
export async function guardInitialTitle(id: string, title: string, token: string, parent: AbortSignal) {
  const controller = new AbortController();
  const signal = AbortSignal.any([parent, controller.signal]);
  const deadline = Date.now() + 30 * 60_000;
  let quietSince = 0;
  const onConversation = () => location.pathname === `/c/${id}`;
  const manualRename = (event: Event) => {
    const element = event.target instanceof Element ? event.target.closest('button, [role=menuitem]') : null;
    const label = element ? element.textContent?.trim() || element.getAttribute('aria-label') || '' : '';
    if (event.isTrusted && element && /^(Rename|Rename chat)$/i.test(label)) controller.abort();
  };
  document.addEventListener('click', manualRename, true);
  try {
    while (onConversation() && Date.now() < deadline) {
      signal.throwIfAborted();
      const streaming = document.querySelector('[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="Stop"]');
      const reply = document.querySelector('[data-message-author-role="assistant"]');
      if (reply && !streaming) quietSince ||= Date.now();
      else quietSince = 0;
      if (quietSince && Date.now() - quietSince >= 15_000) break;
      await pause(2000, signal);
    }
    if (!onConversation()) return;
    if (Date.now() >= deadline) throw new Error('The first response did not finish within 30 minutes.');
    for (const delay of [0, 60_000]) {
      await pause(delay, signal);
      if (!onConversation()) return;
      const data = await readJson(await apiRequest(`/backend-api/conversation/${id}`, token, signal));
      if (!isRecord(data) || typeof data.title !== 'string') throw new Error('Unexpected chat format.');
      if (data.title !== title) {
        await renameChat(id, title, token, signal);
        document.title = title;
      }
    }
  } catch (error) {
    if (!signal.aborted) {
      await chrome.runtime.sendMessage({ type: 'notification-add', completion: {
        kind: 'error', message: `Could not preserve the branch title. Rename the new chat to “${title}” if needed.`,
      } }).catch(() => {});
    }
  } finally {
    controller.abort();
    document.removeEventListener('click', manualRename, true);
  }
}
