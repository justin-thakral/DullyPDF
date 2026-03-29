import type { CreateTool, PdfField, RadioToolDraft } from '../types';
import { buildNextRadioToolDraft } from './radioGroups';

export type PendingQuickRadioSelection = {
  fieldIds: string[];
  page: number;
} | null;

export function resolveRadioToolDraftForToolChange(
  targetTool: Extract<CreateTool, 'radio' | 'quick-radio'>,
  nextTool: CreateTool | null,
  previousTool: CreateTool | null,
  currentDraft: RadioToolDraft | null,
  fields: PdfField[],
): RadioToolDraft | null {
  if (nextTool !== targetTool) {
    return null;
  }
  if (previousTool === targetTool && currentDraft) {
    return currentDraft;
  }
  return buildNextRadioToolDraft(fields);
}

export function prunePendingQuickRadioSelection(
  selection: PendingQuickRadioSelection,
  fields: PdfField[],
  activePage?: number,
): PendingQuickRadioSelection {
  if (!selection?.fieldIds.length) {
    return selection;
  }
  if (typeof activePage === 'number' && selection.page !== activePage) {
    return null;
  }
  const allowedIds = new Set(
    fields
      .filter((field) => field.type === 'checkbox' && field.page === selection.page)
      .map((field) => field.id),
  );
  const nextFieldIds = selection.fieldIds.filter((fieldId) => allowedIds.has(fieldId));
  if (!nextFieldIds.length) {
    return null;
  }
  if (nextFieldIds.length === selection.fieldIds.length) {
    return selection;
  }
  return { ...selection, fieldIds: nextFieldIds };
}

export function resolvePendingQuickRadioFields(
  selection: PendingQuickRadioSelection,
  fields: PdfField[],
): PdfField[] {
  if (!selection?.fieldIds.length) {
    return [];
  }
  const fieldsById = new Map(
    fields
      .filter((field) => field.type === 'checkbox' && field.page === selection.page)
      .map((field) => [field.id, field]),
  );
  return selection.fieldIds
    .map((fieldId) => fieldsById.get(fieldId) ?? null)
    .filter((field): field is PdfField => Boolean(field));
}
