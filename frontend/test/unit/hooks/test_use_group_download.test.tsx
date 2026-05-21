import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGroupDownload } from '../../../src/hooks/useGroupDownload';
import { ApiError } from '../../../src/services/apiConfig';

const downloadGroupPdfArchiveMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/api', () => ({
  ApiService: {
    downloadGroupPdfArchive: downloadGroupPdfArchiveMock,
  },
}));

function createSnapshot(formId: string, templateName: string, sourceFile: File) {
  return {
    formId,
    templateName,
    sourceFile,
    sourceFileName: `${templateName}.pdf`,
    pdfDoc: { destroy: vi.fn().mockResolvedValue(undefined) } as any,
    pageSizes: { 1: { width: 612, height: 792 } },
    pageCount: 1,
    currentPage: 1,
    scale: 1,
    fields: [
      {
        id: `${formId}-field`,
        name: `${templateName}_field`,
        type: 'text',
        page: 1,
        rect: { x: 10, y: 10, width: 120, height: 20 },
        value: templateName,
      },
    ],
    history: { undo: [], redo: [] },
    selectedFieldId: null,
    detectSessionId: null,
    mappingSessionId: null,
    hasRenamedFields: false,
    hasMappedSchema: false,
    checkboxRules: [],
    radioGroupSuggestions: [],
    textTransformRules: [],
    display: {
      showFields: true,
      showFieldNames: true,
      showFieldInfo: false,
      transformMode: false,
    },
  };
}

describe('useGroupDownload', () => {
  beforeEach(() => {
    downloadGroupPdfArchiveMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads the current group through one quota-enforced zip endpoint', async () => {
    const setLoadError = vi.fn();
    const setBannerNotice = vi.fn();
    const refreshProfile = vi.fn().mockResolvedValue(undefined);
    const ensureGroupTemplateSnapshot = vi.fn();
    const activeFile = new File(['alpha'], 'Alpha Packet.pdf', { type: 'application/pdf' });
    const cachedFile = new File(['bravo'], 'Bravo Intake.pdf', { type: 'application/pdf' });
    const activeSnapshot = createSnapshot('tpl-a', 'Alpha Packet', activeFile);
    const cachedSnapshot = createSnapshot('tpl-b', 'Bravo Intake', cachedFile);
    ensureGroupTemplateSnapshot.mockResolvedValue(cachedSnapshot);
    downloadGroupPdfArchiveMock.mockResolvedValue(new Blob(['zip'], { type: 'application/zip' }));

    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:group-download');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    let latest: ReturnType<typeof useGroupDownload> | null = null;
    function Harness() {
      latest = useGroupDownload({
        verifiedUser: { uid: 'user-1' },
        activeGroupId: 'group-1',
        activeGroupName: 'Admissions',
        activeGroupTemplates: [
          { id: 'tpl-a', name: 'Alpha Packet' },
          { id: 'tpl-b', name: 'Bravo Intake' },
        ],
        activeSavedFormId: 'tpl-a',
        captureActiveGroupTemplateSnapshot: () => activeSnapshot as any,
        ensureGroupTemplateSnapshot,
        refreshProfile,
        setLoadError,
        setBannerNotice,
      });
      return null;
    }

    render(<Harness />);

    if (!latest) {
      throw new Error('hook not initialized');
    }

    await act(async () => {
      await latest?.handleDownloadGroup();
    });

    expect(setLoadError.mock.calls).toEqual([[null]]);
    expect(downloadGroupPdfArchiveMock).toHaveBeenCalledTimes(1);
    const callPayload = downloadGroupPdfArchiveMock.mock.calls[0][0];
    expect(callPayload).toMatchObject({
      groupId: 'group-1',
      groupName: 'Admissions',
      downloadRequestId: expect.stringMatching(/^pdf_download_/),
    });
    expect(callPayload.items).toHaveLength(2);
    expect(callPayload.items[0]).toMatchObject({
      sourceFile: activeFile,
      filename: 'Alpha Packet.pdf',
      exportMode: 'editable',
      appearance: {
        globalFieldFont: undefined,
        globalFieldFontSize: undefined,
        globalFieldFontColor: undefined,
      },
    });
    expect(callPayload.items[1]).toMatchObject({
      sourceFile: cachedFile,
      filename: 'Bravo Intake.pdf',
      exportMode: 'editable',
    });
    expect(ensureGroupTemplateSnapshot).toHaveBeenCalledWith('tpl-b', 'Bravo Intake');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).not.toHaveBeenCalled();
    expect(setLoadError).toHaveBeenCalledWith(null);
    expect(setBannerNotice).not.toHaveBeenCalled();
    expect(createObjectUrlSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/zip' }));
    expect(refreshProfile).toHaveBeenCalledTimes(1);
  });

  it('shows quota copy when a group download would exceed the monthly PDF limit', async () => {
    const setLoadError = vi.fn();
    const setBannerNotice = vi.fn();
    const refreshProfile = vi.fn().mockResolvedValue(undefined);
    const activeFile = new File(['alpha'], 'Alpha Packet.pdf', { type: 'application/pdf' });
    const activeSnapshot = createSnapshot('tpl-a', 'Alpha Packet', activeFile);
    downloadGroupPdfArchiveMock.mockRejectedValue(new ApiError(
      'limit',
      429,
      'pdf_download_limit_reached',
      {
        detail: {
          code: 'pdf_download_limit_reached',
          monthlyLimit: 25,
          currentMonthUsage: 24,
          downloadsRemaining: 1,
          monthKey: '2026-05',
          pdfCount: 2,
        },
      },
    ));

    let latest: ReturnType<typeof useGroupDownload> | null = null;
    function Harness() {
      latest = useGroupDownload({
        verifiedUser: { uid: 'user-1' },
        activeGroupId: 'group-1',
        activeGroupName: 'Admissions',
        activeGroupTemplates: [
          { id: 'tpl-a', name: 'Alpha Packet' },
          { id: 'tpl-b', name: 'Bravo Intake' },
        ],
        activeSavedFormId: 'tpl-a',
        captureActiveGroupTemplateSnapshot: () => activeSnapshot as any,
        ensureGroupTemplateSnapshot: vi.fn().mockResolvedValue(createSnapshot(
          'tpl-b',
          'Bravo Intake',
          new File(['bravo'], 'Bravo Intake.pdf', { type: 'application/pdf' }),
        )),
        refreshProfile,
        setLoadError,
        setBannerNotice,
      });
      return null;
    }

    render(<Harness />);

    await act(async () => {
      await latest?.handleDownloadGroup();
    });

    expect(setLoadError).toHaveBeenCalledWith(
      'You have used all 25 generated PDF downloads for this month. Upgrade to Premium for unlimited downloads. This group export needs 2 downloads.',
    );
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    expect(setBannerNotice).not.toHaveBeenCalled();
  });
});
