import bwipjs from 'bwip-js/browser';
import type { PdfField } from '../types';

export const QR_VALUE_MAX_LENGTH = 2000;

const qrDataUrlCache = new Map<string, string>();

export function qrTextFromValue(value: PdfField['value'] | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, QR_VALUE_MAX_LENGTH);
}

export function isCompleteQrValue(value: PdfField['value'] | null | undefined): boolean {
  return qrTextFromValue(value).length > 0;
}

export function generateQrDataUrl(value: PdfField['value'] | null | undefined): string | null {
  const text = qrTextFromValue(value);
  if (!text || typeof document === 'undefined') {
    return null;
  }
  const cached = qrDataUrlCache.get(text);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  try {
    bwipjs.toCanvas(canvas, {
      bcid: 'qrcode',
      text,
      scale: 3,
      paddingwidth: 8,
      paddingheight: 8,
      backgroundcolor: 'FFFFFF',
    });
    const dataUrl = canvas.toDataURL('image/png');
    qrDataUrlCache.set(text, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}
