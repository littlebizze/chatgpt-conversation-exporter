export interface Completion {
  message: string;
  kind?: 'success' | 'error' | 'canceled';
  title?: string;
  url?: string;
  tabId?: number;
}
export interface Notification extends Completion { id: string }
export function prependNotification(items: Notification[], completion: Completion): Notification[] {
  return [{ ...completion, id: crypto.randomUUID() }, ...items].slice(0, 3);
}
