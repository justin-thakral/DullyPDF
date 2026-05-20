import bwipjs from 'bwip-js/browser';
import type { PdfField } from '../types';

export const BARCODE_ID_LENGTH = 9;

const barcodeDataUrlCache = new Map<string, string>();

export function barcodeDigitsFromValue(value: PdfField['value'] | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D/g, '').slice(0, BARCODE_ID_LENGTH);
}

export function isCompleteBarcodeValue(value: PdfField['value'] | null | undefined): boolean {
  return barcodeDigitsFromValue(value).length === BARCODE_ID_LENGTH;
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
