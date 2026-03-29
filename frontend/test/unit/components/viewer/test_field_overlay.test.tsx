import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PdfField, RadioGroupSuggestion } from '../../../../src/types';
import { FieldOverlay } from '../../../../src/components/viewer/FieldOverlay';

function makeField(overrides: Partial<PdfField> & Pick<PdfField, 'id' | 'name' | 'type'>): PdfField {
  return {
    id: overrides.id,
    name: overrides.name,
    type: overrides.type,
    page: 1,
    rect: { x: 10, y: 10, width: 30, height: 20 },
    ...overrides,
  };
}

function pointerMove(clientX: number, clientY: number, pointerId = 1, shiftKey = false) {
  fireEvent.pointerMove(window, { clientX, clientY, pointerId, shiftKey });
}

function pointerUp(pointerId = 1) {
  fireEvent.pointerUp(window, { pointerId });
}

describe('FieldOverlay', () => {
  beforeEach(() => {
    if (typeof PointerEvent === 'undefined') {
      (globalThis as any).PointerEvent = MouseEvent;
    }
  });

  it('renders labels/confidence classes, selected styling, and selection callback behavior', async () => {
    const user = userEvent.setup();
    const onSelectField = vi.fn();
    const fields = [
      makeField({
        id: 'text-field',
        name: 'Patient Name',
        type: 'text',
        rect: { x: 10, y: 10, width: 100, height: 40 },
        fieldConfidence: 0.6,
        mappingConfidence: 0.7,
      }),
      makeField({
        id: 'checkbox-field',
        name: 'Agree',
        type: 'checkbox',
      }),
    ];
    const { container } = render(
      <FieldOverlay
        fields={fields}
        pageSize={{ width: 200, height: 120 }}
        scale={1}
        moveEnabled={false}
        resizeEnabled={false}
        createEnabled={false}
        activeCreateTool={null}
        showFieldNames
        selectedFieldId="text-field"
        onSelectField={onSelectField}
        onUpdateField={vi.fn()}
        onCreateFieldWithRect={vi.fn()}
        onBeginFieldChange={vi.fn()}
        onCommitFieldChange={vi.fn()}
      />,
    );

    const selectedBox = container.querySelector('[data-field-id="text-field"]') as HTMLDivElement;
    expect(selectedBox.className).toContain('field-box--text');
    expect(selectedBox.className).toContain('field-box--conf-high');
    expect(selectedBox.className).toContain('field-box--active');

    const label = selectedBox.querySelector('.field-label') as HTMLSpanElement;
    expect(label.textContent).toBe('Patient Name');
    expect(label.className).not.toContain('field-label--conf-medium');
    expect(label.style.getPropertyValue('--field-label-max-width')).toBe('75px');
    expect(label.style.getPropertyValue('--field-label-max-height')).toBe('30px');
    expect(Number.parseFloat(label.style.getPropertyValue('--field-label-font-size'))).toBeLessThanOrEqual(11);

    const checkboxBox = container.querySelector('[data-field-id="checkbox-field"]') as HTMLDivElement;
    expect(checkboxBox.querySelector('.field-label')).toBeNull();

    await user.pointer({
      target: selectedBox,
      keys: '[MouseLeft]',
      coords: { x: 20, y: 20 },
    });
    expect(onSelectField).toHaveBeenCalledWith('text-field');
  });

  it('handles move drag with page-bound clamping and begin/commit callbacks', () => {
    const onUpdateField = vi.fn();
    const onBeginFieldChange = vi.fn();
    const onCommitFieldChange = vi.fn();
    const onSelectField = vi.fn();
    const field = makeField({
      id: 'move-field',
      name: 'move-field',
      type: 'text',
      rect: { x: 10, y: 10, width: 30, height: 20 },
    });
    const { container } = render(
      <FieldOverlay
        fields={[field]}
        pageSize={{ width: 100, height: 80 }}
        scale={1}
        moveEnabled
        resizeEnabled
        createEnabled={false}
        activeCreateTool={null}
        showFieldNames={false}
        selectedFieldId={null}
        onSelectField={onSelectField}
        onUpdateField={onUpdateField}
        onCreateFieldWithRect={vi.fn()}
        onBeginFieldChange={onBeginFieldChange}
        onCommitFieldChange={onCommitFieldChange}
      />,
    );

    const box = container.querySelector('[data-field-id="move-field"]') as HTMLDivElement;
    fireEvent.pointerDown(box, { clientX: 20, clientY: 20, pointerId: 1 });
    pointerMove(220, 220, 1);
    pointerUp(1);

    expect(onBeginFieldChange).toHaveBeenCalledTimes(1);
    expect(onSelectField).toHaveBeenCalledWith('move-field');
    const lastUpdate = onUpdateField.mock.calls.slice(-1)[0];
    expect(lastUpdate).toEqual([
      'move-field',
      {
        rect: { x: 70, y: 60, width: 30, height: 20 },
      },
    ]);
    expect(onCommitFieldChange).toHaveBeenCalledTimes(1);
  });

  it('locks field movement when moveEnabled is false', () => {
    const onUpdateField = vi.fn();
    const onBeginFieldChange = vi.fn();
    const onCommitFieldChange = vi.fn();
    const onSelectField = vi.fn();
    const field = makeField({
      id: 'static-field',
      name: 'static-field',
      type: 'text',
      rect: { x: 10, y: 10, width: 30, height: 20 },
    });
    const { container } = render(
      <FieldOverlay
        fields={[field]}
        pageSize={{ width: 100, height: 80 }}
        scale={1}
        moveEnabled={false}
        resizeEnabled
        createEnabled={false}
        activeCreateTool={null}
        showFieldNames={false}
        selectedFieldId={null}
        onSelectField={onSelectField}
        onUpdateField={onUpdateField}
        onCreateFieldWithRect={vi.fn()}
        onBeginFieldChange={onBeginFieldChange}
        onCommitFieldChange={onCommitFieldChange}
      />,
    );

    const box = container.querySelector('[data-field-id="static-field"]') as HTMLDivElement;
    fireEvent.pointerDown(box, { clientX: 20, clientY: 20, pointerId: 1 });
    pointerMove(220, 220, 1);
    pointerUp(1);

    expect(onSelectField).toHaveBeenCalledWith('static-field');
    expect(onBeginFieldChange).not.toHaveBeenCalled();
    expect(onUpdateField).not.toHaveBeenCalled();
    expect(onCommitFieldChange).not.toHaveBeenCalled();
  });

  it('creates a default-sized field on click without rendering a draft preview', () => {
    const onCreateFieldWithRect = vi.fn();
    const { container } = render(
      <FieldOverlay
        fields={[]}
        pageSize={{ width: 300, height: 200 }}
        scale={1}
        moveEnabled={false}
        resizeEnabled={false}
        createEnabled
        activeCreateTool="text"
        showFieldNames={false}
        selectedFieldId={null}
        pendingQuickRadioFieldIds={[]}
        radioSuggestionByFieldId={new Map()}
        onSelectField={vi.fn()}
        onUpdateField={vi.fn()}
        onCreateFieldWithRect={onCreateFieldWithRect}
        onQuickRadioSelect={vi.fn()}
        onBeginFieldChange={vi.fn()}
        onCommitFieldChange={vi.fn()}
      />,
    );

    const surface = container.querySelector('.field-create-surface') as HTMLDivElement;
    fireEvent.pointerDown(surface, { clientX: 150, clientY: 60, pointerId: 1 });

    expect(container.querySelector('.field-create-draft')).toBeNull();

    pointerMove(151, 61, 1);
    expect(container.querySelector('.field-create-draft')).toBeNull();

    pointerUp(1);

    expect(onCreateFieldWithRect).toHaveBeenCalledWith('text', {
      x: 60,
      y: 49,
      width: 180,
      height: 22,
    });
  });

  it('waits to show the create preview until drag movement clears the click threshold', () => {
    const onCreateFieldWithRect = vi.fn();
    const { container } = render(
      <FieldOverlay
        fields={[]}
        pageSize={{ width: 300, height: 200 }}
        scale={1}
        moveEnabled={false}
        resizeEnabled={false}
        createEnabled
        activeCreateTool="text"
        showFieldNames={false}
        selectedFieldId={null}
        pendingQuickRadioFieldIds={[]}
        radioSuggestionByFieldId={new Map()}
        onSelectField={vi.fn()}
        onUpdateField={vi.fn()}
        onCreateFieldWithRect={onCreateFieldWithRect}
        onQuickRadioSelect={vi.fn()}
        onBeginFieldChange={vi.fn()}
        onCommitFieldChange={vi.fn()}
      />,
    );

    const surface = container.querySelector('.field-create-surface') as HTMLDivElement;
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 40, pointerId: 1 });

    pointerMove(101, 41, 1);
    expect(container.querySelector('.field-create-draft')).toBeNull();

    pointerMove(170, 95, 1);
    const draft = container.querySelector('.field-create-draft') as HTMLDivElement;
    expect(draft).toBeTruthy();
    expect(draft.style.left).toBe('100px');
    expect(draft.style.top).toBe('40px');
    expect(draft.style.width).toBe('70px');
    expect(draft.style.height).toBe('55px');

    pointerUp(1);

    expect(onCreateFieldWithRect).toHaveBeenCalledWith('text', {
      x: 100,
      y: 40,
      width: 70,
      height: 55,
    });
  });

  it('updates geometry for each resize handle and enforces minimum size', () => {
    const testCases: Array<{
      handleClass: string;
      moveTo: { x: number; y: number };
      expected: { x: number; y: number; width: number; height: number };
    }> = [
      {
        handleClass: '.field-handle--left',
        moveTo: { x: 120, y: 20 },
        expected: { x: 28, y: 10, width: 12, height: 20 },
      },
      {
        handleClass: '.field-handle--right',
        moveTo: { x: 70, y: 20 },
        expected: { x: 10, y: 10, width: 80, height: 20 },
      },
      {
        handleClass: '.field-handle--top',
        moveTo: { x: 20, y: 100 },
        expected: { x: 10, y: 18, width: 30, height: 12 },
      },
      {
        handleClass: '.field-handle--bottom',
        moveTo: { x: 20, y: 80 },
        expected: { x: 10, y: 10, width: 30, height: 70 },
      },
      {
        handleClass: '.field-handle--br',
        moveTo: { x: 80, y: 30 },
        expected: { x: 10, y: 10, width: 90, height: 30 },
      },
    ];

    for (const testCase of testCases) {
      const onUpdateField = vi.fn();
      const onCommitFieldChange = vi.fn();
      const { container, unmount } = render(
        <FieldOverlay
          fields={[
            makeField({
              id: 'resize-field',
              name: 'resize-field',
              type: 'text',
              rect: { x: 10, y: 10, width: 30, height: 20 },
            }),
          ]}
          pageSize={{ width: 100, height: 80 }}
          scale={1}
          moveEnabled
          resizeEnabled
          createEnabled={false}
          activeCreateTool={null}
          showFieldNames={false}
          selectedFieldId={null}
          onSelectField={vi.fn()}
          onUpdateField={onUpdateField}
          onCreateFieldWithRect={vi.fn()}
          onBeginFieldChange={vi.fn()}
          onCommitFieldChange={onCommitFieldChange}
        />,
      );

      const handle = container.querySelector(testCase.handleClass) as HTMLSpanElement;
      fireEvent.pointerDown(handle, { clientX: 20, clientY: 20, pointerId: 1 });
      pointerMove(testCase.moveTo.x, testCase.moveTo.y, 1);
      pointerUp(1);

      const lastUpdate = onUpdateField.mock.calls.slice(-1)[0];
      expect(lastUpdate).toEqual(['resize-field', { rect: testCase.expected }]);
      expect(onCommitFieldChange).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it('marks low-confidence radio suggestions with a review class', () => {
    const suggestedField = makeField({
      id: 'checkbox-field',
      name: 'i_marital_status_single',
      type: 'checkbox',
    });
    const suggestion: RadioGroupSuggestion = {
      id: 'marital-status',
      suggestedType: 'radio_group',
      groupKey: 'marital_status',
      groupLabel: 'Marital Status',
      confidence: 0.2,
      suggestedFields: [
        {
          fieldId: 'checkbox-field',
          fieldName: 'i_marital_status_single',
          optionKey: 'single',
          optionLabel: 'Single',
        },
        {
          fieldId: 'checkbox-field-2',
          fieldName: 'i_marital_status_married',
          optionKey: 'married',
          optionLabel: 'Married',
        },
      ],
    };

    const { container } = render(
      <FieldOverlay
        fields={[suggestedField]}
        pageSize={{ width: 200, height: 120 }}
        scale={1}
        moveEnabled={false}
        resizeEnabled={false}
        createEnabled={false}
        activeCreateTool={null}
        showFieldNames={false}
        selectedFieldId={null}
        radioSuggestionByFieldId={new Map([[suggestedField.id, suggestion]])}
        onSelectField={vi.fn()}
        onUpdateField={vi.fn()}
        onCreateFieldWithRect={vi.fn()}
        onQuickRadioSelect={vi.fn()}
        onBeginFieldChange={vi.fn()}
        onCommitFieldChange={vi.fn()}
      />,
    );

    const box = container.querySelector('[data-field-id="checkbox-field"]') as HTMLDivElement;
    expect(box.className).toContain('field-box--radio-suggestion');
    expect(box.className).toContain('field-box--radio-suggestion--low');
  });
});
