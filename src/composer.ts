export function hasAttachment(filename: string): boolean {
  const editor = document.querySelector('[contenteditable=true][role=textbox]');
  const scope = editor?.closest('form') ?? document.querySelector('main') ?? document.body;
  // ChatGPT renders some file cards as text with a separate Remove button,
  // rather than a button whose accessible name is the filename.
  return [...scope.querySelectorAll<HTMLElement>('[aria-label], [title], span, div, a')].some(element => {
    if (!element.getClientRects().length || element.closest('[contenteditable=true]')) return false;
    return element.getAttribute('aria-label') === filename ||
      element.getAttribute('title') === filename || element.textContent?.trim() === filename;
  });
}
