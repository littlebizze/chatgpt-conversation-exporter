export function archiveFilename(title: string, date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  // Local getters preserve the user's time zone; ISO timestamps would use UTC.
  const timestamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}`;
  const cleaned = title.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim();
  // Filesystems limit bytes as well as characters. Trim by code point to keep Unicode names intact.
  const encoder = new TextEncoder();
  let safe = '';
  let bytes = 0;
  for (const character of cleaned) {
    bytes += encoder.encode(character).length;
    if (bytes > 180) break;
    safe += character;
  }
  safe = safe.replace(/[. ]+$/g, '') || 'ChatGPT conversation';
  return `${timestamp} ${safe}.zip`;
}
