export function shouldIgnoreWorkspaceHotkeys(target: HTMLElement | null): boolean {
  if (
    target &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  ) {
    return true;
  }

  if (typeof document === 'undefined') {
    return false;
  }

  return Boolean(document.querySelector('[aria-modal="true"]'));
}
