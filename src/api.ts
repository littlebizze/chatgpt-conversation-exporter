import { isRecord } from './types';
const ORIGIN = 'https://chatgpt.com';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function request(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } finally { clearTimeout(timer); }
    // This timeout covers connection setup. File reads have a separate idle timeout.
    if (response.ok) return response;
    if (response.status !== 429 || attempt >= 4) {
      throw new Error(`ChatGPT request failed (HTTP ${response.status}). Try again later.`);
    }
    const header = response.headers.get('retry-after');
    const seconds = header ? Number(header) : NaN;
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header ?? '') - Date.now();
    await sleep(Math.min(60_000, Math.max(1000, Number.isFinite(delay) ? delay : 3000 * 2 ** attempt)));
  }
}

export async function accessToken(): Promise<string> {
  const response = await request(`${ORIGIN}/api/auth/session`, { credentials: 'include' });
  const session: unknown = await response.json();
  if (!isRecord(session) || typeof session.accessToken !== 'string' || !session.accessToken) {
    throw new Error('Sign in to ChatGPT, then try again.');
  }
  return session.accessToken;
}

export function apiRequest(path: string, token: string): Promise<Response> {
  return request(`${ORIGIN}${path}`, {
    credentials: 'include', redirect: 'error', headers: { Authorization: `Bearer ${token}` },
  });
}

export function contentRequest(url: string, token: string): Promise<Response> {
  const parsed = new URL(url, ORIGIN);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('ChatGPT returned an invalid file URL.');
  }
  // Signed storage URLs carry their own credentials. Never send the session token to storage hosts.
  return request(parsed.href, parsed.origin === ORIGIN ? {
    credentials: 'include', redirect: 'error', headers: { Authorization: `Bearer ${token}` },
  } : { credentials: 'omit', referrerPolicy: 'no-referrer' });
}
