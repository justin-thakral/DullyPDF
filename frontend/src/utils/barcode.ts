import bwipjs from 'bwip-js/browser';
import type { FieldRect, PageSize, PdfField } from '../types';
import { clamp, clampRectToPage } from './coords';

export const BARCODE_ID_LENGTH = 9;
export const BARCODE_9_DIGIT_FIELD_ASPECT_RATIO = 351 / 127;

const barcodeDataUrlCache = new Map<string, string>();

export function barcodeDigitsFromValue(value: PdfField['value'] | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D/g, '').slice(0, BARCODE_ID_LENGTH);
}

export function isCompleteBarcodeValue(value: PdfField['value'] | null | undefined): boolean {
  return barcodeDigitsFromValue(value).length === BARCODE_ID_LENGTH;
}

type BarcodeVerticalAnchor = 'top' | 'center' | 'bottom';
type BarcodeHorizontalAnchor = 'left' | 'center' | 'right';

function barcodeSizeFromWidth(width: number, page: PageSize, minHeight: number) {
  const maxWidth = Math.max(1, Math.min(page.width, page.height * BARCODE_9_DIGIT_FIELD_ASPECT_RATIO));
  const minimumWidth = Math.min(maxWidth, minHeight * BARCODE_9_DIGIT_FIELD_ASPECT_RATIO);
  const nextWidth = clamp(Number.isFinite(width) ? width : minimumWidth, minimumWidth, maxWidth);
  return {
    width: nextWidth,
    height: nextWidth / BARCODE_9_DIGIT_FIELD_ASPECT_RATIO,
  };
}

function barcodeSizeFromHeight(height: number, page: PageSize, minHeight: number) {
  const maxHeight = Math.max(1, Math.min(page.height, page.width / BARCODE_9_DIGIT_FIELD_ASPECT_RATIO));
  const minimumHeight = Math.min(maxHeight, minHeight);
  const nextHeight = clamp(Number.isFinite(height) ? height : minimumHeight, minimumHeight, maxHeight);
  return {
    width: nextHeight * BARCODE_9_DIGIT_FIELD_ASPECT_RATIO,
    height: nextHeight,
  };
}

export function barcodeRectFromWidth(
  rect: FieldRect,
  page: PageSize,
  minHeight: number,
  anchorY: BarcodeVerticalAnchor = 'top',
): FieldRect {
  const size = barcodeSizeFromWidth(rect.width, page, minHeight);
  const y = anchorY === 'center'
    ? rect.y + rect.height / 2 - size.height / 2
    : anchorY === 'bottom'
      ? rect.y + rect.height - size.height
      : rect.y;
  return clampRectToPage({ x: rect.x, y, ...size }, page, 1);
}

export function barcodeRectFromHeight(
  rect: FieldRect,
  page: PageSize,
  minHeight: number,
  anchorX: BarcodeHorizontalAnchor = 'left',
): FieldRect {
  const size = barcodeSizeFromHeight(rect.height, page, minHeight);
  const x = anchorX === 'center'
    ? rect.x + rect.width / 2 - size.width / 2
    : anchorX === 'right'
      ? rect.x + rect.width - size.width
      : rect.x;
  return clampRectToPage({ x, y: rect.y, ...size }, page, 1);
}

export function normalizeBarcodeFieldRect(rect: FieldRect, page: PageSize, minHeight: number): FieldRect {
  const safeWidth = Math.max(1, rect.width);
  const safeHeight = Math.max(1, rect.height);
  return safeWidth / safeHeight > BARCODE_9_DIGIT_FIELD_ASPECT_RATIO
    ? barcodeRectFromHeight(rect, page, minHeight)
    : barcodeRectFromWidth(rect, page, minHeight);
}

export function generateBarcodeDataUrl(value: PdfField['value'] | null | undefined): string | null {
  const digits = barcodeDigitsFromValue(value);
  if (digits.length !== BARCODE_ID_LENGTH || typeof document === 'undefined') {
    return null;
  }
  const cached = barcodeDataUrlCache.get(digits);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  try {
    bwipjs.toCanvas(canvas, {
      bcid: 'code128',
      text: digits,
      scale: 3,
      height: 12,
      includetext: false,
      paddingwidth: 8,
      paddingheight: 4,
      backgroundcolor: 'FFFFFF',
    });
    const dataUrl = canvas.toDataURL('image/png');
    barcodeDataUrlCache.set(digits, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}
