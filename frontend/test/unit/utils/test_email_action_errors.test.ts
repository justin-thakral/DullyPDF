import { describe, expect, it } from 'vitest';
import {
  INVALID_LINK_MESSAGE,
  resolveEmailActionFailureMessage,
  resolveResetPasswordSubmitFailureMessage,
  RESET_LINK_REFRESH_MESSAGE,
  UNSUPPORTED_LINK_MESSAGE,
} from '../../../src/utils/emailActionErrors';

describe('emailActionErrors utils', () => {
  it('exports the static account-action copy used across the flow', () => {
    expect(INVALID_LINK_MESSAGE).toBe(
      'This verification link is invalid, expired, or has already been used.',
    );
    expect(UNSUPPORTED_LINK_MESSAGE).toBe('This email link is not supported by this page.');
    expect(RESET_LINK_REFRESH_MESSAGE).toBe(
      'For security, password reset links are kept only in this tab after they open. Request a fresh reset email to continue.',
    );
  });

  it('maps invalid action codes to the shared invalid-link message', () => {
    expect(
      resolveEmailActionFailureMessage(
        'verifyEmail',
        Object.assign(new Error('expired'), { code: 'auth/expired-action-code' }),
      ),
    ).toBe(INVALID_LINK_MESSAGE);
    expect(
      resolveResetPasswordSubmitFailureMessage(
        Object.assign(new Error('invalid'), { code: 'auth/invalid-action-code' }),
      ),
    ).toBe(INVALID_LINK_MESSAGE);
  });

  it('keeps transient verify-email failures retryable', () => {
    expect(
      resolveEmailActionFailureMessage(
        'verifyEmail',
        Object.assign(new Error('network failed'), { code: 'auth/network-request-failed' }),
      ),
    ).toBe(
      'Unable to verify this email right now because the network request failed. Try the link again shortly.',
    );
    expect(
      resolveEmailActionFailureMessage(
        'verifyEmail',
        Object.assign(new Error('rate limited'), { code: 'auth/too-many-requests' }),
      ),
    ).toBe('Too many attempts. Please wait a moment and try again.');
  });

  it('keeps transient reset-password failures retryable', () => {
    expect(
      resolveEmailActionFailureMessage(
        'resetPassword',
        Object.assign(new Error('network failed'), { code: 'auth/network-request-failed' }),
      ),
    ).toBe(
      'Unable to validate this password reset link right now because the network request failed. Try again shortly or request a fresh reset email.',
    );
    expect(
      resolveResetPasswordSubmitFailureMessage(
        Object.assign(new Error('network failed'), { code: 'auth/network-request-failed' }),
      ),
    ).toBe(
      'Unable to reset your password right now because the network request failed. Please try again or request a fresh reset email.',
    );
  });
});
