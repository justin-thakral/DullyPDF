import type {
  CheckboxRule,
  NameQueue,
  PdfField,
  RadioGroupSuggestion,
  TextTransformRule,
} from '../types';
import { computeCheckboxMeta } from './checkboxMeta';
import {
  applyFieldNameUpdatesToList,
  enqueueByName,
  takeNextByName,
} from './fieldUpdates';
import { deriveMappingConfidence, parseConfidence } from './confidence';
import { normalizeRadioKey } from './radioGroups';

type DeriveRadioGroupSuggestionsOptions = {
  idPrefix?: string;
};

const EXCLUSIVE_BINARY_OPTION_SETS = [
  new Set(['yes', 'no']),
  new Set(['true', 'false']),
  new Set(['male', 'female']),
  new Set(['m', 'f']),
];

function compareFields(left: PdfField, right: PdfField) {
  if (left.page !== right.page) return left.page - right.page;
  if (left.rect.y !== right.rect.y) return left.rect.y - right.rect.y;
  if (left.rect.x !== right.rect.x) return left.rect.x - right.rect.x;
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

function humanizeRadioSuggestionLabel(raw: string, fallback: string): string {
  const candidate = String(raw || '').trim();
  const base = candidate || fallback;
  return base
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function deriveRuleBasedOptionLabel(field: PdfField, groupKey: string, index: number): string {
  const explicit = String(field.optionLabel || field.radioOptionLabel || '').trim();
  if (explicit) {
    return explicit;
  }
  const rawOptionKey = String(field.optionKey || field.radioOptionKey || '').trim();
  if (rawOptionKey) {
    return humanizeRadioSuggestionLabel(rawOptionKey, `Option ${index}`);
  }
  const groupPrefix = `${normalizeRadioKey(groupKey, groupKey)}_`;
  const normalizedFieldName = normalizeRadioKey(field.name, field.name);
  if (normalizedFieldName.startsWith(groupPrefix)) {
    return humanizeRadioSuggestionLabel(normalizedFieldName.slice(groupPrefix.length), `Option ${index}`);
  }
  return humanizeRadioSuggestionLabel(field.name, `Option ${index}`);
}

function collectCheckboxGroups(fields: PdfField[]): Map<string, PdfField[]> {
  const checkboxGroups = new Map<string, PdfField[]>();
  for (const field of fields) {
    if (field.type !== 'checkbox') {
      continue;
    }
    const groupKey = normalizeRadioKey(String(field.groupKey || '').trim(), '');
    if (!groupKey) {
      continue;
    }
    const group = checkboxGroups.get(groupKey);
    if (group) {
      group.push(field);
    } else {
      checkboxGroups.set(groupKey, [field]);
    }
  }
  return checkboxGroups;
}

function resolveFieldRenameConfidence(field: PdfField): number | undefined {
  return parseConfidence(field.renameConfidence ?? field.mappingConfidence ?? field.fieldConfidence);
}

function resolveHeuristicGroupConfidence(
  fields: PdfField[],
  multiplier: number,
  fallback: number,
): number {
  const confidences = fields
    .map((field) => resolveFieldRenameConfidence(field))
    .filter((value): value is number => typeof value === 'number');
  if (!confidences.length) {
    return fallback;
  }
  const nextConfidence = Math.min(...confidences) * multiplier;
  return Math.max(0.3, Math.min(0.99, nextConfidence));
}

function resolveGroupOptionKey(field: PdfField): string {
  return normalizeRadioKey(
    String(field.optionKey || field.radioOptionKey || '').trim(),
    '',
  );
}

function hasExclusiveBinaryOptions(optionKeys: string[]): boolean {
  if (optionKeys.length !== 2) {
    return false;
  }
  const normalized = new Set(optionKeys.map((optionKey) => normalizeRadioKey(optionKey, '')));
  return EXCLUSIVE_BINARY_OPTION_SETS.some((candidate) => (
    candidate.size === normalized.size &&
    [...candidate].every((optionKey) => normalized.has(optionKey))
  ));
}

function isCompactPairLayout(fields: PdfField[]): boolean {
  if (fields.length !== 2) {
    return false;
  }
  const [first, second] = [...fields].sort(compareFields);
  const firstCenterX = first.rect.x + first.rect.width / 2;
  const secondCenterX = second.rect.x + second.rect.width / 2;
  const firstCenterY = first.rect.y + first.rect.height / 2;
  const secondCenterY = second.rect.y + second.rect.height / 2;
  const avgWidth = (first.rect.width + second.rect.width) / 2;
  const avgHeight = (first.rect.height + second.rect.height) / 2;
  const deltaX = Math.abs(firstCenterX - secondCenterX);
  const deltaY = Math.abs(firstCenterY - secondCenterY);
  const sameRow = deltaY <= avgHeight * 1.5 && deltaX <= avgWidth * 12;
  const sameColumn = deltaX <= avgWidth * 1.5 && deltaY <= avgHeight * 8;
  return sameRow || sameColumn;
}

function isSingleRowOptionSet(fields: PdfField[]): boolean {
  if (fields.length < 3 || fields.length > 8) {
    return false;
  }
  const centersY = fields.map((field) => field.rect.y + field.rect.height / 2);
  const maxHeight = Math.max(...fields.map((field) => field.rect.height), 0);
  return Math.max(...centersY) - Math.min(...centersY) <= maxHeight * 1.5;
}

function buildRadioSuggestionFromGroup(params: {
  groupKey: string;
  fields: PdfField[];
  idPrefix: string;
  selectionReason: RadioGroupSuggestion['selectionReason'];
  confidence: number;
  reasoning: string;
}): RadioGroupSuggestion {
  const { groupKey, fields, idPrefix, selectionReason, confidence, reasoning } = params;
  const sortedFields = [...fields].sort(compareFields);
  const groupLabel = humanizeRadioSuggestionLabel(
    String(sortedFields[0]?.groupLabel || '').trim(),
    groupKey,
  );
  return {
    id: `${idPrefix}${groupKey}`,
    suggestedType: 'radio_group',
    groupKey,
    groupLabel,
    suggestedFields: sortedFields.map((field, index) => {
      const optionLabel = deriveRuleBasedOptionLabel(field, groupKey, index + 1);
      return {
        fieldId: field.id,
        fieldName: field.name,
        optionKey: resolveGroupOptionKey(field) || normalizeRadioKey(optionLabel, `option_${index + 1}`),
        optionLabel,
      };
    }),
    selectionReason,
    confidence,
    reasoning,
  };
}

// Heuristic radio inference is limited to compact, high-signal patterns so large
// multi-select checklists such as medical history remain checkboxes. Complexity is
// O(n log n) for n checkbox fields because each candidate group is sorted once.
export function deriveRadioGroupSuggestionsFromFieldHeuristics(
  fields: PdfField[],
  options: DeriveRadioGroupSuggestionsOptions = {},
): RadioGroupSuggestion[] {
  if (!fields.length) {
    return [];
  }

  const idPrefix = String(options.idPrefix || 'inferred_');
  const suggestions: RadioGroupSuggestion[] = [];
  for (const [groupKey, groupFields] of collectCheckboxGroups(fields).entries()) {
    const sortedFields = [...groupFields].sort(compareFields);
    if (sortedFields.length < 2) {
      continue;
    }
    if (sortedFields.some((field) => field.type === 'radio' || field.radioGroupId)) {
      continue;
    }
    const optionKeys = sortedFields.map((field) => resolveGroupOptionKey(field));
    if (optionKeys.some((optionKey) => !optionKey)) {
      continue;
    }
    if (new Set(optionKeys).size !== optionKeys.length) {
      continue;
    }

    if (hasExclusiveBinaryOptions(optionKeys) && isCompactPairLayout(sortedFields)) {
      suggestions.push(buildRadioSuggestionFromGroup({
        groupKey,
        fields: sortedFields,
        idPrefix,
        selectionReason: 'binary_pair',
        confidence: resolveHeuristicGroupConfidence(sortedFields, 0.96, 0.86),
        reasoning: `Renamed checkbox options for "${groupKey}" form a compact exclusive pair (${optionKeys.join(' / ')}), so they are likely a radio question.`,
      }));
      continue;
    }

    if (isSingleRowOptionSet(sortedFields)) {
      suggestions.push(buildRadioSuggestionFromGroup({
        groupKey,
        fields: sortedFields,
        idPrefix,
        selectionReason: 'label_pattern',
        confidence: resolveHeuristicGroupConfidence(sortedFields, 0.9, 0.74),
        reasoning: `Renamed checkbox options for "${groupKey}" appear as a compact single-row option set, which strongly suggests one single-choice radio group.`,
      }));
    }
  }

  return suggestions;
}

export function deriveRadioGroupSuggestionsFromCheckboxRules(
  fields: PdfField[],
  checkboxRules: CheckboxRule[],
  options: DeriveRadioGroupSuggestionsOptions = {},
): RadioGroupSuggestion[] {
  if (!fields.length || !checkboxRules.length) {
    return [];
  }

  const idPrefix = String(options.idPrefix || 'rule_');
  const checkboxGroups = collectCheckboxGroups(fields);

  const suggestionsByGroup = new Map<string, RadioGroupSuggestion>();
  for (const rule of checkboxRules) {
    if (rule.operation !== 'yes_no' && rule.operation !== 'enum') {
      continue;
    }
    const groupKey = normalizeRadioKey(String(rule.groupKey || '').trim(), '');
    if (!groupKey || suggestionsByGroup.has(groupKey)) {
      continue;
    }
    const groupFields = [...(checkboxGroups.get(groupKey) || [])].sort(compareFields);
    if (groupFields.length < 2) {
      continue;
    }
    if (groupFields.some((field) => field.type === 'radio' || field.radioGroupId)) {
      continue;
    }
    const groupLabel = humanizeRadioSuggestionLabel(
      String(groupFields[0]?.groupLabel || '').trim(),
      groupKey,
    );
    suggestionsByGroup.set(groupKey, {
      id: `${idPrefix}${groupKey}`,
      suggestedType: 'radio_group',
      groupKey,
      groupLabel,
      suggestedFields: groupFields.map((field, index) => {
        const optionLabel = deriveRuleBasedOptionLabel(field, groupKey, index + 1);
        const optionKey = normalizeRadioKey(
          String(field.optionKey || field.radioOptionKey || '').trim() || optionLabel,
          `option_${index + 1}`,
        );
        return {
          fieldId: field.id,
          fieldName: field.name,
          optionKey,
          optionLabel,
        };
      }),
      sourceField: String(rule.databaseField || '').trim() || undefined,
      selectionReason: rule.operation === 'yes_no' ? 'yes_no' : 'enum',
      confidence: typeof rule.confidence === 'number' ? rule.confidence : undefined,
      reasoning: String(rule.reasoning || '').trim() || `Checkbox rule "${rule.operation}" targeted "${groupLabel}". Review and convert this cluster into an explicit radio group if it is single-choice.`,
    });
  }

  return [...suggestionsByGroup.values()].sort((left, right) => (
    left.groupLabel.localeCompare(right.groupLabel, undefined, { sensitivity: 'base' })
  ));
}

export function mergeRadioGroupSuggestions(
  explicitSuggestions: RadioGroupSuggestion[],
  fallbackSuggestions: RadioGroupSuggestion[],
): RadioGroupSuggestion[] {
  const merged: RadioGroupSuggestion[] = [];
  const seen = new Set<string>();

  const pushSuggestion = (suggestion: RadioGroupSuggestion) => {
    const groupKey = normalizeRadioKey(String(suggestion.groupKey || '').trim(), '');
    const dedupeKey = groupKey || String(suggestion.id || '').trim();
    if (!dedupeKey || seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    merged.push(suggestion);
  };

  for (const suggestion of explicitSuggestions) {
    pushSuggestion(suggestion);
  }
  for (const suggestion of fallbackSuggestions) {
    pushSuggestion(suggestion);
  }

  return merged;
}

export function deriveCombinedRadioGroupSuggestions(
  fields: PdfField[],
  explicitSuggestions: RadioGroupSuggestion[] = [],
  checkboxRules: CheckboxRule[] = [],
  options?: {
    ruleIdPrefix?: string;
    heuristicIdPrefix?: string;
  },
): RadioGroupSuggestion[] {
  const ruleSuggestions = deriveRadioGroupSuggestionsFromCheckboxRules(fields, checkboxRules, {
    idPrefix: options?.ruleIdPrefix,
  });
  const heuristicSuggestions = deriveRadioGroupSuggestionsFromFieldHeuristics(fields, {
    idPrefix: options?.heuristicIdPrefix,
  });
  return mergeRadioGroupSuggestions(
    explicitSuggestions,
    mergeRadioGroupSuggestions(ruleSuggestions, heuristicSuggestions),
  );
}

export function applyRenamePayloadToFields(
  fields: PdfField[],
  renamedFieldsPayload?: Array<Record<string, any>>,
): PdfField[] | null {
  if (!Array.isArray(renamedFieldsPayload) || !renamedFieldsPayload.length) return null;
  const renamesByOriginal = new Map<string, NameQueue<Record<string, any>>>();
  for (const entry of renamedFieldsPayload) {
    const original =
      entry.originalName || entry.original_name || entry.originalFieldName || entry.name;
    if (typeof original === 'string' && original.trim()) {
      enqueueByName(renamesByOriginal, original.trim(), entry);
    }
  }
  if (!renamesByOriginal.size) return null;

  const updated: PdfField[] = [];
  for (const field of fields) {
    const rename = takeNextByName(renamesByOriginal, field.name);
    if (!rename) {
      updated.push(field);
      continue;
    }
    const renameConfidence = parseConfidence(rename.renameConfidence ?? rename.rename_confidence);
    const fieldConfidence = parseConfidence(rename.isItAfieldConfidence ?? rename.is_it_a_field_confidence);
    const hasMappingConf =
      Object.prototype.hasOwnProperty.call(rename, 'mappingConfidence') ||
      Object.prototype.hasOwnProperty.call(rename, 'mapping_confidence');
    const mappingConfidence = parseConfidence(rename.mappingConfidence ?? rename.mapping_confidence);
    const nextName = String(rename.name || rename.suggestedRename || field.name).trim() || field.name;
    updated.push({
      ...field,
      name: nextName,
      mappingConfidence: hasMappingConf ? mappingConfidence : field.mappingConfidence,
      renameConfidence: renameConfidence ?? field.renameConfidence,
      fieldConfidence: fieldConfidence ?? field.fieldConfidence,
      groupKey: rename.groupKey ?? field.groupKey,
      optionKey: rename.optionKey ?? field.optionKey,
      optionLabel: rename.optionLabel ?? field.optionLabel,
      groupLabel: rename.groupLabel ?? field.groupLabel,
    });
  }
  return updated;
}

type MappingApplicationResult = {
  fields: PdfField[];
  checkboxRules: CheckboxRule[];
  radioGroupSuggestions: RadioGroupSuggestion[];
  textTransformRules: TextTransformRule[];
};

export function applyMappingPayloadToFields(
  fields: PdfField[],
  mappingResults?: Record<string, any> | null,
  dataColumns: string[] = [],
): MappingApplicationResult {
  const mappings = Array.isArray(mappingResults?.mappings) ? mappingResults.mappings : [];
  const updates = new Map<string, NameQueue<Record<string, any>>>();
  const checkboxMetaById = computeCheckboxMeta(fields, dataColumns);

  for (const mapping of mappings) {
    if (!mapping || !mapping.pdfField) continue;
    const currentName = mapping.originalPdfField || mapping.pdfField;
    const desiredName = mapping.pdfField;
    if (!currentName) continue;
    const mappingConfidence =
      parseConfidence(mapping.confidence) ??
      deriveMappingConfidence(String(currentName), String(desiredName));
    enqueueByName(updates, String(currentName), {
      newName: String(desiredName),
      mappingConfidence,
    });
  }

  const nextFields = updates.size
    ? applyFieldNameUpdatesToList(fields, updates, checkboxMetaById)
    : fields;
  const fillRules = mappingResults?.fillRules && typeof mappingResults.fillRules === 'object'
    ? mappingResults.fillRules
    : null;

  const checkboxRules = Array.isArray(fillRules?.checkboxRules)
    ? (fillRules.checkboxRules as CheckboxRule[])
    : Array.isArray(mappingResults?.checkboxRules)
      ? (mappingResults.checkboxRules as CheckboxRule[])
      : [];
  const explicitSuggestions = Array.isArray(mappingResults?.radioGroupSuggestions)
    ? (mappingResults.radioGroupSuggestions as RadioGroupSuggestion[])
    : [];
  const radioGroupSuggestions = deriveCombinedRadioGroupSuggestions(
    nextFields,
    explicitSuggestions,
    checkboxRules,
  );
  const textTransformRules = Array.isArray(fillRules?.textTransformRules)
    ? (fillRules.textTransformRules as TextTransformRule[])
    : Array.isArray((fillRules as Record<string, unknown> | null)?.templateRules)
      ? ((fillRules as Record<string, unknown>).templateRules as TextTransformRule[])
      : Array.isArray(mappingResults?.textTransformRules)
        ? (mappingResults.textTransformRules as TextTransformRule[])
        : Array.isArray((mappingResults as Record<string, unknown> | null)?.templateRules)
          ? ((mappingResults as Record<string, unknown>).templateRules as TextTransformRule[])
          : [];

  return {
    fields: nextFields,
    checkboxRules,
    radioGroupSuggestions,
    textTransformRules,
  };
}
