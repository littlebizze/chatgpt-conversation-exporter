import { request } from './api';

export async function renameChat(id: string, title: string, token: string, signal: AbortSignal): Promise<void> {
  const response = await request(`https://chatgpt.com/backend-api/conversation/id/${encodeURIComponent(id)}/rename`, {
    method: 'POST', credentials: 'include', redirect: 'error', signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  await response.body?.cancel();
}
