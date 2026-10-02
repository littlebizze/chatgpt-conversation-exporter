import { isRecord, errorMessage, conversationId } from './types';

import { prependNotification, type Notification, type Completion } from './notifications';

let queue = Promise.resolve();

// Keep tab ownership and recent notices in session storage. Archive bytes and tokens stay in the tabs.
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !isRecord(message)) return;
  const fromTab = sender.tab?.id !== undefined && sender.url?.startsWith('https://chatgpt.com/');
  const fromPopup = sender.url === chrome.runtime.getURL('popup.html');
  if (!fromTab && !fromPopup) return;
  const source = sender.tab?.id;
  const windowId = sender.tab?.windowId;
  const run = async () => {
    if (typeof message.type !== 'string') throw new Error('Invalid request.');
    if (message.type.startsWith('notification-')) {
      const stored = await chrome.storage.session.get('notifications');
      const items = (stored.notifications ?? []) as Notification[];
      if (message.type === 'notification-list' && fromPopup) return items;
      if (message.type === 'notification-dismiss' && fromPopup && typeof message.id === 'string') {
        const remaining = items.filter(item => item.id !== message.id);
        await chrome.storage.session.set({ notifications: remaining }); return remaining;
      }
      if (message.type === 'notification-add' && (fromTab || fromPopup) && isRecord(message.completion) && typeof message.completion.message === 'string') {
        const completion = message.completion as unknown as Completion;
        if (completion.url && (!conversationId(completion.url) || typeof completion.title !== 'string')) throw new Error('Invalid chat link.');
        await chrome.storage.session.set({ notifications: prependNotification(items, completion) }); return true;
      }
      if (message.type === 'notification-open' && fromPopup && typeof message.id === 'string') {
        const item = items.find(item => item.id === message.id);
        const id = item?.url && conversationId(item.url);
        if (!item?.url || !id) throw new Error('The chat link is unavailable.');
        const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
        const tab = tabs.find(tab => tab.id === item.tabId && conversationId(tab.url ?? '') === id) ??
          tabs.find(tab => conversationId(tab.url ?? '') === id);
        if (tab?.id !== undefined) {
          await chrome.tabs.update(tab.id, { active: true });
          await chrome.windows.update(tab.windowId, { focused: true });
        } else await chrome.tabs.create({ url: item.url, active: true });
        return true;
      }
      throw new Error('Unknown notification request.');
    }
    if (message.type === 'job-status' && fromPopup) {
      const { owner } = await chrome.storage.session.get('owner');
      if (!isRecord(owner) || typeof owner.source !== 'number') return null;
      const state = await chrome.tabs.sendMessage(owner.source, { type: 'export-status' }).catch(() => null);
      return state?.phase === 'running' ? { tabId: owner.source, state } : null;
    }
    if (!fromTab || source === undefined) throw new Error('A ChatGPT tab is required.');
    const stored = await chrome.storage.session.get('owner');
    const owner = stored.owner as { source: number; target?: number } | undefined;
    if (message.type === 'branch-acquire') {
      if (owner && owner.source !== source) {
        const state = await chrome.tabs.sendMessage(owner.source, { type: 'export-status' }).catch(() => null);
        if (state?.phase === 'running') throw new Error('Another job is running. Wait for it to finish.');
      }
      await chrome.storage.session.set({ owner: { source } });
      return true;
    }
    if (!owner || owner.source !== source) throw new Error('The branch operation ended. Try again.');
    if (message.type === 'branch-cancel') {
      if (owner.target !== undefined) await chrome.tabs.sendMessage(owner.target, { type: 'branch-target-cancel' }).catch(() => {});
      return true;
    }
    if (message.type === 'branch-release') { await chrome.storage.session.remove('owner'); return true; }
    if (message.type === 'branch-create') {
      const tab = await chrome.tabs.create({ url: 'https://chatgpt.com/', active: false, windowId });
      if (tab.id === undefined) throw new Error('Could not open a new ChatGPT tab.');
      await chrome.storage.session.set({ owner: { source, target: tab.id } });
      return tab.id;
    }
    if (owner.target === undefined) throw new Error('The new tab is unavailable.');
    if (message.type === 'branch-inject') {
      const tab = await chrome.tabs.get(owner.target);
      if (tab.status !== 'complete' || !tab.url || new URL(tab.url).origin !== 'https://chatgpt.com' || new URL(tab.url).pathname !== '/') throw new Error('Waiting for the new ChatGPT page.');
      await chrome.scripting.executeScript({ target: { tabId: owner.target }, world: 'MAIN', files: ['title-observer.js'] });
      await chrome.scripting.executeScript({ target: { tabId: owner.target }, files: ['target.js'] });
      return true;
    }
    if (message.type === 'branch-relay' && isRecord(message.payload)) {
      return chrome.tabs.sendMessage(owner.target, message.payload);
    }
    throw new Error('Unknown branch request.');
  };
  const operation = queue.then(run);
  queue = operation.then(() => {}, () => {});
  void operation.then(value => reply({ value }), error => reply({ error: errorMessage(error) }));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => {
  queue = queue.then(async () => {
    const { owner } = await chrome.storage.session.get('owner');
    if (isRecord(owner) && (owner.source === tabId || owner.target === tabId)) return chrome.storage.session.remove('owner');
  }).catch(() => {});
});
