import type {
  CalculationFieldRole,
  CalculationMetadata,
  CheckboxRule,
  FieldFontColorChoice,
  FieldFontChoice,
  FieldFontSizeChoice,
  FieldTextAlignmentChoice,
  FieldDependencyRef,
  PageSize,
  Pdf417DependencyKey,
  Pdf417ScanData,
  PdfField,
  RadioGroup,
  RadioGroupSuggestion,
  SavedFormEditorSnapshot,
  TextTransformRule,
} from '../types';
import {
  DEFAULT_FIELD_FONT_COLOR,
  DEFAULT_FIELD_FONT_CHOICE,
  DEFAULT_FIELD_FONT_SIZE_CHOICE,
  DEFAULT_FIELD_TEXT_ALIGNMENT,
  isPdfBase14FontName,
  sanitizeFieldFontColorChoice,
  sanitizeFieldFontColorOverride,
  sanitizeFieldFontSizeChoice,
  sanitizeFieldFontSizeOverride,
  sanitizeFieldTextAlignmentOverride,
  sanitizeGlobalFieldTextAlignment,
} from './fieldFonts';
import { buildRadioGroups } from './radioGroups';
import { deriveRadioGroupSuggestionsFromCheckboxRules } from './openAiFields';

type FillRulesSource = {
  fillRules?: {
    checkboxRules?: Array<Record<string, unknown>>;
    checkboxHints?: Array<Record<string, unknown>>;
    textTransformRules?: Array<Record<string, unknown>>;
    templateRules?: Array<Record<string, unknown>>;
  };
  checkboxRules?: Array<Record<string, unknown>>;
  checkboxHints?: Array<Record<string, unknown>>;
  textTransformRules?: Array<Record<string, unknown>>;
  templateRules?: Array<Record<string, unknown>>;
};

export type SavedFormFillRuleState = {
  checkboxRules: CheckboxRule[];
  legacyRadioGroupSuggestions: RadioGroupSuggestion[];
  textTransformRules: TextTransformRule[];
};

function normalizeRect(value: unknown): PdfField['rect'] | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const width = Number(record.width);
  const height = Number(record.height);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { x, y, width, height };
}

function normalizeFieldValue(value: unknown): PdfField['value'] {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  return String(value);
}

function normalizeDependencyRef(value: unknown): FieldDependencyRef | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const fieldId = String(record.fieldId || '').trim();
  const fieldName = String(record.fieldName || '').trim();
  if (!fieldId && !fieldName) {
    return null;
  }
  return { fieldId, fieldName };
}

const LEGACY_PDF417_KEYS: Pdf417DependencyKey[] = [
  'firstName', 'middleName', 'lastName',
  'streetAddress', 'city', 'state', 'zip',
  'dob', 'sex', 'eyeColor', 'height',
  'customerId', 'issueDate', 'expirationDate',
];

function normalizePdf417FieldMappings(value: unknown): PdfField['pdf417FieldMappings'] {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const normalized: Partial<Record<Pdf417DependencyKey, FieldDependencyRef>> = {};
  for (const key of LEGACY_PDF417_KEYS) {
    const ref = normalizeDependencyRef(record[key]);
    if (ref) {
      normalized[key] = ref;
    }
  }
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeBarcodeClasses(value: unknown): PdfField['barcodeClasses'] {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const out: NonNullable<PdfField['barcodeClasses']> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = String(record.id || '').trim();
    const label = typeof record.label === 'string' ? record.label : '';
    const modeRaw = String(record.mode || 'manual').trim();
    const mode = modeRaw === 'field' ? 'field' : 'manual';
    const fieldRef = mode === 'field' ? normalizeDependencyRef(record.fieldRef) : null;
    const manualValue = mode === 'manual' && typeof record.manualValue === 'string'
      ? record.manualValue
      : null;
    if (!id && !label && !fieldRef && !manualValue) continue;
    out.push({
      id: id || `class_${Math.random().toString(16).slice(2)}`,
      label,
      mode,
      fieldRef: fieldRef ?? null,
      manualValue,
    });
  }
  return out;
}

const NUMERIC_VALUE_TYPES = new Set(['integer', 'decimal']);
const CALCULATION_FIELD_ROLES = new Set([
  'none',
  'number_input',
  'calculated_output',
  'calculated_intermediate',
  'external_imported_calculation',
]);

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return undefined;
}

function normalizeNumericValueType(value: unknown): CalculationMetadata['valueType'] | undefined {
  const normalized = String(value || '').trim();
  return NUMERIC_VALUE_TYPES.has(normalized)
    ? normalized as CalculationMetadata['valueType']
    : undefined;
}

function normalizeCalculationMetadata(value: unknown): CalculationMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const roleValue = String(record.role || '').trim();
  const valueType = normalizeNumericValueType(record.valueType);
  if (!CALCULATION_FIELD_ROLES.has(roleValue) || !valueType) {
    return undefined;
  }
  const calculation: CalculationMetadata = {
    role: roleValue as CalculationFieldRole,
    valueType,
  };
  if (record.formula && typeof record.formula === 'object' && !Array.isArray(record.formula)) {
    calculation.formula = record.formula as CalculationMetadata['formula'];
  }
  if (Array.isArray(record.dependencies)) {
    calculation.dependencies = record.dependencies
      .map((dependency) => String(dependency || '').trim())
      .filter(Boolean);
  }
  if (record.output && typeof record.output === 'object' && !Array.isArray(record.output)) {
    const outputRecord = record.output as Record<string, unknown>;
    const outputValueType = normalizeNumericValueType(outputRecord.valueType);
    if (outputValueType) {
      calculation.output = { valueType: outputValueType };
      const rounding = String(outputRecord.rounding || '').trim();
      if (['round', 'floor', 'ceil', 'truncate'].includes(rounding)) {
        calculation.output.rounding = rounding as NonNullable<CalculationMetadata['output']>['rounding'];
      }
      const blankInputBehavior = String(outputRecord.blankInputBehavior || '').trim();
      if (['treat_as_zero', 'blank_result', 'validation_error'].includes(blankInputBehavior)) {
        calculation.output.blankInputBehavior =
          blankInputBehavior as NonNullable<CalculationMetadata['output']>['blankInputBehavior'];
      }
      const divideByZeroBehavior = String(outputRecord.divideByZeroBehavior || '').trim();
      if (['blank_result', 'validation_error'].includes(divideByZeroBehavior)) {
        calculation.output.divideByZeroBehavior =
          divideByZeroBehavior as NonNullable<CalculationMetadata['output']>['divideByZeroBehavior'];
      }
    }
  }
  if (record.imported && typeof record.imported === 'object' && !Array.isArray(record.imported)) {
    const importedRecord = record.imported as Record<string, unknown>;
    const source = String(importedRecord.source || '').trim();
    if (source === 'acroform_js' || source === 'dullypdf_metadata') {
      calculation.imported = {
        source,
        supported: normalizeBoolean(importedRecord.supported) ?? false,
      };
      if (importedRecord.reason !== undefined && importedRecord.reason !== null) {
        calculation.imported.reason = String(importedRecord.reason);
      }
      if (importedRecord.rawActionSummary !== undefined && importedRecord.rawActionSummary !== null) {
        calculation.imported.rawActionSummary = String(importedRecord.rawActionSummary);
      }
    }
  }
  return calculation;
}

function normalizeField(value: unknown): PdfField | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = String(record.id || '').trim();
  const name = String(record.name || '').trim();
  const rawType = String(record.type || 'text').trim().toLowerCase();
  const type = (rawType === 'date' ? 'text' : rawType) as PdfField['type'];
  const page = Number(record.page);
  const rect = normalizeRect(record.rect);
  if (!id || !name || !rect || !Number.isInteger(page) || page < 1) {
    return null;
  }
  if (!['text', 'checkbox', 'radio', 'signature', 'image', 'pdf417', 'barcode', 'qr'].includes(type)) {
    return null;
  }
  const field: PdfField = {
    id,
    name,
    type,
    page,
    rect,
    value: normalizeFieldValue(record.value),
  };
  const readOnly = normalizeBoolean(record.readOnly ?? record.readonly);
  if (readOnly !== undefined) {
    field.readOnly = readOnly;
  }
  const required = normalizeBoolean(record.required);
  if (required !== undefined) {
    field.required = required;
  }
  const valueType = normalizeNumericValueType(record.valueType);
  if (valueType && type === 'text') {
    field.valueType = valueType;
  }
  const calculation = normalizeCalculationMetadata(record.calculation);
  if (calculation && type === 'text') {
    field.calculation = calculation;
  }
  for (const key of [
    'groupKey',
    'optionKey',
    'optionLabel',
    'groupLabel',
    'radioGroupId',
    'radioGroupKey',
    'radioGroupLabel',
    'radioOptionKey',
    'radioOptionLabel',
  ] as const) {
    const raw = record[key];
    if (raw === undefined || raw === null) {
      continue;
    }
    field[key] = String(raw);
  }
  if (record.radioGroupSource !== undefined && record.radioGroupSource !== null) {
    const source = String(record.radioGroupSource).trim();
    if (source === 'manual' || source === 'ai_suggestion' || source === 'migrated_legacy') {
      field.radioGroupSource = source;
    }
  }
  if (record.fontName !== undefined && record.fontName !== null) {
    const fontName = String(record.fontName).trim();
    if (fontName === 'global' || isPdfBase14FontName(fontName)) {
      field.fontName = fontName;
    }
  }
  if (type === 'text' && record.fontSize !== undefined && record.fontSize !== null) {
    field.fontSize = sanitizeFieldFontSizeOverride(record.fontSize, 'global');
  }
  if (type === 'text' && record.fontColor !== undefined && record.fontColor !== null) {
    field.fontColor = sanitizeFieldFontColorOverride(record.fontColor, 'global');
  }
  if (type === 'text' && record.textAlign !== undefined && record.textAlign !== null) {
    field.textAlign = sanitizeFieldTextAlignmentOverride(record.textAlign, 'global');
  }
  for (const key of ['imageDataUrl', 'imageMimeType', 'imageName', 'pdf417Name', 'pdf417Dob'] as const) {
    const raw = record[key];
    if (raw === undefined) {
      continue;
    }
    field[key] = raw === null ? null : String(raw);
  }
  if (record.pdf417Data === null) {
    field.pdf417Data = null;
  } else if (record.pdf417Data && typeof record.pdf417Data === 'object') {
    const rawPdf417Data = record.pdf417Data as Record<string, unknown>;
    const normalizedPdf417Data: Pdf417ScanData = {};
    for (const key of LEGACY_PDF417_KEYS) {
      if (rawPdf417Data[key] !== undefined) {
        normalizedPdf417Data[key] =
          rawPdf417Data[key] === null ? null : String(rawPdf417Data[key]);
      }
    }
    field.pdf417Data = normalizedPdf417Data;
  }
  if (record.barcodeSourceField !== undefined) {
    field.barcodeSourceField = normalizeDependencyRef(record.barcodeSourceField);
  }
  if (record.qrSourceField !== undefined) {
    field.qrSourceField = normalizeDependencyRef(record.qrSourceField);
  }
  if (record.pdf417FieldMappings !== undefined) {
    field.pdf417FieldMappings = normalizePdf417FieldMappings(record.pdf417FieldMappings);
  }
  if (record.barcodeClasses !== undefined) {
    const normalizedClasses = normalizeBarcodeClasses(record.barcodeClasses);
    if (normalizedClasses !== undefined) {
      field.barcodeClasses = normalizedClasses;
    }
  }
  for (const key of ['fieldConfidence', 'mappingConfidence', 'renameConfidence', 'radioOptionOrder'] as const) {
    const raw = record[key];
    if (raw === undefined || raw === null) {
      continue;
    }
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      if (key === 'radioOptionOrder') {
        field.radioOptionOrder = numeric;
      } else {
        field[key] = numeric;
      }
    }
  }
  return field;
}

function normalizeAppearance(value: unknown): SavedFormEditorSnapshot['appearance'] {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const rawGlobalFont = String(record.globalFieldFont || DEFAULT_FIELD_FONT_CHOICE).trim();
  const globalFieldFont: FieldFontChoice = isPdfBase14FontName(rawGlobalFont)
    ? rawGlobalFont
    : DEFAULT_FIELD_FONT_CHOICE;
  const globalFieldFontSize = sanitizeFieldFontSizeChoice(
    record.globalFieldFontSize,
    DEFAULT_FIELD_FONT_SIZE_CHOICE,
  );
  const globalFieldFontColor = sanitizeFieldFontColorChoice(
    record.globalFieldFontColor,
    DEFAULT_FIELD_FONT_COLOR,
  );
  const globalFieldAlignment = sanitizeGlobalFieldTextAlignment(
    record.globalFieldAlignment,
    DEFAULT_FIELD_TEXT_ALIGNMENT,
  );
  return { globalFieldFont, globalFieldFontSize, globalFieldFontColor, globalFieldAlignment };
}

function normalizeRadioGroups(value: unknown): RadioGroup[] | null {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const normalized: RadioGroup[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const record = entry as Record<string, unknown>;
    const id = String(record.id || '').trim();
    const key = String(record.key || '').trim();
    const label = String(record.label || '').trim();
    const source = String(record.source || 'manual').trim() as RadioGroup['source'];
    if (!id || !key || !label) return null;
    const options = Array.isArray(record.options)
      ? record.options
          .map((option) => {
            if (!option || typeof option !== 'object') return null;
            const optionRecord = option as Record<string, unknown>;
            const fieldId = String(optionRecord.fieldId || '').trim();
            const optionKey = String(optionRecord.optionKey || '').trim();
            const optionLabel = String(optionRecord.optionLabel || '').trim();
            if (!fieldId || !optionKey || !optionLabel) return null;
            return { fieldId, optionKey, optionLabel };
          })
          .filter((option): option is RadioGroup['options'][number] => Boolean(option))
      : null;
    if (!options) return null;
    if (options.length === 0) return null;
    const optionOrder = Array.isArray(record.optionOrder)
      ? record.optionOrder.map((item) => String(item || '').trim()).filter(Boolean)
      : options.map((option) => option.optionKey);
    const rawPage = record.page;
    const page =
      rawPage === undefined || rawPage === null
        ? undefined
        : Number.isInteger(Number(rawPage)) && Number(rawPage) > 0
          ? Number(rawPage)
          : undefined;
    normalized.push({
      id,
      key,
      label,
      page,
      optionOrder,
      options,
      source: source === 'ai_suggestion' || source === 'migrated_legacy' ? source : 'manual',
    });
  }
  return normalized;
}

function normalizePageSizes(
  value: unknown,
  pageCount: number,
): Record<number, PageSize> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const normalized: Record<number, PageSize> = {};
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const raw = record[String(pageNumber)] ?? record[pageNumber];
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const size = raw as Record<string, unknown>;
    const width = Number(size.width);
    const height = Number(size.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    normalized[pageNumber] = { width, height };
  }
  return normalized;
}

export function deriveLegacyRadioGroupSuggestions(
  fields: PdfField[],
  checkboxRules: CheckboxRule[],
): RadioGroupSuggestion[] {
  return deriveRadioGroupSuggestionsFromCheckboxRules(fields, checkboxRules, {
    idPrefix: 'legacy_',
  });
}

export function buildSavedFormEditorSnapshot(params: {
  pageCount: number;
  pageSizes: Record<number, PageSize>;
  fields: PdfField[];
  globalFieldFont?: FieldFontChoice;
  globalFieldFontSize?: FieldFontSizeChoice;
  globalFieldFontColor?: FieldFontColorChoice;
  globalFieldAlignment?: FieldTextAlignmentChoice;
  hasRenamedFields: boolean;
  hasMappedSchema: boolean;
}): SavedFormEditorSnapshot {
  const globalFieldFont = isPdfBase14FontName(params.globalFieldFont)
    ? params.globalFieldFont
    : DEFAULT_FIELD_FONT_CHOICE;
  const globalFieldFontSize = sanitizeFieldFontSizeChoice(
    params.globalFieldFontSize,
    DEFAULT_FIELD_FONT_SIZE_CHOICE,
  );
  const globalFieldFontColor = sanitizeFieldFontColorChoice(
    params.globalFieldFontColor,
    DEFAULT_FIELD_FONT_COLOR,
  );
  const globalFieldAlignment = sanitizeGlobalFieldTextAlignment(
    params.globalFieldAlignment,
    DEFAULT_FIELD_TEXT_ALIGNMENT,
  );
  return {
    version: 2,
    pageCount: params.pageCount,
    pageSizes: Object.fromEntries(
      Object.entries(params.pageSizes).map(([page, size]) => [
        Number(page),
        { width: size.width, height: size.height },
      ]),
    ),
    appearance: { globalFieldFont, globalFieldFontSize, globalFieldFontColor, globalFieldAlignment },
    fields: params.fields.map((field) => ({
      ...field,
      rect: { ...field.rect },
    })),
    radioGroups: buildRadioGroups(params.fields),
    hasRenamedFields: params.hasRenamedFields,
    hasMappedSchema: params.hasMappedSchema,
  };
}

export function normalizeSavedFormEditorSnapshot(
  value: unknown,
  options?: { expectedPageCount?: number },
): SavedFormEditorSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const version = Number(record.version || 0);
  const pageCount = Number(record.pageCount);
  if (![1, 2].includes(version) || !Number.isInteger(pageCount) || pageCount < 1) {
    return null;
  }
  if (options?.expectedPageCount && pageCount !== options.expectedPageCount) {
    return null;
  }
  const pageSizes = normalizePageSizes(record.pageSizes, pageCount);
  if (!pageSizes) {
    return null;
  }
  if (!Array.isArray(record.fields)) {
    return null;
  }
  const fields = record.fields
    .map((field) => normalizeField(field))
    .filter((field): field is PdfField => Boolean(field));
  if (fields.length !== record.fields.length) {
    return null;
  }
  const radioGroups = normalizeRadioGroups(record.radioGroups);
  if (radioGroups === null) {
    return null;
  }
  return {
    version: 2,
    pageCount,
    pageSizes,
    appearance: normalizeAppearance(record.appearance),
    fields,
    radioGroups: radioGroups.length ? radioGroups : buildRadioGroups(fields),
    hasRenamedFields: Boolean(record.hasRenamedFields),
    hasMappedSchema: Boolean(record.hasMappedSchema),
  };
}

export function extractSavedFormFillRuleState(
  savedMeta: FillRulesSource | null | undefined,
  options?: { fields?: PdfField[] },
): SavedFormFillRuleState {
  const savedFillRules = savedMeta?.fillRules && typeof savedMeta.fillRules === 'object'
    ? savedMeta.fillRules
    : null;
  const checkboxRules = Array.isArray(savedFillRules?.checkboxRules)
    ? (savedFillRules.checkboxRules as CheckboxRule[])
    : Array.isArray(savedMeta?.checkboxRules)
      ? (savedMeta.checkboxRules as CheckboxRule[])
      : [];
  const textTransformRules = Array.isArray(savedFillRules?.textTransformRules)
    ? (savedFillRules.textTransformRules as TextTransformRule[])
    : Array.isArray((savedFillRules as Record<string, unknown> | null)?.templateRules)
      ? ((savedFillRules as Record<string, unknown>).templateRules as TextTransformRule[])
      : Array.isArray(savedMeta?.textTransformRules)
        ? (savedMeta.textTransformRules as TextTransformRule[])
        : Array.isArray(savedMeta?.templateRules)
          ? (savedMeta.templateRules as TextTransformRule[])
          : [];
  return {
    checkboxRules,
    legacyRadioGroupSuggestions: deriveLegacyRadioGroupSuggestions(options?.fields || [], checkboxRules),
    textTransformRules,
  };
}
