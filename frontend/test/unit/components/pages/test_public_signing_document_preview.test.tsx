import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicSigningDocumentPreview } from '../../../../src/components/pages/publicSigning/PublicSigningDocumentPreview';

const loadPageSizesMock = vi.fn();
const loadPdfFromFileMock = vi.fn();
const pdfViewerMock = vi.fn();

vi.mock('../../../../src/utils/pdf', () => ({
  loadPageSizes: (...args: unknown[]) => loadPageSizesMock(...args),
  loadPdfFromFile: (...args: unknown[]) => loadPdfFromFileMock(...args),
}));

vi.mock('../../../../src/components/viewer/PdfViewer', () => ({
  PdfViewer: (props: unknown) => {
    pdfViewerMock(props);
    return <div data-testid="public-signing-pdf-viewer" />;
  },
}));

describe('PublicSigningDocumentPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadPdfFromFileMock.mockResolvedValue({
      numPages: 2,
      destroy: vi.fn().mockResolvedValue(undefined),
    });
    loadPageSizesMock.mockResolvedValue({
      1: { width: 612, height: 792 },
      2: { width: 612, height: 792 },
    });
  });

  it('renders only the current signer signature anchors and numbers multiple placements', async () => {
    render(
      <PublicSigningDocumentPreview
        anchors={[
          {
            kind: 'signature',
            page: 2,
            rect: { x: 24, y: 48, width: 180, height: 36 },
            fieldId: 'signature-anchor-1',
            fieldName: 'signature_1',
          },
          {
            kind: 'signed_date',
            page: 2,
            rect: { x: 220, y: 48, width: 110, height: 24 },
            fieldId: 'signed-date-anchor-1',
            fieldName: 'signed_date_1',
          },
          {
            kind: 'signature',
            page: 2,
            rect: { x: 340, y: 48, width: 180, height: 36 },
            fieldId: 'signature-anchor-2',
            fieldName: 'signature_2',
          },
        ]}
        documentBlob={new Blob(['pdf'], { type: 'application/pdf' })}
        documentObjectUrl={null}
      />,
    );

    expect(await screen.findByTestId('public-signing-pdf-viewer')).toBeTruthy();
    await waitFor(() => {
      expect(pdfViewerMock).toHaveBeenCalled();
    });

    const lastCall = pdfViewerMock.mock.calls.at(-1)?.[0] as {
      fields: Array<{ id: string; name: string; page: number }>;
      pendingPageJump: number | null;
    };
    expect(lastCall.fields).toEqual([
      expect.objectContaining({ id: 'signature-anchor-1', name: 'Sign here 1', page: 2 }),
      expect.objectContaining({ id: 'signature-anchor-2', name: 'Sign here 2', page: 2 }),
    ]);
    expect(lastCall.pendingPageJump).toBe(2);
  });
});
