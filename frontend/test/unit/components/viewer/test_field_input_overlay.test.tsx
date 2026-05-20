import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import type { PdfField } from '../../../../src/types';
import { FieldInputOverlay } from '../../../../src/components/viewer/FieldInputOverlay';

vi.mock('bwip-js/browser', () => ({
  default: {
    toCanvas: vi.fn(),
  },
}));

function makeField(overrides: Partial<PdfField> & Pick<PdfField, 'id' | 'name' | 'type'>): PdfField {
  return {
    id: overrides.id,
    name: overrides.name,
    type: overrides.type,
    page: 1,
    rect: { x: 10, y: 20, width: 100, height: 20 },
    ...overrides,
  };
}

function StatefulOverlay({
  initialFields,
  onSelectField,
  onUpdateField,
}: {
  initialFields: PdfField[];
  onSelectField: (fieldId: string) => void;
  onUpdateField: (fieldId: string, updates: Partial<PdfField>) => void;
}) {
  const [fields, setFields] = useState<PdfField[]>(initialFields);

  return (
    <FieldInputOverlay
      fields={fields}
      pageSize={{ width: 200, height: 100 }}
      scale={1}
      globalFieldFont="default"
      globalFieldFontSize="auto"
      globalFieldFontColor="#000000"
      globalFieldAlignment="left"
      selectedFieldId={null}
      onSelectField={onSelectField}
      onUpdateField={(fieldId, updates) => {
        onUpdateField(fieldId, updates);
        setFields((prev) =>
          prev.map((field) => (field.id === fieldId ? { ...field, ...updates } : field)),
        );
      }}
      onSelectRadioField={vi.fn()}
    />
  );
}

describe('FieldInputOverlay', () => {
  it('renders text and choice input types with coerced values and scaled geometry', () => {
    const fields = [
      makeField({
        id: 'text',
        name: 'amount',
        type: 'text',
        rect: { x: 5, y: 10, width: 60, height: 12 },
        value: 42,
      }),
      makeField({
        id: 'date',
        name: 'visit_date',
        type: 'text',
        rect: { x: 20, y: 12, width: 40, height: 10 },
        value: '2025-01-02',
      }),
      makeField({
        id: 'checkbox',
        name: 'has_consent',
        type: 'checkbox',
        rect: { x: 15, y: 30, width: 10, height: 10 },
        value: 'yes',
      }),
      makeField({
        id: 'radio',
        name: 'consent_yes',
        type: 'radio',
        rect: { x: 35, y: 30, width: 10, height: 10 },
        radioOptionKey: 'yes',
        value: 'yes',
      }),
    ];

    const { container } = render(
      <FieldInputOverlay
        fields={fields}
        pageSize={{ width: 200, height: 100 }}
        scale={2}
        globalFieldFont="default"
        globalFieldFontSize="auto"
        globalFieldFontColor="#000000"
        globalFieldAlignment="left"
        selectedFieldId="text"
        onSelectField={vi.fn()}
        onUpdateField={vi.fn()}
        onSelectRadioField={vi.fn()}
      />,
    );

    const layer = container.querySelector('.field-layer') as HTMLDivElement;
    expect(layer.style.width).toBe('400px');
    expect(layer.style.height).toBe('200px');

    const textInput = screen.getByLabelText('amount') as HTMLInputElement;
    const dateInput = screen.getByLabelText('visit_date') as HTMLInputElement;
    const checkboxInput = screen.getByRole('checkbox', { name: 'has_consent' }) as HTMLInputElement;
    const radioInput = screen.getByRole('radio', { name: 'consent_yes' }) as HTMLInputElement;

    expect(textInput.type).toBe('text');
    expect(textInput.value).toBe('42');
    expect(dateInput.type).toBe('text');
    expect(dateInput.value).toBe('2025-01-02');
    expect(checkboxInput.checked).toBe(true);
    expect(radioInput.checked).toBe(true);

    const textBox = container.querySelector('[data-field-id="text"]') as HTMLDivElement;
    const checkboxBox = container.querySelector('[data-field-id="checkbox"]') as HTMLDivElement;
    const radioBox = container.querySelector('[data-field-id="radio"]') as HTMLDivElement;
    expect(textBox.style.left).toBe('10px');
    expect(textBox.style.top).toBe('20px');
    expect(textBox.style.width).toBe('120px');
    expect(textBox.style.height).toBe('24px');
    expect(checkboxBox.style.width).toBe('20px');
    expect(checkboxBox.style.height).toBe('20px');
    expect(radioBox.style.width).toBe('20px');
    expect(radioBox.style.height).toBe('20px');
    expect(checkboxBox.style.getPropertyValue('--field-checkbox-size')).toBe('24px');
    expect(radioBox.style.getPropertyValue('--field-checkbox-size')).toBe('24px');
  });

  it('does not treat NaN checkbox values as checked', () => {
    render(
      <FieldInputOverlay
        fields={[
          makeField({
            id: 'nan-checkbox',
            name: 'accept_terms',
            type: 'checkbox',
            value: Number.NaN,
          }),
        ]}
        pageSize={{ width: 200, height: 100 }}
        scale={1}
        globalFieldFont="default"
        globalFieldFontSize="auto"
        globalFieldFontColor="#000000"
        globalFieldAlignment="left"
        selectedFieldId={null}
        onSelectField={vi.fn()}
        onUpdateField={vi.fn()}
        onSelectRadioField={vi.fn()}
      />,
    );

    const checkboxInput = screen.getByRole('checkbox', { name: 'accept_terms' }) as HTMLInputElement;
    expect(checkboxInput.checked).toBe(false);
  });

  it('fires select-on-focus and update callbacks on text and checkbox changes', async () => {
    const user = userEvent.setup();
    const onSelectField = vi.fn();
    const onUpdateField = vi.fn();
    const fields = [
      makeField({ id: 'text', name: 'patient_name', type: 'text', value: '' }),
      makeField({ id: 'checkbox', name: 'active', type: 'checkbox', value: false }),
    ];

    render(
      <StatefulOverlay
        initialFields={fields}
        onSelectField={onSelectField}
        onUpdateField={onUpdateField}
      />,
    );

    const textInput = screen.getByLabelText('patient_name');
    const checkboxInput = screen.getByRole('checkbox', { name: 'active' });

    await user.click(textInput);
    expect(onSelectField).toHaveBeenCalledWith('text');

    await user.type(textInput, 'Ada');
    expect((textInput as HTMLInputElement).value).toBe('Ada');
    await user.tab();
    const lastTextUpdate = onUpdateField.mock.calls
      .filter((call) => call[0] === 'text')
      .slice(-1)[0];
    expect(lastTextUpdate).toEqual(['text', { value: 'Ada' }]);

    await user.click(checkboxInput);
    expect(onSelectField).toHaveBeenCalledWith('checkbox');
    expect(onUpdateField).toHaveBeenCalledWith('checkbox', { value: true });
  });

  it('calls the radio selection callback when a selected radio is clicked again', async () => {
    const user = userEvent.setup();
    const onSelectRadioField = vi.fn();

    render(
      <FieldInputOverlay
        fields={[
          makeField({
            id: 'radio-selected',
            name: 'preferred_email',
            type: 'radio',
            radioGroupId: 'preferred_contact',
            radioOptionKey: 'email',
            value: 'email',
          }),
        ]}
        pageSize={{ width: 200, height: 100 }}
        scale={1}
        globalFieldFont="default"
        globalFieldFontSize="auto"
        globalFieldFontColor="#000000"
        globalFieldAlignment="left"
        selectedFieldId={null}
        onSelectField={vi.fn()}
        onUpdateField={vi.fn()}
        onSelectRadioField={onSelectRadioField}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'preferred_email' }));

    expect(onSelectRadioField).toHaveBeenCalledWith('radio-selected');
  });

  it('previews inherited and field-specific Base 14 font choices', () => {
    render(
      <FieldInputOverlay
        fields={[
          makeField({
            id: 'global-font',
            name: 'global_font',
            type: 'text',
          }),
          makeField({
            id: 'override-font',
            name: 'override_font',
            type: 'text',
            fontName: 'Courier-BoldOblique',
          }),
        ]}
        pageSize={{ width: 200, height: 100 }}
        scale={1}
        globalFieldFont="Times-Italic"
        globalFieldFontSize="auto"
        globalFieldFontColor="#000000"
        globalFieldAlignment="left"
        selectedFieldId={null}
        onSelectField={vi.fn()}
        onUpdateField={vi.fn()}
        onSelectRadioField={vi.fn()}
      />,
    );

    const inheritedInput = screen.getByLabelText('global_font') as HTMLInputElement;
    const overrideInput = screen.getByLabelText('override_font') as HTMLInputElement;

    expect(inheritedInput.style.fontFamily).toContain('Times New Roman');
    expect(inheritedInput.style.fontStyle).toBe('italic');
    expect(overrideInput.style.fontFamily).toContain('Courier New');
    expect(overrideInput.style.fontWeight).toBe('700');
    expect(overrideInput.style.fontStyle).toBe('italic');
  });

  it('previews inherited and field-specific font size choices', () => {
    const { container } = render(
      <FieldInputOverlay
        fields={[
          makeField({
            id: 'global-size',
            name: 'global_size',
            type: 'text',
          }),
          makeField({
            id: 'override-size',
            name: 'override_size',
            type: 'text',
            fontSize: 8,
          }),
        ]}
        pageSize={{ width: 200, height: 100 }}
        scale={2}
        globalFieldFont="default"
        globalFieldFontSize={12}
        globalFieldFontColor="#000000"
        globalFieldAlignment="left"
        selectedFieldId={null}
        onSelectField={vi.fn()}
        onUpdateField={vi.fn()}
        onSelectRadioField={vi.fn()}
      />,
    );

    const inheritedBox = container.querySelector('[data-field-id="global-size"]') as HTMLDivElement;
    const overrideBox = container.querySelector('[data-field-id="override-size"]') as HTMLDivElement;

    expect(inheritedBox.style.getPropertyValue('--field-font-size')).toBe('24px');
    expect(overrideBox.style.getPropertyValue('--field-font-size')).toBe('16px');
  });

  it('clears date-like text values to an empty string on blur', async () => {
    const user = userEvent.setup();
    const onUpdateField = vi.fn();
    render(
      <StatefulOverlay
        initialFields={[
          makeField({
            id: 'date',
            name: 'appointment_date',
            type: 'text',
            value: '2025-03-15',
          }),
        ]}
        onSelectField={vi.fn()}
        onUpdateField={onUpdateField}
      />,
    );

    const dateInput = screen.getByLabelText('appointment_date');
    await user.clear(dateInput);
    await user.tab();

    expect(onUpdateField).toHaveBeenCalledWith('date', { value: '' });
  });

  it('normalizes barcode input and uploads image field previews', async () => {
    const onUpdateField = vi.fn();
    render(
      <StatefulOverlay
        initialFields={[
          makeField({
            id: 'barcode',
            name: 'member_barcode',
            type: 'barcode',
            value: '',
          }),
          makeField({
            id: 'image',
            name: 'profile_photo',
            type: 'image',
            value: null,
          }),
        ]}
        onSelectField={vi.fn()}
        onUpdateField={onUpdateField}
      />,
    );

    const barcodeInput = screen.getByLabelText('member_barcode') as HTMLInputElement;
    fireEvent.change(barcodeInput, { target: { value: '12-34 abc5678' } });
    expect(barcodeInput.value).toBe('12345678');
    fireEvent.blur(barcodeInput);
    expect(onUpdateField).toHaveBeenCalledWith('barcode', { value: '12345678' });

    const imageInput = screen.getByLabelText('profile_photo') as HTMLInputElement;
    const file = new File(['image-bytes'], 'profile.png', { type: 'image/png' });
    fireEvent.change(imageInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(onUpdateField).toHaveBeenCalledWith(
        'image',
        expect.objectContaining({
          imageDataUrl: expect.stringMatching(/^data:image\/png;base64,/),
          imageMimeType: 'image/png',
          imageName: 'profile.png',
          value: null,
        }),
      );
    });
  });

  it('renders barcode dependency values from source fields as read-only input', () => {
    render(
      <FieldInputOverlay
        fields={[
          makeField({
            id: 'source',
            name: 'member_id',
            type: 'text',
            value: '12345678',
          }),
          makeField({
            id: 'barcode',
            name: 'member_barcode',
            type: 'barcode',
            value: '',
            barcodeSourceField: { fieldId: 'source', fieldName: 'member_id' },
          }),
        ]}
        pageSize={{ width: 200, height: 100 }}
        scale={1}
        globalFieldFont="default"
        globalFieldFontSize="auto"
        globalFieldFontColor="#000000"
        globalFieldAlignment="left"
        selectedFieldId={null}
        onSelectField={vi.fn()}
        onUpdateField={vi.fn()}
        onSelectRadioField={vi.fn()}
      />,
    );

    const barcodeInput = screen.getByLabelText('member_barcode') as HTMLInputElement;
    expect(barcodeInput.value).toBe('12345678');
    expect(barcodeInput.readOnly).toBe(true);
  });

  it('renders QR previews from source field dependencies', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,qr');

    render(
      <FieldInputOverlay
        fields={[
          makeField({
            id: 'source',
            name: 'verification_url',
            type: 'text',
            value: 'https://example.com/verify/abc',
          }),
          makeField({
            id: 'qr',
            name: 'verification_qr',
            type: 'qr',
            value: '',
            qrSourceField: { fieldId: 'source', fieldName: 'verification_url' },
          }),
        ]}
        pageSize={{ width: 200, height: 100 }}
        scale={1}
        globalFieldFont="default"
        globalFieldFontSize="auto"
        globalFieldFontColor="#000000"
        globalFieldAlignment="left"
        selectedFieldId={null}
        onSelectField={vi.fn()}
        onUpdateField={vi.fn()}
        onSelectRadioField={vi.fn()}
      />,
    );

    const qrPreview = screen.getByRole('button', { name: 'verification_qr' });
    expect(qrPreview.getAttribute('title')).toBe('https://example.com/verify/abc');
  });
});
