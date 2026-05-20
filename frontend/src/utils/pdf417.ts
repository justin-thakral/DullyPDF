import bwipjs from 'bwip-js/browser';
import type { Pdf417ScanData, PdfField } from '../types';
import type { ResolvedBarcodeClass } from './appOnlyFieldDependencies';

export type Pdf417AgeStatus = 'OVER 21' | 'UNDER 21' | 'AGE UNKNOWN';

const pdf417DataUrlCache = new Map<string, string>();

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function parseDateParts(raw: string | null | undefined): DateParts | null {
  const value = String(raw || '').trim();
  const match = value.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return { year, month, day };
}

function todayParts(today = new Date()): DateParts {
  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
}

export function resolvePdf417AgeStatus(
  dob: string | null | undefined,
  today = new Date(),
): Pdf417AgeStatus {
  const birth = parseDateParts(dob);
  if (!birth) return 'AGE UNKNOWN';
  const current = todayParts(today);
  if (
    birth.year > current.year ||
    (birth.year === current.year && birth.month > current.month) ||
    (birth.year === current.year && birth.month === current.month && birth.day > current.day)
  ) {
    return 'AGE UNKNOWN';
  }

  let age = current.year - birth.year;
  if (current.month < birth.month || (current.month === birth.month && current.day < birth.day)) {
    age -= 1;
  }
  return age >= 21 ? 'OVER 21' : 'UNDER 21';
}

function cleanScanValue(value: string | null | undefined): string {
  return String(value || '').trim();
}

function splitLegacyName(name: string | null | undefined): Pick<Pdf417ScanData, 'firstName' | 'middleName' | 'lastName'> {
  const parts = cleanScanValue(name).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

export function buildPdf417ScanText(
  dataOrName: Pdf417ScanData | string | null | undefined,
  dob?: string | null | undefined,
): string {
  const data: Pdf417ScanData = typeof dataOrName === 'object' && dataOrName !== null
    ? dataOrName
    : { ...splitLegacyName(dataOrName), dob };

  const fullName = [
    data.firstName,
    data.middleName,
    data.lastName,
  ].map(cleanScanValue).filter(Boolean).join(' ');

  return [
    ['FIRST NAME', data.firstName],
    ['MIDDLE NAME', data.middleName],
    ['LAST NAME', data.lastName],
    ['NAME', fullName],
    ['STREET ADDRESS', data.streetAddress],
    ['CITY', data.city],
    ['STATE', data.state],
    ['ZIP', data.zip],
    ['DOB', data.dob],
    ['SEX', data.sex],
    ['EYE COLOR', data.eyeColor],
    ['HEIGHT', data.height],
    ['CUSTOMER ID', data.customerId],
    ['ISSUE DATE', data.issueDate],
    ['EXPIRATION DATE', data.expirationDate],
  ].map(([label, value]) => `${label}: ${cleanScanValue(value)}`).join('\n');
}

export function fieldPdf417ScanText(field: PdfField): string {
  return buildPdf417ScanText(field.pdf417Data ?? field.pdf417Name, field.pdf417Dob);
}

/**
 * Build a PDF417 scan text payload from user-defined barcode classes.
 * Each ready/manual class emits a "LABEL: value" line; unresolved classes are
 * skipped so the preview only ever reflects values that will actually export.
 */
export function buildPdf417ScanTextFromClasses(classes: ResolvedBarcodeClass[]): string {
  return classes
    .filter((entry) => entry.status === 'ready' || entry.status === 'manual')
    .map((entry) => {
      const label = String(entry.class.label || '').trim().toUpperCase();
      const value = cleanScanValue(entry.value);
      return `${label}: ${value}`;
    })
    .join('\n');
}

export function generatePdf417DataUrl(text: string): string | null {
  if (!text || typeof document === 'undefined') {
    return null;
  }
  const cached = pdf417DataUrlCache.get(text);
  if (cached) {
    return cached;
  }
  const canvas = document.createElement('canvas');
  try {
    bwipjs.toCanvas(canvas, {
      bcid: 'pdf417',
      text,
      scale: 2,
      paddingwidth: 8,
      paddingheight: 8,
      backgroundcolor: 'FFFFFF',
    });
    const dataUrl = canvas.toDataURL('image/png');
    pdf417DataUrlCache.set(text, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}
