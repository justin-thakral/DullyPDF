import type { WorkspaceSessionDiagnostic } from '../types';

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Build a placeholder diagnostic while the client is resolving session metadata
 * from the backend. This keeps the header honest by showing that the backend
 * source PDF has not been confirmed yet.
 */
export function createPendingSessionDiagnostic(
  sessionId: string,
  fallbackPageCount: number | null = null,
): WorkspaceSessionDiagnostic {
  return {
    sessionId,
    sourcePdf: null,
    pageCount: normalizeOptionalNumber(fallbackPageCount),
    status: null,
    sourcePdfResolved: false,
  };
}

/**
 * Normalize backend session status payloads into a single shape for the header
 * badge and the dev-only Rename/Map console trace.
 */
export function resolveSessionDiagnostic(
  sessionId: string,
  payload: unknown,
  options: { fallbackPageCount?: number | null } = {},
): WorkspaceSessionDiagnostic {
  const sessionPayload = payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : {};
  const sourcePdf = normalizeOptionalString(sessionPayload.sourcePdf);
  const pageCount = normalizeOptionalNumber(sessionPayload.pageCount)
    ?? normalizeOptionalNumber(options.fallbackPageCount);
  const status = normalizeOptionalString(sessionPayload.status);

  return {
    sessionId,
    sourcePdf,
    pageCount,
    status,
    sourcePdfResolved: Boolean(sourcePdf),
  };
}
