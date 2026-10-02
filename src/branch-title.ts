import { apiRequest, readJson } from './api';
import { isRecord } from './types';

function parseBranchTitle(title: string): { number: number; base: string } | null {
  const match = /^⎇ ([1-9]\d*) - (.+)$/.exec(title);
  return match?.[1] && match[2] ? { number: Number(match[1]), base: match[2] } : null;
}
export function baseTitle(title: string): string { return parseBranchTitle(title)?.base ?? title; }
export function nextBranchTitle(title: string, titles: string[]): string {
  const base = baseTitle(title);
  let highest = 0;
  for (const candidate of [title, ...titles]) {
    const parsed = parseBranchTitle(candidate);
    if (parsed?.base === base && parsed.number > highest) highest = parsed.number;
  }
  return `⎇ ${highest + 1} - ${base}`;
}

async function searchTitles(query: string, token: string, signal?: AbortSignal): Promise<string[]> {
  const params = new URLSearchParams({ query, limit: '100' });
  const page: unknown = await readJson(await apiRequest(`/backend-api/conversations/search?${params}`, token, signal));
  if (!isRecord(page) || !Array.isArray(page.items) ||
      !page.items.every(item => isRecord(item) && typeof item.title === 'string')) {
    throw new Error('Unexpected conversation search result.');
  }
  return page.items.map(item => (item as { title: string }).title);
}

export async function findBranchTitle(title: string, token: string, signal?: AbortSignal, knownTitles: string[] = []): Promise<string> {
  const timeout = AbortSignal.timeout(30_000);
  const lookupSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return nextBranchTitle(title, [...knownTitles, ...await searchTitles(baseTitle(title), token, lookupSignal)]);
}
