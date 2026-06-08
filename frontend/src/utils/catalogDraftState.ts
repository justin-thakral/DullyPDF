import type { MaterializePdfExportMode } from '../services/api';
import type {
  CheckboxRule,
  FieldFontChoice,
  FieldFontColorChoice,
  FieldFontSizeChoice,
  FieldTextAlignmentChoice,
  PdfField,
  TextTransformRule,
} from '../types';

const CATALOG_DRAFT_STATE_KEY = 'dullypdf.catalogDraftState';
const CATALOG_DRAFT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type CatalogDraftPendingAction =
  | { type: 'download'; exportMode: MaterializePdfExportMode }
  | { type: 'save' };

export type CatalogDraftState = {
  version: 1;
  slug: string;
  sourceFileName: string | null;
  fields: PdfField[];
  checkboxRules: CheckboxRule[];
  textTransformRules: TextTransformRule[];
  globalFieldFont: FieldFontChoice;
  globalFieldFontSize: FieldFontSizeChoice;
  globalFieldFontColor: FieldFontColorChoice;
  globalFieldAlignment: FieldTextAlignmentChoice;
  hasRenamedFields: boolean;
  hasMappedSchema: boolean;
  currentPage: number;
  scale: number;
  pendingAction: CatalogDraftPendingAction | null;
  updatedAtMs: number;
};

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isFreshTimestamp(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Date.now() - value <= CATALOG_DRAFT_MAX_AGE_MS;
}

function normalizePendingAction(value: unknown): CatalogDraftPendingAction | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { type?: unknown; exportMode?: unknown };
  if (candidate.type === 'save') return { type: 'save' };
  if (
    candidate.type === 'download'
    && (candidate.exportMode === 'editable' || candidate.exportMode === 'flat')
  ) {
    return { type: 'download', exportMode: candidate.exportMode };
  }
  return null;
}

export function readCatalogDraftState(): CatalogDraftState | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  const raw = storage.getItem(CATALOG_DRAFT_STATE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CatalogDraftState> | null;
    const slug = typeof parsed?.slug === 'string' ? parsed.slug.trim() : '';
    if (parsed?.version !== 1 || !slug || !isFreshTimestamp(parsed?.updatedAtMs)) {
      clearCatalogDraftState();
      return null;
    }
    return {
      version: 1,
      slug,
      sourceFileName: typeof parsed.sourceFileName === 'string' ? parsed.sourceFileName : null,
      fields: Array.isArray(parsed.fields) ? parsed.fields as PdfField[] : [],
      checkboxRules: Array.isArray(parsed.checkboxRules) ? parsed.checkboxRules as CheckboxRule[] : [],
      textTransformRules: Array.isArray(parsed.textTransformRules) ? parsed.textTransformRules as TextTransformRule[] : [],
      globalFieldFont: parsed.globalFieldFont || 'default',
      globalFieldFontSize: parsed.globalFieldFontSize || 'auto',
      globalFieldFontColor: parsed.globalFieldFontColor || '#000000',
      globalFieldAlignment: parsed.globalFieldAlignment || 'left',
      hasRenamedFields: Boolean(parsed.hasRenamedFields),
      hasMappedSchema: Boolean(parsed.hasMappedSchema),
      currentPage: Math.max(1, Number(parsed.currentPage) || 1),
      scale: Math.max(0.25, Number(parsed.scale) || 1),
      pendingAction: normalizePendingAction(parsed.pendingAction),
      updatedAtMs: parsed.updatedAtMs,
    };
  } catch {
    clearCatalogDraftState();
    return null;
  }
}

export function writeCatalogDraftState(state: CatalogDraftState): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(CATALOG_DRAFT_STATE_KEY, JSON.stringify(state));
  } catch {
    // Catalog drafts are a convenience for sign-in/checkout handoffs. If the
    // browser blocks storage or quota is exceeded, the live in-memory editor
    // still remains intact until the page navigates away.
  }
}

export function clearCatalogDraftState(): void {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.removeItem(CATALOG_DRAFT_STATE_KEY);
}
