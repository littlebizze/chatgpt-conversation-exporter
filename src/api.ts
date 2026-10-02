import { isRecord } from './types';
import { pause } from './wait';
const ORIGIN = 'https://chatgpt.com';
export class RateLimitError extends Error {}
const controllers = new WeakMap<Response, AbortController>();

export async function request(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal });
    } finally { clearTimeout(timer); }
    // This timeout covers connection setup. File reads have a separate idle timeout.
    if (response.ok) { controllers.set(response, controller); return response; }
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      await response.body?.cancel();
      throw new RateLimitError(`ChatGPT is limiting requests. The operation stopped.${retryAfter ? ` Retry-After: ${retryAfter}.` : ' Wait before trying again.'}`);
    }
    const safeRead = !init.method || ['GET', 'HEAD'].includes(init.method.toUpperCase());
    const retryable = safeRead && [502, 503, 504].includes(response.status);
    if (!retryable || attempt >= 4) {
      throw new Error(`ChatGPT request failed (HTTP ${response.status}). Try again later.`);
    }
    const header = response.headers.get('retry-after');
    const seconds = header ? Number(header) : NaN;
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header ?? '') - Date.now();
    await response.body?.cancel();
    // Never retry sooner than Retry-After. Long server cooldowns need a later user attempt.
    if (Number.isFinite(delay) && delay > 60_000) {
      throw new Error(`ChatGPT asked us to wait ${Math.ceil(delay / 1000)} seconds (HTTP ${response.status}). Try again after that.`);
    }
    await pause(Math.max(1000, Number.isFinite(delay) ? delay : 3000 * 2 ** attempt), init.signal);
  }
}

export async function accessToken(signal?: AbortSignal): Promise<string> {
  const response = await request(`${ORIGIN}/api/auth/session`, { credentials: 'include', signal });
  const session: unknown = await readJson(response);
  if (!isRecord(session) || typeof session.accessToken !== 'string' || !session.accessToken) {
    throw new Error('Sign in to ChatGPT, then try again.');
  }
  return session.accessToken;
}

export function apiRequest(path: string, token: string, signal?: AbortSignal): Promise<Response> {
  return request(`${ORIGIN}${path}`, {
    signal, credentials: 'include', redirect: 'error', headers: { Authorization: `Bearer ${token}` },
  });
}

export function contentRequest(url: string, token: string, signal?: AbortSignal): Promise<Response> {
  const parsed = new URL(url, ORIGIN);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('ChatGPT returned an invalid file URL.');
  }
  // Signed storage URLs carry their own credentials. Never send the session token to storage hosts.
  return request(parsed.href, parsed.origin === ORIGIN ? {
    signal, credentials: 'include', redirect: 'error', headers: { Authorization: `Bearer ${token}` },
  } : { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
}

// Headers can arrive while the JSON body stalls. Abort its fetch as well as
// rejecting the read; file streams use their own idle timeout instead.
export async function readJson(response: Response, owner: Response = response): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response.json(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controllers.get(owner)?.abort();
          reject(new Error('ChatGPT returned a stalled JSON response. Try again.'));
        }, 60_000);
      }),
    ]);
  } finally { clearTimeout(timer); }
}
