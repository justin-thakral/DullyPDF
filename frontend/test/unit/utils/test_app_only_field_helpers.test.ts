import { afterEach, describe, expect, it, vi } from 'vitest';
import bwipjs from 'bwip-js/browser';

import { BARCODE_ID_LENGTH, barcodeDigitsFromValue, generateBarcodeDataUrl, isCompleteBarcodeValue } from '../../../src/utils/barcode';
import { IMAGE_ACCEPT, isSupportedImageFile, readImageFileAsDataUrl } from '../../../src/utils/images';
import { buildPdf417ScanText, generatePdf417DataUrl, resolvePdf417AgeStatus } from '../../../src/utils/pdf417';
import { QR_VALUE_MAX_LENGTH, generateQrDataUrl, isCompleteQrValue, qrTextFromValue } from '../../../src/utils/qr';
import { dependencyRefForField, resolveBarcodeValue, resolvePdf417Data, resolveQrValue } from '../../../src/utils/appOnlyFieldDependencies';
import type { PdfField } from '../../../src/types';

vi.mock('bwip-js/browser', () => ({
  default: {
    toCanvas: vi.fn(),
  },
}));

afterEach(() => {
  vi.mocked(bwipjs.toCanvas).mockReset();
});

describe('app-only field helpers', () => {
  const sourceFields: PdfField[] = [
    {
      id: 'first-name',
      name: 'First Name',
      type: 'text',
      page: 1,
      rect: { x: 0, y: 0, width: 100, height: 20 },
      value: 'Ada',
    },
    {
      id: 'last-name',
      name: 'Last Name',
      type: 'text',
      page: 1,
      rect: { x: 0, y: 24, width: 100, height: 20 },
      value: 'Lovelace',
    },
    {
      id: 'dob',
      name: 'DOB',
      type: 'text',
      page: 1,
      rect: { x: 0, y: 48, width: 100, height: 20 },
      value: '1815-12-10',
    },
    {
      id: 'member-id',
      name: 'Member ID',
      type: 'text',
      page: 1,
      rect: { x: 0, y: 72, width: 100, height: 20 },
      value: '123456789',
    },
  ];

  it('normalizes 1D barcode values to exactly the supported digit payload', () => {
    expect(BARCODE_ID_LENGTH).toBe(9);
    expect(barcodeDigitsFromValue('12-34 abc567890')).toBe('123456789');
    expect(isCompleteBarcodeValue('12345678')).toBe(false);
    expect(isCompleteBarcodeValue('123456789')).toBe(true);
    expect(generateBarcodeDataUrl('12345678')).toBeNull();
  });

  it('generates Code 128 barcode images through bwip-js', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,barcode');

    expect(generateBarcodeDataUrl('987654321')).toBe('data:image/png;base64,barcode');
    expect(bwipjs.toCanvas).toHaveBeenCalledTimes(1);
    expect(vi.mocked(bwipjs.toCanvas).mock.calls[0]?.[1]).toMatchObject({
      bcid: 'code128',
      text: '987654321',
    });
  });

  it('resolves barcode dependencies by field id before name fallback', () => {
    const barcodeField: PdfField = {
      id: 'barcode',
      name: 'Barcode',
      type: 'barcode',
      page: 1,
      rect: { x: 0, y: 96, width: 200, height: 52 },
      value: null,
      barcodeSourceField: {
        fieldId: 'member-id',
        fieldName: 'Old Member ID Name',
      },
    };

    expect(resolveBarcodeValue(barcodeField, sourceFields)).toMatchObject({
      digits: '123456789',
      status: 'ready',
      message: 'Scans as 123456789',
    });

    expect(resolveBarcodeValue({
      ...barcodeField,
      barcodeSourceField: { fieldId: 'missing', fieldName: 'Member ID' },
    }, sourceFields)).toMatchObject({
      digits: '123456789',
      status: 'ready',
    });
  });

  it('surfaces blank, missing, and invalid barcode dependency states', () => {
    const barcodeField: PdfField = {
      id: 'barcode',
      name: 'Barcode',
      type: 'barcode',
      page: 1,
      rect: { x: 0, y: 96, width: 200, height: 52 },
      value: null,
      barcodeSourceField: dependencyRefForField(sourceFields[0]),
    };

    expect(resolveBarcodeValue({
      ...barcodeField,
      barcodeSourceField: { fieldId: 'missing', fieldName: 'Missing' },
    }, sourceFields).status).toBe('missing');
    expect(resolveBarcodeValue(barcodeField, [
      { ...sourceFields[0], value: '' },
    ]).status).toBe('blank');
    expect(resolveBarcodeValue(barcodeField, [
      { ...sourceFields[0], value: '123-456-789' },
    ]).status).toBe('invalid');
  });

  it('builds PDF417 scan text and age status without route-specific assumptions', () => {
    const today = new Date(2026, 4, 19);

    expect(resolvePdf417AgeStatus('2005-05-19', today)).toBe('OVER 21');
    expect(resolvePdf417AgeStatus('2005-05-20', today)).toBe('UNDER 21');
    expect(resolvePdf417AgeStatus('not-a-date', today)).toBe('AGE UNKNOWN');
    expect(buildPdf417ScanText('Grace Brewster Hopper', '1906-12-09')).toContain('FIRST NAME: Grace');
    expect(buildPdf417ScanText({
      firstName: 'Ada',
      lastName: 'Lovelace',
      dob: '1815-12-10',
      customerId: 'AL-1',
    })).toContain('CUSTOMER ID: AL-1');
  });

  it('resolves PDF417 dependency mappings over manual fallback values', () => {
    const pdf417Field: PdfField = {
      id: 'pdf417',
      name: 'PDF417',
      type: 'pdf417',
      page: 1,
      rect: { x: 0, y: 96, width: 220, height: 78 },
      value: null,
      pdf417Name: 'Manual Name',
      pdf417Dob: '1900-01-01',
      pdf417FieldMappings: {
        firstName: dependencyRefForField(sourceFields[0]),
        lastName: dependencyRefForField(sourceFields[1]),
        dob: dependencyRefForField(sourceFields[2]),
        customerId: dependencyRefForField(sourceFields[3]),
      },
    };

    const resolved = resolvePdf417Data(pdf417Field, sourceFields);

    expect(resolved.isComplete).toBe(true);
    expect(resolved.messages).toEqual([]);
    expect(resolved.data).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
      dob: '1815-12-10',
      customerId: '123456789',
    });
  });

  it('resolves QR values from manual text or source field dependencies', () => {
    const qrField: PdfField = {
      id: 'qr',
      name: 'QR',
      type: 'qr',
      page: 1,
      rect: { x: 0, y: 96, width: 110, height: 110 },
      value: ' https://example.com/member/123 ',
    };

    expect(QR_VALUE_MAX_LENGTH).toBe(2000);
    expect(qrTextFromValue(` ${'x'.repeat(QR_VALUE_MAX_LENGTH + 5)} `)).toHaveLength(QR_VALUE_MAX_LENGTH);
    expect(isCompleteQrValue('https://example.com')).toBe(true);
    expect(resolveQrValue(qrField, sourceFields)).toMatchObject({
      value: 'https://example.com/member/123',
      status: 'ready',
    });
    expect(resolveQrValue({
      ...qrField,
      value: null,
      qrSourceField: dependencyRefForField(sourceFields[3]),
    }, sourceFields)).toMatchObject({
      value: '123456789',
      status: 'ready',
    });
  });

  it('generates PDF417 images through bwip-js', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,pdf417');

    const text = buildPdf417ScanText({ firstName: 'Katherine', lastName: 'Johnson', dob: '1918-08-26' });

    expect(generatePdf417DataUrl(text)).toBe('data:image/png;base64,pdf417');
    expect(bwipjs.toCanvas).toHaveBeenCalledTimes(1);
    expect(vi.mocked(bwipjs.toCanvas).mock.calls[0]?.[1]).toMatchObject({
      bcid: 'pdf417',
      text,
    });
  });

  it('generates QR images through bwip-js', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,qr');

    expect(generateQrDataUrl('https://example.com/verify')).toBe('data:image/png;base64,qr');
    expect(bwipjs.toCanvas).toHaveBeenCalledTimes(1);
    expect(vi.mocked(bwipjs.toCanvas).mock.calls[0]?.[1]).toMatchObject({
      bcid: 'qrcode',
      text: 'https://example.com/verify',
    });
  });

  it('accepts PNG/JPEG images and rejects unsupported uploads', async () => {
    expect(IMAGE_ACCEPT).toContain('image/png');
    expect(isSupportedImageFile(new File(['x'], 'photo.png', { type: 'image/png' }))).toBe(true);
    expect(isSupportedImageFile(new File(['x'], 'photo.jpeg', { type: 'image/jpeg' }))).toBe(true);
    expect(isSupportedImageFile(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toBe(false);

    const image = await readImageFileAsDataUrl(new File(['image-bytes'], 'photo.png', { type: 'image/png' }));
    expect(image).toEqual({
      imageDataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      imageMimeType: 'image/png',
      imageName: 'photo.png',
    });
    await expect(readImageFileAsDataUrl(new File(['x'], 'notes.txt', { type: 'text/plain' })))
      .rejects
      .toThrow('Only PNG and JPEG images are supported.');
  });
});
