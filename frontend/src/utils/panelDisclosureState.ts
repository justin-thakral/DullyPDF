const STORAGE_PREFIX = 'dullypdf.panelDisclosure.';

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

export function readPanelDisclosureState(key: string, fallback = false): boolean {
  try {
    const value = window.localStorage.getItem(storageKey(key));
    if (value === null) return fallback;
    return value === 'open';
  } catch {
    return fallback;
  }
}

export function writePanelDisclosureState(key: string, open: boolean): void {
  try {
    window.localStorage.setItem(storageKey(key), open ? 'open' : 'closed');
  } catch {
    // Local storage can be unavailable in privacy modes; disclosure state should still work in memory.
  }
}
