import { describe, expect, it } from 'vitest';

import {
  createPendingSessionDiagnostic,
  resolveSessionDiagnostic,
} from '../../../src/utils/sessionDiagnostics';

describe('sessionDiagnostics', () => {
  it('creates an unresolved placeholder while backend metadata is loading', () => {
    expect(createPendingSessionDiagnostic('sess-1', 4)).toEqual({
      sessionId: 'sess-1',
      sourcePdf: null,
      pageCount: 4,
      status: null,
      sourcePdfResolved: false,
    });
  });

  it('normalizes backend session status payloads for the header badge and logs', () => {
    expect(
      resolveSessionDiagnostic('sess-2', {
        sourcePdf: '  dental-intake.pdf  ',
        pageCount: '2',
        status: 'complete',
      }),
    ).toEqual({
      sessionId: 'sess-2',
      sourcePdf: 'dental-intake.pdf',
      pageCount: 2,
      status: 'complete',
      sourcePdfResolved: true,
    });
  });

  it('falls back to the current page count when the status payload omits it', () => {
    expect(
      resolveSessionDiagnostic('sess-3', { status: 'running' }, { fallbackPageCount: 6 }),
    ).toEqual({
      sessionId: 'sess-3',
      sourcePdf: null,
      pageCount: 6,
      status: 'running',
      sourcePdfResolved: false,
    });
  });
});
