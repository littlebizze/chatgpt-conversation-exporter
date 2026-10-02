import { pause } from './wait';
import { accessToken, apiRequest, readJson, RateLimitError } from './api';
import { renameChat } from './rename';
import { findBranchTitle } from './branch-title';
import { conversationId, errorMessage, isRecord } from './types';

export const continuationPrompt = 'Attached is an export of another conversation, including its branches and files. Continue from the branch identified as current. Read that branch and inspect the relevant files. Summarize the goal, decisions, unresolved questions, and next step. Tell me if anything could not be read, then wait for my next instruction.';
declare global { interface Window { chatGptBranchTargetInstalled?: boolean } }
let controller = new AbortController();
function sendButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('#composer-submit-button, [data-testid="send-button"]')
    ?? document.querySelector<HTMLButtonElement>('button[aria-label="Send"]');
}
function stopButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="Stop"]');
}
async function until<T>(read: (signal: AbortSignal) => T | Promise<T>, timeout: number, description: string, retryErrors = false): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeout;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]);
  while (Date.now() < deadline) {
    controller.signal.throwIfAborted();
    let value: T | undefined;
    try { value = await read(signal); } catch (error) { controller.signal.throwIfAborted(); if (!retryErrors || error instanceof RateLimitError) throw error; }
    controller.signal.throwIfAborted();
    if (value) return value as NonNullable<T>;
    await pause(retryErrors ? 10_000 : 1000, controller.signal);
  }
  throw new Error(`${description} Keep the new tab open and finish there if needed.`);
}

if (!window.chatGptBranchTargetInstalled && location.origin === 'https://chatgpt.com') {
  window.chatGptBranchTargetInstalled = true;
  let chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  let phase = 'receiving';
  let message = 'Sending archive to new tab…';
  let step = 1;
  let newTitle = '';
  let newUrl = '';
  const generatedTitles = new Set<string>();
  const onTitle = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin || !isRecord(event.data)) return;
    if (event.data.type === 'fork-generated-title' && typeof event.data.conversationId === 'string') {
      generatedTitles.add(event.data.conversationId);
    }
  };
  window.addEventListener('message', onTitle);
  async function start(filename: string, oldTitle: string) {
    try {
      phase = 'running'; message = 'Waiting for the new chat…'; step = 2;
      // Use ChatGPT's native composer so its normal upload and send safeguards run.
      const input = await until(() => [...document.querySelectorAll<HTMLInputElement>('input[type=file]')].find(element => !element.accept), 60_000, 'The upload control did not appear.');
      const editor = await until(() => document.querySelector<HTMLElement>('[contenteditable=true][role=textbox]'), 60_000, 'The message box did not appear.');
      if (conversationId(location.href)) throw new Error('The new tab is no longer an empty chat. Nothing was submitted.');
      const transfer = new DataTransfer();
      transfer.items.add(new File(chunks, filename, { type: 'application/zip' }));
      chunks = []; size = 0;
      controller.signal.throwIfAborted();
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      editor.focus(); editor.textContent = continuationPrompt;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: continuationPrompt }));
      message = 'Uploading ZIP to ChatGPT…'; step = 2;
      const existingAlerts = new Set([...document.querySelectorAll('[role=alert]')].map(element => element.textContent?.trim()));
      const send = await until(() => {
        const failure = [...document.querySelectorAll<HTMLElement>('[role=alert]')]
          .filter(element => element.getClientRects().length)
          .map(element => element.textContent?.trim())
          .find(text => text && !existingAlerts.has(text));
        if (failure) throw new Error(`ChatGPT reported: ${failure} Check the new tab before trying again.`);
        const attachment = [...document.querySelectorAll('button[aria-label]')].some(button => button.getAttribute('aria-label') === filename);
        const button = sendButton();
        return attachment && button && !button.disabled ? button : null;
      }, 180_000, 'The ZIP upload was not ready within 3 minutes. Check the new tab for an upload error or limit.');
      controller.signal.throwIfAborted();
      send.click(); message = 'Confirming ChatGPT started…'; step = 3;
      const id = await until(() => conversationId(location.href), 60_000, 'ChatGPT did not save the new conversation.');
      const token = await accessToken(controller.signal);
      // Saving the prompt and attachment is the acknowledgement we need. A
      // streaming assistant node or the native Stop button confirms work began.
      await until(async signal => {
        const data: unknown = await readJson(await apiRequest(`/backend-api/conversation/${id}`, token, signal));
        if (!isRecord(data) || !isRecord(data.mapping)) return false;
        const messages = Object.values(data.mapping).flatMap(node =>
          isRecord(node) && isRecord(node.message) ? [node.message] : []);
        const savedPrompt = messages.some(item => isRecord(item.author) && item.author.role === 'user' &&
          isRecord(item.content) && Array.isArray(item.content.parts) && item.content.parts.includes(continuationPrompt) &&
          isRecord(item.metadata) && Array.isArray(item.metadata.attachments) &&
          item.metadata.attachments.some(file => isRecord(file) && file.name === filename));
        const started = messages.some(item => isRecord(item.author) && item.author.role === 'assistant') ||
          stopButton();
        return savedPrompt && started;
      }, 120_000, 'ChatGPT has not acknowledged the prompt and attachment.', true);
      message = 'Waiting for ChatGPT to name the conversation…'; step = 4;
      await until(() => generatedTitles.has(id), 120_000, 'ChatGPT did not send its automatic title event within 2 minutes.');
      message = 'Choosing the next branch number…';
      newTitle = await findBranchTitle(oldTitle, token, controller.signal);
      await renameChat(id, newTitle, token, controller.signal);
      await until(async signal => {
        const data: unknown = await readJson(await apiRequest(`/backend-api/conversation/${id}`, token, signal));
        if (!isRecord(data) || typeof data.title !== 'string') return false;
        if (data.title === newTitle) return true;
        return false;
      }, 30_000, 'The new chat title could not be confirmed.', true);
      newUrl = `https://chatgpt.com/c/${id}`;
      document.title = newTitle;
      phase = 'success'; message = `Created ${newTitle} in a new tab.`; step = 5;
    } catch (error) { phase = controller.signal.aborted ? 'canceled' : 'error'; message = errorMessage(error); }
    finally {
      chunks = []; size = 0;
      window.removeEventListener('message', onTitle);
      window.postMessage({ type: 'fork-title-stop' }, location.origin);
    }
  }
  chrome.runtime.onMessage.addListener((data: unknown, sender, reply) => {
    if (sender.id !== chrome.runtime.id || !isRecord(data)) return;
    if (data.type === 'branch-target-cancel') {
      if (phase !== 'success') { controller.abort(); phase = 'canceled'; message = 'Canceled.'; chunks = []; size = 0; }
      reply({ ok: true }); return;
    }
    if (data.type === 'branch-target-status') { reply({ phase, message, step, title: newTitle, url: newUrl }); return; }
    if (data.type === 'branch-chunk' && typeof data.chunk === 'string' && phase === 'receiving') {
      if (size + data.chunk.length * 0.75 > 270 * 1024 * 1024) { reply({ error: 'The ZIP is too large to transfer.' }); return; }
      const raw = atob(data.chunk);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      size += bytes.length; chunks.push(bytes); reply({ ok: true }); return;
    }
    if (data.type === 'branch-target-start' && typeof data.filename === 'string' && typeof data.title === 'string' && phase === 'receiving') {
      phase = 'running'; reply({ ok: true }); void start(data.filename, data.title);
    }
  });
}
