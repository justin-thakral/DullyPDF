import type { FirebaseError } from 'firebase/app';
import type { SupportedEmailActionMode } from './emailActions';

export const INVALID_LINK_MESSAGE =
  'This verification link is invalid, expired, or has already been used.';
export const UNSUPPORTED_LINK_MESSAGE = 'This email link is not supported by this page.';
export const RESET_LINK_REFRESH_MESSAGE =
  'For security, password reset links are kept only in this tab after they open. Request a fresh reset email to continue.';

function resolveFirebaseErrorCode(error: unknown): string {
  const candidate = error as FirebaseError & { code?: string };
  return typeof candidate?.code === 'string' ? candidate.code : '';
}

function isInvalidEmailActionError(error: unknown): boolean {
  const code = resolveFirebaseErrorCode(error);
  return code === 'auth/expired-action-code' || code === 'auth/invalid-action-code';
}

export function resolveEmailActionFailureMessage(
  mode: SupportedEmailActionMode,
  error: unknown,
): string {
  if (isInvalidEmailActionError(error)) {
    return INVALID_LINK_MESSAGE;
  }
  const code = resolveFirebaseErrorCode(error);
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (code === 'auth/network-request-failed') {
    return mode === 'verifyEmail'
      ? 'Unable to verify this email right now because the network request failed. Try the link again shortly.'
      : 'Unable to validate this password reset link right now because the network request failed. Try again shortly or request a fresh reset email.';
  }
  return mode === 'verifyEmail'
    ? 'Unable to verify this email right now. Try the link again shortly.'
    : 'Unable to validate this password reset link right now. Try again shortly or request a fresh reset email.';
}

export function resolveResetPasswordSubmitFailureMessage(error: unknown): string {
  if (isInvalidEmailActionError(error)) {
    return INVALID_LINK_MESSAGE;
  }
  const code = resolveFirebaseErrorCode(error);
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Unable to reset your password right now because the network request failed. Please try again or request a fresh reset email.';
  }
  return 'Unable to reset your password right now. Please try again or request a fresh reset email.';
}
