import { describe, expect, it } from 'vitest';

import { resolveConfirmDialogResult } from '../../../src/utils/dialogResult';

describe('resolveConfirmDialogResult', () => {
  it('preserves explicit null dismiss results instead of collapsing them to fallback', () => {
    const request = {
      dismissResult: null,
      cancelResult: false,
    };

    expect(resolveConfirmDialogResult(request, 'dismissResult', false)).toBeNull();
  });

  it('falls back when a result key is omitted', () => {
    expect(resolveConfirmDialogResult({}, 'dismissResult', false)).toBe(false);
  });

  it('falls back when a provided result is undefined', () => {
    expect(resolveConfirmDialogResult({ dismissResult: undefined }, 'dismissResult', false)).toBe(false);
  });
});
