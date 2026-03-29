import type { ConfidenceTier, PdfField, RadioGroupSuggestion } from '../types';
import { CONFIDENCE_THRESHOLDS, confidenceTierForConfidence, parseConfidence } from './confidence';
import {
  normalizeRadioKey,
  resolveRadioOptionDisplayLabel,
  resolveUniqueRadioGroupKey,
} from './radioGroups';

type ResolvedRadioSuggestionTarget = {
  field: PdfField;
  optionKey: string;
  optionLabel: string;
};

type ApplyRadioGroupSuggestionsResult = {
  fields: PdfField[];
  appliedSuggestionIds: string[];
};

function compareFields(left: PdfField, right: PdfField) {
  if (left.page !== right.page) return left.page - right.page;
  if (left.rect.y !== right.rect.y) return left.rect.y - right.rect.y;
  if (left.rect.x !== right.rect.x) return left.rect.x - right.rect.x;
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

export function resolveRadioGroupSuggestionTargets(
  fields: PdfField[],
  suggestion: RadioGroupSuggestion,
): ResolvedRadioSuggestionTarget[] {
  const byId = new Map(fields.map((field) => [field.id, field] as const));
  const byName = new Map<string, PdfField[]>();
  for (const field of [...fields].sort(compareFields)) {
    const bucket = byName.get(field.name);
    if (bucket) {
      bucket.push(field);
    } else {
      byName.set(field.name, [field]);
    }
  }

  const consumed = new Set<string>();
  const resolved: ResolvedRadioSuggestionTarget[] = [];
  for (const entry of suggestion.suggestedFields) {
    let field = entry.fieldId ? byId.get(entry.fieldId) ?? null : null;
    if (!field) {
      const matches = byName.get(entry.fieldName) ?? [];
      field = matches.find((candidate) => !consumed.has(candidate.id)) ?? null;
    }
    if (!field || consumed.has(field.id)) {
      continue;
    }
    if (field.type !== 'checkbox' && field.type !== 'radio') {
      continue;
    }
    consumed.add(field.id);
    const rawOptionKey = String(
      entry.optionKey
      || field.optionKey
      || field.radioOptionKey
      || entry.optionLabel
      || field.optionLabel
      || field.radioOptionLabel
      || '',
    ).trim();
    const optionKey = normalizeRadioKey(rawOptionKey, `option_${resolved.length + 1}`);
    const optionLabel = resolveRadioOptionDisplayLabel({
      ...field,
      optionKey: String(entry.optionKey || field.optionKey || '').trim() || field.optionKey,
      optionLabel: String(entry.optionLabel || field.optionLabel || '').trim() || field.optionLabel,
      radioOptionKey: optionKey,
      radioOptionLabel: String(entry.optionLabel || field.radioOptionLabel || '').trim() || field.radioOptionLabel,
      radioGroupKey: suggestion.sourceField || suggestion.groupKey || field.radioGroupKey,
      radioGroupLabel: suggestion.groupLabel || field.radioGroupLabel,
    }, `Option ${resolved.length + 1}`);
    if (!optionLabel) {
      continue;
    }
    resolved.push({
      field,
      optionKey,
      optionLabel,
    });
  }

  return resolved;
}

export function buildRadioSuggestionFieldMap(
  fields: PdfField[],
  suggestions: RadioGroupSuggestion[],
): Map<string, RadioGroupSuggestion> {
  const nextMap = new Map<string, RadioGroupSuggestion>();
  for (const suggestion of suggestions) {
    for (const target of resolveRadioGroupSuggestionTargets(fields, suggestion)) {
      const current = nextMap.get(target.field.id);
      const currentConfidence = Number(current?.confidence ?? 0);
      const nextConfidence = Number(suggestion.confidence ?? 0);
      if (!current || nextConfidence >= currentConfidence) {
        nextMap.set(target.field.id, suggestion);
      }
    }
  }
  return nextMap;
}

export function radioGroupSuggestionConfidence(
  suggestion: RadioGroupSuggestion,
): number | undefined {
  return parseConfidence(suggestion.confidence);
}

export function radioGroupSuggestionConfidenceTier(
  suggestion: RadioGroupSuggestion,
): ConfidenceTier | null {
  const confidence = radioGroupSuggestionConfidence(suggestion);
  if (confidence === undefined) {
    return null;
  }
  return confidenceTierForConfidence(confidence);
}

export function isRadioGroupSuggestionApplied(
  fields: PdfField[],
  suggestion: RadioGroupSuggestion,
): boolean {
  const targets = resolveRadioGroupSuggestionTargets(fields, suggestion);
  if (targets.length < 2) {
    return false;
  }
  const expectedGroupKey = resolveUniqueRadioGroupKey(
    fields,
    suggestion.sourceField || suggestion.groupKey,
    suggestion.sourceField || suggestion.groupKey,
    { groupId: suggestion.id },
  );
  const groupId = targets[0].field.radioGroupId;
  if (!groupId) {
    return false;
  }
  return targets.every(({ field, optionKey }) => (
    field.type === 'radio' &&
    field.radioGroupId === groupId &&
    normalizeRadioKey(String(field.radioGroupKey || ''), '') === expectedGroupKey &&
    String(field.radioOptionKey || '').trim() === optionKey
  ));
}

export function applyRadioGroupSuggestion(
  fields: PdfField[],
  suggestion: RadioGroupSuggestion,
): PdfField[] {
  const targets = resolveRadioGroupSuggestionTargets(fields, suggestion);
  if (targets.length < 2) {
    return fields;
  }
  const targetById = new Map(targets.map((target) => [target.field.id, target] as const));
  const persistedGroupKey = resolveUniqueRadioGroupKey(
    fields,
    suggestion.sourceField || suggestion.groupKey,
    suggestion.sourceField || suggestion.groupKey,
    { groupId: suggestion.id },
  );
  return fields.map((field) => {
    const target = targetById.get(field.id);
    if (!target) {
      return field;
    }
    const nextValue = field.type === 'radio' && field.value === field.radioOptionKey
      ? target.optionKey
      : null;
    return {
      ...field,
      type: 'radio',
      value: nextValue,
      groupKey: undefined,
      optionKey: undefined,
      optionLabel: undefined,
      groupLabel: undefined,
      radioGroupId: suggestion.id,
      radioGroupKey: persistedGroupKey,
      radioGroupLabel: suggestion.groupLabel,
      radioOptionKey: target.optionKey,
      radioOptionLabel: target.optionLabel,
      radioOptionOrder: targets.findIndex((entry) => entry.field.id === field.id) + 1,
      radioGroupSource: 'ai_suggestion',
    };
  });
}

export function isLegacyRadioGroupSuggestion(suggestion: RadioGroupSuggestion): boolean {
  return String(suggestion.id || '').trim().startsWith('legacy_');
}

export function shouldAutoApplyRadioGroupSuggestion(
  suggestion: RadioGroupSuggestion,
): boolean {
  if (isLegacyRadioGroupSuggestion(suggestion)) {
    return false;
  }
  const confidence = radioGroupSuggestionConfidence(suggestion);
  return typeof confidence === 'number' && confidence >= CONFIDENCE_THRESHOLDS.high;
}

export function applyRadioGroupSuggestions(
  fields: PdfField[],
  suggestions: RadioGroupSuggestion[],
): ApplyRadioGroupSuggestionsResult {
  let nextFields = fields;
  const appliedSuggestionIds: string[] = [];

  for (const suggestion of suggestions) {
    if (isRadioGroupSuggestionApplied(nextFields, suggestion)) {
      continue;
    }
    const updatedFields = applyRadioGroupSuggestion(nextFields, suggestion);
    if (updatedFields === nextFields) {
      continue;
    }
    nextFields = updatedFields;
    appliedSuggestionIds.push(suggestion.id);
  }

  return {
    fields: nextFields,
    appliedSuggestionIds,
  };
}
