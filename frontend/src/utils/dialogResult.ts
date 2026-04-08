import type { ConfirmDialogOptions } from '../types';

/**
 * Resolve an optional confirm-dialog result while preserving explicit null.
 * This keeps close-vs-cancel semantics stable when a caller intentionally uses
 * null to mean "dismiss without choosing either action".
 */
export function resolveConfirmDialogResult(
  request: Pick<ConfirmDialogOptions, 'cancelResult' | 'dismissResult'>,
  key: 'cancelResult' | 'dismissResult',
  fallback: boolean | null,
): boolean | null {
  if (!Object.prototype.hasOwnProperty.call(request, key)) {
    return fallback;
  }
  const value = request[key];
  return value === undefined ? fallback : value;
}
