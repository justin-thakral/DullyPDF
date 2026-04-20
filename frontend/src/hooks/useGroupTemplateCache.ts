import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { MAX_FIELD_HISTORY } from '../config/appConstants';
import {
  ApiService,
  type SavedFormSummary,
  type SearchFillSourceKind,
  type SearchFillUsageResponse,
  type TemplateGroupSummary,
} from '../services/api';
import { ApiError } from '../services/apiConfig';
import type { StructuredFillCommitProvenance } from '../components/features/SearchFillModal';
import type {
  BannerNotice,
  CheckboxRule,
  DataSourceKind,
  PageSize,
  PdfField,
  RadioGroupSuggestion,
  TextTransformRule,
} from '../types';
import { debugLog } from '../utils/debug';
import { extractFieldsFromPdf, loadPageSizes, loadPdfFromFile } from '../utils/pdf';
import {
  applySearchFillRowToFieldsWithStats,
  SEARCH_FILL_NO_MATCH_MESSAGE,
} from '../utils/searchFillApply';
import {
  buildSavedFormEditorSnapshot,
  extractSavedFormFillRuleState,
  normalizeSavedFormEditorSnapshot,
} from '../utils/savedFormHydration';

type SearchFillPresetState = {
  query: string;
  searchKey?: string;
  searchMode?: 'contains' | 'equals';
  autoRun?: boolean;
  autoFillOnSearch?: boolean;
  highlightResult?: boolean;
  token: number;
} | null;

export type DirtyGroupTemplateRecord = {
  formId: string;
  templateName: string;
};

export type GroupTemplateWorkspaceSnapshot = {
  formId: string;
  templateName: string;
  sourceFile: File;
  sourceFileName: string;
  pdfDoc: PDFDocumentProxy;
  pageSizes: Record<number, PageSize>;
  pageCount: number;
  currentPage: number;
  scale: number;
  fields: PdfField[];
  history: {
    undo: PdfField[][];
    redo: PdfField[][];
  };
  selectedFieldId: string | null;
  detectSessionId: string | null;
  mappingSessionId: string | null;
  hasRenamedFields: boolean;
  hasMappedSchema: boolean;
  checkboxRules: CheckboxRule[];
  radioGroupSuggestions: RadioGroupSuggestion[];
  textTransformRules: TextTransformRule[];
};

type GroupTemplateCacheEntry =
  | {
      status: 'loading';
      templateName: string;
      promise: Promise<GroupTemplateWorkspaceSnapshot>;
      token: number;
    }
  | {
      status: 'ready';
      templateName: string;
      snapshot: GroupTemplateWorkspaceSnapshot;
      snapshotSignature: string;
      persistedSignature: string;
      token: number;
    }
  | {
      status: 'error';
      templateName: string;
      error: string;
      token: number;
    };

type GroupRuntimeState = {
  groups: TemplateGroupSummary[];
  groupsLoading: boolean;
  activeGroupId: string | null;
  activeGroupName: string | null;
  activeGroupTemplateIds: string[];
  setActiveGroupId: Dispatch<SetStateAction<string | null>>;
  setActiveGroupName: Dispatch<SetStateAction<string | null>>;
  setActiveGroupTemplateIds: Dispatch<SetStateAction<string[]>>;
  groupRenameMapInProgress: boolean;
};

type SavedFormsRuntimeState = {
  savedForms: SavedFormSummary[];
  activeSavedFormId: string | null;
  activeSavedFormName: string | null;
  pendingSavedFormId: string | null;
  setActiveSavedFormId: Dispatch<SetStateAction<string | null>>;
  setActiveSavedFormName: Dispatch<SetStateAction<string | null>>;
  openSavedFormWithinGroup: (
    formId: string,
    groupContext?: { id: string; name: string; templateIds: string[] } | null,
  ) => Promise<boolean>;
};

type DocumentRuntimeState = {
  pdfDoc: PDFDocumentProxy | null;
  sourceFile: File | null;
  sourceFileName: string | null;
  pageSizes: Record<number, PageSize>;
  pageCount: number;
  currentPage: number;
  scale: number;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setShowHomepage: Dispatch<SetStateAction<boolean>>;
  setShowSearchFill: Dispatch<SetStateAction<boolean>>;
  bumpSearchFillSession: () => void;
  setSearchFillPreset: Dispatch<SetStateAction<SearchFillPresetState>>;
  setShowFillLinkManager: Dispatch<SetStateAction<boolean>>;
  setSourceFile: Dispatch<SetStateAction<File | null>>;
  setSourceFileName: Dispatch<SetStateAction<string | null>>;
  setSourceFileIsDemo: Dispatch<SetStateAction<boolean>>;
  setPdfDoc: Dispatch<SetStateAction<PDFDocumentProxy | null>>;
  setPageSizes: Dispatch<SetStateAction<Record<number, PageSize>>>;
  setPageCount: Dispatch<SetStateAction<number>>;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  setScale: Dispatch<SetStateAction<number>>;
  setPendingPageJump: Dispatch<SetStateAction<number | null>>;
};

type FieldHistoryRuntimeState = {
  fields: PdfField[];
  fieldsRef: MutableRefObject<PdfField[]>;
  historyRef: MutableRefObject<{ undo: PdfField[][]; redo: PdfField[][] }>;
  historyTick: number;
  restoreState: (
    nextFields: PdfField[],
    history?: {
      undo?: PdfField[][];
      redo?: PdfField[][];
    } | null,
  ) => void;
};

type FieldSelectionRuntimeState = {
  selectedFieldId: string | null;
  setSelectedFieldId: Dispatch<SetStateAction<string | null>>;
  handleFieldsChange: (nextFields: PdfField[]) => void;
};

type DetectionRuntimeState = {
  detectSessionId: string | null;
  mappingSessionId: string | null;
  resetProcessing: () => void;
  setDetectSessionId: Dispatch<SetStateAction<string | null>>;
  setMappingSessionId: Dispatch<SetStateAction<string | null>>;
};

type OpenAiRuntimeState = {
  renameInProgress: boolean;
  mappingInProgress: boolean;
  mapSchemaInProgress: boolean;
  hasRenamedFields: boolean;
  hasMappedSchema: boolean;
  checkboxRules: CheckboxRule[];
  textTransformRules: TextTransformRule[];
  radioGroupSuggestions: RadioGroupSuggestion[];
  setRenameInProgress: Dispatch<SetStateAction<boolean>>;
  setMappingInProgress: Dispatch<SetStateAction<boolean>>;
  setHasRenamedFields: Dispatch<SetStateAction<boolean>>;
  setHasMappedSchema: Dispatch<SetStateAction<boolean>>;
  setCheckboxRules: Dispatch<SetStateAction<CheckboxRule[]>>;
  setRadioGroupSuggestions: Dispatch<SetStateAction<RadioGroupSuggestion[]>>;
  setTextTransformRules: Dispatch<SetStateAction<TextTransformRule[]>>;
  setOpenAiError: Dispatch<SetStateAction<string | null>>;
};

type SearchFillRuntimeState = {
  dataSourceKind: DataSourceKind;
  dataSourceLabel?: string | null;
  identifierKey?: string | null;
};

const STRUCTURED_FILL_SOURCE_KINDS: ReadonlySet<SearchFillSourceKind> = new Set([
  'csv',
  'excel',
  'sql',
  'json',
  'txt',
]);

function toStructuredFillSourceKind(value: DataSourceKind): SearchFillSourceKind | null {
  return STRUCTURED_FILL_SOURCE_KINDS.has(value as SearchFillSourceKind)
    ? (value as SearchFillSourceKind)
    : null;
}

function buildStructuredFillRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `sf_${crypto.randomUUID()}`;
  }
  return `sf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function sha256HexForGroupFingerprint(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const buf = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a_${hash.toString(16).padStart(8, '0')}`;
}

async function buildGroupRecordFingerprint(
  row: Record<string, unknown>,
  identifierKey: string | null | undefined,
): Promise<string | null> {
  const parts: string[] = [];
  const push = (value: unknown) => {
    const text = String(value ?? '').trim();
    if (text) parts.push(text);
  };
  if (identifierKey && row[identifierKey] !== undefined) push(row[identifierKey]);
  const lowered = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    lowered.set(key.toLowerCase(), value);
  }
  push(lowered.get('full_name'));
  push(lowered.get('first_name'));
  push(lowered.get('last_name'));
  push(lowered.get('dob') ?? lowered.get('date_of_birth'));
  if (parts.length === 0) return null;
  return sha256HexForGroupFingerprint(parts.join('|'));
}

type UseGroupTemplateCacheDeps = {
  verifiedUser: unknown;
  group: GroupRuntimeState;
  savedForms: SavedFormsRuntimeState;
  document: DocumentRuntimeState;
  fieldHistory: FieldHistoryRuntimeState;
  fieldSelection: FieldSelectionRuntimeState;
  detection: DetectionRuntimeState;
  openAi: OpenAiRuntimeState;
  searchFill: SearchFillRuntimeState;
  setBannerNotice: (notice: BannerNotice | null) => void;
  markSavedFillLinkSnapshot: (fields: PdfField[], checkboxRules: CheckboxRule[]) => void;
};

const GROUP_TEMPLATE_LOAD_TIMEOUT_MS = 15_000;
const GROUP_TEMPLATE_PREFETCH_DELAY_MS = 75;

function clonePdfField(field: PdfField): PdfField {
  return {
    ...field,
    rect: { ...field.rect },
  };
}

function clonePdfFields(fields: PdfField[]): PdfField[] {
  return fields.map(clonePdfField);
}

function buildGroupTemplatePersistedSignature(snapshot: GroupTemplateWorkspaceSnapshot): string {
  return JSON.stringify({
    fields: snapshot.fields.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.type,
      page: field.page,
      rect: {
        x: field.rect.x,
        y: field.rect.y,
        width: field.rect.width,
        height: field.rect.height,
      },
      value: field.value ?? null,
      groupKey: field.groupKey ?? null,
      optionKey: field.optionKey ?? null,
      optionLabel: field.optionLabel ?? null,
      groupLabel: field.groupLabel ?? null,
      fieldConfidence: field.fieldConfidence ?? null,
      mappingConfidence: field.mappingConfidence ?? null,
      renameConfidence: field.renameConfidence ?? null,
    })),
    hasRenamedFields: snapshot.hasRenamedFields,
    hasMappedSchema: snapshot.hasMappedSchema,
    checkboxRules: snapshot.checkboxRules,
    textTransformRules: snapshot.textTransformRules,
  });
}

function cloneFieldHistoryStacks(history: { undo: PdfField[][]; redo: PdfField[][] }) {
  return {
    undo: history.undo.map((snapshot) => clonePdfFields(snapshot)),
    redo: history.redo.map((snapshot) => clonePdfFields(snapshot)),
  };
}

function cloneCheckboxRules(rules: CheckboxRule[]): CheckboxRule[] {
  return rules.map((rule) => ({
    ...rule,
    valueMap: rule.valueMap ? { ...rule.valueMap } : undefined,
  }));
}

function cloneTextTransformRules(rules: TextTransformRule[]): TextTransformRule[] {
  return rules.map((rule) => ({ ...rule, sources: Array.isArray(rule.sources) ? [...rule.sources] : [] }));
}

function cloneRadioGroupSuggestions(suggestions: RadioGroupSuggestion[] | null | undefined): RadioGroupSuggestion[] {
  return (suggestions ?? []).map((suggestion) => ({
    ...suggestion,
    suggestedFields: suggestion.suggestedFields.map((field) => ({ ...field })),
  }));
}

function releasePdfDocument(doc: PDFDocumentProxy | null | undefined): void {
  if (!doc) return;
  void doc.destroy().catch((error) => {
    debugLog('Failed to release cached PDF document resources', error);
  });
}

export function resolveGroupTemplates(
  group: Pick<TemplateGroupSummary, 'templateIds' | 'templates'> | null,
  savedForms: SavedFormSummary[],
): SavedFormSummary[] {
  if (!group) return [];
  const savedFormLookup = new Map(savedForms.map((form) => [form.id, form] as const));
  const resolved = group.templateIds
    .map((templateId) => savedFormLookup.get(templateId) ?? group.templates.find((entry) => entry.id === templateId) ?? null)
    .filter((entry): entry is SavedFormSummary => Boolean(entry));
  return resolved.sort((left, right) => left.name.localeCompare(right.name));
}

export function useGroupTemplateCache(deps: UseGroupTemplateCacheDeps) {
  const {
    group,
    savedForms,
    document: documentState,
    fieldHistory,
    fieldSelection,
    detection,
    openAi,
    searchFill,
    setBannerNotice,
    markSavedFillLinkSnapshot,
    verifiedUser,
  } = deps;
  const [groupSwitchingTemplateId, setGroupSwitchingTemplateId] = useState<string | null>(null);
  const [groupCacheVersion, setGroupCacheVersion] = useState(0);
  const groupTemplateCacheRef = useRef<Map<string, GroupTemplateCacheEntry>>(new Map());
  const retainedGroupPdfDocsRef = useRef<Set<PDFDocumentProxy>>(new Set());
  const groupCacheTokenRef = useRef(0);
  const activePdfDocRef = useRef<PDFDocumentProxy | null>(null);

  const activeGroup = useMemo(
    () => group.groups.find((entry) => entry.id === group.activeGroupId) ?? null,
    [group.activeGroupId, group.groups],
  );

  const activeGroupTemplates = useMemo(
    () => resolveGroupTemplates(
      activeGroup ?? (group.activeGroupId && group.activeGroupName ? {
        id: group.activeGroupId,
        name: group.activeGroupName,
        templateIds: group.activeGroupTemplateIds,
        templateCount: group.activeGroupTemplateIds.length,
        templates: [],
      } : null),
      savedForms.savedForms,
    ),
    [activeGroup, group.activeGroupId, group.activeGroupName, group.activeGroupTemplateIds, savedForms.savedForms],
  );

  const bumpGroupCacheVersion = useCallback(() => {
    setGroupCacheVersion((prev) => prev + 1);
  }, []);

  const setReadyGroupTemplateSnapshot = useCallback((
    snapshot: GroupTemplateWorkspaceSnapshot,
    token: number,
    options?: { persistedSignature?: string },
  ) => {
    const existing = groupTemplateCacheRef.current.get(snapshot.formId);
    const snapshotSignature = buildGroupTemplatePersistedSignature(snapshot);
    const persistedSignature = options?.persistedSignature
      ?? (existing?.status === 'ready' ? existing.persistedSignature : snapshotSignature);
    retainedGroupPdfDocsRef.current.add(snapshot.pdfDoc);
    groupTemplateCacheRef.current.set(snapshot.formId, {
      status: 'ready',
      templateName: snapshot.templateName,
      snapshot,
      snapshotSignature,
      persistedSignature,
      token,
    });
    bumpGroupCacheVersion();
  }, [bumpGroupCacheVersion]);

  const clearGroupTemplateCache = useCallback((options?: { preserveFormId?: string | null }) => {
    groupCacheTokenRef.current += 1;
    const preserveFormId = options?.preserveFormId ?? null;
    const nextCache = new Map<string, GroupTemplateCacheEntry>();
    for (const [formId, entry] of groupTemplateCacheRef.current.entries()) {
      if (preserveFormId && formId === preserveFormId) {
        nextCache.set(formId, entry);
        continue;
      }
      if (entry.status === 'ready') {
        retainedGroupPdfDocsRef.current.delete(entry.snapshot.pdfDoc);
        if (entry.snapshot.pdfDoc !== documentState.pdfDoc) {
          releasePdfDocument(entry.snapshot.pdfDoc);
        }
      }
    }
    groupTemplateCacheRef.current = nextCache;
    bumpGroupCacheVersion();
  }, [bumpGroupCacheVersion, documentState.pdfDoc]);

  const captureActiveGroupTemplateSnapshot = useCallback((): GroupTemplateWorkspaceSnapshot | null => {
    if (!group.activeGroupId || !savedForms.activeSavedFormId || !documentState.pdfDoc || !documentState.sourceFile) {
      return null;
    }
    const templateName = savedForms.activeSavedFormName || documentState.sourceFileName || 'Saved form';
    return {
      formId: savedForms.activeSavedFormId,
      templateName,
      sourceFile: documentState.sourceFile,
      sourceFileName: documentState.sourceFileName || templateName,
      pdfDoc: documentState.pdfDoc,
      pageSizes: { ...documentState.pageSizes },
      pageCount: documentState.pageCount,
      currentPage: documentState.currentPage,
      scale: documentState.scale,
      fields: clonePdfFields(fieldHistory.fieldsRef.current),
      history: cloneFieldHistoryStacks(fieldHistory.historyRef.current),
      selectedFieldId: fieldSelection.selectedFieldId,
      detectSessionId: detection.detectSessionId,
      mappingSessionId: detection.mappingSessionId,
      hasRenamedFields: openAi.hasRenamedFields,
      hasMappedSchema: openAi.hasMappedSchema,
      checkboxRules: cloneCheckboxRules(openAi.checkboxRules),
      radioGroupSuggestions: cloneRadioGroupSuggestions(openAi.radioGroupSuggestions),
      textTransformRules: cloneTextTransformRules(openAi.textTransformRules),
    };
  }, [
    detection.detectSessionId,
    detection.mappingSessionId,
    documentState.currentPage,
    documentState.pageCount,
    documentState.pageSizes,
    documentState.pdfDoc,
    documentState.scale,
    documentState.sourceFile,
    documentState.sourceFileName,
    fieldHistory.fieldsRef,
    fieldHistory.historyRef,
    fieldSelection.selectedFieldId,
    group.activeGroupId,
    openAi.checkboxRules,
    openAi.hasMappedSchema,
    openAi.hasRenamedFields,
    openAi.radioGroupSuggestions,
    openAi.textTransformRules,
    savedForms.activeSavedFormId,
    savedForms.activeSavedFormName,
  ]);

  const storeActiveGroupTemplateSnapshot = useCallback((): GroupTemplateWorkspaceSnapshot | null => {
    const snapshot = captureActiveGroupTemplateSnapshot();
    if (!snapshot) return null;
    const existing = groupTemplateCacheRef.current.get(snapshot.formId);
    setReadyGroupTemplateSnapshot(
      snapshot,
      groupCacheTokenRef.current,
      existing?.status === 'ready' ? { persistedSignature: existing.persistedSignature } : undefined,
    );
    return snapshot;
  }, [captureActiveGroupTemplateSnapshot, setReadyGroupTemplateSnapshot]);

  const resolveDirtyGroupTemplateRecords = useCallback((formIds?: string[]): DirtyGroupTemplateRecord[] => {
    if (!group.activeGroupId) {
      return [];
    }
    const targetIds = formIds?.length ? new Set(formIds) : null;
    const dirtyTemplates = new Map<string, DirtyGroupTemplateRecord>();
    const activeSnapshot = captureActiveGroupTemplateSnapshot();
    const activeSignature = activeSnapshot ? buildGroupTemplatePersistedSignature(activeSnapshot) : null;
    if (
      activeSnapshot &&
      activeSignature &&
      (!targetIds || targetIds.has(activeSnapshot.formId))
    ) {
      const activeEntry = groupTemplateCacheRef.current.get(activeSnapshot.formId);
      const persistedSignature = activeEntry?.status === 'ready'
        ? activeEntry.persistedSignature
        : activeSignature;
      if (activeSignature !== persistedSignature) {
        dirtyTemplates.set(activeSnapshot.formId, {
          formId: activeSnapshot.formId,
          templateName: activeSnapshot.templateName,
        });
      }
    }
    for (const [formId, entry] of groupTemplateCacheRef.current.entries()) {
      if (formId === activeSnapshot?.formId) continue;
      if (targetIds && !targetIds.has(formId)) continue;
      if (entry?.status !== 'ready') continue;
      if (entry.snapshotSignature !== entry.persistedSignature) {
        dirtyTemplates.set(formId, {
          formId,
          templateName: entry.snapshot.templateName,
        });
      }
    }
    return Array.from(dirtyTemplates.values());
  }, [captureActiveGroupTemplateSnapshot, group.activeGroupId]);

  const resolveGroupTemplateDirtyNames = useCallback((): string[] => {
    return resolveDirtyGroupTemplateRecords().map((record) => record.templateName);
  }, [resolveDirtyGroupTemplateRecords]);

  const isActiveGroupTemplateDirty = useCallback((): boolean => {
    if (!group.activeGroupId) return false;
    const activeSnapshot = captureActiveGroupTemplateSnapshot();
    if (!activeSnapshot) return false;
    const activeSignature = buildGroupTemplatePersistedSignature(activeSnapshot);
    const activeEntry = groupTemplateCacheRef.current.get(activeSnapshot.formId);
    const persistedSignature = activeEntry?.status === 'ready'
      ? activeEntry.persistedSignature
      : activeSignature;
    return activeSignature !== persistedSignature;
  }, [captureActiveGroupTemplateSnapshot, group.activeGroupId]);

  const markGroupTemplatesPersisted = useCallback((formIds?: string[]) => {
    const targetIds = formIds?.length
      ? new Set(formIds)
      : new Set(group.activeGroupTemplateIds);
    if (!targetIds.size) return;
    const activeSnapshot = captureActiveGroupTemplateSnapshot();
    if (activeSnapshot && targetIds.has(activeSnapshot.formId)) {
      const activeSignature = buildGroupTemplatePersistedSignature(activeSnapshot);
      setReadyGroupTemplateSnapshot(activeSnapshot, groupCacheTokenRef.current, {
        persistedSignature: activeSignature,
      });
      targetIds.delete(activeSnapshot.formId);
    }
    if (!targetIds.size) return;
    let mutated = false;
    for (const formId of targetIds) {
      const entry = groupTemplateCacheRef.current.get(formId);
      if (entry?.status !== 'ready') continue;
      const nextPersistedSignature = entry.snapshotSignature;
      if (nextPersistedSignature === entry.persistedSignature) continue;
      groupTemplateCacheRef.current.set(formId, {
        ...entry,
        persistedSignature: nextPersistedSignature,
      });
      mutated = true;
    }
    if (mutated) {
      bumpGroupCacheVersion();
    }
  }, [bumpGroupCacheVersion, captureActiveGroupTemplateSnapshot, group.activeGroupTemplateIds, setReadyGroupTemplateSnapshot]);

  const applyGroupTemplateSnapshot = useCallback((snapshot: GroupTemplateWorkspaceSnapshot) => {
    documentState.setLoadError(null);
    documentState.setShowHomepage(false);
    documentState.setShowSearchFill(false);
    documentState.bumpSearchFillSession();
    documentState.setSearchFillPreset(null);
    documentState.setShowFillLinkManager(false);
    documentState.setSourceFile(snapshot.sourceFile);
    documentState.setSourceFileName(snapshot.sourceFileName);
    documentState.setSourceFileIsDemo(false);
    documentState.setPdfDoc(snapshot.pdfDoc);
    documentState.setPageSizes({ ...snapshot.pageSizes });
    documentState.setPageCount(snapshot.pageCount);
    documentState.setCurrentPage(Math.max(1, Math.min(snapshot.currentPage || 1, snapshot.pageCount || 1)));
    documentState.setScale(snapshot.scale || 1);
    documentState.setPendingPageJump(null);
    fieldHistory.restoreState(
      clonePdfFields(snapshot.fields),
      cloneFieldHistoryStacks(snapshot.history),
    );
    fieldSelection.setSelectedFieldId(snapshot.selectedFieldId);
    detection.resetProcessing();
    detection.setDetectSessionId(snapshot.detectSessionId);
    detection.setMappingSessionId(snapshot.mappingSessionId);
    openAi.setRenameInProgress(false);
    openAi.setMappingInProgress(false);
    openAi.setHasRenamedFields(snapshot.hasRenamedFields);
    openAi.setHasMappedSchema(snapshot.hasMappedSchema);
    openAi.setCheckboxRules(cloneCheckboxRules(snapshot.checkboxRules));
    openAi.setRadioGroupSuggestions(cloneRadioGroupSuggestions(snapshot.radioGroupSuggestions));
    openAi.setTextTransformRules(cloneTextTransformRules(snapshot.textTransformRules));
    openAi.setOpenAiError(null);
    markSavedFillLinkSnapshot(snapshot.fields, snapshot.checkboxRules);
    savedForms.setActiveSavedFormId(snapshot.formId);
    savedForms.setActiveSavedFormName(snapshot.templateName);
  }, [detection, documentState, fieldHistory, fieldSelection, markSavedFillLinkSnapshot, openAi, savedForms]);

  const loadGroupTemplateSnapshot = useCallback(async (
    formId: string,
    templateNameHint?: string | null,
  ): Promise<GroupTemplateWorkspaceSnapshot> => {
    const [savedMeta, blob] = await Promise.all([
      ApiService.loadSavedForm(formId, { timeoutMs: GROUP_TEMPLATE_LOAD_TIMEOUT_MS }),
      ApiService.downloadSavedForm(formId, { timeoutMs: GROUP_TEMPLATE_LOAD_TIMEOUT_MS }),
    ]);
    const templateName = savedMeta?.name || templateNameHint || 'saved-form.pdf';
    const sourcePdfFile = new File([blob], templateName, { type: 'application/pdf' });
    const doc = await loadPdfFromFile(sourcePdfFile);
    try {
      const hydratedSnapshot = normalizeSavedFormEditorSnapshot(savedMeta?.editorSnapshot, {
        expectedPageCount: doc.numPages,
      });
      const [sizes, existingFields] = await Promise.all([
        hydratedSnapshot
          ? Promise.resolve(hydratedSnapshot.pageSizes)
          : loadPageSizes(doc),
        hydratedSnapshot
          ? Promise.resolve(clonePdfFields(hydratedSnapshot.fields))
          : (async () => {
              try {
                return await extractFieldsFromPdf(doc);
              } catch (error) {
                debugLog('Failed to extract cached group template fields', error);
                return [] as PdfField[];
              }
            })(),
      ]);
      const fillRuleState = extractSavedFormFillRuleState(savedMeta, { fields: existingFields });
      const derivedHasMappedSchema = Boolean(
        fillRuleState.checkboxRules.length ||
        fillRuleState.textTransformRules.length
      );
      if (!hydratedSnapshot && verifiedUser && existingFields.length > 0) {
        void Promise.resolve(
          ApiService.updateSavedFormEditorSnapshot(
            formId,
            buildSavedFormEditorSnapshot({
              pageCount: doc.numPages,
              pageSizes: sizes,
              fields: existingFields,
              hasRenamedFields: false,
              hasMappedSchema: derivedHasMappedSchema,
            }),
          ),
        ).catch((error) => {
          debugLog('Failed to backfill group template editor snapshot', formId, error);
        });
      }
      return {
        formId,
        templateName,
        sourceFile: sourcePdfFile,
        sourceFileName: templateName,
        pdfDoc: doc,
        pageSizes: sizes,
        pageCount: doc.numPages,
        currentPage: 1,
        scale: 1,
        fields: clonePdfFields(existingFields),
        history: { undo: [], redo: [] },
        selectedFieldId: null,
        detectSessionId: null,
        mappingSessionId: null,
        hasRenamedFields: hydratedSnapshot?.hasRenamedFields ?? false,
        hasMappedSchema: hydratedSnapshot?.hasMappedSchema ?? derivedHasMappedSchema,
        checkboxRules: cloneCheckboxRules(fillRuleState.checkboxRules),
        radioGroupSuggestions: cloneRadioGroupSuggestions(fillRuleState.legacyRadioGroupSuggestions),
        textTransformRules: cloneTextTransformRules(fillRuleState.textTransformRules),
      };
    } catch (error) {
      releasePdfDocument(doc);
      throw error;
    }
  }, []);

  const ensureGroupTemplateSnapshot = useCallback(async (
    formId: string,
    templateNameHint?: string | null,
  ): Promise<GroupTemplateWorkspaceSnapshot> => {
    const existing = groupTemplateCacheRef.current.get(formId);
    if (existing?.status === 'ready') {
      return existing.snapshot;
    }
    if (existing?.status === 'loading') {
      return existing.promise;
    }

    const token = groupCacheTokenRef.current;
    const templateName = templateNameHint || savedForms.savedForms.find((entry) => entry.id === formId)?.name || 'Saved form';
    const promise = loadGroupTemplateSnapshot(formId, templateName)
      .then((snapshot) => {
        if (groupCacheTokenRef.current !== token) {
          releasePdfDocument(snapshot.pdfDoc);
          return snapshot;
        }
        setReadyGroupTemplateSnapshot(snapshot, token);
        return snapshot;
      })
      .catch((error) => {
        if (groupCacheTokenRef.current === token) {
          groupTemplateCacheRef.current.set(formId, {
            status: 'error',
            templateName,
            error: error instanceof Error ? error.message : 'Failed to prepare group template.',
            token,
          });
          bumpGroupCacheVersion();
        }
        throw error;
      });

    groupTemplateCacheRef.current.set(formId, {
      status: 'loading',
      templateName,
      promise,
      token,
    });
    bumpGroupCacheVersion();
    return promise;
  }, [bumpGroupCacheVersion, loadGroupTemplateSnapshot, savedForms.savedForms, setReadyGroupTemplateSnapshot]);

  const handleSelectActiveGroupTemplate = useCallback(async (formId: string) => {
    if (!group.activeGroupId || !group.activeGroupName || !group.activeGroupTemplateIds.includes(formId)) {
      return savedForms.openSavedFormWithinGroup(formId, null);
    }
    if (formId === savedForms.activeSavedFormId) return true;
    if (openAi.renameInProgress || openAi.mappingInProgress || openAi.mapSchemaInProgress || group.groupRenameMapInProgress) {
      setBannerNotice({
        tone: 'info',
        message: 'Finish the current AI action before switching group templates.',
        autoDismissMs: 6000,
      });
      return false;
    }
    storeActiveGroupTemplateSnapshot();
    const cached = groupTemplateCacheRef.current.get(formId);
    if (cached?.status === 'loading') {
      setBannerNotice({
        tone: 'info',
        message: 'Wait for this group template to finish preparing before opening it.',
        autoDismissMs: 5000,
      });
      return false;
    }
    if (cached?.status === 'ready') {
      applyGroupTemplateSnapshot(cached.snapshot);
      return true;
    }
    const targetTemplate = savedForms.savedForms.find((template) => template.id === formId) ?? null;
    setGroupSwitchingTemplateId(formId);
    try {
      const snapshot = await ensureGroupTemplateSnapshot(formId, targetTemplate?.name);
      applyGroupTemplateSnapshot(snapshot);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to switch group template.';
      setBannerNotice({ tone: 'error', message, autoDismissMs: 8000 });
      return false;
    } finally {
      setGroupSwitchingTemplateId(null);
    }
  }, [
    applyGroupTemplateSnapshot,
    ensureGroupTemplateSnapshot,
    group.activeGroupId,
    group.activeGroupName,
    group.activeGroupTemplateIds,
    group.groupRenameMapInProgress,
    openAi.mapSchemaInProgress,
    openAi.mappingInProgress,
    openAi.renameInProgress,
    savedForms,
    setBannerNotice,
    storeActiveGroupTemplateSnapshot,
  ]);

  const handleFillSearchTargets = useCallback(async (
    row: Record<string, unknown>,
    targetIds: string[],
  ): Promise<{ structuredFillCommit?: StructuredFillCommitProvenance | null } | void> => {
    if (!targetIds.length) {
      throw new Error('Select at least one PDF target before filling.');
    }

    type PlannedApplication =
      | {
          kind: 'active';
          targetId: string;
          templateName: string;
          nextFields: PdfField[];
        }
      | {
          kind: 'cached';
          targetId: string;
          templateName: string;
          nextSnapshot: GroupTemplateWorkspaceSnapshot;
        };

    // Pass 1 — plan: compute matched fills across every target without
    // mutating any snapshot. The commit happens before any field state
    // change so a 429 / commit failure cannot leave the group half-filled.
    const plannedApplications: PlannedApplication[] = [];
    let unmatchedTargetCount = 0;
    const uniqueTargetIds = Array.from(new Set(targetIds));
    for (const targetId of uniqueTargetIds) {
      const template = activeGroupTemplates.find((entry) => entry.id === targetId) ?? null;
      if (!template) continue;
      if (targetId === savedForms.activeSavedFormId) {
        const searchFillResult = applySearchFillRowToFieldsWithStats({
          row,
          fields: fieldHistory.fields,
          checkboxRules: openAi.checkboxRules,
          textTransformRules: openAi.textTransformRules,
          dataSourceKind: searchFill.dataSourceKind,
        });
        if (searchFillResult.matchedFieldCount === 0) {
          unmatchedTargetCount += 1;
          continue;
        }
        plannedApplications.push({
          kind: 'active',
          targetId,
          templateName: template.name,
          nextFields: searchFillResult.fields,
        });
        continue;
      }

      const snapshot = await ensureGroupTemplateSnapshot(targetId, template.name);
      const searchFillResult = applySearchFillRowToFieldsWithStats({
        row,
        fields: snapshot.fields,
        checkboxRules: snapshot.checkboxRules,
        textTransformRules: snapshot.textTransformRules,
        dataSourceKind: searchFill.dataSourceKind,
      });
      if (searchFillResult.matchedFieldCount === 0) {
        unmatchedTargetCount += 1;
        continue;
      }
      const nextSnapshot: GroupTemplateWorkspaceSnapshot = {
        ...snapshot,
        fields: clonePdfFields(searchFillResult.fields),
        history: {
          undo: [...snapshot.history.undo, clonePdfFields(snapshot.fields)].slice(-MAX_FIELD_HISTORY),
          redo: [],
        },
      };
      plannedApplications.push({
        kind: 'cached',
        targetId,
        templateName: template.name,
        nextSnapshot,
      });
    }

    if (plannedApplications.length === 0) {
      throw new Error(SEARCH_FILL_NO_MATCH_MESSAGE);
    }

    // Commit once for the whole group fill. Credits == matched target PDFs.
    // Refuse to apply the fill if crediting should have happened but the
    // group context is missing — silently skipping the commit would be a
    // free-fill path.
    let structuredFillCommit: StructuredFillCommitProvenance | null = null;
    const chargeableSourceKind = toStructuredFillSourceKind(searchFill.dataSourceKind);
    if (chargeableSourceKind && !group.activeGroupId) {
      throw new Error('Active group context is required to commit a Search & Fill charge.');
    }
    if (chargeableSourceKind && group.activeGroupId) {
      const requestId = buildStructuredFillRequestId();
      const matchedTemplateIds = plannedApplications.map((entry) => entry.targetId);
      const fingerprint = await buildGroupRecordFingerprint(row, searchFill.identifierKey ?? null);
      try {
        const commitResponse: SearchFillUsageResponse = await ApiService.commitSearchFillUsage({
          requestId,
          sourceKind: chargeableSourceKind,
          scopeType: 'group',
          scopeId: group.activeGroupId,
          groupId: group.activeGroupId,
          targetTemplateIds: uniqueTargetIds,
          matchedTemplateIds,
          countIncrement: matchedTemplateIds.length,
          matchCount: matchedTemplateIds.length,
          recordLabelPreview:
            plannedApplications[0]?.templateName ? plannedApplications[0].templateName : null,
          recordFingerprint: fingerprint,
          dataSourceLabel: searchFill.dataSourceLabel ?? null,
          workspaceSavedFormId: savedForms.activeSavedFormId ?? null,
        });
        structuredFillCommit = {
          eventId: commitResponse.eventId,
          requestId: commitResponse.requestId,
          status: commitResponse.status,
          countIncrement: commitResponse.countIncrement,
          sourceKind: chargeableSourceKind,
          recordFingerprint: fingerprint,
        };
      } catch (commitError) {
        if (commitError instanceof ApiError && commitError.status === 429) {
          setBannerNotice({
            tone: 'error',
            message: commitError.message || 'Monthly Search & Fill credit limit reached.',
            autoDismissMs: 8000,
          });
          throw commitError;
        }
        throw commitError;
      }
    }

    // Pass 2 — apply: all mutations happen after the debit is confirmed.
    const matchedTemplateNames: string[] = [];
    for (const planned of plannedApplications) {
      matchedTemplateNames.push(planned.templateName);
      if (planned.kind === 'active') {
        fieldSelection.handleFieldsChange(planned.nextFields);
      } else {
        setReadyGroupTemplateSnapshot(planned.nextSnapshot, groupCacheTokenRef.current);
      }
    }

    if (uniqueTargetIds.length > 1) {
      const unmatchedMessage = unmatchedTargetCount > 0
        ? ` ${unmatchedTargetCount} ${unmatchedTargetCount === 1 ? 'PDF had' : 'PDFs had'} no matching fields.`
        : '';
      setBannerNotice({
        tone: 'success',
        message:
          `Filled ${matchedTemplateNames.length} of ${uniqueTargetIds.length} PDFs in ${
            group.activeGroupName ? `"${group.activeGroupName}"` : 'the open group'
          }.${unmatchedMessage}`,
        autoDismissMs: 6000,
      });
    } else if (matchedTemplateNames[0] && uniqueTargetIds[0] !== savedForms.activeSavedFormId) {
      setBannerNotice({
        tone: 'success',
        message: `Filled "${matchedTemplateNames[0]}".`,
        autoDismissMs: 5000,
      });
    }

    return { structuredFillCommit };
  }, [
    activeGroupTemplates,
    ensureGroupTemplateSnapshot,
    fieldHistory.fields,
    fieldSelection,
    group.activeGroupId,
    group.activeGroupName,
    groupCacheTokenRef,
    openAi.checkboxRules,
    openAi.textTransformRules,
    savedForms.activeSavedFormId,
    searchFill.dataSourceKind,
    searchFill.dataSourceLabel,
    searchFill.identifierKey,
    setReadyGroupTemplateSnapshot,
    setBannerNotice,
  ]);

  useEffect(() => {
    activePdfDocRef.current = documentState.pdfDoc;
  }, [documentState.pdfDoc]);

  useEffect(() => {
    if (!group.activeGroupId) return;
    if (!activeGroup) return;
    group.setActiveGroupName(activeGroup.name);
    group.setActiveGroupTemplateIds(activeGroup.templateIds);
  }, [activeGroup, group]);

  useEffect(() => {
    if (!group.activeGroupId) return;
    if (group.groupsLoading) return;
    if (activeGroup) return;
    group.setActiveGroupId(null);
    group.setActiveGroupName(null);
    group.setActiveGroupTemplateIds([]);
  }, [activeGroup, group]);

  useEffect(() => {
    if (group.activeGroupId) return;
    clearGroupTemplateCache();
  }, [clearGroupTemplateCache, group.activeGroupId]);

  useEffect(() => {
    if (!group.activeGroupId) return;
    const allowedFormIds = new Set(group.activeGroupTemplateIds);
    let mutated = false;
    for (const [formId, entry] of [...groupTemplateCacheRef.current.entries()]) {
      if (allowedFormIds.has(formId)) continue;
      groupTemplateCacheRef.current.delete(formId);
      if (entry.status === 'ready') {
        retainedGroupPdfDocsRef.current.delete(entry.snapshot.pdfDoc);
        if (entry.snapshot.pdfDoc !== documentState.pdfDoc) {
          releasePdfDocument(entry.snapshot.pdfDoc);
        }
      }
      mutated = true;
    }
    if (mutated) {
      bumpGroupCacheVersion();
    }
  }, [bumpGroupCacheVersion, documentState.pdfDoc, group.activeGroupId, group.activeGroupTemplateIds]);

  useEffect(() => {
    if (!group.activeGroupId) return;
    storeActiveGroupTemplateSnapshot();
  }, [
    documentState.pdfDoc,
    documentState.sourceFile,
    documentState.sourceFileName,
    group.activeGroupId,
    savedForms.activeSavedFormId,
    storeActiveGroupTemplateSnapshot,
  ]);

  useEffect(() => {
    if (!group.activeGroupId || activeGroupTemplates.length <= 1) return;
    let cancelled = false;
    let idleCallbackId: number | null = null;
    let startTimerId: number | null = null;
    const activeOrPendingTemplateId = savedForms.pendingSavedFormId ?? savedForms.activeSavedFormId;
    const templateQueue = activeGroupTemplates
      .filter((template) => template.id !== activeOrPendingTemplateId)
      .map((template) => ({ id: template.id, name: template.name }));

    const prefetch = async () => {
      for (const template of templateQueue) {
        if (cancelled || !group.activeGroupId) return;
        const existing = groupTemplateCacheRef.current.get(template.id);
        if (
          existing?.status === 'ready' ||
          existing?.status === 'loading' ||
          existing?.status === 'error'
        ) {
          continue;
        }
        try {
          await ensureGroupTemplateSnapshot(template.id, template.name);
        } catch (error) {
          debugLog('Failed to prefetch group template', template.id, error);
        }
      }
    };

    startTimerId = window.setTimeout(() => {
      if (cancelled) return;
      if (typeof window.requestIdleCallback === 'function') {
        idleCallbackId = window.requestIdleCallback(() => {
          void prefetch();
        }, { timeout: 1500 });
        return;
      }
      void prefetch();
    }, GROUP_TEMPLATE_PREFETCH_DELAY_MS);

    return () => {
      cancelled = true;
      if (startTimerId !== null) {
        window.clearTimeout(startTimerId);
      }
      if (idleCallbackId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleCallbackId);
      }
    };
  }, [
    activeGroupTemplates,
    ensureGroupTemplateSnapshot,
    group.activeGroupId,
    savedForms.activeSavedFormId,
    savedForms.pendingSavedFormId,
  ]);

  useEffect(() => {
    if (!verifiedUser || !group.activeGroupId) return;
    let cancelled = false;
    let intervalId: number | null = null;

    const pingCachedSessions = async () => {
      const sessionIds = new Set<string>();
      for (const [formId, entry] of groupTemplateCacheRef.current.entries()) {
        if (formId === savedForms.activeSavedFormId || entry.status !== 'ready') continue;
        const sessionId = entry.snapshot.mappingSessionId || entry.snapshot.detectSessionId;
        if (sessionId) sessionIds.add(sessionId);
      }
      for (const sessionId of sessionIds) {
        if (cancelled) return;
        try {
          await ApiService.touchSession(sessionId);
        } catch (error) {
          if (!cancelled) {
            debugLog('Failed to refresh cached group session TTL', sessionId, error);
          }
        }
      }
    };

    const start = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(() => {
        if (!globalThis.document.hidden) {
          void pingCachedSessions();
        }
      }, 60_000);
      if (!globalThis.document.hidden) {
        void pingCachedSessions();
      }
    };

    const stop = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const handleVisibilityChange = () => {
      if (globalThis.document.hidden) {
        stop();
      } else {
        start();
      }
    };

    globalThis.document.addEventListener('visibilitychange', handleVisibilityChange);
    start();
    return () => {
      cancelled = true;
      stop();
      globalThis.document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [group.activeGroupId, groupCacheVersion, savedForms.activeSavedFormId, verifiedUser]);

  useEffect(() => {
    return () => {
      if (!documentState.pdfDoc) return;
      if (retainedGroupPdfDocsRef.current.has(documentState.pdfDoc)) return;
      void documentState.pdfDoc.destroy().catch((error) => {
        debugLog('Failed to release PDF document resources', error);
      });
    };
  }, [documentState.pdfDoc]);

  useEffect(() => {
    return () => {
      for (const entry of groupTemplateCacheRef.current.values()) {
        if (entry.status !== 'ready') continue;
        retainedGroupPdfDocsRef.current.delete(entry.snapshot.pdfDoc);
        if (entry.snapshot.pdfDoc !== activePdfDocRef.current) {
          releasePdfDocument(entry.snapshot.pdfDoc);
        }
      }
      groupTemplateCacheRef.current.clear();
    };
  }, []);

  const groupTemplateStatusById = useMemo(() => {
    const statusMap: Record<string, 'ready' | 'loading' | 'error'> = {};
    void groupCacheVersion;
    for (const template of activeGroupTemplates) {
      const entry = groupTemplateCacheRef.current.get(template.id);
      if (!entry) {
        // No cache entry yet — treat non-active templates as loading so
        // the selector shows a loading indicator and disables the option
        // until the prefetch creates a real cache entry.
        if (template.id !== savedForms.activeSavedFormId) {
          statusMap[template.id] = 'loading';
        }
        continue;
      }
      statusMap[template.id] = entry.status;
    }
    return statusMap;
  }, [activeGroupTemplates, groupCacheVersion, savedForms.activeSavedFormId]);

  return {
    activeGroup,
    activeGroupTemplates,
    groupTemplateStatusById,
    groupSwitchingTemplateId,
    clearGroupTemplateCache,
    captureActiveGroupTemplateSnapshot,
    ensureGroupTemplateSnapshot,
    resolveDirtyGroupTemplateRecords,
    resolveGroupTemplateDirtyNames,
    isActiveGroupTemplateDirty,
    markGroupTemplatesPersisted,
    handleSelectActiveGroupTemplate,
    handleFillSearchTargets,
  };
}
