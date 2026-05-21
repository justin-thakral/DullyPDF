import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CalculationSetupDialog } from '../../../../src/components/features/CalculationSetupDialog';
import type { PdfField } from '../../../../src/types';

const DEPENDENCY_FIELDS: PdfField[] = [
  {
    id: 'joey',
    name: 'Joey',
    type: 'text',
    page: 1,
    rect: { x: 10, y: 10, width: 80, height: 20 },
    valueType: 'integer',
    calculation: { role: 'number_input', valueType: 'integer' },
  },
  {
    id: 'jt',
    name: 'JT',
    type: 'text',
    page: 1,
    rect: { x: 10, y: 40, width: 80, height: 20 },
    valueType: 'integer',
    calculation: { role: 'number_input', valueType: 'integer' },
  },
];

const TARGET_FIELD: PdfField = {
  id: 'target',
  name: 'Total',
  type: 'text',
  page: 1,
  rect: { x: 10, y: 70, width: 80, height: 20 },
  valueType: 'integer',
  calculation: {
    role: 'calculated_output',
    valueType: 'integer',
    dependencies: [],
    output: { valueType: 'integer' },
  },
};

describe('CalculationSetupDialog', () => {
  it('opens calculation usage docs and labels field insertion clearly', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <CalculationSetupDialog
        open
        field={TARGET_FIELD}
        fields={[...DEPENDENCY_FIELDS, TARGET_FIELD]}
        intent="calculated_output"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Usage Docs' }));

    expect(openSpy).toHaveBeenCalledWith(
      '/es/usage-docs/editor-workflow#campos-de-calculo',
      '_blank',
      'noopener,noreferrer',
    );
    expect(screen.getByRole('button', { name: 'Add Field to equation' })).toBeTruthy();
    openSpy.mockRestore();
  });

  it('uses calculated dependency values in formula preview labels and totals', () => {
    const fields: PdfField[] = [
      {
        ...DEPENDENCY_FIELDS[0],
        value: '10',
      },
      {
        ...DEPENDENCY_FIELDS[1],
        value: '5',
      },
      {
        id: 'subtotal',
        name: 'Subtotal',
        type: 'text',
        page: 1,
        rect: { x: 10, y: 70, width: 80, height: 20 },
        value: '',
        valueType: 'integer',
        calculation: {
          role: 'calculated_intermediate',
          valueType: 'integer',
          formula: {
            kind: 'binary',
            op: '+',
            left: { kind: 'field', fieldId: 'joey' },
            right: { kind: 'field', fieldId: 'jt' },
          },
          output: { valueType: 'integer', rounding: 'round' },
        },
      },
      {
        id: 'fee',
        name: 'Fee',
        type: 'text',
        page: 1,
        rect: { x: 10, y: 100, width: 80, height: 20 },
        value: '2',
        valueType: 'integer',
        calculation: { role: 'number_input', valueType: 'integer' },
      },
      {
        ...TARGET_FIELD,
        rect: { x: 10, y: 130, width: 80, height: 20 },
        calculation: {
          role: 'calculated_output',
          valueType: 'integer',
          dependencies: ['subtotal', 'fee'],
          formula: {
            kind: 'binary',
            op: '+',
            left: { kind: 'field', fieldId: 'subtotal' },
            right: { kind: 'field', fieldId: 'fee' },
          },
          output: { valueType: 'integer', rounding: 'round' },
        },
      },
    ];

    render(
      <CalculationSetupDialog
        open
        field={fields[4]}
        fields={fields}
        intent="edit"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText('Subtotal (15) + Fee (2)')).toBeTruthy();
    expect(screen.getByText('17')).toBeTruthy();
    expect(screen.getAllByText('Subtotal (15)').length).toBeGreaterThan(0);
    expect(screen.getByRole('option', { name: /Fee \(2\)/ })).toBeTruthy();
  });

  it('shows invalid dependency options as disabled with a reason', () => {
    const checkboxField: PdfField = {
      id: 'agree',
      name: 'Agree',
      type: 'checkbox',
      page: 1,
      rect: { x: 10, y: 100, width: 20, height: 20 },
    };

    render(
      <CalculationSetupDialog
        open
        field={TARGET_FIELD}
        fields={[...DEPENDENCY_FIELDS, checkboxField, TARGET_FIELD]}
        intent="calculated_output"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: /Agree.*not a text field/i })).toHaveProperty('disabled', true);
    expect(screen.getByRole('option', { name: /Total.*current field/i })).toHaveProperty('disabled', true);
  });

  it('filters equation dependency fields by typed search', async () => {
    const user = userEvent.setup();

    render(
      <CalculationSetupDialog
        open
        field={TARGET_FIELD}
        fields={[...DEPENDENCY_FIELDS, TARGET_FIELD]}
        intent="calculated_output"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: /Joey/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /JT/i })).toBeTruthy();

    await user.type(screen.getByLabelText('Formula field'), 'jt');
    expect(screen.queryByRole('option', { name: /Joey/i })).toBeNull();
    await user.click(screen.getByRole('option', { name: /JT/i }));
    await user.click(screen.getByRole('button', { name: 'Add Field to equation' }));

    expect(screen.getAllByText('JT (blank)').length).toBeGreaterThan(0);
  });

  it('keeps number inputs integer-only so setup matches export validation', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const numberField: PdfField = {
      ...DEPENDENCY_FIELDS[0],
      valueType: 'decimal',
      calculation: { role: 'number_input', valueType: 'decimal' },
    };

    render(
      <CalculationSetupDialog
        open
        field={numberField}
        fields={[numberField]}
        intent="number_input"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const numericType = screen.getByText('Numeric type')
      .closest('label')
      ?.querySelector('select') as HTMLSelectElement | null;
    expect(numericType).toBeTruthy();
    if (!numericType) return;
    expect(numericType.disabled).toBe(true);
    expect(numericType.value).toBe('integer');
    expect(screen.getByText('Number inputs are integer-only for this release.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save setup' }));

    expect(onSave).toHaveBeenCalledWith(
      numberField.id,
      expect.objectContaining({
        valueType: 'integer',
        calculation: expect.objectContaining({
          role: 'number_input',
          valueType: 'integer',
        }),
      }),
    );
  });
});
