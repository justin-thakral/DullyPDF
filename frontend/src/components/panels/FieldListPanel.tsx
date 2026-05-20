/**
 * Side panel that lists fields and controls visibility/filtering.
 */
import {
  memo,
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type {
  ConfidenceFilter,
  ConfidenceTier,
  FieldFontChoice,
  FieldFontColorChoice,
  FieldFontSizeChoice,
  FieldTextAlignmentChoice,
  FieldType,
  PdfField,
} from '../../types';
import {
  fieldConfidenceForField,
  fieldConfidenceTierForField,
  nameConfidenceForField,
  nameConfidenceTierForField,
  hasAnyConfidence,
} from '../../utils/confidence';
import {
  DEFAULT_CUSTOM_FIELD_FONT_SIZE_PT,
  DEFAULT_FIELD_FONT_CHOICE,
  DEFAULT_FIELD_FONT_COLOR,
  DEFAULT_FIELD_FONT_SIZE_CHOICE,
  FIELD_TEXT_ALIGNMENT_CHOICES,
  MAX_FIELD_FONT_SIZE_PT,
  MIN_FIELD_FONT_SIZE_PT,
  PDF_BASE_14_FONT_OPTION_GROUPS,
  fieldFontColorChoiceLabel,
  fieldTextAlignmentChoiceLabel,
  sanitizeFieldFontColorChoice,
  sanitizeFieldFontSizeChoice,
  sanitizeGlobalFieldTextAlignment,
} from '../../utils/fieldFonts';
import { formatSize } from '../../utils/fields';
import { FIELD_TYPES, fieldTypeLabel } from '../../utils/fieldUi';
import {
  readPanelDisclosureState,
  writePanelDisclosureState,
} from '../../utils/panelDisclosureState';
import { openUsageDocsWindow, USAGE_DOCS_ROUTES } from '../../utils/usageDocs';

const MIN_PAGE = 1;
const BROWSER_DESCRIPTION_DISCLOSURE_KEY = 'field-browser-description';

type SortMode = 'page' | 'name' | 'type' | 'confidence';
export type FieldListDisplayPreset = 'review' | 'edit' | 'fill' | 'custom';

type FontSizeDraft = {
  source: FieldFontSizeChoice;
  value: string;
};

type PreparedFieldRow = {
  field: PdfField;
  searchName: string;
  typeLabel: string;
  sizeLabel: string;
  fieldConfidenceValue: number;
  fieldTier: ConfidenceTier;
  nameTier: ConfidenceTier | null;
  showConfidence: boolean;
  fieldConfidenceText: string | null;
  nameConfidenceText: string | null;
  nameClassName: string;
};

type FieldListPanelProps = {
  fields: PdfField[];
  selectedFieldId: string | null;
  selectedField: PdfField | null;
  currentPage: number;
  pageCount: number;
  showFields: boolean;
  showFieldNames: boolean;
  showFieldInfo: boolean;
  transformMode: boolean;
  displayPreset: FieldListDisplayPreset;
  onApplyDisplayPreset: (preset: Exclude<FieldListDisplayPreset, 'custom'>) => void;
  onShowFieldsChange: (enabled: boolean) => void;
  onShowFieldNamesChange: (enabled: boolean) => void;
  onShowFieldInfoChange: (enabled: boolean) => void;
  onTransformModeChange: (enabled: boolean) => void;
  canClearInputs: boolean;
  onClearInputs: () => void;
  globalFieldFont: FieldFontChoice;
  onGlobalFieldFontChange: (font: FieldFontChoice) => void;
  globalFieldFontSize: FieldFontSizeChoice;
  onGlobalFieldFontSizeChange: (fontSize: FieldFontSizeChoice) => void;
  globalFieldFontColor: FieldFontColorChoice;
  onGlobalFieldFontColorChange: (fontColor: FieldFontColorChoice) => void;
  globalFieldAlignment: FieldTextAlignmentChoice;
  onGlobalFieldAlignmentChange: (alignment: FieldTextAlignmentChoice) => void;
  confidenceFilter: ConfidenceFilter;
  onConfidenceFilterChange: (tier: ConfidenceTier, enabled: boolean) => void;
  onResetConfidenceFilters: () => void;
  onSelectField: (fieldId: string) => void;
  onPageChange: (page: number) => void;
  renameInProgress?: boolean;
  onBlockedAction?: (message: string) => void;
};

/**
 * Clamp requested page numbers into valid ranges.
 */
function clampPage(value: number, pageCount: number) {
  if (pageCount <= 0) return MIN_PAGE;
  return Math.min(Math.max(value, MIN_PAGE), pageCount);
}

/**
 * Return a sorted copy of fields according to the selected mode.
 */
function sortFields(items: PreparedFieldRow[], mode: SortMode): PreparedFieldRow[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (mode === 'name') {
      return a.field.name.localeCompare(b.field.name, undefined, { sensitivity: 'base' });
    }
    if (mode === 'type') {
      const byType = a.typeLabel.localeCompare(b.typeLabel, undefined, {
        sensitivity: 'base',
      });
      if (byType !== 0) return byType;
      return a.field.name.localeCompare(b.field.name, undefined, { sensitivity: 'base' });
    }
    if (mode === 'confidence') {
      const aConfidence = a.fieldConfidenceValue;
      const bConfidence = b.fieldConfidenceValue;
      if (aConfidence !== bConfidence) return bConfidence - aConfidence;
      return a.field.name.localeCompare(b.field.name, undefined, { sensitivity: 'base' });
    }

    if (a.field.page !== b.field.page) return a.field.page - b.field.page;
    if (a.field.rect.y !== b.field.rect.y) return a.field.rect.y - b.field.rect.y;
    if (a.field.rect.x !== b.field.rect.x) return a.field.rect.x - b.field.rect.x;
    return a.field.name.localeCompare(b.field.name, undefined, { sensitivity: 'base' });
  });
  return sorted;
}

function fontSizeDraftValue(fontSize: FieldFontSizeChoice): string {
  return typeof fontSize === 'number' ? String(fontSize) : '';
}

function prepareFieldRow(field: PdfField): PreparedFieldRow {
  const fieldConfidence = fieldConfidenceForField(field);
  const nameConfidence = nameConfidenceForField(field);
  const fieldTier = fieldConfidenceTierForField(field);
  const nameTier = nameConfidenceTierForField(field);
  const showConfidence = hasAnyConfidence(field);
  const fieldConfidenceText =
    typeof fieldConfidence === 'number'
      ? `${Math.round(fieldConfidence * 100)}% field`
      : null;
  const nameLabel = typeof field.mappingConfidence === 'number' ? 'field remap' : 'name';
  const nameConfidenceText =
    typeof nameConfidence === 'number'
      ? `${Math.round(nameConfidence * 100)}% ${nameLabel}`
      : null;
  const nameClassName =
    nameTier && nameTier !== 'high' ? `field-row__name--conf-${nameTier}` : '';

  const radioSearchTokens = field.type === 'radio'
    ? [
        field.radioGroupLabel,
        field.radioGroupKey,
        field.radioOptionLabel,
        field.radioOptionKey,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  return {
    field,
    searchName: `${field.name} ${radioSearchTokens}`.trim().toLowerCase(),
    typeLabel: fieldTypeLabel(field.type),
    sizeLabel: formatSize(field.rect),
    fieldConfidenceValue: fieldConfidence ?? -1,
    fieldTier,
    nameTier,
    showConfidence,
    fieldConfidenceText,
    nameConfidenceText,
    nameClassName,
  };
}

type FieldListRowProps = {
  row: PreparedFieldRow;
  isSelected: boolean;
  onActivate: (fieldId: string, page: number) => void;
};

const FieldListRow = memo(function FieldListRow({
  row,
  isSelected,
  onActivate,
}: FieldListRowProps) {
  const rowClassName = [
    'field-row',
    isSelected ? 'field-row--active' : '',
    `field-row--conf-${row.fieldTier}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={rowClassName}
      type="button"
      onClick={() => onActivate(row.field.id, row.field.page)}
    >
      <div className="field-row__main">
        <span className={['field-row__name', row.nameClassName].filter(Boolean).join(' ')}>
          {row.field.name}
        </span>
        <span className="field-row__meta">
          <span className={`field-row__type field-row__type--${row.field.type}`}>
            {row.typeLabel}
          </span>
          <span className="field-row__page">Page {row.field.page}</span>
          {row.field.type === 'radio' && row.field.radioGroupLabel ? (
            <span className="field-row__group">
              {row.field.radioGroupLabel}
            </span>
          ) : null}
          {row.showConfidence ? (
            <span className="field-row__confidence-group">
              {row.fieldConfidenceText ? (
                <span className={`field-row__confidence field-row__confidence--${row.fieldTier}`}>
                  {row.fieldConfidenceText}
                </span>
              ) : null}
              {row.nameConfidenceText ? (
                <span
                  className={`field-row__confidence field-row__confidence--${
                    row.nameTier || 'high'
                  }`}
                >
                  {row.nameConfidenceText}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </div>
      <span className="field-row__size">{row.sizeLabel}</span>
    </button>
  );
}, (prev, next) => prev.row === next.row && prev.isSelected === next.isSelected && prev.onActivate === next.onActivate);

/**
 * Render the field list UI with filtering and selection.
 */
export function FieldListPanel({
  fields,
  selectedFieldId,
  selectedField,
  currentPage,
  pageCount,
  showFields,
  showFieldNames,
  showFieldInfo,
  transformMode,
  displayPreset,
  onApplyDisplayPreset,
  onShowFieldsChange,
  onShowFieldNamesChange,
  onShowFieldInfoChange,
  onTransformModeChange,
  canClearInputs,
  onClearInputs,
  globalFieldFont,
  onGlobalFieldFontChange,
  globalFieldFontSize,
  onGlobalFieldFontSizeChange,
  globalFieldFontColor,
  onGlobalFieldFontColorChange,
  globalFieldAlignment,
  onGlobalFieldAlignmentChange,
  confidenceFilter,
  onConfidenceFilterChange,
  onResetConfidenceFilters,
  onSelectField,
  onPageChange,
  renameInProgress = false,
  onBlockedAction,
}: FieldListPanelProps) {
  const guardClick = (blocked: boolean, reason: string, action: () => void) => {
    if (blocked) { onBlockedAction?.(reason); return; }
    action();
  };
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<FieldType | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('page');
  const [showAllPages, setShowAllPages] = useState(false);
  const [browserDescriptionOpen, setBrowserDescriptionOpen] = useState(() => (
    readPanelDisclosureState(BROWSER_DESCRIPTION_DISCLOSURE_KEY)
  ));
  const [globalFieldFontSizeDraft, setGlobalFieldFontSizeDraft] = useState<FontSizeDraft>({
    source: globalFieldFontSize,
    value: fontSizeDraftValue(globalFieldFontSize),
  });
  const deferredQuery = useDeferredValue(query);
  const panelBodyRef = useRef<HTMLDivElement | null>(null);
  const resolvedGlobalFieldFontSizeDraft = Object.is(globalFieldFontSizeDraft.source, globalFieldFontSize)
    ? globalFieldFontSizeDraft.value
    : fontSizeDraftValue(globalFieldFontSize);

  const preparedFields = useMemo(
    () => fields.map((field) => prepareFieldRow(field)),
    [fields],
  );

  const currentPageFields = useMemo(
    () => preparedFields.filter((row) => row.field.page === currentPage),
    [currentPage, preparedFields],
  );

  const baseFields = useMemo(
    () => (showAllPages ? preparedFields : currentPageFields),
    [currentPageFields, preparedFields, showAllPages],
  );

  const filtered = useMemo(() => {
    const lowered = deferredQuery.trim().toLowerCase();
    return baseFields.filter((row) => {
      if (filterType !== 'all' && row.field.type !== filterType) return false;
      if (!lowered) return true;
      return row.searchName.includes(lowered);
    });
  }, [baseFields, deferredQuery, filterType]);

  const sorted = useMemo(() => sortFields(filtered, sortMode), [filtered, sortMode]);

  const currentPageFieldCount = currentPageFields.length;
  const emptyMessage =
    baseFields.length === 0
      ? showAllPages
        ? 'No fields detected yet.'
        : `No fields on page ${currentPage}.`
      : 'No fields match the current filter.';

  const inputValue = pageCount === 0 ? '' : String(currentPage);

  const selectedOutsideFilters = useMemo(() => {
    if (!selectedField) return null;
    if (sorted.some((row) => row.field.id === selectedField.id)) return null;
    return selectedField;
  }, [selectedField, sorted]);

  const confidenceChipLabel = useMemo(() => {
    const enabled = (['high', 'medium', 'low'] as const).filter((tier) => confidenceFilter[tier]);
    if (enabled.length === 3) return null;
    if (enabled.length === 0) return 'Confidence: none';
    return `Confidence: ${enabled.join(', ')}`;
  }, [confidenceFilter]);

  const hasActiveFilters =
    query.trim().length > 0 ||
    filterType !== 'all' ||
    sortMode !== 'page' ||
    showAllPages ||
    Boolean(confidenceChipLabel);

  const handlePageInput = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = Number(event.target.value);
    if (Number.isNaN(raw)) return;
    onPageChange(clampPage(Math.round(raw), pageCount));
  };

  const handleGlobalFieldFontSizeModeChange = (value: string) => {
    if (value === DEFAULT_FIELD_FONT_SIZE_CHOICE) {
      setGlobalFieldFontSizeDraft({ source: DEFAULT_FIELD_FONT_SIZE_CHOICE, value: '' });
      onGlobalFieldFontSizeChange(DEFAULT_FIELD_FONT_SIZE_CHOICE);
      return;
    }
    const nextFontSize =
      typeof globalFieldFontSize === 'number'
        ? globalFieldFontSize
        : DEFAULT_CUSTOM_FIELD_FONT_SIZE_PT;
    setGlobalFieldFontSizeDraft({ source: nextFontSize, value: String(nextFontSize) });
    onGlobalFieldFontSizeChange(nextFontSize);
  };

  const handleGlobalFieldFontSizeChange = (value: string) => {
    setGlobalFieldFontSizeDraft({ source: globalFieldFontSize, value });
  };

  const commitGlobalFieldFontSizeChange = () => {
    const fallback =
      typeof globalFieldFontSize === 'number'
        ? globalFieldFontSize
        : DEFAULT_CUSTOM_FIELD_FONT_SIZE_PT;
    const rawFontSizeDraft = resolvedGlobalFieldFontSizeDraft.trim();
    const nextFontSize =
      rawFontSizeDraft.length === 0
        ? fallback
        : sanitizeFieldFontSizeChoice(rawFontSizeDraft, fallback);
    setGlobalFieldFontSizeDraft({
      source: nextFontSize,
      value: typeof nextFontSize === 'number' ? String(nextFontSize) : String(fallback),
    });
    if (nextFontSize !== globalFieldFontSize) {
      onGlobalFieldFontSizeChange(nextFontSize);
    }
  };

  const handleGlobalFieldFontSizeKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setGlobalFieldFontSizeDraft({
        source: globalFieldFontSize,
        value: fontSizeDraftValue(globalFieldFontSize),
      });
      event.currentTarget.blur();
    }
  };

  const handleGlobalFieldFontColorChange = (value: string) => {
    onGlobalFieldFontColorChange(
      sanitizeFieldFontColorChoice(value, globalFieldFontColor || DEFAULT_FIELD_FONT_COLOR),
    );
  };

  const handlePrev = () => onPageChange(clampPage(currentPage - 1, pageCount));
  const handleNext = () => onPageChange(clampPage(currentPage + 1, pageCount));

  const clearFilters = useCallback(() => {
    setQuery('');
    setFilterType('all');
    setSortMode('page');
    setShowAllPages(false);
    onResetConfidenceFilters();
  }, [onResetConfidenceFilters]);

  const handleScrollToTop = useCallback(() => {
    panelBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toggleBrowserDescription = useCallback(() => {
    setBrowserDescriptionOpen((open) => {
      const nextOpen = !open;
      writePanelDisclosureState(BROWSER_DESCRIPTION_DISCLOSURE_KEY, nextOpen);
      return nextOpen;
    });
  }, []);

  const handleRevealSelected = useCallback(() => {
    if (!selectedOutsideFilters) return;
    setQuery('');
    setFilterType('all');
    setSortMode('page');
    setShowAllPages(true);
    onResetConfidenceFilters();
    if (selectedOutsideFilters.page !== currentPage) {
      onPageChange(selectedOutsideFilters.page);
    }
    onSelectField(selectedOutsideFilters.id);
  }, [currentPage, onPageChange, onResetConfidenceFilters, onSelectField, selectedOutsideFilters]);

  const handleActivateField = useCallback((fieldId: string, page: number) => {
    if (showAllPages && page !== currentPage) {
      onPageChange(page);
    }
    onSelectField(fieldId);
  }, [currentPage, onPageChange, onSelectField, showAllPages]);

  const isNavDisabled = pageCount === 0;
  const canGoBack = currentPage > MIN_PAGE;
  const canGoForward = currentPage < pageCount;

  return (
    <aside className="panel panel--field-list">
      <div className="panel__header panel__header--stacked">
        <div className="panel__header-row">
          <div className="panel__header-copy">
            <h2>
              <button
                type="button"
                className="panel-title-toggle"
                aria-expanded={browserDescriptionOpen}
                aria-controls="field-browser-description"
                onClick={toggleBrowserDescription}
              >
                Browser
              </button>
            </h2>
            {renameInProgress ? <p className="panel__status-text">Renaming in progress.</p> : null}
          </div>
          <div className="panel__header-actions">
            <button
              type="button"
              className="ui-button ui-button--ghost ui-button--compact panel__header-action"
              onClick={() => openUsageDocsWindow(USAGE_DOCS_ROUTES.editorWorkflow)}
              title="Open Editor Workflow usage docs in a new window"
            >
              Usage Docs
            </button>
            <button
              className="panel-scroll-top"
              type="button"
              onClick={handleScrollToTop}
              aria-label="Scroll field panel to top"
            >
              Top
            </button>
          </div>
        </div>
        <p
          id="field-browser-description"
          className="panel__micro panel-title-description"
          hidden={!browserDescriptionOpen}
        >
          Browse detected fields, move between PDF pages, control overlay visibility, set workspace-wide
          text appearance, and select a field before editing it in the right panel.
        </p>
      </div>

      <div className="panel__body" ref={panelBodyRef}>
        <div className="panel__section panel__section--page">
          <details className="panel-disclosure">
            <summary className="panel-disclosure__summary panel-disclosure__summary--section">
              Page
            </summary>
            <p className="panel__micro panel-disclosure__body">
              Move through the PDF pages. With All off, the field list follows the current page.
            </p>
          </details>
          <div className="page-bar">
            <button
              className="page-bar__button"
              type="button"
              onClick={() => guardClick(isNavDisabled || !canGoBack, isNavDisabled ? 'Page navigation is unavailable right now.' : 'Already on the first page.', handlePrev)}
              disabled={isNavDisabled || !canGoBack}
              aria-disabled={isNavDisabled || !canGoBack}
              aria-label="Previous page"
            >
              {'<'}
            </button>
            <div className="page-bar__input-wrap">
              <input
                id="page-input"
                name="page-input"
                className="page-bar__input"
                type="number"
                aria-label="Page"
                min={MIN_PAGE}
                max={pageCount || MIN_PAGE}
                inputMode="numeric"
                value={inputValue}
                onChange={handlePageInput}
                disabled={isNavDisabled}
              />
              <span className="page-bar__total">/ {pageCount || '--'}</span>
            </div>
            <button
              className="page-bar__button"
              type="button"
              onClick={() => guardClick(isNavDisabled || !canGoForward, isNavDisabled ? 'Page navigation is unavailable right now.' : 'Already on the last page.', handleNext)}
              disabled={isNavDisabled || !canGoForward}
              aria-disabled={isNavDisabled || !canGoForward}
              aria-label="Next page"
            >
              {'>'}
            </button>
          </div>
        </div>

        <div className="panel__section panel__section--tight">
          <details className="panel-disclosure">
            <summary className="panel-disclosure__summary panel-disclosure__summary--section">
              Display mode
            </summary>
            <p className="panel__micro panel-disclosure__body">
              Review shows overlays and names, Edit enables field moving and resizing, and Fill shows
              fillable inputs. Manual toggles can override the preset.
            </p>
          </details>
          <div className="panel-display-modes" role="group" aria-label="Display mode presets">
            {([
              { key: 'review', label: 'Review' },
              { key: 'edit', label: 'Edit' },
              { key: 'fill', label: 'Fill' },
            ] as const).map((preset) => (
              <button
                key={preset.key}
                type="button"
                className={`panel-mode-chip${displayPreset === preset.key ? ' panel-mode-chip--active' : ''}`}
                onClick={() => onApplyDisplayPreset(preset.key)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {displayPreset === 'custom' ? (
            <p className="panel__micro">Custom mode active from manual visibility toggles.</p>
          ) : null}
          <div className="panel__toggle-row" role="group" aria-label="Field display controls">
            <label
              className={`panel-pill-toggle${showFields ? ' panel-pill-toggle--active' : ''}`}
              title="Show field overlays on the PDF"
            >
              <input
                id="panel-toggle-fields"
                name="panel-toggle-fields"
                type="checkbox"
                checked={showFields}
                onChange={(event) => onShowFieldsChange(event.target.checked)}
              />
              <span>Fields</span>
            </label>
            <label
              className={`panel-pill-toggle${showFieldNames ? ' panel-pill-toggle--active' : ''}`}
              title="Show field names on the PDF overlay"
            >
              <input
                id="panel-toggle-names"
                name="panel-toggle-names"
                type="checkbox"
                checked={showFieldNames}
                onChange={(event) => onShowFieldNamesChange(event.target.checked)}
              />
              <span>Names</span>
            </label>
            <label
              className={`panel-pill-toggle${showAllPages ? ' panel-pill-toggle--active' : ''}`}
              title="Show fields from every page in the list"
            >
              <input
                id="panel-toggle-all"
                name="panel-toggle-all"
                type="checkbox"
                checked={showAllPages}
                onChange={(event) => setShowAllPages(event.target.checked)}
              />
              <span>All</span>
            </label>
            <label
              className={`panel-pill-toggle${showFieldInfo ? ' panel-pill-toggle--active' : ''}`}
              title="Fill values for fields (data entry mode)"
            >
              <input
                id="panel-toggle-info"
                name="panel-toggle-info"
                type="checkbox"
                checked={showFieldInfo}
                onChange={(event) => onShowFieldInfoChange(event.target.checked)}
              />
              <span>Info</span>
            </label>
            <label
              className={`panel-pill-toggle${transformMode ? ' panel-pill-toggle--active' : ''}`}
              title="Transform mode enables field moving and resize handles"
            >
              <input
                id="panel-toggle-transform"
                name="panel-toggle-transform"
                type="checkbox"
                checked={transformMode}
                onChange={(event) => onTransformModeChange(event.target.checked)}
              />
              <span>Transform</span>
            </label>
            <button
              className="panel-pill-toggle panel-pill-toggle--action"
              type="button"
              onClick={() => guardClick(!canClearInputs, 'No field values to clear.', onClearInputs)}
              disabled={!canClearInputs}
              aria-disabled={!canClearInputs}
              title="Clear all field inputs"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="panel__section panel__section--tight">
          <details className="panel-disclosure">
            <summary className="panel-disclosure__summary panel-disclosure__summary--section">
              Global appearance
            </summary>
            <p className="panel__micro panel-disclosure__body">
              These workspace defaults apply to text fields unless a selected field has its own font,
              size, color, or alignment override.
            </p>
          </details>
          <div>
            <label className="panel__label" htmlFor="global-field-font">
              Global font
            </label>
            <select
              id="global-field-font"
              name="global-field-font"
              className="panel__select panel__select--compact"
              value={globalFieldFont}
              title="Default keeps the current generated PDF field font behavior"
              onChange={(event) => onGlobalFieldFontChange(event.target.value as FieldFontChoice)}
            >
              <option value={DEFAULT_FIELD_FONT_CHOICE}>Default (Helvetica)</option>
              {PDF_BASE_14_FONT_OPTION_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.advanced ? `${option.label} (symbol)` : option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label className="panel__label" htmlFor="global-field-font-size">
              Global font size
            </label>
            <div className="panel__inline-control panel__inline-control--stacked">
              <select
                id="global-field-font-size"
                name="global-field-font-size"
                className="panel__select panel__select--compact"
                value={globalFieldFontSize === DEFAULT_FIELD_FONT_SIZE_CHOICE ? 'auto' : 'custom'}
                title="Auto keeps the current generated PDF field font-size behavior"
                onChange={(event) => handleGlobalFieldFontSizeModeChange(event.target.value)}
              >
                <option value="auto">Auto (dynamic)</option>
                <option value="custom">Custom</option>
              </select>
              <input
                id="global-field-font-size-custom"
                name="global-field-font-size-custom"
                className="panel__input panel__input--inline"
                type="number"
                min={MIN_FIELD_FONT_SIZE_PT}
                max={MAX_FIELD_FONT_SIZE_PT}
                step={0.5}
                inputMode="decimal"
                aria-label="Global custom font size"
                value={
                  globalFieldFontSize === DEFAULT_FIELD_FONT_SIZE_CHOICE
                    ? ''
                    : resolvedGlobalFieldFontSizeDraft
                }
                placeholder="Auto"
                disabled={globalFieldFontSize === DEFAULT_FIELD_FONT_SIZE_CHOICE}
                onChange={(event) => handleGlobalFieldFontSizeChange(event.target.value)}
                onBlur={commitGlobalFieldFontSizeChange}
                onKeyDown={handleGlobalFieldFontSizeKeyDown}
              />
            </div>
          </div>

          <div>
            <label className="panel__label" htmlFor="global-field-font-color">
              Global font color
            </label>
            <div className="panel__inline-control panel__inline-control--color">
              <input
                id="global-field-font-color"
                name="global-field-font-color"
                className="panel__color-input"
                type="color"
                aria-label="Global font color"
                value={sanitizeFieldFontColorChoice(globalFieldFontColor, DEFAULT_FIELD_FONT_COLOR)}
                onChange={(event) => handleGlobalFieldFontColorChange(event.target.value)}
              />
              <span className="panel__color-value">
                {fieldFontColorChoiceLabel(globalFieldFontColor)}
              </span>
            </div>
          </div>

          <div>
            <label className="panel__label" htmlFor="global-field-alignment">
              Global alignment
            </label>
            <select
              id="global-field-alignment"
              name="global-field-alignment"
              className="panel__select panel__select--compact"
              value={sanitizeGlobalFieldTextAlignment(globalFieldAlignment)}
              onChange={(event) => (
                onGlobalFieldAlignmentChange(
                  sanitizeGlobalFieldTextAlignment(event.target.value, globalFieldAlignment),
                )
              )}
            >
              {FIELD_TEXT_ALIGNMENT_CHOICES.map((alignment) => (
                <option key={alignment} value={alignment}>
                  {fieldTextAlignmentChoiceLabel(alignment)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="panel__section panel__section--tight">
          <details className="panel-disclosure">
            <summary className="panel-disclosure__summary panel-disclosure__summary--section">
              List filters
            </summary>
            <p className="panel__micro panel-disclosure__body">
              Narrow the field list by confidence, name, type, page scope, or sort order before choosing the
              field to inspect.
            </p>
          </details>
            <div>
              <span className="panel__label">Confidence</span>
              <div className="confidence-filter confidence-filter--compact" role="group" aria-label="Filter by confidence">
                {(['high', 'medium', 'low'] as const).map((tier) => (
                  <label
                    key={tier}
                    className={`confidence-filter__option confidence-filter__option--${tier}`}
                  >
                    <input
                      id={`confidence-filter-${tier}`}
                      name={`confidence-filter-${tier}`}
                      type="checkbox"
                      checked={confidenceFilter[tier]}
                      onChange={(event) => onConfidenceFilterChange(tier, event.target.checked)}
                    />
                    <span>{tier.charAt(0).toUpperCase() + tier.slice(1)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="panel__controls">
              <div>
                <label className="panel__label" htmlFor="field-search">
                  Search
                </label>
                <input
                  id="field-search"
                  name="field-search"
                  className="panel__input"
                  placeholder="Search by name"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div>
                <label className="panel__label" htmlFor="field-filter">
                  Filter
                </label>
                <select
                  id="field-filter"
                  name="field-filter"
                  className="panel__select"
                  value={filterType}
                  onChange={(event) => setFilterType(event.target.value as FieldType | 'all')}
                >
                  <option value="all">All types</option>
                  {FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {fieldTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="panel__label" htmlFor="field-sort">
                  Sort
                </label>
                <select
                  id="field-sort"
                  name="field-sort"
                  className="panel__select"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                >
                  <option value="page">Page order</option>
                  <option value="name">Name</option>
                  <option value="type">Type</option>
                  <option value="confidence">Confidence</option>
                </select>
              </div>
              <div className="panel-page-field-count" title="Fields on the current page after confidence filtering">
                <span className="panel-page-field-count__label">Page Fields:</span>
                <span className="panel-page-field-count__value">{currentPageFieldCount}</span>
              </div>
            </div>

            {hasActiveFilters ? (
              <div className="panel-filter-summary">
                {query.trim().length > 0 ? <span className="panel-filter-chip">Search: {query.trim()}</span> : null}
                {filterType !== 'all' ? <span className="panel-filter-chip">Type: {fieldTypeLabel(filterType)}</span> : null}
                {showAllPages ? <span className="panel-filter-chip">Scope: all pages</span> : null}
                {sortMode !== 'page' ? <span className="panel-filter-chip">Sort: {sortMode}</span> : null}
                {confidenceChipLabel ? <span className="panel-filter-chip">{confidenceChipLabel}</span> : null}
                <button
                  type="button"
                  className="panel-filter-reset"
                  onClick={clearFilters}
                >
                  Reset filters
                </button>
              </div>
            ) : null}
        </div>

        <div className="panel__list">
          {selectedOutsideFilters ? (
            <div className="panel-selected-outside">
              <p className="panel-selected-outside__text">
                Selected field is outside the current filters.
              </p>
              <button
                type="button"
                className="panel-selected-outside__action"
                onClick={handleRevealSelected}
              >
                Reveal selected
              </button>
            </div>
          ) : null}

          <div className="field-list">
            {sorted.length === 0 ? (
              <p className="panel__empty">{emptyMessage}</p>
            ) : (
              sorted.map((row) => {
                return (
                  <FieldListRow
                    key={row.field.id}
                    row={row}
                    isSelected={row.field.id === selectedFieldId}
                    onActivate={handleActivateField}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
