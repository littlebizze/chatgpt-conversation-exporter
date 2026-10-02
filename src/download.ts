export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  const revoke = () => URL.revokeObjectURL(url);
  addEventListener('pagehide', revoke, { once: true });
  // Chrome can ask the user to allow multiple downloads from one page. Keep the
  // blob URL alive long enough for that prompt without keeping it indefinitely.
  setTimeout(revoke, 10 * 60_000);
}
