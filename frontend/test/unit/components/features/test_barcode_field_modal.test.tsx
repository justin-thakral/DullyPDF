import { beforeEach, describe, expect, it, vi } from 'vitest';

const bwipToCanvasMock = vi.hoisted(() => vi.fn());

vi.mock('bwip-js/browser', () => ({
  default: {
    toCanvas: bwipToCanvasMock,
  },
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BarcodeFieldModal } from '../../../../src/components/features/BarcodeFieldModal';
import type { BarcodeClass, PdfField } from '../../../../src/types';

const SOURCE_FIELD: PdfField = {
  id: 'source',
  name: 'Member ID',
  type: 'text',
  page: 1,
  rect: { x: 10, y: 10, width: 80, height: 20 },
  value: '864209753',
};

const POLICY_FIELD: PdfField = {
  id: 'policy',
  name: 'Policy Number',
  type: 'text',
  page: 1,
  rect: { x: 10, y: 40, width: 80, height: 20 },
  value: 'POL-42',
};

function modalField(type: 'pdf417' | 'barcode' | 'qr', barcodeClasses: BarcodeClass[]): PdfField {
  return {
    id: `${type}-field`,
    name: `${type} helper`,
    type,
    page: 1,
    rect: { x: 20, y: 20, width: 120, height: 48 },
    value: '',
    barcodeClasses,
  };
}

describe('BarcodeFieldModal', () => {
  beforeEach(() => {
    bwipToCanvasMock.mockClear();
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,barcode');
  });

  it.each([
    {
      type: 'pdf417' as const,
      title: 'PDF417 Setup',
      contentTitle: 'Encoded Classes',
      valueLabel: 'Class value',
      saveLabel: 'Save PDF417 Setup',
      classes: [{ id: 'pdf417-class', label: 'ACCOUNT ID', mode: 'manual' as const, manualValue: 'A123' }],
    },
    {
      type: 'barcode' as const,
      title: '1D Code 128 Setup',
      contentTitle: 'Encoded Value',
      valueLabel: '9 digit value',
      saveLabel: 'Save 1D Code 128 Setup',
      classes: [{ id: 'barcode-class', label: 'Value', mode: 'manual' as const, manualValue: '135792468' }],
    },
    {
      type: 'qr' as const,
      title: 'QR Code Setup',
      contentTitle: 'Encoded Value',
      valueLabel: 'QR text',
      saveLabel: 'Save QR Code Setup',
      classes: [{ id: 'qr-class', label: 'Value', mode: 'manual' as const, manualValue: 'https://example.test' }],
    },
  ])('renders a consistent setup shell for $title', ({ type, title, contentTitle, valueLabel, saveLabel, classes }) => {
    const field = modalField(type, classes);

    render(
      <BarcodeFieldModal
        open
        field={field}
        fields={[SOURCE_FIELD, field]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: title })).toBeTruthy();
    expect(screen.getByRole('heading', { name: contentTitle })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Preview' })).toBeTruthy();
    expect(screen.getByText(valueLabel)).toBeTruthy();
    expect(screen.getByRole('button', { name: saveLabel })).toBeTruthy();
  });

  it('renders numeric QR values through the QR generator', () => {
    const field = modalField('qr', [
      { id: 'qr-numeric-class', label: 'Value', mode: 'manual', manualValue: '864209753' },
    ]);

    render(
      <BarcodeFieldModal
        open
        field={field}
        fields={[SOURCE_FIELD, field]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(bwipToCanvasMock).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({
        bcid: 'qrcode',
        text: '864209753',
      }),
    );
    expect(bwipToCanvasMock).not.toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({
        bcid: 'code128',
        text: '864209753',
      }),
    );
  });

  it('requires manual Code 128 setup to contain exactly 9 digits before saving', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const field = modalField('barcode', []);

    render(
      <BarcodeFieldModal
        open
        field={field}
        fields={[SOURCE_FIELD, field]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const saveButton = screen.getByRole('button', { name: 'Save 1D Code 128 Setup' });
    expect(saveButton).toHaveProperty('disabled', true);
    expect(screen.getByRole('alert').textContent).toContain('Enter exactly 9 digits');

    await user.type(screen.getByLabelText('9 digit value'), '12345');
    expect(saveButton).toHaveProperty('disabled', true);

    await user.clear(screen.getByLabelText('9 digit value'));
    await user.type(screen.getByLabelText('9 digit value'), '123456789');
    expect(saveButton).toHaveProperty('disabled', false);
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledWith(
      field.id,
      expect.objectContaining({
        barcodeClasses: [
          expect.objectContaining({
            mode: 'manual',
            manualValue: '123456789',
          }),
        ],
      }),
    );
  });

  it('allows Code 128 setup to save a selected source field without a current 9 digit sample', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const sourceWithoutValue: PdfField = { ...SOURCE_FIELD, value: '' };
    const field = modalField('barcode', []);

    render(
      <BarcodeFieldModal
        open
        field={field}
        fields={[sourceWithoutValue, field]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByText('From field'));
    const saveButton = screen.getByRole('button', { name: 'Save 1D Code 128 Setup' });
    expect(saveButton).toHaveProperty('disabled', true);
    await user.click(screen.getByRole('option', { name: /Member ID/i }));
    expect(saveButton).toHaveProperty('disabled', false);
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledWith(
      field.id,
      expect.objectContaining({
        barcodeClasses: [
          expect.objectContaining({
            mode: 'field',
            fieldRef: {
              fieldId: sourceWithoutValue.id,
              fieldName: sourceWithoutValue.name,
            },
          }),
        ],
      }),
    );
  });

  it('filters source fields by typing before selecting a barcode dependency', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const field = modalField('qr', []);

    render(
      <BarcodeFieldModal
        open
        field={field}
        fields={[SOURCE_FIELD, POLICY_FIELD, field]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByText('From field'));
    expect(screen.getByRole('option', { name: /Member ID/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Policy Number/i })).toBeTruthy();

    await user.type(screen.getByLabelText('Source field'), 'policy');
    expect(screen.queryByRole('option', { name: /Member ID/i })).toBeNull();
    const policyOption = screen.getByRole('option', { name: /Policy Number/i });
    await user.click(policyOption);
    await user.click(screen.getByRole('button', { name: 'Save QR Code Setup' }));

    expect(onSave).toHaveBeenCalledWith(
      field.id,
      expect.objectContaining({
        barcodeClasses: [
          expect.objectContaining({
            mode: 'field',
            fieldRef: {
              fieldId: POLICY_FIELD.id,
              fieldName: POLICY_FIELD.name,
            },
          }),
        ],
      }),
    );
  });
});
