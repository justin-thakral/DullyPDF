/**
 * Field helpers for creation, naming, and formatting.
 */
import type {
  FieldDependencyRef,
  FieldFontChoice,
  FieldFontColorChoice,
  FieldRect,
  FieldType,
  PageSize,
  Pdf417DependencyKey,
  Pdf417ScanData,
  PdfField,
} from '../types';
import { clampRectToPage } from './coords';
import { BARCODE_ID_LENGTH, barcodeDigitsFromValue, generateBarcodeDataUrl } from './barcode';
import { buildPdf417ScanText, buildPdf417ScanTextFromClasses, generatePdf417DataUrl } from './pdf417';
import { QR_VALUE_MAX_LENGTH, generateQrDataUrl, qrTextFromValue } from './qr';
import { migrateFieldBarcodeClasses, resolveBarcodeClasses, resolveBarcodeValue, resolvePdf417Data, resolveQrValue } from './appOnlyFieldDependencies';
import {
  DEFAULT_FIELD_FONT_CHOICE,
  DEFAULT_FIELD_FONT_COLOR,
  resolveEffectiveFieldFont,
  resolveEffectiveFieldFontColor,
  sanitizeFieldFontSizeOverride,
  sanitizeFieldTextAlignmentOverride,
} from './fieldFonts';

export const PHOTO_FIELD_NAME_MARKER = '__CVTPF';
export const PHOTO_FIELD_VALUE_MARKER = 'CVTPF#@&';
export const PDF417_FIELD_NAME_MARKER = '__CVTP4';
export const BARCODE_FIELD_NAME_MARKER = '__CVTBC';
export const QR_FIELD_NAME_MARKER = '__CVTQR';

type AppOnlyFieldType = Extract<FieldType, 'image' | 'pdf417' | 'barcode' | 'qr'>;

type AppOnlyFieldMarker = {
  marker: string;
  type: AppOnlyFieldType;
  fallback: string;
};

const APP_FIELD_MARKERS: AppOnlyFieldMarker[] = [
  { marker: PHOTO_FIELD_NAME_MARKER, type: 'image', fallback: 'photo' },
  { marker: PDF417_FIELD_NAME_MARKER, type: 'pdf417', fallback: 'pdf417_barcode' },
  { marker: BARCODE_FIELD_NAME_MARKER, type: 'barcode', fallback: 'id_barcode' },
  { marker: QR_FIELD_NAME_MARKER, type: 'qr', fallback: 'qr_code' },
];

export type DullyPdfAppOnlyFieldMetadata = {
  id?: string;
  name: string;
  markerName?: string;
  type: AppOnlyFieldType;
  page: number;
  rect?: FieldRect;
  value?: PdfField['value'];
  imageDataUrl?: string | null;
  imageMimeType?: string | null;
  imageName?: string | null;
  pdf417Name?: string | null;
  pdf417Dob?: string | null;
  pdf417Data?: Pdf417ScanData | null;
  barcodeSourceField?: FieldDependencyRef | null;
  qrSourceField?: FieldDependencyRef | null;
  pdf417FieldMappings?: Partial<Record<Pdf417DependencyKey, FieldDependencyRef>> | null;
};

export type PrepareFieldsForMaterializeOptions = {
  preserveAppOnlyFieldMarkers?: boolean;
  preserveImageFieldMarkers?: boolean;
};

function isAppOnlyFieldType(type: FieldType): type is AppOnlyFieldType {
  return type === 'image' || type === 'pdf417' || type === 'barcode' || type === 'qr';
}

function parsePdf417ScanText(text: string): { name: string; dob: string; data: Pdf417ScanData } {
  let name = '';
  let dob = '';
  const data: Pdf417ScanData = {};
  for (const line of String(text || '').split(/[\r\n]+/)) {
    const valueMatch = line.match(/^\s*([A-Z ]+):\s*(.*)$/i);
    if (valueMatch) {
      const key = valueMatch[1].trim().toUpperCase();
      const value = valueMatch[2].trim();
      if (key === 'FIRST NAME') data.firstName = value;
      if (key === 'MIDDLE NAME') data.middleName = value;
      if (key === 'LAST NAME') data.lastName = value;
      if (key === 'STREET ADDRESS') data.streetAddress = value;
      if (key === 'CITY') data.city = value;
      if (key === 'STATE') data.state = value;
      if (key === 'ZIP') data.zip = value;
      if (key === 'SEX') data.sex = value;
      if (key === 'EYE COLOR') data.eyeColor = value;
      if (key === 'HEIGHT') data.height = value;
      if (key === 'CUSTOMER ID') data.customerId = value;
      if (key === 'ISSUE DATE') data.issueDate = value;
      if (key === 'EXPIRATION DATE') data.expirationDate = value;
    }
    const nameMatch = line.match(/^\s*NAME:\s*(.*)$/i);
    if (nameMatch) name = nameMatch[1].trim();
    const dobMatch = line.match(/^\s*DOB:\s*(.*)$/i);
    if (dobMatch) {
      dob = dobMatch[1].trim();
      data.dob = dob;
    }
  }
  return { name, dob, data };
}

// Defaults mirror common form dimensions so new fields feel usable immediately.
const DEFAULT_SIZES: Record<FieldType, FieldRect> = {
  text: { x: 0, y: 0, width: 180, height: 22 },
  signature: { x: 0, y: 0, width: 220, height: 32 },
  checkbox: { x: 0, y: 0, width: 14, height: 14 },
  radio: { x: 0, y: 0, width: 14, height: 14 },
  image: { x: 0, y: 0, width: 180, height: 120 },
  pdf417: { x: 0, y: 0, width: 220, height: 78 },
  barcode: { x: 0, y: 0, width: 220, height: 52 },
  qr: { x: 0, y: 0, width: 110, height: 110 },
};

const MIN_SIZES: Record<FieldType, number> = {
  text: 12,
  signature: 16,
  checkbox: 12,
  radio: 12,
  image: 24,
  pdf417: 36,
  barcode: 32,
  qr: 36,
};

// Base naming keeps field lists readable while still ensuring unique identifiers.
const NAME_BASES: Record<FieldType, string> = {
  text: 'text_field',
  signature: 'signature',
  checkbox: 'i_checkbox',
  radio: 'radio_option',
  image: 'image_field',
  pdf417: 'pdf417_barcode',
  barcode: 'id_barcode',
  qr: 'qr_code',
};

function nextName(base: string, existing: Set<string>) {
  let index = 1;
  while (existing.has(`${base}_${index}`)) {
    index += 1;
  }
  return `${base}_${index}`;
}

export function ensureUniqueFieldName(baseName: string, existing: Set<string>) {
  const normalized = baseName.trim() || 'field';
  if (!existing.has(normalized)) {
    existing.add(normalized);
    return normalized;
  }
  const unique = nextName(normalized, existing);
  existing.add(unique);
  return unique;
}

export function getDefaultFieldRect(type: FieldType): FieldRect {
  const template = DEFAULT_SIZES[type] ?? DEFAULT_SIZES.text;
  return { ...template };
}

export function getMinFieldSize(type: FieldType): number {
  return MIN_SIZES[type] ?? MIN_SIZES.text;
}

export function normalizeRectForFieldType(rect: FieldRect, type: FieldType, pageSize: PageSize): FieldRect {
  const minSize = getMinFieldSize(type);
  if (type === 'checkbox' || type === 'radio') {
    const defaultType = type === 'radio' ? 'radio' : 'checkbox';
    const side = Math.max(rect.width, rect.height, getDefaultFieldRect(defaultType).width, minSize);
    return clampRectToPage(
      {
        x: rect.x,
        y: rect.y,
        width: side,
        height: side,
      },
      pageSize,
      minSize,
    );
  }

  return clampRectToPage(
    {
      x: rect.x,
      y: rect.y,
      width: Math.max(rect.width, minSize),
      height: Math.max(rect.height, minSize),
    },
    pageSize,
    minSize,
  );
}

export function createFieldWithRect(
  type: FieldType,
  page: number,
  pageSize: PageSize,
  existingFields: PdfField[],
  rect: FieldRect,
): PdfField {
  const existingNames = new Set(existingFields.map((field) => field.name));
  const base = NAME_BASES[type] || 'field';
  const name = ensureUniqueFieldName(base, existingNames);
  const normalizedRect = normalizeRectForFieldType(rect, type, pageSize);

  return {
    id: makeId(),
    name,
    type,
    page,
    rect: normalizedRect,
  };
}

export function createField(
  type: FieldType,
  page: number,
  pageSize: PageSize,
  existingFields: PdfField[],
): PdfField {
  const template = getDefaultFieldRect(type);
  // Start fields near the page center and clamp to the page bounds to avoid off-page geometry.
  const centeredRect = clampRectToPage(
    {
      x: Math.max(0, pageSize.width / 2 - template.width / 2),
      y: Math.max(0, pageSize.height / 2 - template.height / 2),
      width: template.width,
      height: template.height,
    },
    pageSize,
  );
  return createFieldWithRect(type, page, pageSize, existingFields, centeredRect);
}

export function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `field_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function formatSize(rect: FieldRect) {
  return `${Math.round(rect.width)} x ${Math.round(rect.height)}`;
}

/**
 * Convert raw filenames into a display-friendly saved form name.
 */
export function normaliseFormName(raw: string | null | undefined): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed.length) return 'Saved form';
  return trimmed.replace(/\.pdf$/i, '');
}

/**
 * Normalize values so fillable PDFs receive consistent defaults.
 */
function normaliseFieldValueForMaterialize(field: PdfField): PdfField['value'] {
  const value = field.value;
  if (field.type === 'image') {
    return value ?? null;
  }
  if (field.type === 'pdf417') {
    if (value === null || value === undefined) return '';
    return String(value);
  }
  if (field.type === 'barcode') {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\D/g, '').slice(0, 9);
  }
  if (field.type === 'qr') {
    if (value === null || value === undefined) return '';
    return String(value).trim().slice(0, QR_VALUE_MAX_LENGTH);
  }
  if (field.type === 'checkbox') {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim().length === 0) return false;
    return value;
  }
  if (field.type === 'radio') {
    const exportValue = String(field.radioOptionKey || field.name || '').trim();
    if (!exportValue) return null;
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value ? exportValue : null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      return trimmed;
    }
    return String(value);
  }
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' && value.trim().length === 0) return '';
  return value;
}

/**
 * Build the minimal template-field payload sent to the backend for session
 * registration and OpenAI rename / mapping calls.
 */
export function buildTemplateFields(sourceFields: PdfField[]) {
  return sourceFields.map((field) => ({
    id: field.id,
    name: field.name, type: field.type, page: field.page, rect: field.rect,
    readOnly: field.readOnly,
    required: field.required,
    valueType: field.valueType,
    calculation: field.calculation,
    groupKey: field.groupKey, optionKey: field.optionKey,
    optionLabel: field.optionLabel, groupLabel: field.groupLabel,
    radioGroupId: field.radioGroupId,
    radioGroupKey: field.radioGroupKey,
    radioGroupLabel: field.radioGroupLabel,
    radioOptionKey: field.radioOptionKey,
    radioOptionLabel: field.radioOptionLabel,
    radioOptionOrder: field.radioOptionOrder,
    barcodeSourceField: field.barcodeSourceField,
    qrSourceField: field.qrSourceField,
    pdf417FieldMappings: field.pdf417FieldMappings,
    barcodeClasses: field.barcodeClasses,
    group: field.type === 'radio' ? (field.radioGroupKey || field.radioGroupLabel || field.name) : undefined,
    exportValue: field.type === 'radio' ? (field.radioOptionKey || field.name) : undefined,
  }));
}

function withFieldNameMarker(name: string, marker: string, fallback: string): string {
  const trimmed = name.trim() || fallback;
  return trimmed.includes(marker) ? trimmed : `${trimmed}${marker}`;
}

function markerInfoForAppOnlyField(type: FieldType): AppOnlyFieldMarker | null {
  return APP_FIELD_MARKERS.find((entry) => entry.type === type) ?? null;
}

function markerNameForAppOnlyField(field: PdfField): string | null {
  const marker = markerInfoForAppOnlyField(field.type);
  if (!marker) return null;
  return withFieldNameMarker(field.name, marker.marker, marker.fallback);
}

function buildMarkerTextField(field: PdfField, marker: AppOnlyFieldMarker, idSuffix: string): PdfField {
  return {
    ...field,
    id: `${field.id}_${idSuffix}`,
    name: withFieldNameMarker(field.name, marker.marker, marker.fallback),
    type: 'text',
    value: null,
    readOnly: true,
    required: false,
    imageDataUrl: undefined,
    imageMimeType: undefined,
    imageName: undefined,
    pdf417Name: undefined,
    pdf417Dob: undefined,
    pdf417Data: undefined,
    barcodeSourceField: undefined,
    qrSourceField: undefined,
    pdf417FieldMappings: undefined,
    barcodeClasses: undefined,
    appOnlyMarkerName: undefined,
  };
}

function buildAppOnlyMarkerTextField(field: PdfField): PdfField | null {
  const marker = markerInfoForAppOnlyField(field.type);
  if (!marker) return null;
  return buildMarkerTextField(field, marker, `${field.type}_marker`);
}

function materializeAppOnlyField(field: PdfField, fields: PdfField[]): PdfField {
  const migrated = migrateFieldBarcodeClasses(field);
  const appOnlyMarkerName = markerNameForAppOnlyField(migrated);
  const normalizedValue = normaliseFieldValueForMaterialize(migrated);
  const baseField = {
    ...migrated,
    value: normalizedValue,
    ...(appOnlyMarkerName ? { appOnlyMarkerName } : {}),
  };
  if (migrated.type === 'barcode') {
    if (Array.isArray(migrated.barcodeClasses)) {
      const resolution = resolveBarcodeValue(migrated, fields);
      const digits = resolution.status === 'ready' ? resolution.digits : '';
      const imageDataUrl = generateBarcodeDataUrl(digits);
      return {
        ...baseField,
        value: digits.length === BARCODE_ID_LENGTH ? digits : digits || null,
        imageDataUrl,
        imageMimeType: imageDataUrl ? 'image/png' : null,
        imageName: imageDataUrl ? `${migrated.name || 'barcode'}.png` : null,
      };
    }
    const resolution = resolveBarcodeValue(migrated, fields);
    const digits = resolution.status === 'ready'
      ? resolution.digits
      : barcodeDigitsFromValue(normalizedValue);
    const imageDataUrl = generateBarcodeDataUrl(digits);
    return {
      ...baseField,
      value: digits.length === BARCODE_ID_LENGTH ? digits : digits || null,
      imageDataUrl,
      imageMimeType: imageDataUrl ? 'image/png' : null,
      imageName: imageDataUrl ? `${migrated.name || 'barcode'}.png` : null,
    };
  }
  if (migrated.type === 'qr') {
    if (Array.isArray(migrated.barcodeClasses)) {
      const resolution = resolveQrValue(migrated, fields);
      const text = resolution.status === 'ready' ? resolution.value : '';
      const imageDataUrl = generateQrDataUrl(text);
      return {
        ...baseField,
        value: text || null,
        imageDataUrl,
        imageMimeType: imageDataUrl ? 'image/png' : null,
        imageName: imageDataUrl ? `${migrated.name || 'qr'}.png` : null,
      };
    }
    const resolution = resolveQrValue(migrated, fields);
    const text = resolution.status === 'ready'
      ? resolution.value
      : qrTextFromValue(normalizedValue);
    const imageDataUrl = generateQrDataUrl(text);
    return {
      ...baseField,
      value: text || null,
      imageDataUrl,
      imageMimeType: imageDataUrl ? 'image/png' : null,
      imageName: imageDataUrl ? `${migrated.name || 'qr'}.png` : null,
    };
  }
  if (migrated.type === 'pdf417') {
    if (Array.isArray(migrated.barcodeClasses)) {
      const classRes = resolveBarcodeClasses(migrated, fields);
      const scanText = buildPdf417ScanTextFromClasses(classRes.classes);
      const imageDataUrl = generatePdf417DataUrl(scanText);
      return {
        ...baseField,
        value: scanText.trim() ? scanText : null,
        pdf417Data: null,
        imageDataUrl,
        imageMimeType: imageDataUrl ? 'image/png' : null,
        imageName: imageDataUrl ? `${migrated.name || 'pdf417'}.png` : null,
      };
    }
    const resolution = resolvePdf417Data(migrated, fields);
    const scanText = buildPdf417ScanText(resolution.data);
    const imageDataUrl = generatePdf417DataUrl(scanText);
    return {
      ...baseField,
      value: scanText.trim() ? scanText : null,
      pdf417Data: resolution.data,
      imageDataUrl,
      imageMimeType: imageDataUrl ? 'image/png' : null,
      imageName: imageDataUrl ? `${migrated.name || 'pdf417'}.png` : null,
    };
  }
  return baseField;
}

function appFieldMarkerInfo(field: PdfField): AppOnlyFieldMarker | null {
  if (field.type !== 'text') return null;
  const name = String(field.name || '');
  for (const entry of APP_FIELD_MARKERS) {
    if (name.includes(entry.marker)) return entry;
  }
  if (typeof field.value === 'string' && field.value.trim() === PHOTO_FIELD_VALUE_MARKER) {
    return APP_FIELD_MARKERS[0];
  }
  return null;
}

function cleanFieldName(name: string, marker: string, fallback: string): string {
  const cleaned = name
    .replaceAll(marker, '')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim();
  return cleaned || fallback;
}

function metadataMatchesField(
  metadata: DullyPdfAppOnlyFieldMetadata,
  field: PdfField,
  marker: AppOnlyFieldMarker,
  cleanedName: string,
): boolean {
  if (metadata.type !== marker.type || metadata.page !== field.page) return false;
  if (metadata.markerName && metadata.markerName === field.name) return true;
  return metadata.name.trim().toLowerCase() === cleanedName.trim().toLowerCase();
}

function pickMarkerMetadata(
  field: PdfField,
  marker: AppOnlyFieldMarker,
  cleanedName: string,
  metadata: DullyPdfAppOnlyFieldMetadata[],
  usedMetadataIndexes: Set<number>,
): DullyPdfAppOnlyFieldMetadata | null {
  const exactIndex = metadata.findIndex((entry, index) => (
    !usedMetadataIndexes.has(index)
    && entry.markerName === field.name
    && entry.type === marker.type
    && entry.page === field.page
  ));
  const index = exactIndex !== -1
    ? exactIndex
    : metadata.findIndex((entry, candidateIndex) => (
        !usedMetadataIndexes.has(candidateIndex)
        && metadataMatchesField(entry, field, marker, cleanedName)
      ));
  if (index === -1) return null;
  usedMetadataIndexes.add(index);
  return metadata[index];
}

/**
 * Rehydrate tagged editable-export widgets back into DullyPDF-only helper fields.
 */
export function convertAppOnlyMarkerFields(
  fields: PdfField[],
  metadata: DullyPdfAppOnlyFieldMetadata[] = [],
): PdfField[] {
  const usedMetadataIndexes = new Set<number>();
  return fields.map((field) => {
    const marker = appFieldMarkerInfo(field);
    if (!marker) return field;
    const cleanedName = cleanFieldName(field.name, marker.marker, marker.fallback);
    const markerMetadata = pickMarkerMetadata(field, marker, cleanedName, metadata, usedMetadataIndexes);
    const rect = markerMetadata?.rect ?? field.rect;
    const base: PdfField = {
      ...field,
      id: markerMetadata?.id || field.id,
      name: markerMetadata?.name || cleanedName,
      type: marker.type,
      rect,
      value: markerMetadata?.value ?? null,
      appOnlyMarkerName: markerMetadata?.markerName ?? field.name,
    };
    if (marker.type === 'image') {
      return {
        ...base,
        imageDataUrl: markerMetadata?.imageDataUrl ?? null,
        imageMimeType: markerMetadata?.imageMimeType ?? null,
        imageName: markerMetadata?.imageName ?? null,
      };
    }
    if (marker.type === 'pdf417') {
      const valueText = typeof field.value === 'string' ? field.value : '';
      const parsed = parsePdf417ScanText(valueText);
      return {
        ...base,
        imageDataUrl: markerMetadata?.imageDataUrl ?? null,
        imageMimeType: markerMetadata?.imageMimeType ?? null,
        imageName: markerMetadata?.imageName ?? null,
        pdf417Name: markerMetadata?.pdf417Name ?? parsed.name,
        pdf417Dob: markerMetadata?.pdf417Dob ?? parsed.dob,
        pdf417Data: markerMetadata?.pdf417Data ?? parsed.data,
        pdf417FieldMappings: markerMetadata?.pdf417FieldMappings ?? null,
      };
    }
    if (marker.type === 'barcode') {
      const digits = markerMetadata?.value !== undefined
        ? barcodeDigitsFromValue(markerMetadata.value)
        : typeof field.value === 'string'
          ? barcodeDigitsFromValue(field.value)
          : '';
      return {
        ...base,
        value: digits || null,
        imageDataUrl: markerMetadata?.imageDataUrl ?? null,
        imageMimeType: markerMetadata?.imageMimeType ?? null,
        imageName: markerMetadata?.imageName ?? null,
        barcodeSourceField: markerMetadata?.barcodeSourceField ?? null,
      };
    }
    if (marker.type === 'qr') {
      const text = markerMetadata?.value !== undefined
        ? qrTextFromValue(markerMetadata.value)
        : typeof field.value === 'string'
          ? qrTextFromValue(field.value)
          : '';
      return {
        ...base,
        value: text || null,
        imageDataUrl: markerMetadata?.imageDataUrl ?? null,
        imageMimeType: markerMetadata?.imageMimeType ?? null,
        imageName: markerMetadata?.imageName ?? null,
        qrSourceField: markerMetadata?.qrSourceField ?? null,
      };
    }
    return field;
  });
}

/**
 * Apply value normalization across all fields before materialization or snapshot persistence.
 */
export function normalizeFieldValuesForMaterialize(fields: PdfField[]): PdfField[] {
  return fields.map((field) => {
    const value = normaliseFieldValueForMaterialize(field);
    return value === field.value ? field : { ...field, value };
  });
}

function textFieldSupportsFont(field: PdfField): boolean {
  return field.type === 'text';
}

/**
 * Build the PDF materialization payload. Global appearance stays in the
 * top-level appearance payload; only explicit field overrides are copied onto
 * fields so saved PDFs can later distinguish inherited settings from custom
 * field settings.
 */
export function prepareFieldsForMaterialize(
  fields: PdfField[],
  globalFieldFont: FieldFontChoice = DEFAULT_FIELD_FONT_CHOICE,
  globalFieldFontColor: FieldFontColorChoice = DEFAULT_FIELD_FONT_COLOR,
  options: PrepareFieldsForMaterializeOptions = {},
): PdfField[] {
  void globalFieldFont;
  void globalFieldFontColor;
  const preserveAppOnlyFieldMarkers =
    Boolean(options.preserveAppOnlyFieldMarkers) || Boolean(options.preserveImageFieldMarkers);
  return fields.flatMap((field) => {
    if (isAppOnlyFieldType(field.type)) {
      const materialized = materializeAppOnlyField(field, fields);
      if (!preserveAppOnlyFieldMarkers) {
        return [materialized];
      }
      const markerField = buildAppOnlyMarkerTextField(field);
      return markerField ? [materialized, markerField] : [materialized];
    }
    const value = normaliseFieldValueForMaterialize(field);
    const supportsFont = textFieldSupportsFont(field);
    const hasExplicitFieldColor =
      supportsFont && field.fontColor !== undefined && field.fontColor !== 'global';
    const explicitTextAlign = supportsFont
      ? sanitizeFieldTextAlignmentOverride(field.textAlign, 'global')
      : 'global';
    const explicitFont = supportsFont && field.fontName && field.fontName !== 'global'
      ? resolveEffectiveFieldFont(field, DEFAULT_FIELD_FONT_CHOICE)
      : null;
    const explicitColor = hasExplicitFieldColor
      ? resolveEffectiveFieldFontColor(field, DEFAULT_FIELD_FONT_COLOR)
      : null;
    const explicitFontSize = supportsFont
      ? sanitizeFieldFontSizeOverride(field.fontSize, 'global')
      : 'global';
    const valueChanged = value !== field.value;
    const fontNameChanged =
      explicitFont ? field.fontName !== explicitFont : field.fontName !== undefined;
    const fontColorChanged =
      explicitColor ? field.fontColor !== explicitColor : field.fontColor !== undefined;
    const fontSizeChanged = supportsFont
      ? explicitFontSize !== 'global'
        ? field.fontSize !== explicitFontSize
        : field.fontSize !== undefined
      : field.fontSize !== undefined;
    const textAlignChanged =
      explicitTextAlign !== 'global' ? field.textAlign !== explicitTextAlign : field.textAlign !== undefined;
    if (!valueChanged && !fontNameChanged && !fontColorChanged && !fontSizeChanged && !textAlignChanged) {
      return [field];
    }
    const next = { ...field, value };
    if (explicitFont) {
      next.fontName = explicitFont;
    } else {
      delete next.fontName;
    }
    if (explicitColor) {
      next.fontColor = explicitColor;
    } else {
      delete next.fontColor;
    }
    if (!supportsFont) {
      delete next.fontSize;
      delete next.fontColor;
    }
    if (supportsFont && explicitFontSize !== 'global') {
      next.fontSize = explicitFontSize;
    } else {
      delete next.fontSize;
    }
    if (supportsFont && explicitTextAlign !== 'global') {
      next.textAlign = explicitTextAlign;
    } else {
      delete next.textAlign;
    }
    return [next];
  });
}

/**
 * Strip transient values before persisting a template-definition update.
 */
export function clearFieldValues(fields: PdfField[]): PdfField[] {
  return fields.map((field) => {
    if (field.value === undefined || field.value === null) {
      return field;
    }
    return { ...field, value: null };
  });
}
