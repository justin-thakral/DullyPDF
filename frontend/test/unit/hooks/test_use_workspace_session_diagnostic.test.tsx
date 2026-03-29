import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { useWorkspaceSessionDiagnostic } from '../../../src/hooks/useWorkspaceSessionDiagnostic';

const fetchDetectionStatusMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/detectionApi', () => ({
  fetchDetectionStatus: fetchDetectionStatusMock,
}));

function renderHookHarness(
  overrides: Partial<Parameters<typeof useWorkspaceSessionDiagnostic>[0]> = {},
) {
  let latest: ReturnType<typeof useWorkspaceSessionDiagnostic> | null = null;

  function Harness() {
    latest = useWorkspaceSessionDiagnostic({
      detectSessionId: 'sess-1',
      pageCount: 2,
      activeSavedFormId: 'saved-form-1',
      activeSavedFormName: 'Saved Form.pdf',
      sourceFileName: 'local-source.pdf',
      ...overrides,
    });
    return null;
  }

  render(<Harness />);

  return {
    get current() {
      if (!latest) {
        throw new Error('hook not initialized');
      }
      return latest;
    },
  };
}

describe('useWorkspaceSessionDiagnostic', () => {
  beforeEach(() => {
    fetchDetectionStatusMock.mockReset();
    vi.stubEnv('DEV', '1');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('resolves the active backend session into header-friendly state', async () => {
    fetchDetectionStatusMock.mockResolvedValue({
      sessionId: 'sess-1',
      sourcePdf: 'backend-source.pdf',
      pageCount: 2,
      status: 'complete',
    });

    const hook = renderHookHarness();

    await waitFor(() => {
      expect(hook.current.sessionDiagnostic).toEqual({
        sessionId: 'sess-1',
        sourcePdf: 'backend-source.pdf',
        pageCount: 2,
        status: 'complete',
        sourcePdfResolved: true,
      });
    });

    expect(fetchDetectionStatusMock).toHaveBeenCalledWith('sess-1');
  });

  it('refreshes and logs the session diagnostic before OpenAI actions', async () => {
    fetchDetectionStatusMock.mockResolvedValue({
      sessionId: 'sess-1',
      sourcePdf: 'backend-source.pdf',
      pageCount: 2,
      status: 'complete',
    });

    const hook = renderHookHarness();

    await act(async () => {
      await hook.current.onBeforeOpenAiAction('rename', 'sess-1');
    });

    expect(console.log).toHaveBeenCalledWith(
      '[dullypdf-ui]',
      'OpenAI workspace session diagnostic',
      expect.objectContaining({
        action: 'rename',
        sessionId: 'sess-1',
        sourcePdf: 'backend-source.pdf',
        sourcePdfResolved: true,
      }),
    );
    expect(hook.current.sessionDiagnostic?.sourcePdf).toBe('backend-source.pdf');
  });
});
