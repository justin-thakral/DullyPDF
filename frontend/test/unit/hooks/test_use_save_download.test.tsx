import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSaveDownload, type UseSaveDownloadDeps } from '../../../src/hooks/useSaveDownload';
import { ApiError } from '../../../src/services/apiConfig';

const materializeFormPdfMock = vi.hoisted(() => vi.fn());
const downloadFormPdfMock = vi.hoisted(() => vi.fn());
const saveFormToProfileMock = vi.hoisted(() => vi.fn());
const applyPdfPageToolsMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/api', () => ({
  ApiService: {
    applyPdfPageTools: applyPdfPageToolsMock,
    downloadFormPdf: downloadFormPdfMock,
    materializeFormPdf: materializeFormPdfMock,
    saveFormToProfile: saveFormToProfileMock,
  },
}));

function createDeps(overrides: Partial<UseSaveDownloadDeps> = {}): UseSaveDownloadDeps {
  return {
    pdfDoc: {
      getData: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      numPages: 1,
    } as Partial<PDFDocumentProxy> as PDFDocumentProxy,
    sourceFile: new File(['pdf'], 'template.pdf', { type: 'application/pdf' }),
    sourceFileName: 'template.pdf',
    fields: [{
      id: 'field-1',
      name: 'Field 1',
      type: 'text',
      page: 1,
      rect: { x: 10, y: 10, width: 100, height: 20 },
      value: null,
    }],
    globalFieldFont: 'default',
    globalFieldFontSize: 'auto',
    globalFieldFontColor: '#000000',
    globalFieldAlignment: 'left',
    pageSizes: {
      1: { width: 612, height: 792 },
    },
    pageCount: 1,
    checkboxRules: [],
    textTransformRules: [],
    hasRenamedFields: false,
    hasMappedSchema: false,
    mappingSessionId: 'mapping-session-1',
    activeSavedFormId: 'saved-form-1',
    activeSavedFormName: 'Template A',
    activeGroupId: 'group-1',
    activeGroupName: 'Admissions',
    savedFormsCount: 1,
    savedFormsMax: 10,
    verifiedUser: { uid: 'user-1' } as Partial<User> as User,
    setBannerNotice: vi.fn(),
    setLoadError: vi.fn(),
    requestConfirm: vi.fn().mockResolvedValue(true),
    requestPrompt: vi.fn().mockResolvedValue('Copy Name'),
    refreshSavedForms: vi.fn().mockResolvedValue(undefined),
    refreshGroups: vi.fn().mockResolvedValue(undefined),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    setActiveSavedFormId: vi.fn(),
    setActiveSavedFormName: vi.fn(),
    markGroupTemplatesPersisted: vi.fn(),
    queueSaveAfterLimit: vi.fn(),
    allowAnonymousDownload: false,
    onSaveSuccess: vi.fn(),
    ...overrides,
  };
}

function renderHookHarness(deps: UseSaveDownloadDeps) {
  return renderHook(() => useSaveDownload(deps)).result;
}

describe('useSaveDownload', () => {
  beforeEach(() => {
    applyPdfPageToolsMock.mockReset();
    downloadFormPdfMock.mockReset();
    materializeFormPdfMock.mockReset();
    saveFormToProfileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks save-new-copy when a group template is open and only allows overwrite', async () => {
    const deps = createDeps({
      requestConfirm: vi.fn().mockResolvedValue(false),
    });
    const hook = renderHookHarness(deps);

    await act(async () => {
      await hook.current.handleSaveToProfile();
    });

    expect(deps.requestConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Overwrite group template?',
    }));
    expect(deps.requestPrompt).not.toHaveBeenCalled();
    expect(materializeFormPdfMock).not.toHaveBeenCalled();
    expect(saveFormToProfileMock).not.toHaveBeenCalled();
  });

  it('overwrites the active group template and marks it persisted after save', async () => {
    materializeFormPdfMock.mockResolvedValue(new Blob(['generated']));
    saveFormToProfileMock.mockResolvedValue({ id: 'saved-form-1', name: 'Template A' });
    const deps = createDeps();
    const hook = renderHookHarness(deps);

    await act(async () => {
      await hook.current.handleSaveToProfile();
    });

    expect(deps.requestConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Overwrite group template?',
    }));
    expect(deps.requestPrompt).not.toHaveBeenCalled();
    expect(saveFormToProfileMock).toHaveBeenCalledWith(
      expect.any(Blob),
      'Template A',
      'mapping-session-1',
      'saved-form-1',
      [],
      [],
      expect.objectContaining({
        version: 2,
        pageCount: 1,
        hasRenamedFields: false,
        hasMappedSchema: false,
        radioGroups: [],
      }),
    );
    expect(deps.markGroupTemplatesPersisted).toHaveBeenCalledWith(['saved-form-1']);
  });

  it('keeps a completed save successful when post-save sync throws', async () => {
    materializeFormPdfMock.mockResolvedValue(new Blob(['generated']));
    saveFormToProfileMock.mockResolvedValue({ id: 'saved-form-2', name: 'Fresh Save' });
    const deps = createDeps({
      activeSavedFormId: null,
      activeSavedFormName: null,
      activeGroupId: null,
      activeGroupName: null,
      requestPrompt: vi.fn().mockResolvedValue('Fresh Save'),
      refreshSavedForms: vi.fn(() => { throw new TypeError('Failed to fetch'); }),
      onSaveSuccess: vi.fn(() => { throw new Error('post-save fingerprint failed'); }),
    });
    const hook = renderHookHarness(deps);

    await act(async () => {
      await hook.current.handleSaveToProfile();
    });

    expect(saveFormToProfileMock).toHaveBeenCalledWith(
      expect.any(Blob),
      'Fresh Save',
      'mapping-session-1',
      undefined,
      [],
      [],
      expect.objectContaining({
        version: 2,
        pageCount: 1,
      }),
    );
    expect(deps.setActiveSavedFormId).toHaveBeenCalledWith('saved-form-2');
    expect(deps.setActiveSavedFormName).toHaveBeenCalledWith('Fresh Save');
    expect(deps.setBannerNotice).not.toHaveBeenCalled();
    expect(hook.current.saveInProgress).toBe(false);
  });

  it('does not keep save spinning while follow-up refreshes are still pending', async () => {
    materializeFormPdfMock.mockResolvedValue(new Blob(['generated']));
    saveFormToProfileMock.mockResolvedValue({ id: 'saved-form-3', name: 'Fresh Save' });
    const deps = createDeps({
      activeSavedFormId: null,
      activeSavedFormName: null,
      activeGroupId: null,
      activeGroupName: null,
      requestPrompt: vi.fn().mockResolvedValue('Fresh Save'),
      refreshSavedForms: vi.fn(() => new Promise(() => {})),
      refreshGroups: vi.fn(() => new Promise(() => {})),
      refreshProfile: vi.fn(() => new Promise(() => {})),
    });
    const hook = renderHookHarness(deps);

    act(() => {
      void hook.current.handleSaveToProfile();
    });

    await waitFor(() => {
      expect(saveFormToProfileMock).toHaveBeenCalledTimes(1);
      expect(hook.current.saveInProgress).toBe(false);
    });

    expect(deps.setActiveSavedFormId).toHaveBeenCalledWith('saved-form-3');
    expect(deps.setActiveSavedFormName).toHaveBeenCalledWith('Fresh Save');
  });

  it('closes the overwrite dialog without opening save-new-copy when the dialog is dismissed', async () => {
    const deps = createDeps({
      activeGroupId: null,
      activeGroupName: null,
      requestConfirm: vi.fn().mockResolvedValueOnce(null),
    });
    const hook = renderHookHarness(deps);

    await act(async () => {
      await hook.current.handleSaveToProfile();
    });

    expect(deps.requestConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Overwrite saved form?',
      dismissResult: null,
    }));
    expect(deps.requestPrompt).not.toHaveBeenCalled();
    expect(materializeFormPdfMock).not.toHaveBeenCalled();
    expect(saveFormToProfileMock).not.toHaveBeenCalled();
  });

  it('downloads a flat PDF when requested and names the file accordingly', async () => {
    downloadFormPdfMock.mockResolvedValue(new Blob(['flat-pdf']));
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:flat-download');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let clickedDownloadName: string | null = null;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function recordDownloadName(this: HTMLAnchorElement) {
      clickedDownloadName = this.download;
    });
    const deps = createDeps();
    const hook = renderHookHarness(deps);

    await act(async () => {
      await hook.current.handleDownload('flat');
    });

    expect(downloadFormPdfMock).toHaveBeenCalledWith(
      deps.sourceFile,
      expect.any(Array),
      {
        exportMode: 'flat',
        filename: 'template.pdf',
        downloadRequestId: expect.stringMatching(/^pdf_download_/),
        appearance: {
          globalFieldFont: 'default',
          globalFieldFontSize: 'auto',
          globalFieldFontColor: '#000000',
          globalFieldAlignment: 'left',
        },
      },
    );
    expect(materializeFormPdfMock).not.toHaveBeenCalled();
    expect(createObjectUrlSpy).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(clickedDownloadName).toBe('Template A-flat.pdf');
    expect(deps.setLoadError).toHaveBeenCalledWith(null);
    expect(deps.refreshProfile).toHaveBeenCalledTimes(1);
  });

  it('keeps anonymous demo downloads on the internal materializer', async () => {
    materializeFormPdfMock.mockResolvedValue(new Blob(['demo-pdf']));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:demo-download');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const deps = createDeps({
      verifiedUser: null,
      allowAnonymousDownload: true,
    });
    const hook = renderHookHarness(deps);

    await act(async () => {
      await hook.current.handleDownload('editable');
    });

    expect(downloadFormPdfMock).not.toHaveBeenCalled();
    expect(materializeFormPdfMock).toHaveBeenCalledWith(
      deps.sourceFile,
      expect.any(Array),
      expect.objectContaining({
        exportMode: 'editable',
        usageContext: 'workspace_download',
      }),
    );
    expect(deps.refreshProfile).not.toHaveBeenCalled();
  });

  it('shows upgrade-focused copy when the monthly PDF download quota is exhausted', async () => {
    downloadFormPdfMock.mockRejectedValue(new ApiError(
      'server limit',
      429,
      'pdf_download_limit_reached',
      {
        detail: {
          code: 'pdf_download_limit_reached',
          monthlyLimit: 25,
          currentMonthUsage: 25,
          downloadsRemaining: 0,
          monthKey: '2026-05',
          pdfCount: 1,
        },
      },
    ));
    const deps = createDeps();
    const hook = renderHookHarness(deps);

    await act(async () => {
      await hook.current.handleDownload('editable');
    });

    expect(deps.setLoadError).toHaveBeenCalledWith(
      'You have used all 25 generated PDF downloads for this month. Upgrade to Premium for unlimited downloads.',
    );
    expect(deps.refreshProfile).toHaveBeenCalledTimes(1);
  });

  it('blocks downloads when calculation fields are not export-ready', async () => {
    const deps = createDeps({
      fields: [{
        id: 'total',
        name: 'Total',
        type: 'text',
        page: 1,
        rect: { x: 10, y: 10, width: 100, height: 20 },
        valueType: 'integer',
        calculation: {
          role: 'calculated_output',
          valueType: 'integer',
        },
      }],
    });
    const hook = renderHookHarness(deps);

    await act(async () => {
      await hook.current.handleDownload('editable');
    });

    expect(deps.setLoadError).toHaveBeenCalledWith(
      'Fix calculation fields before download: Total: Add at least one formula item.',
    );
    expect(downloadFormPdfMock).not.toHaveBeenCalled();
    expect(materializeFormPdfMock).not.toHaveBeenCalled();
  });

  it('downloads only selected pages after source-page subsetting and field remapping', async () => {
    const selectedSourceBlob = new Blob(['selected-source']);
    const generatedBlob = new Blob(['selected-generated']);
    applyPdfPageToolsMock.mockResolvedValue(selectedSourceBlob);
    downloadFormPdfMock.mockResolvedValue(generatedBlob);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:selected-download');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let clickedDownloadName: string | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function recordDownloadName(this: HTMLAnchorElement) {
      clickedDownloadName = this.download;
    });
    const deps = createDeps({
      pageCount: 3,
      fields: [
        {
          id: 'page-1-field',
          name: 'Page 1 Field',
          type: 'text',
          page: 1,
          rect: { x: 10, y: 10, width: 100, height: 20 },
          value: 'ignore',
        },
        {
          id: 'page-2-field',
          name: 'Page 2 Field',
          type: 'text',
          page: 2,
          rect: { x: 20, y: 20, width: 100, height: 20 },
          value: 'include',
        },
      ],
    });
    const hook = renderHookHarness(deps);

    let result = false;
    await act(async () => {
      result = await hook.current.handleDownloadSelectedPages({ pages: [2], exportMode: 'flat' });
    });

    expect(result).toBe(true);
    expect(applyPdfPageToolsMock).toHaveBeenCalledWith(
      deps.sourceFile,
      [{ source: 'current', page: 2, rotate: 0 }],
      [],
      { filename: 'template.pdf' },
    );
    expect(downloadFormPdfMock).toHaveBeenCalledWith(
      selectedSourceBlob,
      [
        expect.objectContaining({
          id: 'page-2-field',
          page: 1,
        }),
      ],
      expect.objectContaining({
        exportMode: 'flat',
        filename: 'template.pdf',
        downloadRequestId: expect.stringMatching(/^pdf_download_/),
      }),
    );
    expect(materializeFormPdfMock).not.toHaveBeenCalled();
    expect(clickedDownloadName).toBe('Template A-page-2-flat.pdf');
    expect(deps.refreshProfile).toHaveBeenCalledTimes(1);
    expect(deps.setBannerNotice).toHaveBeenCalledWith(expect.objectContaining({
      tone: 'success',
      message: 'Downloaded 1 selected page.',
    }));
  });

  it('does not block selected-page download on broken calculations from unselected pages', async () => {
    applyPdfPageToolsMock.mockResolvedValue(new Blob(['selected-source']));
    downloadFormPdfMock.mockResolvedValue(new Blob(['selected-generated']));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:selected-download');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const deps = createDeps({
      pageCount: 2,
      fields: [
        {
          id: 'broken-total',
          name: 'Broken Total',
          type: 'text',
          page: 1,
          rect: { x: 10, y: 10, width: 100, height: 20 },
          valueType: 'integer',
          calculation: {
            role: 'calculated_output',
            valueType: 'integer',
          },
        },
        {
          id: 'safe-field',
          name: 'Safe Field',
          type: 'text',
          page: 2,
          rect: { x: 20, y: 20, width: 100, height: 20 },
          value: 'ok',
        },
      ],
    });
    const hook = renderHookHarness(deps);

    let result = false;
    await act(async () => {
      result = await hook.current.handleDownloadSelectedPages({ pages: [2], exportMode: 'editable' });
    });

    expect(result).toBe(true);
    expect(applyPdfPageToolsMock).toHaveBeenCalledTimes(1);
    expect(downloadFormPdfMock).toHaveBeenCalledWith(
      expect.any(Blob),
      [expect.objectContaining({ id: 'safe-field', page: 1 })],
      expect.objectContaining({ exportMode: 'editable' }),
    );
    expect(deps.setLoadError).toHaveBeenLastCalledWith(null);
  });

  it('blocks selected-page download before calling authenticated page tools when only anonymous demo download is allowed', async () => {
    const deps = createDeps({
      verifiedUser: null,
      allowAnonymousDownload: true,
    });
    const hook = renderHookHarness(deps);

    let result = true;
    await act(async () => {
      result = await hook.current.handleDownloadSelectedPages({ pages: [1], exportMode: 'editable' });
    });

    expect(result).toBe(false);
    expect(deps.setLoadError).toHaveBeenCalledWith('Sign in to download specific pages.');
    expect(applyPdfPageToolsMock).not.toHaveBeenCalled();
    expect(downloadFormPdfMock).not.toHaveBeenCalled();
    expect(materializeFormPdfMock).not.toHaveBeenCalled();
  });

  it('rejects non-integer selected pages instead of truncating them', async () => {
    const deps = createDeps({ pageCount: 3 });
    const hook = renderHookHarness(deps);

    let result = true;
    await act(async () => {
      result = await hook.current.handleDownloadSelectedPages({ pages: [1.5], exportMode: 'editable' });
    });

    expect(result).toBe(false);
    expect(deps.setLoadError).toHaveBeenCalledWith('Selected pages must be between 1 and 3.');
    expect(applyPdfPageToolsMock).not.toHaveBeenCalled();
    expect(downloadFormPdfMock).not.toHaveBeenCalled();
    expect(materializeFormPdfMock).not.toHaveBeenCalled();
  });
});
