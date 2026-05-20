import type {
  CheckboxRule,
  FieldFontChoice,
  FieldFontColorChoice,
  FieldFontSizeChoice,
  FieldTextAlignmentChoice,
  PdfField,
} from '../types';
import type { FillLinkResponse, FillLinkSummary, PublicFillLinkSubmitResult } from '../services/api';
import {
  DEFAULT_FIELD_FONT_COLOR,
  DEFAULT_FIELD_FONT_CHOICE,
  DEFAULT_FIELD_FONT_SIZE_CHOICE,
  DEFAULT_FIELD_TEXT_ALIGNMENT,
  resolveEffectiveFieldFont,
  resolveEffectiveFieldFontColor,
  resolveEffectiveFieldTextAlignment,
  sanitizeFieldFontColorChoice,
  sanitizeFieldFontSizeChoice,
  sanitizeFieldFontSizeOverride,
  sanitizeGlobalFieldTextAlignment,
} from './fieldFonts';

export const FILL_LINK_RESPONSE_ID_KEY = '__fill_link_response_id';
export const FILL_LINK_LINK_ID_KEY = '__fill_link_link_id';
export const FILL_LINK_RESPONDENT_LABEL_KEY = '__fill_link_respondent_label';
export const FILL_LINK_RESPONDENT_SECONDARY_LABEL_KEY = '__fill_link_respondent_secondary_label';
export const FILL_LINK_SUBMITTED_AT_KEY = '__fill_link_submitted_at';

function textFieldSupportsFont(field: PdfField): boolean {
  return field.type === 'text';
}

function resolveFillLinkFieldFontSize(
  field: PdfField,
  globalFieldFontSize: FieldFontSizeChoice = DEFAULT_FIELD_FONT_SIZE_CHOICE,
): number | 'auto' | undefined {
  if (!textFieldSupportsFont(field)) {
    return undefined;
  }
  const fieldFontSize = sanitizeFieldFontSizeOverride(field.fontSize, 'global');
  if (typeof fieldFontSize === 'number' || fieldFontSize === DEFAULT_FIELD_FONT_SIZE_CHOICE) {
    return fieldFontSize;
  }
  const globalFontSize = sanitizeFieldFontSizeChoice(globalFieldFontSize, DEFAULT_FIELD_FONT_SIZE_CHOICE);
  return typeof globalFontSize === 'number' ? globalFontSize : undefined;
}

export function buildFillLinkTemplateFields(
  fields: PdfField[],
  globalFieldFont: FieldFontChoice = DEFAULT_FIELD_FONT_CHOICE,
  globalFieldFontSize: FieldFontSizeChoice = DEFAULT_FIELD_FONT_SIZE_CHOICE,
  globalFieldFontColor: FieldFontColorChoice = DEFAULT_FIELD_FONT_COLOR,
  globalFieldAlignment: FieldTextAlignmentChoice = DEFAULT_FIELD_TEXT_ALIGNMENT,
) {
  const normalizedGlobalColor = sanitizeFieldFontColorChoice(globalFieldFontColor, DEFAULT_FIELD_FONT_COLOR);
  const normalizedGlobalAlignment = sanitizeGlobalFieldTextAlignment(
    globalFieldAlignment,
    DEFAULT_FIELD_TEXT_ALIGNMENT,
  );
  return fields.map((field) => ({
    name: field.name,
    type: field.type,
    page: field.page,
    rect: field.rect,
    readOnly: field.readOnly,
    required: field.required,
    valueType: field.valueType,
    calculation: field.calculation,
    fontName:
      textFieldSupportsFont(field)
        ? resolveEffectiveFieldFont(field, globalFieldFont) || undefined
        : undefined,
    fontSize: resolveFillLinkFieldFontSize(field, globalFieldFontSize),
    fontColor:
      textFieldSupportsFont(field)
        ? resolveEffectiveFieldFontColor(field, normalizedGlobalColor)
        : undefined,
    textAlign:
      textFieldSupportsFont(field)
        ? resolveEffectiveFieldTextAlignment(field, normalizedGlobalAlignment)
        : undefined,
    groupKey: field.groupKey,
    optionKey: field.optionKey,
    optionLabel: field.optionLabel,
    groupLabel: field.groupLabel,
    // Keep explicit radio metadata so backend publish can preserve one
    // respondent-facing question per radio group instead of splitting by field.
    radioGroupId: field.radioGroupId,
    radioGroupKey: field.radioGroupKey,
    radioGroupLabel: field.radioGroupLabel,
    radioOptionKey: field.radioOptionKey,
    radioOptionLabel: field.radioOptionLabel,
  }));
}

export function buildFillLinkResponseRows(responses: FillLinkResponse[]) {
  return responses.map((entry) => ({
    ...(entry.answers || {}),
    [FILL_LINK_RESPONSE_ID_KEY]: entry.id,
    [FILL_LINK_LINK_ID_KEY]: entry.linkId,
    [FILL_LINK_RESPONDENT_LABEL_KEY]: entry.respondentLabel,
    [FILL_LINK_RESPONDENT_SECONDARY_LABEL_KEY]: entry.respondentSecondaryLabel ?? '',
    [FILL_LINK_SUBMITTED_AT_KEY]: entry.submittedAt ?? '',
  }));
}

export function fillLinkRespondentPdfDownloadEnabled(
  link: Pick<FillLinkSummary, 'allowRespondentPdfDownload' | 'respondentPdfDownloadEnabled'> | null | undefined,
): boolean {
  if (typeof link?.respondentPdfDownloadEnabled === 'boolean') {
    return link.respondentPdfDownloadEnabled;
  }
  return Boolean(link?.allowRespondentPdfDownload);
}

export function fillLinkRespondentPdfEditableEnabled(
  link: Pick<FillLinkSummary, 'respondentPdfEditableEnabled'> | null | undefined,
): boolean {
  return Boolean(link?.respondentPdfEditableEnabled);
}

export function fillLinkResponseDownloadEnabled(
  result: Pick<PublicFillLinkSubmitResult, 'responseDownloadAvailable' | 'responseDownloadPath' | 'link'>,
): boolean {
  if (result.responseDownloadAvailable) {
    return true;
  }
  if (typeof result.responseDownloadPath === 'string' && result.responseDownloadPath.trim()) {
    return true;
  }
  return fillLinkRespondentPdfDownloadEnabled(result.link);
}

function sortValueMap(valueMap: Record<string, string> | undefined) {
  if (!valueMap) return undefined;
  return Object.fromEntries(
    Object.entries(valueMap).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function buildFillLinkPublishFingerprint(
  fields: PdfField[],
  checkboxRules: CheckboxRule[],
  globalFieldFont: FieldFontChoice = DEFAULT_FIELD_FONT_CHOICE,
  globalFieldFontSize: FieldFontSizeChoice = DEFAULT_FIELD_FONT_SIZE_CHOICE,
  globalFieldFontColor: FieldFontColorChoice = DEFAULT_FIELD_FONT_COLOR,
  globalFieldAlignment: FieldTextAlignmentChoice = DEFAULT_FIELD_TEXT_ALIGNMENT,
): string {
  const normalizedFields = buildFillLinkTemplateFields(
    fields,
    globalFieldFont,
    globalFieldFontSize,
    globalFieldFontColor,
    globalFieldAlignment,
  )
    .map((field) => ({
      name: field.name,
      type: field.type || 'text',
      readOnly: field.readOnly ?? '',
      required: field.required ?? '',
      valueType: field.valueType || '',
      calculation: field.calculation || null,
      fontName: field.fontName || '',
      fontSize: field.fontSize ?? '',
      fontColor: field.fontColor || '',
      textAlign: field.textAlign || '',
      page: Number.isFinite(field.page) ? field.page : 0,
      rect: {
        x: Number(field.rect?.x || 0),
        y: Number(field.rect?.y || 0),
        width: Number(field.rect?.width || 0),
        height: Number(field.rect?.height || 0),
      },
      groupKey: field.groupKey || '',
      optionKey: field.optionKey || '',
      optionLabel: field.optionLabel || '',
      groupLabel: field.groupLabel || '',
      radioGroupId: field.radioGroupId || '',
      radioGroupKey: field.radioGroupKey || '',
      radioGroupLabel: field.radioGroupLabel || '',
      radioOptionKey: field.radioOptionKey || '',
      radioOptionLabel: field.radioOptionLabel || '',
    }))
    .sort((left, right) => {
      if (left.page !== right.page) return left.page - right.page;
      if (left.name !== right.name) return left.name.localeCompare(right.name);
      if (left.rect.y !== right.rect.y) return left.rect.y - right.rect.y;
      if (left.rect.x !== right.rect.x) return left.rect.x - right.rect.x;
      return left.type.localeCompare(right.type);
    });

  const normalizedRules = checkboxRules
    .map((rule) => ({
      databaseField: rule.databaseField || '',
      groupKey: rule.groupKey || '',
      operation: rule.operation,
      trueOption: rule.trueOption || '',
      falseOption: rule.falseOption || '',
      valueMap: sortValueMap(rule.valueMap),
    }))
    .sort((left, right) => {
      if (left.groupKey !== right.groupKey) return left.groupKey.localeCompare(right.groupKey);
      if (left.databaseField !== right.databaseField) {
        return left.databaseField.localeCompare(right.databaseField);
      }
      return left.operation.localeCompare(right.operation);
    });

  return JSON.stringify({
    fields: normalizedFields,
    checkboxRules: normalizedRules,
  });
}
