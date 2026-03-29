import type {
  CheckboxRule,
  PageSize,
  PdfField,
  RadioGroup,
  RadioGroupSuggestion,
  SavedFormEditorSnapshot,
  TextTransformRule,
} from '../types';
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

function normalizeField(value: unknown): PdfField | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = String(record.id || '').trim();
  const name = String(record.name || '').trim();
  const type = String(record.type || 'text').trim() as PdfField['type'];
  const page = Number(record.page);
  const rect = normalizeRect(record.rect);
  if (!id || !name || !rect || !Number.isInteger(page) || page < 1) {
    return null;
  }
  if (!['text', 'checkbox', 'radio', 'signature', 'date'].includes(type)) {
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
  hasRenamedFields: boolean;
  hasMappedSchema: boolean;
}): SavedFormEditorSnapshot {
  return {
    version: 2,
    pageCount: params.pageCount,
    pageSizes: Object.fromEntries(
      Object.entries(params.pageSizes).map(([page, size]) => [
        Number(page),
        { width: size.width, height: size.height },
      ]),
    ),
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
