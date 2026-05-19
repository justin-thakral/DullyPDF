import { describe, expect, it } from 'vitest';
import type { PdfField } from '../../../src/types';
import {
  DEFAULT_FIELD_FONT_SIZE_CHOICE,
  MAX_FIELD_FONT_SIZE_PT,
  MIN_FIELD_FONT_SIZE_PT,
  PDF_BASE_14_FONTS,
  cssStyleForPdfBase14Font,
  fieldFontChoiceLabel,
  isPdfBase14FontName,
  isValidFieldFontSize,
  resolveEffectiveFieldFont,
  resolveEffectiveFieldFontSize,
  sanitizeFieldFontSizeChoice,
  sanitizeFieldFontSizeOverride,
} from '../../../src/utils/fieldFonts';

function makeField(overrides: Partial<PdfField> = {}): PdfField {
  return {
    id: 'field-1',
    name: 'full_name',
    type: 'text',
    page: 1,
    rect: { x: 0, y: 0, width: 100, height: 20 },
    ...overrides,
  };
}

describe('fieldFonts', () => {
  it('recognizes exactly the text-safe PDF Base 14 font names', () => {
    expect(PDF_BASE_14_FONTS).toHaveLength(12);
    for (const font of PDF_BASE_14_FONTS) {
      expect(isPdfBase14FontName(font)).toBe(true);
    }
    expect(isPdfBase14FontName('Symbol')).toBe(false);
    expect(isPdfBase14FontName('ZapfDingbats')).toBe(false);
    expect(isPdfBase14FontName('Arial')).toBe(false);
    expect(isPdfBase14FontName('Helvetica Neue')).toBe(false);
    expect(isPdfBase14FontName('')).toBe(false);
  });

  it('resolves field-specific font overrides before the global setting', () => {
    expect(resolveEffectiveFieldFont(makeField({ fontName: 'Courier-Bold' }), 'Times-Italic'))
      .toBe('Courier-Bold');
    expect(resolveEffectiveFieldFont(makeField({ fontName: 'global' }), 'Times-Italic'))
      .toBe('Times-Italic');
    expect(resolveEffectiveFieldFont(makeField(), 'Helvetica-Bold'))
      .toBe('Helvetica-Bold');
    expect(resolveEffectiveFieldFont(makeField(), 'default')).toBeNull();
  });

  it('returns user-facing labels for default and text-safe Base 14 fonts', () => {
    expect(fieldFontChoiceLabel('default')).toBe('Default');
    expect(fieldFontChoiceLabel('Helvetica-BoldOblique')).toBe('Helvetica Bold Oblique');
    expect(fieldFontChoiceLabel('Times-Roman')).toBe('Times Roman');
  });

  it('maps text-safe Base 14 font names to browser preview styles', () => {
    expect(cssStyleForPdfBase14Font('Helvetica-Bold')).toMatchObject({
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: 700,
    });
    expect(cssStyleForPdfBase14Font('Times-Italic')).toMatchObject({
      fontFamily: '"Times New Roman", Times, serif',
      fontStyle: 'italic',
    });
    expect(cssStyleForPdfBase14Font('Courier-BoldOblique')).toMatchObject({
      fontFamily: '"Courier New", Courier, monospace',
      fontWeight: 700,
      fontStyle: 'italic',
    });
  });

  it('validates numeric font sizes inside the supported point range', () => {
    expect(isValidFieldFontSize(MIN_FIELD_FONT_SIZE_PT)).toBe(true);
    expect(isValidFieldFontSize(12)).toBe(true);
    expect(isValidFieldFontSize(MAX_FIELD_FONT_SIZE_PT)).toBe(true);
    expect(isValidFieldFontSize(MIN_FIELD_FONT_SIZE_PT - 0.1)).toBe(false);
    expect(isValidFieldFontSize(MAX_FIELD_FONT_SIZE_PT + 0.1)).toBe(false);
    expect(isValidFieldFontSize('12')).toBe(false);
    expect(isValidFieldFontSize(Number.NaN)).toBe(false);
  });

  it('sanitizes global font-size choices while preserving auto as the default', () => {
    expect(sanitizeFieldFontSizeChoice('auto')).toBe(DEFAULT_FIELD_FONT_SIZE_CHOICE);
    expect(sanitizeFieldFontSizeChoice(12)).toBe(12);
    expect(sanitizeFieldFontSizeChoice('14')).toBe(14);
    expect(sanitizeFieldFontSizeChoice(1)).toBe(MIN_FIELD_FONT_SIZE_PT);
    expect(sanitizeFieldFontSizeChoice(200)).toBe(MAX_FIELD_FONT_SIZE_PT);
    expect(sanitizeFieldFontSizeChoice('not-a-size', 10)).toBe(10);
  });

  it('sanitizes per-field font-size overrides', () => {
    expect(sanitizeFieldFontSizeOverride('global')).toBe('global');
    expect(sanitizeFieldFontSizeOverride('auto')).toBe('auto');
    expect(sanitizeFieldFontSizeOverride(11)).toBe(11);
    expect(sanitizeFieldFontSizeOverride('16')).toBe(16);
    expect(sanitizeFieldFontSizeOverride(0)).toBe(MIN_FIELD_FONT_SIZE_PT);
    expect(sanitizeFieldFontSizeOverride(100)).toBe(MAX_FIELD_FONT_SIZE_PT);
    expect(sanitizeFieldFontSizeOverride('bad', 'auto')).toBe('auto');
  });

  it('resolves effective font size from field, global, and auto values', () => {
    expect(resolveEffectiveFieldFontSize(makeField(), 'auto', 9)).toBe(9);
    expect(resolveEffectiveFieldFontSize(makeField(), 12, 9)).toBe(12);
    expect(resolveEffectiveFieldFontSize(makeField({ fontSize: 14 }), 12, 9)).toBe(14);
    expect(resolveEffectiveFieldFontSize(makeField({ fontSize: 'global' }), 12, 9)).toBe(12);
    expect(resolveEffectiveFieldFontSize(makeField({ fontSize: 'auto' }), 12, 9)).toBe(9);
  });

  it('bounds effective font sizes for defensive runtime inputs', () => {
    expect(resolveEffectiveFieldFontSize(makeField({ fontSize: 1 }), 12, 9)).toBe(MIN_FIELD_FONT_SIZE_PT);
    expect(resolveEffectiveFieldFontSize(makeField({ fontSize: 100 }), 12, 9)).toBe(MAX_FIELD_FONT_SIZE_PT);
    expect(resolveEffectiveFieldFontSize(makeField(), 100, 9)).toBe(MAX_FIELD_FONT_SIZE_PT);
    expect(resolveEffectiveFieldFontSize(makeField(), 'auto', 100)).toBe(MAX_FIELD_FONT_SIZE_PT);
  });
});
