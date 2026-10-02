import { request } from './api';

export async function renameChat(id: string, title: string, token: string, signal: AbortSignal) {
  await request(`https://chatgpt.com/backend-api/conversation/${id}`, {
    signal, method: 'PATCH', credentials: 'include', redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

