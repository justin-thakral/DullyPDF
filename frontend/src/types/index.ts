/** Shared type definitions for the frontend. */
import type { ReactNode } from 'react';
import type { AlertTone } from '../components/ui/Alert';
import type { DialogTone } from '../components/ui/Dialog';

// Re-export component types so consumers can import from one place.
export type { AlertTone } from '../components/ui/Alert';
export type { DialogTone } from '../components/ui/Dialog';

// Supported field categories used by the editor and overlay styling.
export type FieldType =
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'signature'
  | 'image'
  | 'pdf417'
  | 'barcode'
  | 'qr';

export type CreateTool = FieldType | 'quick-radio' | 'bulk-text-style' | 'number-input' | 'calculated-output';

export type PdfBase14FontName =
  | 'Helvetica'
  | 'Helvetica-Bold'
  | 'Helvetica-Oblique'
  | 'Helvetica-BoldOblique'
  | 'Times-Roman'
  | 'Times-Bold'
  | 'Times-Italic'
  | 'Times-BoldItalic'
  | 'Courier'
  | 'Courier-Bold'
  | 'Courier-Oblique'
  | 'Courier-BoldOblique';

export type FieldFontChoice = 'default' | PdfBase14FontName;

export type FieldFontOverride = 'global' | PdfBase14FontName;

export type FieldFontSizeChoice = 'auto' | number;

export type FieldFontSizeOverride = 'global' | 'auto' | number;

export type FieldFontColorChoice = string;

export type FieldFontColorOverride = 'global' | string;

export type FieldTextAlignmentChoice = 'left' | 'center' | 'right';

export type FieldTextAlignmentOverride = 'global' | FieldTextAlignmentChoice;

export type NumericValueType = 'integer' | 'decimal';

export type CalculationFieldRole =
  | 'none'
  | 'number_input'
  | 'calculated_output'
  | 'calculated_intermediate'
  | 'external_imported_calculation';

export type FormulaNode =
  | { kind: 'constant'; value: number }
  | { kind: 'field'; fieldId: string }
  | { kind: 'unary'; op: '-'; value: FormulaNode }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: FormulaNode; right: FormulaNode };

export type CalculationMetadata = {
  role: CalculationFieldRole;
  valueType: NumericValueType;
  formula?: FormulaNode;
  dependencies?: string[];
  output?: {
    valueType: NumericValueType;
    rounding?: 'round' | 'floor' | 'ceil' | 'truncate';
    blankInputBehavior?: 'treat_as_zero' | 'blank_result' | 'validation_error';
    divideByZeroBehavior?: 'blank_result' | 'validation_error';
  };
  imported?: {
    source: 'acroform_js' | 'dullypdf_metadata';
    supported: boolean;
    reason?: string;
    rawActionSummary?: string;
  };
};

export type FieldDependencyRef = {
  fieldId: string;
  fieldName: string;
};

export type Pdf417DependencyKey =
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'streetAddress'
  | 'city'
  | 'state'
  | 'zip'
  | 'dob'
  | 'sex'
  | 'eyeColor'
  | 'height'
  | 'customerId'
  | 'issueDate'
  | 'expirationDate';

export type Pdf417ScanData = {
  [key in Pdf417DependencyKey]?: string | null;
};

/**
 * Unified configuration entry for app-only barcode fields (pdf417, barcode, qr).
 * Each class represents a single label-and-value pairing that the form creator
 * defines. PDF417 fields concatenate every class into the encoded scan text;
 * QR / 1D barcode fields encode exactly one class (the first).
 */
export type BarcodeClassMode = 'manual' | 'field';

export type BarcodeClass = {
  id: string;
  label: string;
  mode: BarcodeClassMode;
  fieldRef?: FieldDependencyRef | null;
  manualValue?: string | null;
};

export type SavedFormAppearance = {
  globalFieldFont: FieldFontChoice;
  globalFieldFontSize?: FieldFontSizeChoice;
  globalFieldFontColor?: FieldFontColorChoice;
  globalFieldAlignment?: FieldTextAlignmentChoice;
};

export type RadioGroupSource = 'manual' | 'ai_suggestion' | 'migrated_legacy';

export type RadioGroupOption = {
  fieldId: string;
  optionKey: string;
  optionLabel: string;
};

export type RadioGroup = {
  id: string;
  key: string;
  label: string;
  page?: number;
  optionOrder: string[];
  options: RadioGroupOption[];
  source: RadioGroupSource;
};

export type RadioToolDraft = {
  groupId: string;
  groupKey: string;
  groupLabel: string;
  nextOptionKey: string;
  nextOptionLabel: string;
};

export type ConfidenceTier = 'high' | 'medium' | 'low';

export type ConfidenceFilter = Record<ConfidenceTier, boolean>;

// Geometry is expressed in PDF points with a top-left origin.
export type FieldRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Client-side representation of a form field, kept in memory until export is implemented.
export type PdfField = {
  id: string;
  name: string;
  type: FieldType;
  page: number;
  rect: FieldRect;
  /**
   * Confidence that this is a real field (0..1). Populated by detection.
   * When OpenAI rename runs, this should represent "isItAfieldConfidence" if present.
   */
  fieldConfidence?: number;
  /**
   * Confidence of the schema mapping/rename suggestion (0..1).
   */
  mappingConfidence?: number;
  /**
   * Confidence of the OpenAI rename suggestion (0..1).
   */
  renameConfidence?: number;
  /**
   * Optional field value to inject when generating a filled PDF.
   */
  value?: string | number | boolean | null;
  /**
   * DullyPDF-only image payload used by image fields and generated barcode previews.
   */
  imageDataUrl?: string | null;
  imageMimeType?: string | null;
  imageName?: string | null;
  /**
   * DullyPDF-only PDF417 scan data and manual fallback values.
   */
  pdf417Name?: string | null;
  pdf417Dob?: string | null;
  pdf417Data?: Pdf417ScanData | null;
  /**
   * DullyPDF-only dependency metadata for generated app-helper fields.
   */
  barcodeSourceField?: FieldDependencyRef | null;
  qrSourceField?: FieldDependencyRef | null;
  pdf417FieldMappings?: Partial<Record<Pdf417DependencyKey, FieldDependencyRef>> | null;
  /**
   * User-defined classes that drive the encoded contents of pdf417 / barcode /
   * qr fields. Source of truth going forward; legacy pdf417*/qrSourceField/
   * barcodeSourceField properties remain only for hydration migration.
   */
  barcodeClasses?: BarcodeClass[] | null;
  /**
   * Internal editable-export marker name used to restore DullyPDF-only helper fields.
   */
  appOnlyMarkerName?: string | null;
  /**
   * AcroForm field behavior metadata shared by standard fields and calculation controls.
   */
  readOnly?: boolean;
  required?: boolean;
  valueType?: NumericValueType;
  calculation?: CalculationMetadata;
  /**
   * Optional text-safe PDF Base 14 font preview override for text-like fields.
   * "global" inherits the workspace-level font setting; missing values keep legacy data compatible.
   */
  fontName?: FieldFontOverride;
  /**
   * Optional font-size override in PDF points for text-like fields.
   * "global" inherits the workspace-level size, "auto" preserves height-based sizing,
   * and missing values keep legacy data compatible.
   */
  fontSize?: FieldFontSizeOverride;
  /**
   * Optional text color override for text-like fields.
   * "global" inherits the workspace-level color, and missing values keep legacy data compatible.
   */
  fontColor?: FieldFontColorOverride;
  /**
   * Optional text alignment override for text-like fields.
   * "global" inherits the workspace-level alignment, and missing values keep legacy data compatible.
   */
  textAlign?: FieldTextAlignmentOverride;
  /**
   * Checkbox grouping metadata used for schema mapping and search/fill rules.
   */
  groupKey?: string;
  optionKey?: string;
  optionLabel?: string;
  groupLabel?: string;
  /**
   * Explicit radio-group metadata for app-level single-choice controls.
   */
  radioGroupId?: string;
  radioGroupKey?: string;
  radioGroupLabel?: string;
  radioOptionKey?: string;
  radioOptionLabel?: string;
  radioOptionOrder?: number;
  radioGroupSource?: RadioGroupSource;
};

export type CheckboxRule = {
  databaseField: string;
  groupKey: string;
  operation: 'yes_no' | 'enum' | 'list' | 'presence';
  trueOption?: string;
  falseOption?: string;
  valueMap?: Record<string, string>;
  confidence?: number;
  reasoning?: string;
};

export type RadioGroupSuggestionReason =
  | 'yes_no'
  | 'enum'
  | 'binary_pair'
  | 'label_pattern';

export type RadioGroupSuggestionField = {
  fieldId?: string;
  fieldName: string;
  optionKey: string;
  optionLabel: string;
};

export type RadioGroupSuggestion = {
  id: string;
  suggestedType: 'radio_group';
  groupKey: string;
  groupLabel: string;
  suggestedFields: RadioGroupSuggestionField[];
  sourceField?: string;
  selectionReason?: RadioGroupSuggestionReason;
  confidence?: number;
  reasoning?: string;
};

export type TextTransformRuleOperation =
  | 'copy'
  | 'concat'
  | 'split_name_first_rest'
  | 'split_delimiter';

export type TextTransformRule = {
  targetField: string;
  operation: TextTransformRuleOperation;
  sources: string[];
  separator?: string;
  delimiter?: string;
  part?: 'first' | 'rest' | 'last';
  index?: number;
  confidence?: number;
  requiresReview?: boolean;
  reasoning?: string;
};

export type FillRules = {
  version?: number;
  checkboxRules?: CheckboxRule[];
  textTransformRules?: TextTransformRule[];
};

// Cached page dimensions for rendering and clamping.
export type PageSize = {
  width: number;
  height: number;
};

export type SavedFormEditorSnapshot = {
  version: number;
  pageCount: number;
  pageSizes: Record<number, PageSize>;
  appearance: SavedFormAppearance;
  fields: PdfField[];
  radioGroups: RadioGroup[];
  hasRenamedFields: boolean;
  hasMappedSchema: boolean;
};

// Data source selector options.
export type DataSourceKind = 'csv' | 'sql' | 'excel' | 'json' | 'txt' | 'respondent' | 'none';

// Processing pipeline mode.
export type ProcessingMode = 'detect' | 'fillable' | 'saved' | null;

// Payload sent to the backend when persisting a schema.
export type SchemaPayload = {
  name?: string;
  fields: Array<{ name: string; type?: string }>;
  source?: string;
  sampleCount?: number;
};

// Queued auto-actions that run after background detection completes.
export type PendingAutoActions = {
  loadToken: number;
  sessionId: string;
  schemaId: string | null;
  autoRename: boolean;
  autoMap: boolean;
};

// Dev-only session metadata displayed in the workspace header and logs so
// rename/map requests can be traced back to the exact backend session.
export type WorkspaceSessionDiagnostic = {
  sessionId: string;
  sourcePdf: string | null;
  pageCount: number | null;
  status: string | null;
  sourcePdfResolved: boolean;
};

// Search preset passed to SearchFillModal for demos and respondent jumps.
export type SearchFillPreset = {
  query: string;
  searchKey?: string;
  searchMode?: 'contains' | 'equals';
  autoRun?: boolean;
  autoFillOnSearch?: boolean;
  highlightResult?: boolean;
  token: number;
};

export type DemoSearchPreset = SearchFillPreset;

// Banner notification displayed at the top of the app.
export type BannerNotice = {
  tone: AlertTone;
  message: string;
  autoDismissMs?: number;
};

// Options for the confirm dialog.
export type ConfirmDialogOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  cancelResult?: boolean | null;
  dismissResult?: boolean | null;
};

// Options for the prompt dialog.
export type PromptDialogOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  defaultValue?: string;
  placeholder?: string;
  requireValue?: boolean;
};

// Discriminated union for dialog requests.
export type DialogRequest =
  | ({ kind: 'confirm' } & ConfirmDialogOptions)
  | ({ kind: 'prompt' } & PromptDialogOptions);

// A single field name update from rename or mapping.
export type FieldNameUpdate = {
  newName?: string;
  mappingConfidence?: unknown;
};

// Queue bucket for batching updates by name.
export type NameQueue<T> = {
  entries: T[];
  index: number;
};
