export function isUiDebugEnabled(): boolean {
  return Boolean(import.meta.env?.DEV);
}

/**
 * Conditional UI debug logger.
 */
export function debugLog(...args: unknown[]) {
  if (!isUiDebugEnabled()) return;
  console.log('[dullypdf-ui]', ...args);
}
