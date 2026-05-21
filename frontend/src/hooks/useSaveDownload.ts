import { useCallback, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import type { User } from 'firebase/auth';
import type {
  BannerNotice,
  CheckboxRule,
  ConfirmDialogOptions,
  FieldFontChoice,
  FieldFontColorChoice,
  FieldFontSizeChoice,
  FieldTextAlignmentChoice,
  PdfField,
  PromptDialogOptions,
  TextTransformRule,
} from '../types';
import { normaliseFormName, normalizeFieldValuesForMaterialize, prepareFieldsForMaterialize } from '../utils/fields';
import { debugLog } from '../utils/debug';
import { buildSavedFormEditorSnapshot } from '../utils/savedFormHydration';
import { ApiError } from '../services/apiConfig';
import type { MaterializePdfExportMode, PdfPageToolFinalPage } from '../services/api';
import { ApiService } from '../services/api';
import { validateCalculationExportReadiness } from '../utils/calculationFields';
import {
  buildPdfDownloadRequestId,
  formatPdfDownloadLimitMessage,
  isPdfDownloadLimitError,
} from '../utils/pdfDownloadQuota';

export interface UseSaveDownloadDeps {
  pdfDoc: PDFDocumentProxy | null;
  sourceFile: File | null;
  sourceFileName: string | null;
  fields: PdfField[];
  globalFieldFont: FieldFontChoice;
  globalFieldFontSize: FieldFontSizeChoice;
  globalFieldFontColor: FieldFontColorChoice;
  globalFieldAlignment: FieldTextAlignmentChoice;
  pageSizes: Record<number, { width: number; height: number }>;
  pageCount: number;
  checkboxRules: CheckboxRule[];
  textTransformRules: TextTransformRule[];
  hasRenamedFields: boolean;
  hasMappedSchema: boolean;
  mappingSessionId: string | null;
  activeSavedFormId: string | null;
  activeSavedFormName: string | null;
  activeGroupId?: string | null;
  activeGroupName?: string | null;
  savedFormsCount: number;
  savedFormsMax: number;
  verifiedUser: User | null;
  setBannerNotice: (notice: BannerNotice | null) => void;
  setLoadError: (message: string | null) => void;
  requestConfirm: (options: ConfirmDialogOptions) => Promise<boolean | null>;
  requestPrompt: (options: PromptDialogOptions) => Promise<string | null>;
  refreshSavedForms: (opts?: { allowRetry?: boolean; throwOnError?: boolean }) => Promise<unknown>;
  refreshGroups?: () => Promise<unknown> | void;
  refreshProfile?: () => Promise<unknown> | void;
  setActiveSavedFormId: (id: string | null) => void;
  setActiveSavedFormName: (name: string | null) => void;
  markGroupTemplatesPersisted?: (formIds?: string[]) => void;
  queueSaveAfterLimit: (action: () => Promise<void>) => void;
  allowAnonymousDownload?: boolean;
  onSaveSuccess?: (
    fields: PdfField[],
    checkboxRules: CheckboxRule[],
    globalFieldFont: FieldFontChoice,
    globalFieldFontSize: FieldFontSizeChoice,
    globalFieldFontColor: FieldFontColorChoice,
    globalFieldAlignment: FieldTextAlignmentChoice,
  ) => void;
}

export type DownloadSelectedPagesOptions = {
  pages: number[];
  exportMode?: MaterializePdfExportMode;
};

function triggerGeneratedPdfDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeSelectedDownloadPages(pages: number[], pageCount: number): number[] {
  const seen = new Set<number>();
  const normalized: number[] = [];
  for (const rawPage of pages) {
    const page = Number(rawPage);
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      throw new Error(`Selected pages must be between 1 and ${pageCount}.`);
    }
    if (!seen.has(page)) {
      seen.add(page);
      normalized.push(page);
    }
  }
  if (!normalized.length) {
    throw new Error('Choose at least one page to download.');
  }
  return normalized;
}

function buildSelectedPagesFilename(
  baseName: string,
  pages: number[],
  exportMode: MaterializePdfExportMode,
): string {
  const pageLabel = pages.length === 1 ? `page-${pages[0]}` : `${pages.length}-pages`;
  return `${baseName}-${pageLabel}-${exportMode}.pdf`;
}

function remapFieldsForSelectedPages(fields: PdfField[], selectedPages: number[]): PdfField[] {
  const nextPageByOriginalPage = new Map<number, number>();
  selectedPages.forEach((page, index) => {
    if (!nextPageByOriginalPage.has(page)) {
      nextPageByOriginalPage.set(page, index + 1);
    }
  });

  // This keeps selected-page export linear in field_count + selected_page_count.
  return fields.flatMap((field) => {
    const nextPage = nextPageByOriginalPage.get(field.page || 1);
    return nextPage ? [{ ...field, page: nextPage }] : [];
  });
}

export function useSaveDownload(deps: UseSaveDownloadDeps) {
  const [saveInProgress, setSaveInProgress] = useState(false);
  const [downloadInProgress, setDownloadInProgress] = useState(false);

  const queuePostSaveRefreshes = useCallback(() => {
    void Promise.allSettled([
      Promise.resolve().then(() => deps.refreshSavedForms()),
      Promise.resolve().then(() => deps.refreshGroups?.()),
      Promise.resolve().then(() => deps.refreshProfile?.()),
    ]).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') {
          debugLog('Failed to refresh workspace state after saving form', result.reason);
        }
      }
    });
  }, [deps]);

  const saveFormToProfile = useCallback(
    async ({
      saveName,
      overwriteFormId,
    }: { saveName: string; overwriteFormId?: string | null }): Promise<{ success: boolean; limitReached: boolean }> => {
      if (!deps.pdfDoc) {
        deps.setBannerNotice({ tone: 'error', message: 'No PDF is loaded to save.' });
        return { success: false, limitReached: false };
      }
      setSaveInProgress(true);
      try {
        let blob: Blob;
        if (deps.sourceFile) { blob = deps.sourceFile; }
        else {
          const data = await deps.pdfDoc.getData();
          blob = new Blob([new Uint8Array(data)], { type: 'application/pdf' });
        }
        const fieldsForSnapshot = normalizeFieldValuesForMaterialize(deps.fields);
        const fieldsForSave = prepareFieldsForMaterialize(
          deps.fields,
          deps.globalFieldFont,
          deps.globalFieldFontColor,
          { preserveAppOnlyFieldMarkers: true },
        );
        const checkboxRulesForSave = deps.checkboxRules;
        const textTransformRulesForSave = deps.textTransformRules;
        const editorSnapshot = buildSavedFormEditorSnapshot({
          pageCount: deps.pageCount || deps.pdfDoc.numPages,
          pageSizes: deps.pageSizes,
          fields: fieldsForSnapshot,
          globalFieldFont: deps.globalFieldFont,
          globalFieldFontSize: deps.globalFieldFontSize,
          globalFieldFontColor: deps.globalFieldFontColor,
          globalFieldAlignment: deps.globalFieldAlignment,
          hasRenamedFields: deps.hasRenamedFields,
          hasMappedSchema: deps.hasMappedSchema,
        });
        const generatedBlob = await ApiService.materializeFormPdf(blob, fieldsForSave, {
          appearance: {
            globalFieldFont: deps.globalFieldFont,
            globalFieldFontSize: deps.globalFieldFontSize,
            globalFieldFontColor: deps.globalFieldFontColor,
            globalFieldAlignment: deps.globalFieldAlignment,
          },
        });
        const payload = await ApiService.saveFormToProfile(
          generatedBlob, saveName, deps.mappingSessionId || undefined,
          overwriteFormId || undefined, checkboxRulesForSave, textTransformRulesForSave,
          editorSnapshot,
        );
        deps.setActiveSavedFormId(payload?.id || null);
        deps.setActiveSavedFormName(payload?.name || saveName);
        if (overwriteFormId) {
          try {
            deps.markGroupTemplatesPersisted?.([overwriteFormId]);
          } catch (error) {
            debugLog('Failed to mark group template persisted after save', error);
          }
        }
        try {
          deps.onSaveSuccess?.(
            fieldsForSnapshot,
            checkboxRulesForSave,
            deps.globalFieldFont,
            deps.globalFieldFontSize,
            deps.globalFieldFontColor,
            deps.globalFieldAlignment,
          );
        } catch (error) {
          debugLog('Failed to run post-save workspace sync', error);
        }
        queuePostSaveRefreshes();
        return { success: true, limitReached: false };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save form to profile.';
        const limitReached =
          error instanceof ApiError && error.status === 403 && message.toLowerCase().includes('saved form limit');
        if (!limitReached) deps.setBannerNotice({ tone: 'error', message });
        debugLog('Failed to save form', message);
        return { success: false, limitReached };
      } finally {
        setSaveInProgress(false);
      }
    },
    [deps, queuePostSaveRefreshes],
  );

  const handleSaveToProfile = useCallback(async () => {
    if (!deps.pdfDoc) { deps.setBannerNotice({ tone: 'error', message: 'No PDF is loaded to save.' }); return; }
    if (!deps.verifiedUser) { deps.setBannerNotice({ tone: 'error', message: 'Sign in to save this form to your profile.' }); return; }
    const maxSavedForms = deps.savedFormsMax;
    const savedFormsLimitReached = deps.savedFormsCount >= maxSavedForms;
    deps.setLoadError(null);
    const defaultName = normaliseFormName(deps.activeSavedFormName || deps.sourceFileName || deps.sourceFile?.name);
    const promptForName = async ({ forceSave = false }: { forceSave?: boolean } = {}) => {
      const raw = await deps.requestPrompt({
        title: 'Name this saved form', message: 'Enter a name to store this PDF in your saved forms list.',
        defaultValue: defaultName, placeholder: 'Saved form name', confirmLabel: 'Save',
        cancelLabel: 'Cancel', requireValue: true,
      });
      if (raw === null) return forceSave ? defaultName : null;
      const trimmed = raw.trim();
      if (!trimmed) {
        if (forceSave) return defaultName;
        deps.setBannerNotice({ tone: 'error', message: 'A form name is required to save.' });
        return null;
      }
      return normaliseFormName(trimmed);
    };
    const attemptSaveNew = async ({ forceSave = false }: { forceSave?: boolean } = {}) => {
      const nextName = await promptForName({ forceSave });
      if (!nextName) return;
      const result = await saveFormToProfile({ saveName: nextName });
      if (!result.success && result.limitReached) {
        deps.queueSaveAfterLimit(() => attemptSaveNew({ forceSave: true }));
      }
    };
    let shouldOverwrite = false;
    if (deps.activeSavedFormId && deps.activeGroupId) {
      const overwrite = await deps.requestConfirm({
        title: 'Overwrite group template?',
        message: `Save changes back to "${deps.activeSavedFormName || defaultName}" in "${deps.activeGroupName || 'this group'}"? Saving a new copy is disabled while a group is open so the active template does not leave the group.`,
        confirmLabel: 'Overwrite',
        cancelLabel: 'Cancel',
        tone: 'danger',
      });
      if (overwrite) { shouldOverwrite = true; }
      else { return; }
    } else if (deps.activeSavedFormId) {
      const overwrite = await deps.requestConfirm({
        title: 'Overwrite saved form?',
        message: 'This form is already saved. Overwrite it or save a new copy with a different name.',
        confirmLabel: 'Overwrite',
        cancelLabel: 'Save new copy',
        tone: 'danger',
        dismissResult: null,
      });
      if (overwrite === true) { shouldOverwrite = true; }
      else if (overwrite === false) {
        if (savedFormsLimitReached) { deps.queueSaveAfterLimit(() => attemptSaveNew({ forceSave: true })); return; }
        await attemptSaveNew(); return;
      } else {
        return;
      }
    } else {
      if (savedFormsLimitReached) { deps.queueSaveAfterLimit(() => attemptSaveNew({ forceSave: true })); return; }
      await attemptSaveNew(); return;
    }
    if (shouldOverwrite) {
      const result = await saveFormToProfile({ saveName: defaultName, overwriteFormId: deps.activeSavedFormId });
      if (!result.success && result.limitReached) {
        deps.setBannerNotice({ tone: 'error', message: 'Unable to overwrite saved form at the current limit.' });
      }
    }
  }, [deps, saveFormToProfile]);

  const runDownloadPreflight = useCallback((fieldsToValidate: PdfField[] = deps.fields): boolean => {
    if (!deps.pdfDoc) {
      deps.setLoadError('No PDF is loaded to download.');
      return false;
    }
    if (!deps.verifiedUser && !deps.allowAnonymousDownload) {
      deps.setLoadError('Sign in to download this form.');
      return false;
    }
    const calculationIssues = validateCalculationExportReadiness(fieldsToValidate);
    if (calculationIssues.length) {
      const issueSummary = calculationIssues.slice(0, 3).join(' ');
      const remainingCount = calculationIssues.length - 3;
      deps.setLoadError(
        `Fix calculation fields before download: ${issueSummary}${
          remainingCount > 0 ? ` ${remainingCount} more issue${remainingCount === 1 ? '' : 's'}.` : ''
        }`,
      );
      return false;
    }
    deps.setLoadError(null);
    return true;
  }, [deps]);

  const resolveSourcePdfBlob = useCallback(async (): Promise<Blob> => {
    if (deps.sourceFile) return deps.sourceFile;
    if (!deps.pdfDoc) {
      throw new Error('No PDF is loaded to download.');
    }
    const data = await deps.pdfDoc.getData();
    return new Blob([new Uint8Array(data)], { type: 'application/pdf' });
  }, [deps]);

  const materializeDownloadBlob = useCallback(async (
    sourceBlob: Blob,
    sourceFields: PdfField[],
    exportMode: MaterializePdfExportMode,
  ): Promise<Blob> => {
    const fieldsForDownload = prepareFieldsForMaterialize(
      sourceFields,
      deps.globalFieldFont,
      deps.globalFieldFontColor,
      { preserveAppOnlyFieldMarkers: exportMode === 'editable' },
    );
    return ApiService.materializeFormPdf(sourceBlob, fieldsForDownload, {
      exportMode,
      usageContext: 'workspace_download',
      appearance: {
        globalFieldFont: deps.globalFieldFont,
        globalFieldFontSize: deps.globalFieldFontSize,
        globalFieldFontColor: deps.globalFieldFontColor,
        globalFieldAlignment: deps.globalFieldAlignment,
      },
    });
  }, [deps]);

  const downloadQuotaEnforcedBlob = useCallback(async (
    sourceBlob: Blob,
    sourceFields: PdfField[],
    exportMode: MaterializePdfExportMode,
    filename: string,
  ): Promise<Blob> => {
    const fieldsForDownload = prepareFieldsForMaterialize(
      sourceFields,
      deps.globalFieldFont,
      deps.globalFieldFontColor,
      { preserveAppOnlyFieldMarkers: exportMode === 'editable' },
    );
    return ApiService.downloadFormPdf(sourceBlob, fieldsForDownload, {
      exportMode,
      filename,
      downloadRequestId: buildPdfDownloadRequestId(),
      appearance: {
        globalFieldFont: deps.globalFieldFont,
        globalFieldFontSize: deps.globalFieldFontSize,
        globalFieldFontColor: deps.globalFieldFontColor,
        globalFieldAlignment: deps.globalFieldAlignment,
      },
    });
  }, [deps]);

  const refreshProfileAfterDownload = useCallback(() => {
    void Promise.resolve()
      .then(() => deps.refreshProfile?.())
      .catch((error) => {
        debugLog('Failed to refresh profile after PDF download quota event', error);
      });
  }, [deps]);

  const handleDownload = useCallback(async (exportMode: MaterializePdfExportMode = 'editable') => {
    if (!runDownloadPreflight(deps.fields)) return;
    setDownloadInProgress(true);
    try {
      const blob = await resolveSourcePdfBlob();
      const sourceFilename = deps.sourceFileName || deps.sourceFile?.name || 'form.pdf';
      const generatedBlob = deps.verifiedUser
        ? await downloadQuotaEnforcedBlob(blob, deps.fields, exportMode, sourceFilename)
        : await materializeDownloadBlob(blob, deps.fields, exportMode);
      const baseName = normaliseFormName(deps.activeSavedFormName || deps.sourceFileName || deps.sourceFile?.name);
      const filename = exportMode === 'flat'
        ? `${baseName}-flat.pdf`
        : `${baseName}-editable.pdf`;
      triggerGeneratedPdfDownload(generatedBlob, filename);
      if (deps.verifiedUser) {
        refreshProfileAfterDownload();
      }
    } catch (error) {
      if (isPdfDownloadLimitError(error)) {
        deps.setLoadError(formatPdfDownloadLimitMessage(error));
        refreshProfileAfterDownload();
        debugLog('PDF download quota limit reached', error);
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to download form.';
      deps.setLoadError(message); debugLog('Failed to download form', message);
    } finally { setDownloadInProgress(false); }
  }, [
    deps,
    downloadQuotaEnforcedBlob,
    materializeDownloadBlob,
    refreshProfileAfterDownload,
    resolveSourcePdfBlob,
    runDownloadPreflight,
  ]);

  const handleDownloadSelectedPages = useCallback(async ({
    pages,
    exportMode = 'editable',
  }: DownloadSelectedPagesOptions): Promise<boolean> => {
    if (!deps.pdfDoc) {
      deps.setLoadError('No PDF is loaded to download.');
      return false;
    }
    if (!deps.verifiedUser) {
      deps.setLoadError('Sign in to download specific pages.');
      return false;
    }
    const pageCount = deps.pageCount || deps.pdfDoc?.numPages || 0;
    let selectedPages: number[];
    try {
      selectedPages = normalizeSelectedDownloadPages(pages, pageCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Choose at least one page to download.';
      deps.setLoadError(message);
      return false;
    }
    const selectedFields = remapFieldsForSelectedPages(deps.fields, selectedPages);
    if (!runDownloadPreflight(selectedFields)) return false;

    setDownloadInProgress(true);
    try {
      const sourceBlob = await resolveSourcePdfBlob();
      const finalPages: PdfPageToolFinalPage[] = selectedPages.map((page) => ({
        source: 'current',
        page,
        rotate: 0,
      }));
      const filename = deps.sourceFileName || deps.sourceFile?.name || 'document.pdf';
      const selectedSourceBlob = await ApiService.applyPdfPageTools(sourceBlob, finalPages, [], { filename });
      const generatedBlob = await downloadQuotaEnforcedBlob(
        selectedSourceBlob,
        selectedFields,
        exportMode,
        filename,
      );
      const baseName = normaliseFormName(deps.activeSavedFormName || deps.sourceFileName || deps.sourceFile?.name);
      triggerGeneratedPdfDownload(generatedBlob, buildSelectedPagesFilename(baseName, selectedPages, exportMode));
      refreshProfileAfterDownload();
      deps.setBannerNotice({
        tone: 'success',
        message: `Downloaded ${selectedPages.length} selected page${selectedPages.length === 1 ? '' : 's'}.`,
        autoDismissMs: 5000,
      });
      return true;
    } catch (error) {
      if (isPdfDownloadLimitError(error)) {
        deps.setLoadError(formatPdfDownloadLimitMessage(error));
        refreshProfileAfterDownload();
        debugLog('PDF download quota limit reached for selected pages', error);
        return false;
      }
      const message = error instanceof Error ? error.message : 'Failed to download selected pages.';
      deps.setLoadError(message);
      debugLog('Failed to download selected pages', message);
      return false;
    } finally {
      setDownloadInProgress(false);
    }
  }, [
    deps,
    downloadQuotaEnforcedBlob,
    refreshProfileAfterDownload,
    resolveSourcePdfBlob,
    runDownloadPreflight,
  ]);

  return {
    saveInProgress,
    downloadInProgress,
    handleSaveToProfile,
    handleDownload,
    handleDownloadSelectedPages,
  };
}
