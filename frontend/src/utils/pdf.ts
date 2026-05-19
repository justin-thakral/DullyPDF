/**
 * PDF.js utilities for loading documents and extracting existing widgets.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import type {
  FieldFontChoice,
  FieldFontColorChoice,
  FieldFontSizeChoice,
  FieldRect,
  FieldType,
  PageSize,
  PdfBase14FontName,
  PdfField,
} from '../types';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { clampRectToPage } from './coords';
import { parseConfidence } from './confidence';
import { ensureUniqueFieldName, makeId } from './fields';
import {
  DEFAULT_FIELD_FONT_CHOICE,
  DEFAULT_FIELD_FONT_COLOR,
  DEFAULT_FIELD_FONT_SIZE_CHOICE,
  isPdfBase14FontName,
  sanitizeFieldFontColorChoice,
  sanitizeFieldFontColorOverride,
  sanitizeFieldFontSizeChoice,
  sanitizeFieldFontSizeOverride,
} from './fieldFonts';

const DEBUG_PDF = false;
const DEFAULT_PAGE_COUNT_TIMEOUT_MS = 15000;

function debugLog(...args: unknown[]) {
  if (!DEBUG_PDF) return;
  console.log('[dullypdf-ui/pdf]', ...args);
}

function getDisplayPlatform(): string {
  if (typeof navigator === 'undefined') return '';
  const browserNavigator = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const uaPlatform = typeof browserNavigator.userAgentData?.platform === 'string'
    ? browserNavigator.userAgentData.platform
    : '';
  return uaPlatform || navigator.platform || '';
}

function isWindowsDisplayPlatform(): boolean {
  return /win/i.test(getDisplayPlatform());
}

function metadataLooksLikeWindowsOfficeExport(rawMetadata: unknown): boolean {
  if (!rawMetadata || typeof rawMetadata !== 'object') return false;
  const info = (rawMetadata as { info?: Record<string, unknown> }).info;
  if (!info || typeof info !== 'object') return false;
  const creator = typeof info.Creator === 'string' ? info.Creator : '';
  const producer = typeof info.Producer === 'string' ? info.Producer : '';
  const combined = `${creator}\n${producer}`.toLowerCase();
  return combined.includes('microsoft excel') || combined.includes('microsoft 365');
}

async function shouldPreferEmbeddedFontsForDisplay(doc: PDFDocumentProxy): Promise<boolean> {
  if (!isWindowsDisplayPlatform()) return false;
  try {
    const metadata = await doc.getMetadata();
    return metadataLooksLikeWindowsOfficeExport(metadata);
  } catch (error) {
    debugLog('Failed to inspect PDF metadata for display font strategy', error);
    return false;
  }
}

// Ensure the PDF.js worker runs in a separate thread for heavy parsing work.
GlobalWorkerOptions.workerSrc = workerSrc;

type PdfJsAnnotation = {
  subtype?: string;
  annotationType?: number;
  fieldType?: string;
  fieldName?: string;
  alternativeText?: string;
  title?: string;
  fieldValue?: unknown;
  defaultFieldValue?: unknown;
  rect?: number[];
  checkBox?: boolean;
  radioButton?: boolean;
  pushButton?: boolean;
  defaultAppearanceData?: {
    fontName?: string;
    fontSize?: number;
    fontColor?: ArrayLike<number>;
  };
};

type PdfJsFieldObject = {
  id?: string;
  name?: string;
  rect?: number[];
  page?: number;
  type?: string;
  value?: unknown;
  defaultValue?: unknown;
  exportValues?: unknown;
  hidden?: boolean;
  defaultAppearanceData?: {
    fontName?: string;
    fontSize?: number;
    fontColor?: ArrayLike<number>;
  };
};

const CONFIDENCE_TAG_PREFIX = 'dullypdf:confidence=';
const DULLYPDF_APPEARANCE_METADATA_INFO_KEY = 'DullyPDFAppearance';
const DULLYPDF_APPEARANCE_METADATA_SCHEMA = 'dullypdf.appearance.v1';

export type DullyPdfAppearanceMetadata = {
  appearance: {
    globalFieldFont: FieldFontChoice;
    globalFieldFontSize: FieldFontSizeChoice;
    globalFieldFontColor: FieldFontColorChoice;
  };
  fields: Array<{
    name: string;
    page: number;
    type: 'text' | 'date';
    fontName?: PdfBase14FontName;
    fontSize?: FieldFontSizeChoice;
    fontColor?: FieldFontColorChoice;
  }>;
};

type ExtractFieldsOptions = {
  dullyAppearanceMetadata?: DullyPdfAppearanceMetadata | null;
};

function parseConfidenceTag(raw?: string): number | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  const idx = lower.indexOf(CONFIDENCE_TAG_PREFIX);
  if (idx !== -1) {
    const tagged = raw.slice(idx);
    const taggedMatch = tagged.match(/dullypdf:confidence=\s*([0-9]*\.?[0-9]+)/i);
    if (taggedMatch) {
      return parseConfidence(taggedMatch[1]);
    }
    return undefined;
  }
  const match = raw.match(/confidence\s*[:=]\s*([0-9.]+)/i);
  if (match) return parseConfidence(match[1]);
  return undefined;
}

function isConfidenceTag(raw?: string): boolean {
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower.includes(CONFIDENCE_TAG_PREFIX)) return true;
  // Also detect generic confidence-only labels like "confidence: 72" or "Confidence= 0.72"
  return /^\s*confidence\s*[:=]\s*[0-9.]+\s*$/.test(lower);
}

function extractFieldConfidence(annotation: PdfJsAnnotation): number | undefined {
  return (
    parseConfidenceTag(annotation.alternativeText) ??
    parseConfidenceTag(annotation.title)
  );
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function normalizeDullyPdfAppearanceMetadata(value: unknown): DullyPdfAppearanceMetadata | null {
  const record = metadataRecord(value);
  if (record.schema !== DULLYPDF_APPEARANCE_METADATA_SCHEMA) {
    return null;
  }
  const appearance = metadataRecord(record.appearance);
  const globalFieldFont = isPdfBase14FontName(appearance.globalFieldFont)
    ? appearance.globalFieldFont
    : DEFAULT_FIELD_FONT_CHOICE;
  const globalFieldFontSize = sanitizeFieldFontSizeChoice(
    appearance.globalFieldFontSize,
    DEFAULT_FIELD_FONT_SIZE_CHOICE,
  );
  const globalFieldFontColor = sanitizeFieldFontColorChoice(
    appearance.globalFieldFontColor,
    DEFAULT_FIELD_FONT_COLOR,
  );
  const fields = Array.isArray(record.fields)
    ? record.fields
        .map((entry): DullyPdfAppearanceMetadata['fields'][number] | null => {
          const fieldRecord = metadataRecord(entry);
          const name = typeof fieldRecord.name === 'string' ? fieldRecord.name.trim() : '';
          if (!name) return null;
          const page = Number(fieldRecord.page);
          const type = fieldRecord.type === 'date' ? 'date' : 'text';
          const normalizedField: DullyPdfAppearanceMetadata['fields'][number] = {
            name,
            page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
            type,
          };
          if (isPdfBase14FontName(fieldRecord.fontName)) {
            normalizedField.fontName = fieldRecord.fontName;
          }
          const fontSize = sanitizeFieldFontSizeOverride(fieldRecord.fontSize, 'global');
          if (fontSize !== 'global') {
            normalizedField.fontSize = fontSize;
          }
          const fontColor = sanitizeFieldFontColorOverride(fieldRecord.fontColor, 'global');
          if (fontColor !== 'global') {
            normalizedField.fontColor = sanitizeFieldFontColorChoice(fontColor, DEFAULT_FIELD_FONT_COLOR);
          }
          return normalizedField;
        })
        .filter((entry): entry is DullyPdfAppearanceMetadata['fields'][number] => entry !== null)
    : [];
  return {
    appearance: {
      globalFieldFont,
      globalFieldFontSize,
      globalFieldFontColor,
    },
    fields,
  };
}

export async function extractDullyPdfAppearanceMetadata(
  doc: Pick<PDFDocumentProxy, 'getMetadata'>,
): Promise<DullyPdfAppearanceMetadata | null> {
  try {
    const metadata = await doc.getMetadata();
    const info = metadataRecord((metadata as { info?: unknown })?.info);
    const custom = metadataRecord(info.Custom);
    const raw =
      info[DULLYPDF_APPEARANCE_METADATA_INFO_KEY] ??
      info[`/${DULLYPDF_APPEARANCE_METADATA_INFO_KEY}`] ??
      custom[DULLYPDF_APPEARANCE_METADATA_INFO_KEY] ??
      custom[`/${DULLYPDF_APPEARANCE_METADATA_INFO_KEY}`];
    if (typeof raw !== 'string' || !raw.trim()) {
      return null;
    }
    return normalizeDullyPdfAppearanceMetadata(JSON.parse(raw));
  } catch (error) {
    debugLog('Failed to parse DullyPDF appearance metadata', error);
    return null;
  }
}

export async function loadPdfFromFile(file: File): Promise<PDFDocumentProxy> {
  const buffer = await file.arrayBuffer();
  const initialOptions = {
    data: buffer,
    enableXfa: true,
    useSystemFonts: true,
  };

  try {
    const task = getDocument(initialOptions);
    const doc = await task.promise;
    if (await shouldPreferEmbeddedFontsForDisplay(doc)) {
      debugLog('Reloading Office-exported PDF with embedded-font preference on Windows', {
        name: file.name,
      });
      try {
        const reloadTask = getDocument({
          ...initialOptions,
          useSystemFonts: false,
        });
        const reloadedDoc = await reloadTask.promise;
        if (typeof doc.destroy === 'function') {
          void doc.destroy().catch(() => {});
        }
        debugLog('Reloaded PDF with embedded-font preference', { name: file.name, pages: reloadedDoc.numPages });
        return reloadedDoc;
      } catch (reloadError) {
        debugLog('Failed to reload PDF with embedded-font preference; keeping initial document', reloadError);
      }
    }
    debugLog('Loaded PDF', { name: file.name, pages: doc.numPages });
    return doc;
  } catch (error) {
    debugLog('Failed to load PDF', error);
    throw error;
  }
}

export async function loadPdfPageCountFromFile(
  file: File,
  options: { timeoutMs?: number } = {},
): Promise<number> {
  const buffer = await file.arrayBuffer();
  const task = getDocument({
    data: buffer,
    enableXfa: false,
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: true,
  });
  const timeoutMs = options.timeoutMs ?? DEFAULT_PAGE_COUNT_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const doc = await Promise.race<PDFDocumentProxy>([
      task.promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          void task.destroy();
          reject(new Error('Page counting timed out. Remove this PDF and try again.'));
        }, timeoutMs);
      }),
    ]);
    debugLog('Resolved PDF page count', { name: file.name, pages: doc.numPages });
    try {
      return Math.max(1, Number(doc.numPages) || 1);
    } finally {
      if (typeof doc.destroy === 'function') {
        void doc.destroy().catch(() => {});
      }
    }
  } catch (error) {
    debugLog('Failed to resolve PDF page count', { name: file.name, error });
    throw error;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

export async function loadPageSizes(doc: PDFDocumentProxy): Promise<Record<number, PageSize>> {
  const sizes: Record<number, PageSize> = {};
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    sizes[pageNum] = { width: viewport.width, height: viewport.height };
  }
  debugLog('Loaded page sizes', sizes);
  return sizes;
}

function mapAnnotationType(annotation: PdfJsAnnotation): FieldType {
  if (annotation.fieldType === 'Sig') {
    return 'signature';
  }
  if (annotation.fieldType === 'Btn') {
    if (annotation.radioButton) {
      return 'radio';
    }
    if (annotation.checkBox) {
      return 'checkbox';
    }
    return 'text';
  }
  if (annotation.fieldType === 'Tx') {
    return 'text';
  }
  if (annotation.fieldType === 'Ch') {
    return 'text';
  }
  return 'text';
}

function mapFieldObjectType(fieldType?: string): FieldType {
  const normalized = (fieldType || '').toLowerCase();
  if (normalized === 'radio') {
    return 'radio';
  }
  if (normalized === 'checkbox') {
    return 'checkbox';
  }
  if (normalized === 'signature') {
    return 'signature';
  }
  if (normalized === 'date') {
    return 'date';
  }
  return 'text';
}

function buildRectFromAnnotation(
  annotationRect: number[],
  pageSize: PageSize,
  viewport: { convertToViewportRectangle: (rect: number[]) => number[] },
): FieldRect | null {
  if (!annotationRect || annotationRect.length < 4) return null;
  // PDF rectangles use a bottom-left origin. Convert to top-left viewport coordinates.
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(annotationRect);
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  if (width < 1 || height < 1) return null;
  return clampRectToPage({ x, y, width, height }, pageSize, 2);
}

function coerceFieldValue(rawValue: unknown): PdfField['value'] | undefined {
  if (rawValue === undefined || rawValue === null) return undefined;
  if (Array.isArray(rawValue)) {
    return rawValue.join(', ');
  }
  if (
    typeof rawValue === 'string' ||
    typeof rawValue === 'number' ||
    typeof rawValue === 'boolean'
  ) {
    return rawValue;
  }
  return String(rawValue);
}

function clampRgbChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 0), 255);
}

function hexColorFromPdfJsColor(value: ArrayLike<number> | undefined): FieldFontColorChoice | undefined {
  if (!value || value.length < 3) return undefined;
  const rawChannels = [Number(value[0]), Number(value[1]), Number(value[2])];
  const usesUnitRange = rawChannels.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1);
  const channels = rawChannels.map((channel) => clampRgbChannel(usesUnitRange ? channel * 255 : channel));
  return sanitizeFieldFontColorChoice(
    `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
    DEFAULT_FIELD_FONT_COLOR,
  );
}

function normalizePdfJsFontName(value: unknown): PdfBase14FontName | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/^\//, '');
  if (isPdfBase14FontName(normalized)) return normalized;
  const resourceAliasMap: Record<string, PdfBase14FontName> = {
    Helv: 'Helvetica',
    HeBo: 'Helvetica-Bold',
    HeOb: 'Helvetica-Oblique',
    HeBO: 'Helvetica-BoldOblique',
    Time: 'Times-Roman',
    TiBo: 'Times-Bold',
    TiIt: 'Times-Italic',
    TiBI: 'Times-BoldItalic',
    Cour: 'Courier',
    CoBo: 'Courier-Bold',
    CoOb: 'Courier-Oblique',
    CoBO: 'Courier-BoldOblique',
  };
  return resourceAliasMap[normalized];
}

function applyPdfJsDefaultAppearance(
  field: PdfField,
  appearanceData: PdfJsAnnotation['defaultAppearanceData'] | PdfJsFieldObject['defaultAppearanceData'],
): PdfField {
  if (field.type !== 'text' && field.type !== 'date') {
    return field;
  }
  const next: PdfField = { ...field };
  const fontName = normalizePdfJsFontName(appearanceData?.fontName);
  if (fontName) {
    next.fontName = fontName;
  }
  const fontSize = sanitizeFieldFontSizeOverride(appearanceData?.fontSize, 'global');
  if (fontSize !== 'global') {
    next.fontSize = fontSize;
  }
  const fontColor = hexColorFromPdfJsColor(appearanceData?.fontColor);
  if (fontColor) {
    next.fontColor = fontColor;
  }
  return next;
}

function appearanceMetadataKey(field: Pick<PdfField, 'name' | 'page' | 'type'>): string {
  return `${field.page}\n${field.type}\n${field.name}`;
}

function buildAppearanceMetadataQueues(
  metadata: DullyPdfAppearanceMetadata | null | undefined,
): Map<string, DullyPdfAppearanceMetadata['fields']> {
  const queues = new Map<string, DullyPdfAppearanceMetadata['fields']>();
  for (const field of metadata?.fields ?? []) {
    const key = appearanceMetadataKey(field);
    const queue = queues.get(key);
    if (queue) {
      queue.push(field);
    } else {
      queues.set(key, [field]);
    }
  }
  return queues;
}

function applyDullyPdfFieldAppearance(
  field: PdfField,
  metadataQueues: Map<string, DullyPdfAppearanceMetadata['fields']>,
): PdfField {
  if (field.type !== 'text' && field.type !== 'date') {
    return field;
  }
  const queue = metadataQueues.get(appearanceMetadataKey(field));
  const metadata = queue?.shift();
  if (!metadata) {
    return field;
  }
  const next: PdfField = { ...field };
  if (metadata.fontName) {
    next.fontName = metadata.fontName;
  }
  if (metadata.fontSize !== undefined) {
    next.fontSize = metadata.fontSize;
  }
  if (metadata.fontColor) {
    next.fontColor = metadata.fontColor;
  }
  return next;
}

export async function extractFieldsFromPdf(
  doc: PDFDocumentProxy,
  options: ExtractFieldsOptions = {},
): Promise<PdfField[]> {
  const fields: PdfField[] = [];
  const existingNames = new Set<string>();
  const dullyAppearanceMetadata =
    options.dullyAppearanceMetadata === undefined
      ? await extractDullyPdfAppearanceMetadata(doc)
      : options.dullyAppearanceMetadata;
  const dullyAppearanceMetadataQueues = buildAppearanceMetadataQueues(dullyAppearanceMetadata);

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const pageSize = { width: viewport.width, height: viewport.height };
    const annotations = (await page.getAnnotations({ intent: 'display' })) as PdfJsAnnotation[];
    let widgetCount = 0;
    let fieldIndex = 1;

    for (const annotation of annotations) {
      const isWidget =
        annotation.subtype === 'Widget' || annotation.annotationType === 20 || !!annotation.fieldType;
      if (!isWidget) continue;
      widgetCount += 1;
      const rect = buildRectFromAnnotation(annotation.rect || [], pageSize, viewport);
      if (!rect) continue;

      const altText = annotation.alternativeText?.trim();
      const safeAltText = altText && !isConfidenceTag(altText) ? altText : '';
      const titleText = annotation.title?.trim();
      const safeTitle = titleText && !isConfidenceTag(titleText) ? titleText : '';
      const rawName = (annotation.fieldName || safeAltText || safeTitle || '').trim();
      const baseName = rawName || `field_${pageNum}_${fieldIndex}`;
      const name = ensureUniqueFieldName(baseName, existingNames);
      const type = mapAnnotationType(annotation);
      const fieldConfidence = extractFieldConfidence(annotation);
      const rawValue = annotation.fieldValue ?? annotation.defaultFieldValue;
      const value = coerceFieldValue(rawValue);
      const hasValue =
        value !== undefined && (typeof value !== 'string' || value.trim() !== '');

      const baseField: PdfField = {
        id: makeId(),
        name,
        type,
        page: pageNum,
        rect,
        ...(fieldConfidence !== undefined ? { fieldConfidence } : {}),
        ...(hasValue ? { value } : {}),
      };
      const field = applyDullyPdfFieldAppearance(
        dullyAppearanceMetadata ? baseField : applyPdfJsDefaultAppearance(baseField, annotation.defaultAppearanceData),
        dullyAppearanceMetadataQueues,
      );
      fields.push(field);

      if (DEBUG_PDF && fieldIndex <= 6) {
        debugLog('Widget', {
          page: pageNum,
          fieldType: annotation.fieldType,
          subtype: annotation.subtype,
          annotationType: annotation.annotationType,
          fieldName: annotation.fieldName,
          rect,
        });
      }

      fieldIndex += 1;
    }

    debugLog('Page annotations', {
      page: pageNum,
      total: annotations.length,
      widgets: widgetCount,
    });
  }

  if (fields.length > 0) {
    debugLog('Extracted fields', { total: fields.length });
    return fields;
  }

  const fieldObjects = (await doc.getFieldObjects()) as Record<string, PdfJsFieldObject[]> | null;
  if (!fieldObjects) {
    debugLog('Extracted fields', { total: fields.length });
    return fields;
  }

  const pageCache = new Map<
    number,
    {
      viewport: {
        width: number;
        height: number;
        convertToViewportRectangle: (rect: number[]) => number[];
      };
      pageSize: PageSize;
    }
  >();
  const getPageContext = async (pageNum: number) => {
    if (pageCache.has(pageNum)) {
      return pageCache.get(pageNum)!;
    }
    if (pageNum < 1 || pageNum > doc.numPages) return null;
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const pageSize = { width: viewport.width, height: viewport.height };
    const context = { viewport, pageSize };
    pageCache.set(pageNum, context);
    return context;
  };

  let fallbackIndex = 1;
  const fieldEntries = Object.values(fieldObjects).flat();
  debugLog('Field objects available', { total: fieldEntries.length });

  for (const fieldObject of fieldEntries) {
    const pageIndex = typeof fieldObject.page === 'number' ? fieldObject.page : 0;
    const pageNum = Math.min(Math.max(pageIndex + 1, 1), doc.numPages);
    const pageContext = await getPageContext(pageNum);
    if (!pageContext) continue;
    const rect = buildRectFromAnnotation(fieldObject.rect || [], pageContext.pageSize, pageContext.viewport);
    if (!rect) continue;

    const rawName = (fieldObject.name || '').trim();
    const baseName = rawName || `field_${pageNum}_${fallbackIndex}`;
    const name = ensureUniqueFieldName(baseName, existingNames);
    const type = mapFieldObjectType(fieldObject.type);
    const rawValue = fieldObject.value ?? fieldObject.defaultValue;
    const value = coerceFieldValue(rawValue);
    const hasValue =
      value !== undefined && (typeof value !== 'string' || value.trim() !== '');

    const baseField: PdfField = {
      id: makeId(),
      name,
      type,
      page: pageNum,
      rect,
      ...(hasValue ? { value } : {}),
    };
    const field = applyDullyPdfFieldAppearance(
      dullyAppearanceMetadata ? baseField : applyPdfJsDefaultAppearance(baseField, fieldObject.defaultAppearanceData),
      dullyAppearanceMetadataQueues,
    );
    fields.push(field);

    fallbackIndex += 1;
  }

  debugLog('Extracted fields from field objects', { total: fields.length });
  return fields;
}
