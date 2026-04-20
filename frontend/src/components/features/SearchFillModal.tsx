/**
 * Search & Fill modal for populating fields from data sources.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  DataSourceKind,
  PdfField,
} from '../../types';
import './SearchFillModal.css';
import type { CheckboxRule, TextTransformRule } from '../../types';
import {
  ApiService,
  type SearchFillSourceKind,
  type SearchFillUsageResponse,
} from '../../services/api';
import { ApiError } from '../../services/apiConfig';
import {
  applySearchFillRowToFieldsWithStats,
  SEARCH_FILL_NO_MATCH_MESSAGE,
} from '../../utils/searchFillApply';
import { Alert } from '../ui/Alert';
import { DialogCloseButton, DialogFrame } from '../ui/Dialog';

export type StructuredFillCommitProvenance = {
  eventId: string;
  requestId: string;
  status: SearchFillUsageResponse['status'];
  countIncrement: number;
  sourceKind: SearchFillSourceKind;
  recordFingerprint: string | null;
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

function collectFingerprintParts(
  row: Record<string, unknown>,
  identifierKey: string | null,
): string[] {
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
  return parts;
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const buf = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic fallback hash (FNV-1a) when Web Crypto is unavailable —
  // used only in exotic/test environments. Still non-reversible for raw PII.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a_${hash.toString(16).padStart(8, '0')}`;
}

async function buildRecordFingerprint(
  row: Record<string, unknown>,
  identifierKey: string | null,
): Promise<string | null> {
  const parts = collectFingerprintParts(row, identifierKey);
  if (parts.length === 0) return null;
  return sha256Hex(parts.join('|'));
}

type SearchMode = 'contains' | 'equals';

type PreparedSearchRow = {
  row: Record<string, unknown>;
  preview: {
    title: string;
    subtitle: string;
  };
  searchValueByKey: Map<string, string>;
  searchValues: string[];
  anySearchText: string;
};

type SearchFillModalProps = {
  open: boolean;
  onClose: () => void;
  sessionId?: number;
  dataSourceKind: DataSourceKind;
  dataSourceLabel: string | null;
  columns: string[];
  identifierKey: string | null;
  rows: Array<Record<string, unknown>>;
  fields: PdfField[];
  checkboxRules?: CheckboxRule[];
  textTransformRules?: TextTransformRule[];
  onFieldsChange: (next: PdfField[]) => void;
  onClearFields: () => void;
  onAfterFill: (payload: {
    row: Record<string, unknown>;
    dataSourceKind: DataSourceKind;
    structuredFillCommit?: StructuredFillCommitProvenance | null;
  }) => void;
  onError: (message: string) => void;
  onRequestDataSource?: (kind: 'csv' | 'excel' | 'json') => void;
  searchPreset?: {
    query: string;
    searchKey?: string;
    searchMode?: SearchMode;
    autoRun?: boolean;
    autoFillOnSearch?: boolean;
    highlightResult?: boolean;
    token?: number;
  } | null;
  demoSearch?: {
    query: string;
    searchKey?: string;
    searchMode?: SearchMode;
    autoRun?: boolean;
    autoFillOnSearch?: boolean;
    highlightResult?: boolean;
    token?: number;
  } | null;
  fillTargets?: Array<{ id: string; name: string }>;
  activeFillTargetId?: string | null;
  onFillTargets?: (
    row: Record<string, unknown>,
    targetIds: string[],
  ) => Promise<{ structuredFillCommit?: StructuredFillCommitProvenance | null } | void> | void;
  templateId?: string | null;
  groupId?: string | null;
  workspaceSavedFormId?: string | null;
  structuredFillCreditingEnabled?: boolean;
};

const VALIDATION_ERRORS = new Set([
  'Choose a CSV, Excel, JSON, or respondent source first.',
  'No record rows are available to search.',
  'Enter a search value.',
  'Choose a column to search.',
]);

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * Build a concise preview label for search results.
 */
function rowPreview(
  row: Record<string, unknown>,
  lookup: Map<string, unknown>,
  identifierKey: string | null,
): { title: string; subtitle: string } {
  const get = (key: string) => lookup.get(key.toLowerCase());
  const mrn = identifierKey ? row[identifierKey] ?? get(identifierKey) : get('mrn');
  const fullName = get('full_name');
  const first = get('first_name');
  const last = get('last_name');
  const dob = get('dob') ?? get('date_of_birth');
  const titleParts = [];
  if (mrn) titleParts.push(String(mrn));
  if (fullName) titleParts.push(String(fullName));
  else if (first || last) titleParts.push([first, last].filter(Boolean).join(' '));
  const title = titleParts.join(' • ') || 'Record';
  const subtitleParts = [];
  if (dob) subtitleParts.push(`DOB ${String(dob)}`);
  const phone = get('phone') ?? get('mobile_phone') ?? get('home_phone');
  if (phone) subtitleParts.push(String(phone));
  const email = get('email') ?? get('email_address');
  if (email) subtitleParts.push(String(email));
  return { title, subtitle: subtitleParts.join(' • ') };
}

/**
 * Render the Search & Fill modal and apply data to fields.
 */
export default function SearchFillModal({
  open,
  onClose,
  sessionId,
  dataSourceKind,
  dataSourceLabel,
  columns,
  identifierKey,
  rows,
  fields,
  checkboxRules,
  textTransformRules,
  onFieldsChange,
  onClearFields,
  onAfterFill,
  onError,
  onRequestDataSource,
  searchPreset,
  demoSearch,
  fillTargets,
  activeFillTargetId = null,
  onFillTargets,
  templateId = null,
  // `groupId` is intentionally not destructured here: the modal never sends
  // a group-scope commit of its own — `onFillTargets` delegates to
  // useGroupTemplateCache which owns that path. Keeping the prop in the
  // type definition documents the scope for consumers; the modal ignores it.
  workspaceSavedFormId = null,
  structuredFillCreditingEnabled = true,
}: SearchFillModalProps) {
  const resolvedFillTargets = fillTargets ?? [];
  const resolvedSearchPreset = demoSearch ?? searchPreset ?? null;
  const [searchKey, setSearchKey] = useState<string>('');
  const [searchMode, setSearchMode] = useState<SearchMode>('contains');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PreparedSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedFillTargetIds, setSelectedFillTargetIds] = useState<string[]>([]);
  const [fillAllInGroup, setFillAllInGroup] = useState<boolean>(true);

  const canSearchAnyColumn = true;
  const hasRows = rows.length > 0;
  const hasSource = dataSourceKind !== 'none';
  const canRequestSource = Boolean(onRequestDataSource);
  const hasGroupFillTargets = resolvedFillTargets.length > 1;
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const availableKeys = useMemo(() => {
    const unique = new Set(columns.filter(Boolean));
    return Array.from(unique);
  }, [columns]);
  const preparedRows = useMemo<PreparedSearchRow[]>(() => {
    return rows.map((row) => {
      const rowKeys = availableKeys.length ? availableKeys : Object.keys(row);
      const searchValueByKey = new Map<string, string>();
      const lookup = new Map<string, unknown>();
      for (const [key, value] of Object.entries(row)) {
        const lowered = key.toLowerCase();
        if (!lookup.has(lowered)) {
          lookup.set(lowered, value);
        }
      }
      for (const key of rowKeys) {
        searchValueByKey.set(key, String(row[key] ?? '').toLowerCase());
      }
      const searchValues = rowKeys.map((key) => searchValueByKey.get(key) ?? '');
      return {
        row,
        preview: rowPreview(row, lookup, identifierKey),
        searchValueByKey,
        searchValues,
        anySearchText: searchValues.join('\n'),
      };
    });
  }, [availableKeys, identifierKey, rows]);
  const fillTargetSignature = useMemo(
    () => resolvedFillTargets.map((target) => `${target.id}:${target.name}`).join('|'),
    [resolvedFillTargets],
  );
  const fillTargetLookup = useMemo(
    () => new Map(resolvedFillTargets.map((target) => [target.id, target] as const)),
    [fillTargetSignature],
  );
  const fillTargetIdsKey = useMemo(
    () => resolvedFillTargets.map((target) => target.id).join('|'),
    [resolvedFillTargets],
  );
  const fillTargetDefaultsRef = useRef<{ defaultTargetId: string | null }>({ defaultTargetId: null });
  fillTargetDefaultsRef.current = {
    defaultTargetId:
      activeFillTargetId && fillTargetLookup.has(activeFillTargetId)
        ? activeFillTargetId
        : resolvedFillTargets[0]?.id ?? null,
  };
  const autoRunSignature = useMemo(() => {
    if (!resolvedSearchPreset?.autoRun) return null;
    const defaultKey = identifierKey || availableKeys[0] || '';
    const presetKey = resolvedSearchPreset.searchKey ?? defaultKey;
    const presetMode = resolvedSearchPreset.searchMode ?? 'contains';
    const presetQuery = resolvedSearchPreset.query ?? '';
    if (!presetQuery) return null;
    return JSON.stringify({
      sessionId,
      token: resolvedSearchPreset.token ?? null,
      searchKey: presetKey,
      searchMode: presetMode,
      query: presetQuery,
    });
  }, [
    availableKeys,
    identifierKey,
    resolvedSearchPreset?.autoRun,
    resolvedSearchPreset?.query,
    resolvedSearchPreset?.searchKey,
    resolvedSearchPreset?.searchMode,
    resolvedSearchPreset?.token,
    sessionId,
  ]);
  const lastAutoRunSignatureRef = useRef<string | null>(null);

  const clearValidationError = useCallback(() => {
    if (!localError) return;
    if (!VALIDATION_ERRORS.has(localError)) return;
    setLocalError(null);
  }, [localError]);

  const sourceStateRef = useRef({ hasRows, hasSource });
  useEffect(() => {
    const prev = sourceStateRef.current;
    sourceStateRef.current = { hasRows, hasSource };
    if (!localError) return;
    if (!VALIDATION_ERRORS.has(localError)) return;
    if (prev.hasRows !== hasRows || prev.hasSource !== hasSource) {
      setLocalError(null);
    }
  }, [hasRows, hasSource, localError]);

  /**
   * Apply a selected row to all fields, including checkbox rules.
   */
  const handleFill = useCallback(
    async (row: Record<string, unknown>): Promise<boolean> => {
      setLocalError(null);
      const chargeableSourceKind = toStructuredFillSourceKind(dataSourceKind);
      let structuredFillCommit: StructuredFillCommitProvenance | null = null;
      try {
        if (hasGroupFillTargets && onFillTargets) {
          const targetIds = selectedFillTargetIds.filter((targetId) => fillTargetLookup.has(targetId));
          if (targetIds.length === 0) {
            setLocalError('Select at least one PDF target before filling.');
            return false;
          }
          const groupResult = await onFillTargets(row, targetIds);
          if (groupResult && typeof groupResult === 'object' && groupResult.structuredFillCommit) {
            structuredFillCommit = groupResult.structuredFillCommit;
          }
        } else {
          const searchFillResult = applySearchFillRowToFieldsWithStats({
            row,
            fields,
            checkboxRules,
            textTransformRules,
            dataSourceKind,
          });
          if (searchFillResult.matchedFieldCount === 0) {
            setLocalError(SEARCH_FILL_NO_MATCH_MESSAGE);
            return false;
          }
          // Single-template fill: commit one Search & Fill credit before
          // mutating local field state so a 429 / commit failure can't leave
          // the workspace with applied-but-unbilled changes.
          //
          // If crediting is enabled for this source kind but we don't have a
          // templateId to attribute the charge to, refuse the fill rather
          // than silently skipping the charge (a free-fill path a user could
          // exploit by never saving). `structuredFillCreditingEnabled=false`
          // is the explicit bypass used by demo mode.
          if (
            structuredFillCreditingEnabled
            && chargeableSourceKind
            && !templateId
          ) {
            setLocalError('Save the form before running Search & Fill so usage can be attributed.');
            return false;
          }
          if (
            structuredFillCreditingEnabled
            && chargeableSourceKind
            && templateId
          ) {
            const fingerprint = await buildRecordFingerprint(row, identifierKey);
            const labelPreview = (() => {
              const match = results.find((entry) => entry.row === row);
              if (match) {
                return [match.preview.title, match.preview.subtitle].filter(Boolean).join(' — ');
              }
              return null;
            })();
            const requestId = buildStructuredFillRequestId();
            try {
              const commitResponse = await ApiService.commitSearchFillUsage({
                requestId,
                sourceKind: chargeableSourceKind,
                scopeType: 'template',
                scopeId: templateId,
                templateId,
                targetTemplateIds: [templateId],
                matchedTemplateIds: [templateId],
                countIncrement: 1,
                matchCount: 1,
                recordLabelPreview: labelPreview,
                recordFingerprint: fingerprint,
                dataSourceLabel,
                workspaceSavedFormId: workspaceSavedFormId ?? templateId,
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
                setLocalError(
                  commitError.message || 'Monthly Search & Fill credit limit reached.',
                );
                return false;
              }
              throw commitError;
            }
          }
          onFieldsChange(searchFillResult.fields);
        }
        onAfterFill({ row, dataSourceKind, structuredFillCommit });
        onClose();
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fill PDF.';
        onError(message);
        setLocalError(message);
        return false;
      }
    },
    [
      checkboxRules,
      dataSourceKind,
      dataSourceLabel,
      fields,
      fillTargetLookup,
      hasGroupFillTargets,
      identifierKey,
      onAfterFill,
      onClose,
      onError,
      onFieldsChange,
      onFillTargets,
      results,
      selectedFillTargetIds,
      structuredFillCreditingEnabled,
      templateId,
      textTransformRules,
      workspaceSavedFormId,
    ],
  );

  /**
   * Execute a search against local rows.
   */
  const executeSearch = useCallback(
    async ({
      queryValue,
      searchKeyValue,
      searchModeValue,
    }: {
      queryValue: string;
      searchKeyValue: string;
      searchModeValue: SearchMode;
    }) => {
      const failValidation = (message: string) => {
        setLocalError(message);
        setResults([]);
        setHasSearched(false);
      };
      if (!hasSource) {
        failValidation('Choose a CSV, Excel, JSON, or respondent source first.');
        return;
      }
      if (!hasRows) {
        failValidation('No record rows are available to search.');
        return;
      }
      if (!queryValue) {
        failValidation('Enter a search value.');
        return;
      }
      if (!searchKeyValue || (!canSearchAnyColumn && searchKeyValue === '__any__')) {
        failValidation('Choose a column to search.');
        return;
      }

      setLocalError(null);
      setHasSearched(true);
      setSearching(true);
      setResults([]);
      try {
        const q = queryValue.toLowerCase();
        const matches = (value: string) => (searchModeValue === 'equals' ? value === q : value.includes(q));
        const matched: PreparedSearchRow[] = [];
        for (const preparedRow of preparedRows) {
          if (searchKeyValue === '__any__') {
            const ok = searchModeValue === 'equals'
              ? preparedRow.searchValues.some((value) => matches(value))
              : matches(preparedRow.anySearchText);
            if (!ok) continue;
          } else {
            const value = preparedRow.searchValueByKey.get(searchKeyValue)
              ?? String(preparedRow.row[searchKeyValue] ?? '').toLowerCase();
            if (!matches(value)) continue;
          }
          matched.push(preparedRow);
          if (matched.length >= 25) break;
        }
        if (resolvedSearchPreset?.autoFillOnSearch && matched.length > 0) {
          const filled = await handleFill(matched[0].row);
          if (!filled) {
            setResults(matched);
          }
          return;
        }
        setResults(matched);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Search failed.';
        setLocalError(message);
      } finally {
        setSearching(false);
      }
    },
    [canSearchAnyColumn, handleFill, hasRows, hasSource, preparedRows, resolvedSearchPreset?.autoFillOnSearch],
  );

  const runSearch = useCallback(
    async (override?: { query?: string; searchKey?: string; searchMode?: SearchMode }) => {
      const queryValue = (override?.query ?? query).trim();
      const searchKeyValue = override?.searchKey ?? searchKey;
      const searchModeValue = override?.searchMode ?? searchMode;
      await executeSearch({ queryValue, searchKeyValue, searchModeValue });
    },
    [executeSearch, query, searchKey, searchMode],
  );

  useEffect(() => {
    if (!open) return;
    const defaultKey = identifierKey || availableKeys[0] || '';
    const presetKey = resolvedSearchPreset?.searchKey ?? defaultKey;
    const presetMode = resolvedSearchPreset?.searchMode ?? 'contains';
    const presetQuery = resolvedSearchPreset?.query ?? '';
    setSearchKey(presetKey);
    setQuery(presetQuery);
    setResults([]);
    setSearching(false);
    setLocalError(null);
    setSearchMode(presetMode);
    setHasSearched(false);
    setFillAllInGroup(true);
    // Target list seeding is handled by the dedicated reconciliation effect
    // below so that subsequent changes to `fillTargets` (group membership
    // edits while the modal is open) do not clobber the search query / results.
  }, [
    availableKeys,
    identifierKey,
    open,
    resolvedSearchPreset?.query,
    resolvedSearchPreset?.searchKey,
    resolvedSearchPreset?.searchMode,
    sessionId,
  ]);

  useEffect(() => {
    if (!open) return;
    const allTargetIds = resolvedFillTargets.map((target) => target.id);
    const defaultTargetId = fillTargetDefaultsRef.current.defaultTargetId;
    setSelectedFillTargetIds((prev) => {
      if (fillAllInGroup && allTargetIds.length > 1) {
        return areStringArraysEqual(prev, allTargetIds) ? prev : allTargetIds;
      }
      const validTargetIds = prev.filter((targetId) => fillTargetLookup.has(targetId));
      if (validTargetIds.length > 0) {
        return areStringArraysEqual(prev, validTargetIds) ? prev : validTargetIds;
      }
      const nextTargetIds = defaultTargetId ? [defaultTargetId] : [];
      return areStringArraysEqual(prev, nextTargetIds) ? prev : nextTargetIds;
    });
  }, [fillAllInGroup, fillTargetIdsKey, fillTargetLookup, open]);

  useEffect(() => {
    if (!open) {
      lastAutoRunSignatureRef.current = null;
      return;
    }
    if (!resolvedSearchPreset?.autoRun || !autoRunSignature) return;
    if (lastAutoRunSignatureRef.current === autoRunSignature) return;
    lastAutoRunSignatureRef.current = autoRunSignature;
    const defaultKey = identifierKey || availableKeys[0] || '';
    const presetKey = resolvedSearchPreset.searchKey ?? defaultKey;
    const presetMode = resolvedSearchPreset.searchMode ?? 'contains';
    const presetQuery = resolvedSearchPreset.query ?? '';
    void executeSearch({
      queryValue: presetQuery.trim(),
      searchKeyValue: presetKey,
      searchModeValue: presetMode,
    });
  }, [
    autoRunSignature,
    availableKeys,
    executeSearch,
    identifierKey,
    open,
    resolvedSearchPreset?.autoRun,
    resolvedSearchPreset?.query,
    resolvedSearchPreset?.searchKey,
    resolvedSearchPreset?.searchMode,
  ]);

  const toggleFillTarget = useCallback((targetId: string, checked: boolean) => {
    setSelectedFillTargetIds((prev) => {
      if (checked) {
        if (prev.includes(targetId)) return prev;
        return [...prev, targetId];
      }
      if (prev.length <= 1) return prev;
      return prev.filter((value) => value !== targetId);
    });
  }, []);

  const handleFillAllInGroupToggle = useCallback((checked: boolean) => {
    setFillAllInGroup(checked);
    if (checked) {
      const allTargetIds = resolvedFillTargets.map((target) => target.id);
      setSelectedFillTargetIds((prev) =>
        areStringArraysEqual(prev, allTargetIds) ? prev : allTargetIds,
      );
      return;
    }
    const defaultTargetId = fillTargetDefaultsRef.current.defaultTargetId;
    if (!defaultTargetId) return;
    setSelectedFillTargetIds((prev) =>
      areStringArraysEqual(prev, [defaultTargetId]) ? prev : [defaultTargetId],
    );
  }, [fillTargetIdsKey]);

  const handleSelectCurrentTarget = useCallback(() => {
    const targetId = activeFillTargetId && fillTargetLookup.has(activeFillTargetId)
      ? activeFillTargetId
      : resolvedFillTargets[0]?.id;
    if (!targetId) return;
    setSelectedFillTargetIds([targetId]);
  }, [activeFillTargetId, fillTargetLookup, resolvedFillTargets]);

  const handleSelectAllTargets = useCallback(() => {
    setSelectedFillTargetIds(resolvedFillTargets.map((target) => target.id));
  }, [resolvedFillTargets]);

  const canClearFields = useMemo(
    () =>
      fields.some((field) => {
        const value = field.value;
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        if (typeof value === 'boolean') return value;
        return true;
      }),
    [fields],
  );

  const handleClear = useCallback(() => {
    onClearFields();
    setLocalError(null);
  }, [onClearFields]);

  if (!open) return null;

  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      className="searchfill-modal__card"
      labelledBy={dialogTitleId}
      describedBy={dialogDescriptionId}
    >
      <div className="searchfill-modal__header">
        <div>
          <h2 className="searchfill-modal__title" id={dialogTitleId}>Search, Fill &amp; Clear</h2>
          <p className="searchfill-modal__subtitle" id={dialogDescriptionId}>
            {hasGroupFillTargets
              ? 'Find a record locally and populate the selected PDFs in this group.'
              : 'Find a record locally and populate the current PDF.'}
          </p>
        </div>
        <div className="searchfill-modal__header-actions">
          {structuredFillCreditingEnabled && toStructuredFillSourceKind(dataSourceKind) ? (
            <span
              className="searchfill-modal__credit-pill"
              title={
                hasGroupFillTargets
                  ? `This fill will debit one Search & Fill credit per matched PDF (${
                      selectedFillTargetIds.filter((id) => fillTargetLookup.has(id)).length
                    } selected).`
                  : 'This fill will debit 1 Search & Fill credit when a match is found.'
              }
            >
              {hasGroupFillTargets
                ? `Will use ${
                    selectedFillTargetIds.filter((id) => fillTargetLookup.has(id)).length
                  } credit${
                    selectedFillTargetIds.filter((id) => fillTargetLookup.has(id)).length === 1
                      ? ''
                      : 's'
                  }`
                : 'Will use 1 credit'}
            </span>
          ) : null}
          <DialogCloseButton onClick={onClose} label="Close Search, Fill & Clear dialog" />
        </div>
      </div>
      <div className="searchfill-modal__body">
        <div className="searchfill-meta">
          <div className="searchfill-source">
            <span className="searchfill-source__label">Source</span>
            <span className="searchfill-source__value">
              {dataSourceLabel || (dataSourceKind === 'none' ? 'None selected' : dataSourceKind.toUpperCase())}
            </span>
          </div>
          <div className="searchfill-source">
            <span className="searchfill-source__label">Records</span>
            <span className="searchfill-source__value">{rows.length}</span>
          </div>
        </div>

        {hasGroupFillTargets ? (
          <section className="searchfill-targets" aria-label="Fill targets">
            <label className="searchfill-targets__all-toggle">
              <input
                type="checkbox"
                checked={fillAllInGroup}
                onChange={(event) => handleFillAllInGroupToggle(event.target.checked)}
                disabled={searching}
                aria-describedby="searchfill-targets-all-help"
              />
              <span className="searchfill-targets__all-label">
                <strong>
                  Apply to all forms in this group ({resolvedFillTargets.length} PDFs)
                </strong>
                <span id="searchfill-targets-all-help" className="searchfill-targets__all-help">
                  When off, choose individual PDFs below.
                </span>
              </span>
            </label>
            {!fillAllInGroup ? (
              <>
                <div className="searchfill-targets__header">
                  <div>
                    <p className="searchfill-targets__eyebrow">Fill targets</p>
                    <h3>Select which PDFs receive the row</h3>
                  </div>
                  <div className="searchfill-actions">
                    <button
                      type="button"
                      className="ui-button ui-button--ghost ui-button--compact"
                      onClick={handleSelectCurrentTarget}
                      disabled={searching}
                    >
                      Current PDF
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button--ghost ui-button--compact"
                      onClick={handleSelectAllTargets}
                      disabled={searching}
                    >
                      All PDFs
                    </button>
                  </div>
                </div>
                <div className="searchfill-targets__list">
                  {resolvedFillTargets.map((target) => {
                    const checked = selectedFillTargetIds.includes(target.id);
                    const isCurrent = target.id === activeFillTargetId;
                    return (
                      <label key={target.id} className="searchfill-targets__item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => toggleFillTarget(target.id, event.target.checked)}
                          disabled={searching || (checked && selectedFillTargetIds.length === 1)}
                        />
                        <span className="searchfill-targets__name">
                          {target.name}
                          {isCurrent ? <em>Current</em> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="searchfill-targets__summary">
                  {selectedFillTargetIds.length} PDF{selectedFillTargetIds.length === 1 ? '' : 's'} selected
                </p>
              </>
            ) : (
              <p className="searchfill-targets__summary">
                Will fill all {resolvedFillTargets.length} PDFs in this group from the selected row.
              </p>
            )}
          </section>
        ) : null}

        {!hasRows ? (
          <div className="searchfill-alert searchfill-alert--empty">
            <Alert
              tone="info"
              variant="inline"
              size="sm"
              message={
                hasSource
                  ? 'The connected source is schema-only (no row data). Upload a CSV, Excel, or JSON file with rows to search and fill.'
                  : 'No record rows are loaded yet. Upload a CSV, Excel, or JSON file to search and fill.'
              }
            />
            {canRequestSource ? (
              <div className="searchfill-actions searchfill-actions--empty">
                <button
                  type="button"
                  className="ui-button ui-button--ghost ui-button--compact"
                  onClick={() => onRequestDataSource?.('csv')}
                >
                  Upload CSV
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--ghost ui-button--compact"
                  onClick={() => onRequestDataSource?.('excel')}
                >
                  Upload Excel
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--ghost ui-button--compact"
                  onClick={() => onRequestDataSource?.('json')}
                >
                  Upload JSON
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

          <div className="searchfill-controls">
            <div className="searchfill-field">
              <label className="searchfill-label" htmlFor="searchfill-key">
                Column
              </label>
              <select
                id="searchfill-key"
                name="searchfill-key"
                value={searchKey}
                onChange={(event) => {
                  setSearchKey(event.target.value);
                  clearValidationError();
                }}
                disabled={!hasRows || searching}
              >
                {canSearchAnyColumn ? (
                  <option value="__any__">Any column</option>
                ) : null}
                {availableKeys.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>

            <div className="searchfill-field">
              <label className="searchfill-label" htmlFor="searchfill-mode">
                Match
              </label>
              <select
                id="searchfill-mode"
                name="searchfill-mode"
                value={searchMode}
                onChange={(event) => {
                  setSearchMode(event.target.value as SearchMode);
                  clearValidationError();
                }}
                disabled={!hasRows || searching}
              >
                <option value="contains">Contains</option>
                <option value="equals">Equals</option>
              </select>
            </div>

            <div className="searchfill-field searchfill-field--grow">
              <label className="searchfill-label" htmlFor="searchfill-query">
                Search
              </label>
              <input
                id="searchfill-query"
                name="searchfill-query"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  clearValidationError();
                }}
                placeholder="MRN, name, etc."
                disabled={!hasRows || searching}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void runSearch();
                  }
                }}
              />
            </div>

            <div className="searchfill-actions">
              <button
                type="button"
                className="ui-button ui-button--primary ui-button--compact"
                data-demo-target={demoSearch?.autoFillOnSearch ? 'search-fill-search' : undefined}
                onClick={() => void runSearch()}
                disabled={!hasRows || searching}
              >
                {searching ? 'Searching…' : 'Search'}
              </button>
              <button
                type="button"
                className="ui-button ui-button--ghost ui-button--compact"
                onClick={handleClear}
                disabled={!canClearFields || searching}
              >
                Clear inputs
              </button>
            </div>
          </div>

          {localError ? (
            <div className="searchfill-alert">
              <Alert tone="error" variant="inline" size="sm" message={localError} />
            </div>
          ) : null}

          <div className="searchfill-results" aria-label="Search results">
            {results.length === 0 ? (
              <div
                className={[
                  'searchfill-results__empty',
                  hasSearched && !searching && !localError ? 'searchfill-results__empty--not-found' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {hasSearched && !searching && !localError ? '(search) not found' : 'No results yet.'}
              </div>
            ) : (
              results.map((result, index) => {
                const demoTargetProps =
                  demoSearch?.highlightResult && index === 0
                    ? { 'data-demo-target': 'search-fill-result' }
                    : {};
                return (
                  <div key={index} className="searchfill-result">
                    <div className="searchfill-result__text">
                      <div className="searchfill-result__title">{result.preview.title}</div>
                      {result.preview.subtitle ? <div className="searchfill-result__subtitle">{result.preview.subtitle}</div> : null}
                    </div>
                    <button
                      type="button"
                      className="ui-button ui-button--primary ui-button--compact"
                      {...demoTargetProps}
                      onClick={() => void handleFill(result.row)}
                      disabled={searching}
                    >
                      {hasGroupFillTargets
                        ? (fillAllInGroup
                            ? `Fill all ${resolvedFillTargets.length} PDFs`
                            : 'Fill selected PDFs')
                        : 'Fill PDF'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
      </div>
      <div className="searchfill-modal__footer">
        <button className="ui-button ui-button--ghost" onClick={onClose} type="button">
          Close
        </button>
      </div>
    </DialogFrame>
  );
}
