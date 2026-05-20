import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PdfField } from '../../../../src/types';
import { FieldInspectorPanel } from '../../../../src/components/panels/FieldInspectorPanel';

type FieldInspectorPanelProps = ComponentProps<typeof FieldInspectorPanel>;

vi.mock('bwip-js/browser', () => ({
  default: {
    toCanvas: vi.fn(),
  },
}));

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,barcode');
});

const SAMPLE_FIELD: PdfField = {
  id: 'field-1',
  name: 'Full Name',
  type: 'text',
  page: 2,
  rect: {
    x: 14,
    y: 22,
    width: 120,
    height: 30,
  },
};

function createProps(overrides: Partial<FieldInspectorPanelProps> = {}): FieldInspectorPanelProps {
  return {
    fields: [SAMPLE_FIELD],
    selectedFieldId: SAMPLE_FIELD.id,
    radioGroups: [],
    selectedRadioSuggestion: null,
    globalFieldFont: 'default',
    globalFieldFontSize: 'auto',
    globalFieldFontColor: '#000000',
    globalFieldAlignment: 'left',
    activeCreateTool: null,
    radioToolDraft: null,
    pendingQuickRadioFields: [],
    pendingBulkTextStyleFields: [],
    arrowKeyMoveEnabled: false,
    arrowKeyMoveStep: 5,
    onUpdateField: vi.fn(),
    onSetFieldType: vi.fn(),
    onOpenCalculationSetup: vi.fn(),
    onOpenBarcodeSetup: vi.fn(),
    onUpdateFieldDraft: vi.fn(),
    onDeleteField: vi.fn(),
    onDeleteAllFields: vi.fn(),
    onCreateToolChange: vi.fn(),
    onUpdateRadioToolDraft: vi.fn(),
    onApplyPendingQuickRadioSelection: vi.fn(),
    onCancelPendingQuickRadioSelection: vi.fn(),
    onRemovePendingQuickRadioField: vi.fn(),
    onApplyPendingBulkTextStyleSelection: vi.fn(),
    onCancelPendingBulkTextStyleSelection: vi.fn(),
    onRemovePendingBulkTextStyleField: vi.fn(),
    onRenameRadioGroup: vi.fn(),
    onUpdateRadioFieldOption: vi.fn(),
    onMoveRadioFieldToGroup: vi.fn(),
    onReorderRadioField: vi.fn(),
    onDissolveRadioGroup: vi.fn(),
    onApplyRadioSuggestion: vi.fn(),
    onDismissRadioSuggestion: vi.fn(),
    onArrowKeyMoveEnabledChange: vi.fn(),
    onArrowKeyMoveStepChange: vi.fn(),
    onBeginFieldChange: vi.fn(),
    onCommitFieldChange: vi.fn(),
    canUndo: true,
    canRedo: true,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  };
}

function getBulkConvertButton() {
  const buttons = screen.getAllByRole('button', { name: 'Convert' });
  return buttons[buttons.length - 1];
}

describe('FieldInspectorPanel', () => {
  it('opens editor workflow usage docs in a new window from the inspector header', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<FieldInspectorPanel {...createProps()} />);

    await user.click(screen.getByRole('button', { name: 'Usage Docs' }));

    expect(openSpy).toHaveBeenCalledWith('/usage-docs/editor-workflow', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('renders empty state when no field is selected', () => {
    render(<FieldInspectorPanel {...createProps({ selectedFieldId: null })} />);

    expect(screen.getByText('No field selected.')).toBeTruthy();
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('updates selected field name/type/page/rect and emits begin/commit callbacks', async () => {
    const user = userEvent.setup();
    const onUpdateField = vi.fn();
    const onSetFieldType = vi.fn();
    const onUpdateFieldDraft = vi.fn();
    const onBeginFieldChange = vi.fn();
    const onCommitFieldChange = vi.fn();

    render(
      <FieldInspectorPanel
        {...createProps({
          onUpdateField,
          onSetFieldType,
          onUpdateFieldDraft,
          onBeginFieldChange,
          onCommitFieldChange,
        })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Field Editor' })).toBeTruthy();
    expect(screen.getByText('Selected: Full Name')).toBeTruthy();
    expect(screen.getByText(/Edit the selected field name, type, page, geometry/)).toBeTruthy();

    const nameInput = screen.getByLabelText('Name');
    await user.click(nameInput);
    expect(onBeginFieldChange).toHaveBeenCalledTimes(1);

    await user.type(nameInput, ' X');
    await user.tab();
    expect(onUpdateField).toHaveBeenCalledWith('field-1', { name: 'Full Name X' });
    expect(onCommitFieldChange).toHaveBeenCalledTimes(1);

    await user.selectOptions(screen.getByLabelText('Type'), 'signature');
    expect(onSetFieldType).toHaveBeenLastCalledWith('field-1', 'signature');

    const pageInput = screen.getByLabelText('Page');
    await user.click(pageInput);
    await user.type(pageInput, '3');
    await user.tab();
    const pageCalls = onUpdateField.mock.calls.filter(
      (call) => typeof (call[1] as Partial<PdfField>).page === 'number',
    );
    expect(pageCalls.length).toBeGreaterThan(0);
    expect(((pageCalls.at(-1)?.[1] as { page: number }).page)).toBeGreaterThanOrEqual(1);

    onUpdateField.mockClear();
    const xInput = screen.getByLabelText('X');
    await user.click(xInput);
    await user.type(xInput, '5');
    await user.tab();
    const rectCalls = onUpdateField.mock.calls.filter(
      (call) => Boolean((call[1] as Partial<PdfField>).rect),
    );
    expect(rectCalls.length).toBeGreaterThan(0);
    const lastRect = (rectCalls.at(-1)?.[1] as { rect: PdfField['rect'] }).rect;
    expect(lastRect.x).toBeGreaterThan(14);
    expect(lastRect.y).toBe(22);
    expect(lastRect.width).toBe(120);
    expect(lastRect.height).toBe(30);
  });

  it('updates text field font overrides and hides font controls for non-text fields', async () => {
    const user = userEvent.setup();
    const onUpdateField = vi.fn();
    const { rerender } = render(
      <FieldInspectorPanel
        {...createProps({
          globalFieldFont: 'Helvetica-Bold',
          globalFieldAlignment: 'center',
          onUpdateField,
        })}
      />,
    );

    const fontSelect = screen.getByLabelText('Font') as HTMLSelectElement;
    expect(fontSelect.value).toBe('global');
    expect(screen.getByRole('option', { name: 'Use global (Helvetica Bold)' })).toBeTruthy();

    await user.selectOptions(fontSelect, 'Courier-BoldOblique');
    expect(onUpdateField).toHaveBeenCalledWith('field-1', { fontName: 'Courier-BoldOblique' });

    const alignmentSelect = screen.getByLabelText('Alignment') as HTMLSelectElement;
    expect(alignmentSelect.value).toBe('global');
    expect(screen.getByRole('option', { name: 'Use global (Center)' })).toBeTruthy();

    await user.selectOptions(alignmentSelect, 'right');
    expect(onUpdateField).toHaveBeenCalledWith('field-1', { textAlign: 'right' });

    rerender(
      <FieldInspectorPanel
        {...createProps({
          globalFieldAlignment: 'center',
          selectedField: { ...SAMPLE_FIELD, textAlign: 'right' },
          onUpdateField,
        })}
      />,
    );

    onUpdateField.mockClear();
    await user.selectOptions(screen.getByLabelText('Alignment'), 'global');
    expect(onUpdateField).toHaveBeenCalledWith('field-1', { textAlign: undefined });

    rerender(
      <FieldInspectorPanel
        {...createProps({
          selectedField: { ...SAMPLE_FIELD, type: 'checkbox' },
          onUpdateField,
        })}
      />,
    );

    expect(screen.queryByLabelText('Font')).toBeNull();
    expect(screen.queryByLabelText('Font size')).toBeNull();
    expect(screen.queryByLabelText('Alignment')).toBeNull();
  });

  it('updates text field font size overrides', async () => {
    const user = userEvent.setup();
    const onUpdateField = vi.fn();
    const { rerender } = render(
      <FieldInspectorPanel
        {...createProps({
          globalFieldFontSize: 11,
          onUpdateField,
        })}
      />,
    );

    const fontSizeSelect = screen.getByLabelText('Font size') as HTMLSelectElement;
    expect(fontSizeSelect.value).toBe('global');
    expect(screen.getByRole('option', { name: 'Use global (11 pt)' })).toBeTruthy();

    await user.selectOptions(fontSizeSelect, 'auto');
    expect(onUpdateField).toHaveBeenCalledWith('field-1', { fontSize: 'auto' });

    await user.selectOptions(fontSizeSelect, 'custom');
    expect(onUpdateField).toHaveBeenCalledWith('field-1', { fontSize: 10 });

    rerender(
      <FieldInspectorPanel
        {...createProps({
          selectedField: { ...SAMPLE_FIELD, fontSize: 12 },
          onUpdateField,
        })}
      />,
    );

    onUpdateField.mockClear();
    fireEvent.change(screen.getByLabelText('Custom font size'), {
      target: { value: '1' },
    });
    expect((screen.getByLabelText('Custom font size') as HTMLInputElement).value).toBe('1');
    expect(onUpdateField).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Custom font size'), {
      target: { value: '18' },
    });
    expect(onUpdateField).not.toHaveBeenCalled();
    fireEvent.blur(screen.getByLabelText('Custom font size'));
    expect(onUpdateField).toHaveBeenCalledWith('field-1', { fontSize: 18 });
  });

  it('clamps page input to at least 1 and rounds fractional values', () => {
    const onUpdateField = vi.fn();

    render(<FieldInspectorPanel {...createProps({ onUpdateField })} />);

    const pageInput = screen.getByLabelText('Page');

    fireEvent.change(pageInput, { target: { value: '-5' } });
    fireEvent.blur(pageInput);
    fireEvent.change(pageInput, { target: { value: '1.7' } });
    fireEvent.blur(pageInput);

    const pageCalls = onUpdateField.mock.calls
      .filter((call) => typeof (call[1] as Partial<PdfField>).page === 'number')
      .map((call) => (call[1] as { page: number }).page);

    expect(pageCalls.length).toBeGreaterThan(0);
    for (const value of pageCalls) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('enforces minimum width and height when resizing', async () => {
    const onUpdateField = vi.fn();

    render(<FieldInspectorPanel {...createProps({ onUpdateField })} />);

    const widthInput = screen.getByLabelText('Width');
    fireEvent.change(widthInput, { target: { value: '-5' } });
    fireEvent.blur(widthInput);
    expect(onUpdateField).toHaveBeenLastCalledWith('field-1', {
      rect: { x: 14, y: 22, width: 12, height: 30 },
    });

    onUpdateField.mockClear();
    const heightInput = screen.getByLabelText('Height');
    fireEvent.change(heightInput, { target: { value: '-2' } });
    fireEvent.blur(heightInput);
    expect(onUpdateField).toHaveBeenLastCalledWith('field-1', {
      rect: { x: 14, y: 22, width: 120, height: 12 },
    });
  });

  it('wires create/delete callbacks and undo/redo disabled states', async () => {
    const user = userEvent.setup();
    const onCreateToolChange = vi.fn();
    const onDeleteField = vi.fn();
    const onDeleteAllFields = vi.fn();
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const { rerender } = render(
      <FieldInspectorPanel
        {...createProps({
          onCreateToolChange,
          onDeleteField,
          onDeleteAllFields,
          onUndo,
          onRedo,
          canUndo: false,
          canRedo: false,
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete field' }));
    expect(onDeleteField).toHaveBeenCalledWith('field-1');

    await user.click(screen.getByRole('button', { name: 'Delete all fields' }));
    expect(screen.getByText('Are you sure you want to delete all fields?')).toBeTruthy();
    expect(onDeleteAllFields).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'No' }));
    expect(onDeleteAllFields).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete all fields' }));
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onDeleteAllFields).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Text' }));
    await user.click(screen.getByRole('button', { name: 'Signature' }));
    await user.click(screen.getByRole('button', { name: 'Checkbox' }));
    await user.click(screen.getByRole('button', { name: 'Radio' }));
    await user.click(screen.getAllByRole('button', { name: 'Off' })[0]);

    expect(onCreateToolChange).toHaveBeenCalledTimes(5);
    expect(onCreateToolChange).toHaveBeenNthCalledWith(1, 'text');
    expect(onCreateToolChange).toHaveBeenNthCalledWith(2, 'signature');
    expect(onCreateToolChange).toHaveBeenNthCalledWith(3, 'checkbox');
    expect(onCreateToolChange).toHaveBeenNthCalledWith(4, 'radio');
    expect(onCreateToolChange).toHaveBeenNthCalledWith(5, null);

    const undoButtonBefore = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    const redoButtonBefore = screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement;
    expect(undoButtonBefore.getAttribute('aria-disabled')).toBe('true');
    expect(redoButtonBefore.getAttribute('aria-disabled')).toBe('true');

    rerender(
      <FieldInspectorPanel
        {...createProps({
          onCreateToolChange,
          onDeleteField,
          onDeleteAllFields,
          onUndo,
          onRedo,
          canUndo: true,
          canRedo: true,
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await user.click(screen.getByRole('button', { name: 'Redo' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('activates bulk font conversion and applies a selected style to pending text fields', async () => {
    const user = userEvent.setup();
    const onCreateToolChange = vi.fn();
    const onApplyPendingBulkTextStyleSelection = vi.fn();

    render(
      <FieldInspectorPanel
        {...createProps({
          pendingBulkTextStyleFields: [SAMPLE_FIELD],
          onCreateToolChange,
          onApplyPendingBulkTextStyleSelection,
        })}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Change'), 'fontSize');
    await user.selectOptions(screen.getByLabelText('Bulk font size'), 'custom');
    const customFontSize = screen.getByLabelText('Bulk custom font size');
    await user.clear(customFontSize);
    await user.type(customFontSize, '14');

    await user.click(screen.getByRole('button', { name: 'Quick select text fields' }));
    expect(onCreateToolChange).toHaveBeenCalledWith('bulk-text-style');

    await user.click(getBulkConvertButton());
    expect(onApplyPendingBulkTextStyleSelection).toHaveBeenCalledWith({ fontSize: 14 });
  });

  it('applies each bulk font conversion mode and guards empty selections', async () => {
    const user = userEvent.setup();
    const onApplyPendingBulkTextStyleSelection = vi.fn();
    const onCancelPendingBulkTextStyleSelection = vi.fn();
    const onRemovePendingBulkTextStyleField = vi.fn();
    const onBlockedAction = vi.fn();
    const pendingFields: PdfField[] = [
      SAMPLE_FIELD,
      {
        ...SAMPLE_FIELD,
        id: 'field-2',
        name: 'DOB',
        type: 'text',
      },
    ];
    const { rerender } = render(
      <FieldInspectorPanel
        {...createProps({
          pendingBulkTextStyleFields: pendingFields,
          onApplyPendingBulkTextStyleSelection,
          onCancelPendingBulkTextStyleSelection,
          onRemovePendingBulkTextStyleField,
          onBlockedAction,
        })}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Bulk font'), 'Courier-Bold');
    await user.click(getBulkConvertButton());
    expect(onApplyPendingBulkTextStyleSelection).toHaveBeenLastCalledWith({ fontName: 'Courier-Bold' });

    await user.selectOptions(screen.getByLabelText('Change'), 'fontColor');
    await user.selectOptions(screen.getByLabelText('Bulk font color'), 'custom');
    fireEvent.change(screen.getByLabelText('Bulk custom font color'), { target: { value: '#ff0000' } });
    await user.click(getBulkConvertButton());
    expect(onApplyPendingBulkTextStyleSelection).toHaveBeenLastCalledWith({ fontColor: '#ff0000' });

    await user.selectOptions(screen.getByLabelText('Change'), 'textAlign');
    await user.selectOptions(screen.getByLabelText('Bulk alignment'), 'right');
    await user.click(getBulkConvertButton());
    expect(onApplyPendingBulkTextStyleSelection).toHaveBeenLastCalledWith({ textAlign: 'right' });

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(onRemovePendingBulkTextStyleField).toHaveBeenCalledWith('field-1');

    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onCancelPendingBulkTextStyleSelection).toHaveBeenCalledTimes(1);

    onApplyPendingBulkTextStyleSelection.mockClear();
    onCancelPendingBulkTextStyleSelection.mockClear();
    rerender(
      <FieldInspectorPanel
        {...createProps({
          pendingBulkTextStyleFields: [],
          onApplyPendingBulkTextStyleSelection,
          onCancelPendingBulkTextStyleSelection,
          onRemovePendingBulkTextStyleField,
          onBlockedAction,
        })}
      />,
    );

    await user.click(getBulkConvertButton());
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(onApplyPendingBulkTextStyleSelection).not.toHaveBeenCalled();
    expect(onCancelPendingBulkTextStyleSelection).not.toHaveBeenCalled();
    expect(onBlockedAction).toHaveBeenCalledWith('Select text fields on the page first before converting.');
    expect(onBlockedAction).toHaveBeenCalledWith('No text fields selected to clear.');
  });

  it('clears text alignment overrides when bulk applying workspace alignment', async () => {
    const user = userEvent.setup();
    const onApplyPendingBulkTextStyleSelection = vi.fn();

    render(
      <FieldInspectorPanel
        {...createProps({
          globalFieldAlignment: 'right',
          pendingBulkTextStyleFields: [{ ...SAMPLE_FIELD, textAlign: 'center' }],
          onApplyPendingBulkTextStyleSelection,
        })}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Change'), 'textAlign');
    expect(screen.getByRole('option', { name: 'Use workspace (Right)' })).toBeTruthy();

    await user.click(getBulkConvertButton());
    expect(onApplyPendingBulkTextStyleSelection).toHaveBeenCalledWith({ textAlign: undefined });
  });

  it('updates keyboard move preferences from the create field section', async () => {
    const user = userEvent.setup();
    const onArrowKeyMoveEnabledChange = vi.fn();
    const onArrowKeyMoveStepChange = vi.fn();

    render(
      <FieldInspectorPanel
        {...createProps({
          onArrowKeyMoveEnabledChange,
          onArrowKeyMoveStepChange,
        })}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Arrow keys' }));
    expect(onArrowKeyMoveEnabledChange).toHaveBeenCalledWith(true);

    const stepInput = screen.getByLabelText('Step (pt)');
    await user.clear(stepInput);
    await user.type(stepInput, '7');
    await user.tab();
    expect(onArrowKeyMoveStepChange).toHaveBeenCalledWith(7);
  });

  it('opens the barcode setup modal for pdf417, barcode, and QR fields', async () => {
    const user = userEvent.setup();
    const onOpenBarcodeSetup = vi.fn();
    const barcodeField: PdfField = {
      id: 'barcode',
      name: 'Member Barcode',
      type: 'barcode',
      page: 1,
      rect: { x: 10, y: 10, width: 220, height: 52 },
      value: '',
    };
    const pdf417Field: PdfField = {
      id: 'pdf417',
      name: 'License PDF417',
      type: 'pdf417',
      page: 1,
      rect: { x: 10, y: 70, width: 220, height: 78 },
      value: null,
    };
    const qrField: PdfField = {
      id: 'qr',
      name: 'Verification QR',
      type: 'qr',
      page: 1,
      rect: { x: 10, y: 160, width: 110, height: 110 },
      value: '',
    };

    const { rerender } = render(
      <FieldInspectorPanel
        {...createProps({
          fields: [barcodeField, pdf417Field, qrField],
          selectedFieldId: barcodeField.id,
          selectedField: barcodeField,
          onOpenBarcodeSetup,
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Edit barcode classes/i }));
    expect(onOpenBarcodeSetup).toHaveBeenCalledWith(barcodeField.id);

    rerender(
      <FieldInspectorPanel
        {...createProps({
          fields: [barcodeField, pdf417Field, qrField],
          selectedFieldId: pdf417Field.id,
          selectedField: pdf417Field,
          onOpenBarcodeSetup,
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Edit barcode classes/i }));
    expect(onOpenBarcodeSetup).toHaveBeenCalledWith(pdf417Field.id);

    rerender(
      <FieldInspectorPanel
        {...createProps({
          fields: [barcodeField, pdf417Field, qrField],
          selectedFieldId: qrField.id,
          selectedField: qrField,
          onOpenBarcodeSetup,
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Edit barcode classes/i }));
    expect(onOpenBarcodeSetup).toHaveBeenCalledWith(qrField.id);
  });
});
