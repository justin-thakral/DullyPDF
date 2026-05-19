import type { CSSProperties } from 'react';
import type {
  FieldFontColorChoice,
  FieldFontColorOverride,
  FieldFontChoice,
  FieldFontSizeChoice,
  FieldFontSizeOverride,
  PdfBase14FontName,
  PdfField,
} from '../types';

export const DEFAULT_FIELD_FONT_CHOICE: FieldFontChoice = 'default';
export const DEFAULT_FIELD_FONT_SIZE_CHOICE: FieldFontSizeChoice = 'auto';
export const DEFAULT_FIELD_FONT_COLOR: FieldFontColorChoice = '#000000';
export const DEFAULT_CUSTOM_FIELD_FONT_SIZE_PT = 10;
export const MIN_FIELD_FONT_SIZE_PT = 4;
export const MAX_FIELD_FONT_SIZE_PT = 72;

// Product-facing text fields use the 12 Base 14 fonts that reliably render normal typed text.
export const PDF_BASE_14_FONTS = [
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique',
] as const satisfies readonly PdfBase14FontName[];

const PDF_BASE_14_FONT_SET = new Set<string>(PDF_BASE_14_FONTS);

export type PdfBase14FontOptionGroup = {
  label: string;
  options: Array<{
    value: PdfBase14FontName;
    label: string;
    advanced?: boolean;
  }>;
};

export const PDF_BASE_14_FONT_OPTION_GROUPS: PdfBase14FontOptionGroup[] = [
  {
    label: 'Sans',
    options: [
      { value: 'Helvetica', label: 'Helvetica' },
      { value: 'Helvetica-Bold', label: 'Helvetica Bold' },
      { value: 'Helvetica-Oblique', label: 'Helvetica Oblique' },
      { value: 'Helvetica-BoldOblique', label: 'Helvetica Bold Oblique' },
    ],
  },
  {
    label: 'Serif',
    options: [
      { value: 'Times-Roman', label: 'Times Roman' },
      { value: 'Times-Bold', label: 'Times Bold' },
      { value: 'Times-Italic', label: 'Times Italic' },
      { value: 'Times-BoldItalic', label: 'Times Bold Italic' },
    ],
  },
  {
    label: 'Mono',
    options: [
      { value: 'Courier', label: 'Courier' },
      { value: 'Courier-Bold', label: 'Courier Bold' },
      { value: 'Courier-Oblique', label: 'Courier Oblique' },
      { value: 'Courier-BoldOblique', label: 'Courier Bold Oblique' },
    ],
  },
];

export function isPdfBase14FontName(value: unknown): value is PdfBase14FontName {
  return typeof value === 'string' && PDF_BASE_14_FONT_SET.has(value);
}

export function fieldFontChoiceLabel(value: FieldFontChoice): string {
  if (value === DEFAULT_FIELD_FONT_CHOICE) return 'Default';
  for (const group of PDF_BASE_14_FONT_OPTION_GROUPS) {
    const option = group.options.find((candidate) => candidate.value === value);
    if (option) return option.label;
  }
  return value;
}

export function resolveEffectiveFieldFont(
  field: Pick<PdfField, 'fontName'>,
  globalFieldFont: FieldFontChoice,
): PdfBase14FontName | null {
  if (isPdfBase14FontName(field.fontName)) {
    return field.fontName;
  }
  if (isPdfBase14FontName(globalFieldFont)) {
    return globalFieldFont;
  }
  return null;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'boolean' || value === null || value === undefined) {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

function clampFieldFontSize(value: number): number {
  return Math.min(Math.max(value, MIN_FIELD_FONT_SIZE_PT), MAX_FIELD_FONT_SIZE_PT);
}

export function isValidFieldFontSize(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_FIELD_FONT_SIZE_PT &&
    value <= MAX_FIELD_FONT_SIZE_PT
  );
}

export function sanitizeFieldFontSizeChoice(
  value: unknown,
  fallback: FieldFontSizeChoice = DEFAULT_FIELD_FONT_SIZE_CHOICE,
): FieldFontSizeChoice {
  if (value === DEFAULT_FIELD_FONT_SIZE_CHOICE) {
    return DEFAULT_FIELD_FONT_SIZE_CHOICE;
  }
  const numeric = parseFiniteNumber(value);
  if (numeric === null) {
    return fallback;
  }
  return clampFieldFontSize(numeric);
}

export function sanitizeFieldFontSizeOverride(
  value: unknown,
  fallback: FieldFontSizeOverride = 'global',
): FieldFontSizeOverride {
  if (value === 'global') {
    return 'global';
  }
  if (value === DEFAULT_FIELD_FONT_SIZE_CHOICE) {
    return DEFAULT_FIELD_FONT_SIZE_CHOICE;
  }
  const numeric = parseFiniteNumber(value);
  if (numeric === null) {
    return fallback;
  }
  return clampFieldFontSize(numeric);
}

export function resolveEffectiveFieldFontSize(
  field: Pick<PdfField, 'fontSize'>,
  globalFieldFontSize: FieldFontSizeChoice | undefined,
  autoFontSize: number,
): number {
  const resolvedAuto = sanitizeFieldFontSizeChoice(autoFontSize, MIN_FIELD_FONT_SIZE_PT) as number;
  if (field.fontSize === DEFAULT_FIELD_FONT_SIZE_CHOICE) {
    return resolvedAuto;
  }
  if (typeof field.fontSize === 'number') {
    return sanitizeFieldFontSizeChoice(field.fontSize, resolvedAuto) as number;
  }
  if (globalFieldFontSize === DEFAULT_FIELD_FONT_SIZE_CHOICE || globalFieldFontSize === undefined) {
    return resolvedAuto;
  }
  return sanitizeFieldFontSizeChoice(globalFieldFontSize, resolvedAuto) as number;
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }
  return normalized.toLowerCase();
}

export function sanitizeFieldFontColorChoice(
  value: unknown,
  fallback: FieldFontColorChoice = DEFAULT_FIELD_FONT_COLOR,
): FieldFontColorChoice {
  return normalizeHexColor(value) ?? normalizeHexColor(fallback) ?? DEFAULT_FIELD_FONT_COLOR;
}

export function sanitizeFieldFontColorOverride(
  value: unknown,
  fallback: FieldFontColorOverride = 'global',
): FieldFontColorOverride {
  if (value === 'global') {
    return 'global';
  }
  return normalizeHexColor(value) ?? fallback;
}

export function resolveEffectiveFieldFontColor(
  field: Pick<PdfField, 'fontColor'>,
  globalFieldFontColor: FieldFontColorChoice | undefined,
): FieldFontColorChoice {
  const fieldColor = sanitizeFieldFontColorOverride(field.fontColor, 'global');
  if (fieldColor !== 'global') {
    return fieldColor;
  }
  return sanitizeFieldFontColorChoice(globalFieldFontColor, DEFAULT_FIELD_FONT_COLOR);
}

export function fieldFontColorChoiceLabel(value: FieldFontColorChoice | undefined): string {
  return sanitizeFieldFontColorChoice(value, DEFAULT_FIELD_FONT_COLOR).toUpperCase();
}

export function fieldFontSizeChoiceLabel(value: FieldFontSizeChoice | undefined): string {
  if (value === undefined || value === DEFAULT_FIELD_FONT_SIZE_CHOICE) {
    return 'Auto';
  }
  return `${value} pt`;
}

export function cssStyleForPdfBase14Font(fontName: PdfBase14FontName): CSSProperties {
  const style: CSSProperties = {};
  if (fontName.startsWith('Times-')) {
    style.fontFamily = '"Times New Roman", Times, serif';
  } else if (fontName.startsWith('Courier')) {
    style.fontFamily = '"Courier New", Courier, monospace';
  } else {
    style.fontFamily = 'Arial, Helvetica, sans-serif';
  }

  if (fontName.includes('Bold')) {
    style.fontWeight = 700;
  }
  if (fontName.includes('Italic') || fontName.includes('Oblique')) {
    style.fontStyle = 'italic';
  }
  return style;
}
