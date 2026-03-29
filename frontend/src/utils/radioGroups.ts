import type { FieldRect, PageSize, PdfField, RadioGroup, RadioToolDraft } from '../types';
import { normaliseDataKey } from './dataSource';
import { ensureUniqueFieldName, getDefaultFieldRect, makeId, normalizeRectForFieldType } from './fields';

const GENERIC_RADIO_OPTION_KEY_RE = /^option_\d+(?:_\d+)?$/;

function compareRadioFields(left: PdfField, right: PdfField) {
  const leftOrder = Number.isFinite(left.radioOptionOrder) ? Number(left.radioOptionOrder) : Number.MAX_SAFE_INTEGER;
  const rightOrder = Number.isFinite(right.radioOptionOrder) ? Number(right.radioOptionOrder) : Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  if (left.page !== right.page) return left.page - right.page;
  if (left.rect.y !== right.rect.y) return left.rect.y - right.rect.y;
  if (left.rect.x !== right.rect.x) return left.rect.x - right.rect.x;
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

function fallbackRadioGroupLabel(index: number) {
  return `Radio Group ${index}`;
}

function fallbackRadioOptionLabel(index: number) {
  return `Option ${index}`;
}

export function normalizeRadioKey(raw: string, fallback: string) {
  return normaliseDataKey(raw) || fallback;
}

function humanizeRadioOptionText(raw: string, fallback: string) {
  const candidate = String(raw || '').trim();
  const base = candidate || fallback;
  return base
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function shouldPreferRadioOptionKey(params: {
  name?: string;
  groupLabel?: string;
  explicitLabel: string;
  optionKey: string;
}) {
  const { name, groupLabel, explicitLabel, optionKey } = params;
  const normalizedKey = normalizeRadioKey(optionKey, '');
  if (!normalizedKey || GENERIC_RADIO_OPTION_KEY_RE.test(normalizedKey)) {
    return false;
  }
  if (!explicitLabel) {
    return true;
  }
  const normalizedLabel = normalizeRadioKey(explicitLabel, '');
  if (!normalizedLabel) {
    return true;
  }
  const normalizedFieldName = normalizeRadioKey(String(name || '').trim(), '');
  if (normalizedFieldName && normalizedLabel === normalizedFieldName) {
    return true;
  }
  const normalizedGroupLabel = normalizeRadioKey(String(groupLabel || '').trim(), '');
  if (normalizedGroupLabel && normalizedLabel.startsWith(normalizedGroupLabel)) {
    return true;
  }
  if (explicitLabel.includes('…')) {
    return true;
  }
  return false;
}

export function resolveRadioOptionDisplayLabel(
  field: Pick<PdfField, 'name' | 'optionKey' | 'optionLabel' | 'groupLabel' | 'radioGroupKey' | 'radioGroupLabel' | 'radioOptionKey' | 'radioOptionLabel'>,
  fallback = 'Option',
) {
  const explicitLabel = String(field.radioOptionLabel || field.optionLabel || '').trim();
  const optionKey = String(field.radioOptionKey || field.optionKey || '').trim();
  const groupLabel = String(field.radioGroupLabel || field.groupLabel || field.radioGroupKey || '').trim();
  if (shouldPreferRadioOptionKey({
    name: field.name,
    groupLabel,
    explicitLabel,
    optionKey,
  })) {
    return humanizeRadioOptionText(optionKey, fallback);
  }
  if (explicitLabel) {
    return explicitLabel;
  }
  if (optionKey) {
    return humanizeRadioOptionText(optionKey, fallback);
  }
  return humanizeRadioOptionText(String(field.name || '').trim(), fallback);
}

export function resolveUniqueRadioGroupKey(
  fields: PdfField[],
  rawKey: string,
  fallback: string,
  options?: { groupId?: string | null },
) {
  const baseKey = normalizeRadioKey(rawKey, fallback);
  const activeGroupId = String(options?.groupId || '').trim();
  const usedKeys = new Set<string>();

  for (const field of fields) {
    if (field.type !== 'radio') continue;
    const fieldGroupId = String(field.radioGroupId || '').trim();
    if (activeGroupId && fieldGroupId === activeGroupId) {
      continue;
    }
    const normalizedKey = normalizeRadioKey(String(field.radioGroupKey || '').trim(), '');
    if (normalizedKey) {
      usedKeys.add(normalizedKey);
    }
  }

  if (!usedKeys.has(baseKey)) {
    return baseKey;
  }

  let suffix = 2;
  let candidate = `${baseKey}_${suffix}`;
  while (usedKeys.has(candidate)) {
    suffix += 1;
    candidate = `${baseKey}_${suffix}`;
  }
  return candidate;
}

export function buildRadioGroups(fields: PdfField[]): RadioGroup[] {
  const grouped = new Map<string, PdfField[]>();
  for (const field of fields) {
    if (field.type !== 'radio') continue;
    const groupId = String(field.radioGroupId || '').trim();
    if (!groupId) continue;
    const groupFields = grouped.get(groupId);
    if (groupFields) {
      groupFields.push(field);
    } else {
      grouped.set(groupId, [field]);
    }
  }

  return Array.from(grouped.entries())
    .map(([groupId, groupFields]) => {
      const sorted = [...groupFields].sort(compareRadioFields);
      const first = sorted[0];
      const optionOrder = sorted.map((field) => String(field.radioOptionKey || field.name || field.id));
      const options = sorted.map((field) => ({
        fieldId: field.id,
        optionKey: String(field.radioOptionKey || field.name || field.id),
        optionLabel: resolveRadioOptionDisplayLabel(field, field.id),
      }));
      const singlePage = sorted.every((field) => field.page === first.page) ? first.page : undefined;
      return {
        id: groupId,
        key: String(first.radioGroupKey || ''),
        label: String(first.radioGroupLabel || first.radioGroupKey || groupId),
        page: singlePage,
        optionOrder,
        options,
        source: first.radioGroupSource || 'manual',
      } as RadioGroup;
    })
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
}

export function buildNextRadioToolDraft(fields: PdfField[], preferredLabel?: string | null): RadioToolDraft {
  const groups = buildRadioGroups(fields);
  const nextIndex = groups.length + 1;
  const groupLabel = String(preferredLabel || '').trim() || fallbackRadioGroupLabel(nextIndex);
  return {
    groupId: makeId(),
    groupKey: normalizeRadioKey(groupLabel, `radio_group_${nextIndex}`),
    groupLabel,
    nextOptionKey: 'option_1',
    nextOptionLabel: fallbackRadioOptionLabel(1),
  };
}

export function buildRadioToolDraftForExistingGroup(
  fields: PdfField[],
  groupId: string,
): RadioToolDraft | null {
  const group = buildRadioGroups(fields).find((entry) => entry.id === groupId);
  if (!group) return null;
  const nextIndex = group.options.length + 1;
  return {
    groupId: group.id,
    groupKey: group.key,
    groupLabel: group.label,
    nextOptionKey: `option_${nextIndex}`,
    nextOptionLabel: fallbackRadioOptionLabel(nextIndex),
  };
}

function resolveRadioGroupIdentity(
  fields: PdfField[],
  draft: RadioToolDraft,
): { groupKey: string; groupLabel: string } {
  const existingMember = fields.find((field) => field.type === 'radio' && field.radioGroupId === draft.groupId);
  const nextIndex = buildRadioGroups(fields).length + 1;
  const fallbackLabel = fallbackRadioGroupLabel(nextIndex);
  const groupLabel = String(
    draft.groupLabel ||
    existingMember?.radioGroupLabel ||
    existingMember?.radioGroupKey ||
    '',
  ).trim() || fallbackLabel;
  const groupKey = resolveUniqueRadioGroupKey(
    fields,
    String(draft.groupKey || existingMember?.radioGroupKey || groupLabel).trim(),
    `radio_group_${nextIndex}`,
    { groupId: draft.groupId },
  );
  return { groupKey, groupLabel };
}

function nextRadioOptionIdentity(
  fields: PdfField[],
  draft: RadioToolDraft,
): { optionKey: string; optionLabel: string; optionOrder: number } {
  const groupMembers = fields
    .filter((field) => field.type === 'radio' && field.radioGroupId === draft.groupId)
    .sort(compareRadioFields);
  const nextIndex = groupMembers.length + 1;
  const fallbackLabel = fallbackRadioOptionLabel(nextIndex);
  const optionLabel = String(draft.nextOptionLabel || '').trim() || fallbackLabel;
  const baseKey = normalizeRadioKey(
    String(draft.nextOptionKey || '').trim() || optionLabel,
    `option_${nextIndex}`,
  );
  let optionKey = baseKey;
  const used = new Set(groupMembers.map((field) => String(field.radioOptionKey || '').trim()).filter(Boolean));
  let suffix = 2;
  while (used.has(optionKey)) {
    optionKey = `${baseKey}_${suffix}`;
    suffix += 1;
  }
  return {
    optionKey,
    optionLabel,
    optionOrder: nextIndex,
  };
}

function clearCheckboxMetadata(field: PdfField): PdfField {
  return {
    ...field,
    groupKey: undefined,
    optionKey: undefined,
    optionLabel: undefined,
    groupLabel: undefined,
  };
}

function clearRadioMetadata(field: PdfField): PdfField {
  return {
    ...field,
    radioGroupId: undefined,
    radioGroupKey: undefined,
    radioGroupLabel: undefined,
    radioOptionKey: undefined,
    radioOptionLabel: undefined,
    radioOptionOrder: undefined,
    radioGroupSource: undefined,
  };
}

export function createRadioFieldFromRect(
  fields: PdfField[],
  page: number,
  pageSize: PageSize,
  rect: PdfField['rect'],
  draft: RadioToolDraft,
): PdfField {
  const normalizedRect = normalizeRectForFieldType(rect, 'radio', pageSize);
  const groupIdentity = resolveRadioGroupIdentity(fields, draft);
  const option = nextRadioOptionIdentity(fields, draft);
  const existingNames = new Set(fields.map((field) => field.name));
  const name = ensureUniqueFieldName(`${groupIdentity.groupKey}_${option.optionKey}`, existingNames);
  return {
    id: makeId(),
    name,
    type: 'radio',
    page,
    rect: normalizedRect,
    radioGroupId: draft.groupId,
    radioGroupKey: groupIdentity.groupKey,
    radioGroupLabel: groupIdentity.groupLabel,
    radioOptionKey: option.optionKey,
    radioOptionLabel: option.optionLabel,
    radioOptionOrder: option.optionOrder,
    radioGroupSource: 'manual',
    value: null,
  };
}

export function advanceRadioToolDraft(fields: PdfField[], draft: RadioToolDraft): RadioToolDraft {
  const groupMembers = fields.filter((field) => field.type === 'radio' && field.radioGroupId === draft.groupId);
  const nextIndex = groupMembers.length + 1;
  return {
    ...draft,
    nextOptionKey: `option_${nextIndex}`,
    nextOptionLabel: fallbackRadioOptionLabel(nextIndex),
  };
}

function deriveConvertedOptionLabel(field: PdfField, index: number) {
  const explicit = String(field.optionLabel || field.radioOptionLabel || '').trim();
  if (explicit) return explicit;
  return fallbackRadioOptionLabel(index);
}

function deriveConvertedOptionKey(field: PdfField, label: string, index: number) {
  const explicit = String(field.optionKey || field.radioOptionKey || '').trim();
  if (explicit) {
    return normalizeRadioKey(explicit, `option_${index}`);
  }
  return normalizeRadioKey(label, `option_${index}`);
}

export function convertFieldsToRadioGroup(
  fields: PdfField[],
  fieldIds: string[],
  draft: RadioToolDraft,
  pageSizesByPage?: Record<number, PageSize>,
): PdfField[] {
  if (!fieldIds.length) return fields;
  const groupIdentity = resolveRadioGroupIdentity(fields, draft);
  const targetSet = new Set(fieldIds);
  const existingGroupMembers = fields
    .filter((field) => field.type === 'radio' && field.radioGroupId === draft.groupId && !targetSet.has(field.id))
    .sort(compareRadioFields);
  const usedOptionKeys = new Set(
    existingGroupMembers.map((field) => String(field.radioOptionKey || '').trim()).filter(Boolean),
  );
  const targetMetadata = new Map<string, {
    rect: FieldRect;
    optionLabel: string;
    optionKey: string;
    optionOrder: number;
  }>();

  let nextOrder = existingGroupMembers.length + 1;
  fields
    .filter((field) => targetSet.has(field.id))
    .sort(compareRadioFields)
    .forEach((field) => {
      const pageSize = pageSizesByPage?.[field.page];
      const rect = pageSize
        ? normalizeRectForFieldType(field.rect, 'radio', pageSize)
        : {
            ...field.rect,
            width: Math.max(field.rect.width, field.rect.height, getDefaultFieldRect('radio').width),
            height: Math.max(field.rect.width, field.rect.height, getDefaultFieldRect('radio').height),
          };
      const optionLabel = deriveConvertedOptionLabel(field, nextOrder);
      const baseOptionKey = deriveConvertedOptionKey(field, optionLabel, nextOrder);
      let optionKey = baseOptionKey;
      let suffix = 2;
      while (usedOptionKeys.has(optionKey)) {
        optionKey = `${baseOptionKey}_${suffix}`;
        suffix += 1;
      }
      usedOptionKeys.add(optionKey);
      targetMetadata.set(field.id, {
        rect,
        optionLabel,
        optionKey,
        optionOrder: nextOrder,
      });
      nextOrder += 1;
    });

  return fields.map((field) => {
    if (!targetSet.has(field.id)) return field;
    const metadata = targetMetadata.get(field.id);
    if (!metadata) return field;
    const nextField = clearCheckboxMetadata({
      ...field,
      type: 'radio',
      rect: metadata.rect,
      radioGroupId: draft.groupId,
      radioGroupKey: groupIdentity.groupKey,
      radioGroupLabel: groupIdentity.groupLabel,
      radioOptionKey: metadata.optionKey,
      radioOptionLabel: metadata.optionLabel,
      radioOptionOrder: metadata.optionOrder,
      radioGroupSource: 'manual',
      value: null,
    });
    return nextField;
  });
}

export function renameRadioGroup(
  fields: PdfField[],
  groupId: string,
  updates: { label?: string; key?: string },
): PdfField[] {
  const targetFields = fields.filter((field) => field.type === 'radio' && field.radioGroupId === groupId);
  if (!targetFields.length) {
    return fields;
  }
  const firstTarget = targetFields[0];
  const nextLabel = updates.label ?? firstTarget.radioGroupLabel;
  const nextKey = resolveUniqueRadioGroupKey(
    fields,
    updates.key ?? firstTarget.radioGroupKey ?? nextLabel ?? '',
    String(firstTarget.radioGroupKey || firstTarget.radioGroupLabel || groupId).trim() || groupId,
    { groupId },
  );
  return fields.map((field) => {
    if (field.type !== 'radio' || field.radioGroupId !== groupId) return field;
    return {
      ...field,
      radioGroupLabel: nextLabel ?? field.radioGroupLabel,
      radioGroupKey: nextKey,
    };
  });
}

export function updateRadioFieldOption(
  fields: PdfField[],
  fieldId: string,
  updates: { label?: string; key?: string },
): PdfField[] {
  return fields.map((field) => {
    if (field.id !== fieldId || field.type !== 'radio') return field;
    const nextKey = updates.key ?? field.radioOptionKey;
    const nextValue = field.value;
    return {
      ...field,
      radioOptionLabel: updates.label ?? field.radioOptionLabel,
      radioOptionKey: nextKey,
      value:
        typeof nextValue === 'string' && field.radioOptionKey && nextValue === field.radioOptionKey
          ? nextKey
          : nextValue,
    };
  });
}

export function moveRadioFieldToGroup(
  fields: PdfField[],
  fieldId: string,
  targetGroup: RadioGroup,
): PdfField[] {
  const nextOrder = targetGroup.options.length + 1;
  return fields.map((field) => {
    if (field.id !== fieldId || field.type !== 'radio') return field;
    const optionLabel = resolveRadioOptionDisplayLabel(field, fallbackRadioOptionLabel(nextOrder));
    const optionKey = normalizeRadioKey(String(field.radioOptionKey || optionLabel), `option_${nextOrder}`);
    return {
      ...field,
      radioGroupId: targetGroup.id,
      radioGroupKey: targetGroup.key,
      radioGroupLabel: targetGroup.label,
      radioOptionOrder: nextOrder,
      radioOptionKey: optionKey,
      radioOptionLabel: optionLabel,
      radioGroupSource: targetGroup.source,
      value: null,
    };
  });
}

export function reorderRadioField(
  fields: PdfField[],
  fieldId: string,
  direction: 'up' | 'down',
): PdfField[] {
  const selectedField = fields.find((field) => field.id === fieldId && field.type === 'radio');
  if (!selectedField?.radioGroupId) return fields;
  const groupMembers = fields
    .filter((field) => field.type === 'radio' && field.radioGroupId === selectedField.radioGroupId)
    .sort(compareRadioFields);
  const currentIndex = groupMembers.findIndex((field) => field.id === fieldId);
  if (currentIndex === -1) return fields;
  const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (swapIndex < 0 || swapIndex >= groupMembers.length) return fields;
  const reordered = [...groupMembers];
  const [moved] = reordered.splice(currentIndex, 1);
  reordered.splice(swapIndex, 0, moved);
  const orderById = new Map(reordered.map((field, index) => [field.id, index + 1]));
  return fields.map((field) => {
    if (field.type !== 'radio' || field.radioGroupId !== selectedField.radioGroupId) return field;
    return {
      ...field,
      radioOptionOrder: orderById.get(field.id) ?? field.radioOptionOrder,
    };
  });
}

export function dissolveRadioGroup(fields: PdfField[], groupId: string): PdfField[] {
  return fields.map((field) => {
    if (field.type !== 'radio' || field.radioGroupId !== groupId) return field;
    return {
      ...clearRadioMetadata(field),
      type: 'checkbox',
      value: field.value === null || field.value === undefined ? null : Boolean(field.value),
    };
  });
}

export function convertRadioFieldToType(field: PdfField, type: Exclude<PdfField['type'], 'radio'>): PdfField {
  const cleared = clearRadioMetadata(field);
  if (type === 'checkbox') {
    return {
      ...cleared,
      type,
      value: field.value === null || field.value === undefined ? null : Boolean(field.value),
    };
  }
  return {
    ...cleared,
    type,
    value: type === 'signature' || type === 'text' || type === 'date'
      ? (typeof field.value === 'string' ? field.value : null)
      : field.value,
  };
}

export function setRadioGroupSelectedValue(fields: PdfField[], fieldId: string): PdfField[] {
  const selectedField = fields.find((field) => field.id === fieldId && field.type === 'radio');
  if (!selectedField?.radioGroupId || !selectedField.radioOptionKey) return fields;
  return fields.map((field) => {
    if (field.type !== 'radio' || field.radioGroupId !== selectedField.radioGroupId) return field;
    return {
      ...field,
      value: field.id === selectedField.id ? selectedField.radioOptionKey : null,
    };
  });
}
