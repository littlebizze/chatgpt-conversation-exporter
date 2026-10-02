import { pause } from './wait';
import { renameChat } from './rename';
import { hasAttachment } from './composer';
import { accessToken, apiRequest, readJson, RateLimitError } from './api';
import { branchPrompt } from './branch-metadata';
import { conversationId, errorMessage, isRecord } from './types';

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
  let generatedId: string | undefined;
  let generatedAt = 0;
  const onTitle = (event: MessageEvent) => {
    if (event.source === window && event.origin === location.origin && isRecord(event.data) &&
        event.data.type === 'fork-generated-title' && typeof event.data.conversationId === 'string') {
      generatedId = event.data.conversationId;
      generatedAt = Date.now();
    }
  };
  const stopObserving = () => {
    window.removeEventListener('message', onTitle);
    window.postMessage({ type: 'fork-title-stop' }, location.origin);
  };
  window.addEventListener('message', onTitle);
  async function start(filename: string, title: string) {
    const continuationPrompt = branchPrompt();
    newTitle = title;
    try {
      phase = 'running'; message = 'Waiting for the new chat…'; step = 2;
      // Use ChatGPT's native composer so its normal upload and send safeguards run.
      const input = await until(() => [...document.querySelectorAll<HTMLInputElement>('input[type=file]')].find(element => !element.accept && !element.disabled), 60_000, 'The upload control did not appear.');
      await until(() => document.querySelector<HTMLElement>('[contenteditable=true][role=textbox]'), 60_000, 'The message box did not appear.');
      if (conversationId(location.href)) throw new Error('The new tab is no longer an empty chat. Nothing was submitted.');
      controller.signal.throwIfAborted();
      const existingAlerts = new Set([...document.querySelectorAll('[role=alert]')].map(element => element.textContent?.trim()));
      const checkUploadError = () => {
        const failure = [...document.querySelectorAll<HTMLElement>('[role=alert]')]
          .filter(element => element.getClientRects().length)
          .map(element => element.textContent?.trim())
          .find(text => text && !existingAlerts.has(text));
        if (failure) throw new Error(`ChatGPT reported: ${failure} Check the new tab before trying again.`);
      };
      if (!input.isConnected) throw new Error('ChatGPT replaced the upload control. Try again after the new page finishes loading.');
      {
        const transfer = new DataTransfer();
        transfer.items.add(new File(chunks, filename, { type: 'application/zip' }));
        input.files = transfer.files;
      }
      chunks = []; size = 0;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      message = 'Waiting for ChatGPT to accept the ZIP…'; step = 2;
      // Let the upload enter ChatGPT's composer state before changing the draft.
      // Editing immediately can replace the composer while its file handler runs.
      await until(() => { checkUploadError(); return hasAttachment(filename); }, 30_000,
        'ChatGPT did not show the ZIP attachment within 30 seconds. Nothing was submitted. Check the new tab for upload limits.');
      const editor = await until(() => document.querySelector<HTMLElement>('[contenteditable=true][role=textbox]'),
        30_000, 'The message box disappeared after attaching the ZIP.');
      editor.focus(); editor.textContent = continuationPrompt;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: continuationPrompt }));
      message = 'Uploading ZIP to ChatGPT…';
      const send = await until(() => {
        checkUploadError();
        const attachment = hasAttachment(filename);
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
      message = 'Waiting for ChatGPT’s automatic title…'; step = 4;
      await until(() => generatedId === id, 120_000, 'ChatGPT did not send the automatic title event within two minutes.');
      const waitUntil = (seconds: number) => pause(Math.max(0, generatedAt + seconds * 1000 - Date.now()), controller.signal);
      for (const seconds of [10, 30]) {
        message = `Naming the new conversation (${seconds}-second step)…`;
        await waitUntil(seconds);
        if (conversationId(location.href) !== id) throw new Error('The new tab changed conversations. Nothing was renamed.');
        await renameChat(id, newTitle, token, controller.signal);
      }
      // All three times are measured from the automatic-title event.
      message = 'Checking that the branch name stays saved…';
      await waitUntil(60);
      if (conversationId(location.href) !== id) throw new Error('The new tab changed conversations before the final title check.');
      const finalTitle = await readJson(await apiRequest(`/backend-api/conversation/${id}`, token, controller.signal));
      if (!isRecord(finalTitle) || finalTitle.title !== newTitle) {
        await renameChat(id, newTitle, token, controller.signal);
        await pause(2000, controller.signal);
        const repaired = await readJson(await apiRequest(`/backend-api/conversation/${id}`, token, controller.signal));
        if (!isRecord(repaired) || repaired.title !== newTitle) throw new Error('ChatGPT did not keep the branch name. Rename it manually in the new tab.');
      }
      newUrl = `https://chatgpt.com/c/${id}`;
      phase = 'success'; message = `Created ${newTitle} in a new tab.`; step = 5;
    } catch (error) { phase = controller.signal.aborted ? 'canceled' : 'error'; message = errorMessage(error); }
    finally {
      stopObserving();
      chunks = []; size = 0;
    }
  }
  chrome.runtime.onMessage.addListener((data: unknown, sender, reply) => {
    if (sender.id !== chrome.runtime.id || !isRecord(data)) return;
    if (data.type === 'branch-target-cancel') {
      if (phase !== 'success') {
        controller.abort(); stopObserving(); phase = 'canceled'; message = 'Canceled.'; chunks = []; size = 0;
      }
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
