/**
 * Overlay layer that renders input elements aligned to PDF fields.
 */
import { useMemo, useState, type ChangeEvent, type FocusEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type {
  FieldFontChoice,
  FieldFontColorChoice,
  FieldFontSizeChoice,
  PdfField,
  PageSize,
} from '../../types';
import { fieldConfidenceTierForField } from '../../utils/confidence';
import { toViewportRect } from '../../utils/coords';
import {
  cssStyleForPdfBase14Font,
  resolveEffectiveFieldFont,
  resolveEffectiveFieldFontColor,
  resolveEffectiveFieldFontSize,
} from '../../utils/fieldFonts';

type FieldInputOverlayProps = {
  fields: PdfField[];
  pageSize: PageSize;
  scale: number;
  globalFieldFont: FieldFontChoice;
  globalFieldFontSize: FieldFontSizeChoice;
  globalFieldFontColor: FieldFontColorChoice;
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  onUpdateField: (fieldId: string, updates: Partial<PdfField>) => void;
  onSelectRadioField: (fieldId: string) => void;
};

/**
 * Normalize field values into text for input controls.
 */
function coerceToString(value: PdfField['value']): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/**
 * Normalize field values into a checkbox boolean.
 */
function coerceToCheckbox(value: PdfField['value']): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'string') {
    const norm = value.trim().toLowerCase();
    return (
      norm === 'true' ||
      norm === '1' ||
      norm === 'yes' ||
      norm === 'y' ||
      norm === 'checked' ||
      norm === 'on'
    );
  }
  return false;
}

/**
 * Render input fields for overlay editing.
 */
export function FieldInputOverlay({
  fields,
  pageSize,
  scale,
  globalFieldFont,
  globalFieldFontSize,
  globalFieldFontColor,
  selectedFieldId,
  onSelectField,
  onUpdateField,
  onSelectRadioField,
}: FieldInputOverlayProps) {
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const activeDraftValues = useMemo(() => {
    const fieldById = new Map(fields.map((field) => [field.id, field] as const));
    return Object.entries(draftValues).reduce<Record<string, string>>((acc, [fieldId, draftValue]) => {
      const field = fieldById.get(fieldId);
      if (!field || coerceToString(field.value) === draftValue) {
        return acc;
      }
      acc[fieldId] = draftValue;
      return acc;
    }, {});
  }, [draftValues, fields]);

  /**
   * Generate focus handlers that keep selection in sync.
   */
  const handleFocus = (fieldId: string) => () => onSelectField(fieldId);

  const handleTextChange =
    (field: PdfField) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { value } = event.target;
      setDraftValues((prev) => ({ ...prev, [field.id]: value }));
    };

  const handleCheckboxChange = (field: PdfField) => (event: ChangeEvent<HTMLInputElement>) => {
    onUpdateField(field.id, { value: event.target.checked });
  };

  const handleRadioClick = (field: PdfField, isChecked: boolean) => (event: ReactMouseEvent<HTMLInputElement>) => {
    if (!isChecked) {
      return;
    }
    event.preventDefault();
    onSelectRadioField(field.id);
  };

  const handleRadioChange = (field: PdfField) => (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.checked) {
      return;
    }
    onSelectRadioField(field.id);
  };

  const handleBlur =
    (field: PdfField) =>
    (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      setDraftValues((prev) => {
        if (!(field.id in prev)) return prev;
        const next = { ...prev };
        delete next[field.id];
        return next;
      });
      if (field.type === 'date') {
        const normalized = nextValue.trim();
        if (normalized !== coerceToString(field.value)) {
          onUpdateField(field.id, { value: normalized || null });
        }
        return;
      }
      if (nextValue !== coerceToString(field.value)) {
        onUpdateField(field.id, { value: nextValue });
      }
    };

  return (
    <div
      className="field-layer"
      style={{
        width: pageSize.width * scale,
        height: pageSize.height * scale,
      }}
    >
      {fields.map((field) => {
        const rect = toViewportRect(field.rect, scale);
        const confidenceTier = fieldConfidenceTierForField(field);
        const selected = field.id === selectedFieldId;
        const minSide = Math.min(rect.width, rect.height);
        const isTextLikeField = field.type === 'text' || field.type === 'date';
        const safeScale = scale > 0 ? scale : 1;
        const autoFontSizePx = Math.max(8, Math.min(32, rect.height * 0.48));
        const fontSize =
          isTextLikeField
            ? resolveEffectiveFieldFontSize(
                field,
                globalFieldFontSize,
                autoFontSizePx / safeScale,
              ) * safeScale
            : field.type === 'signature'
              ? autoFontSizePx
              : undefined;
        const checkboxSize =
          field.type === 'checkbox'
            ? Math.max(18, Math.min(56, minSide + 4))
            : field.type === 'radio'
              ? Math.max(18, Math.min(56, minSide + 4))
              : undefined;
        const fieldFont = isTextLikeField
          ? resolveEffectiveFieldFont(field, globalFieldFont)
          : null;
        const inputFontStyle = fieldFont ? cssStyleForPdfBase14Font(fieldFont) : undefined;
        const inputTextColor = isTextLikeField
          ? resolveEffectiveFieldFontColor(field, globalFieldFontColor)
          : undefined;
        const inputTextStyle =
          inputFontStyle || inputTextColor
            ? { ...inputFontStyle, ...(inputTextColor ? { color: inputTextColor } : {}) }
            : undefined;

        const boxClassName = [
          'field-input-box',
          `field-input-box--${field.type}`,
          `field-input-box--conf-${confidenceTier}`,
          selected ? 'field-input-box--active' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const trimmedName = field.name.trim();
        const inputName = trimmedName || field.id;
        const inputId = `field-input-${field.id}`;
        const radioOptionValue = field.type === 'radio'
          ? String(field.radioOptionKey || field.name || field.id)
          : '';
        const radioChecked = field.type === 'radio'
          ? coerceToString(field.value) === radioOptionValue
          : false;
        const commonInputProps = {
          onFocus: handleFocus(field.id),
          id: inputId,
          name: inputName,
          'aria-label': inputName,
        };

        return (
          <div
            key={field.id}
            className={boxClassName}
            data-field-id={field.id}
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              ...(fontSize ? { ['--field-font-size' as string]: `${fontSize}px` } : {}),
              ...(checkboxSize ? { ['--field-checkbox-size' as string]: `${checkboxSize}px` } : {}),
            }}
          >
            {field.type === 'checkbox' ? (
              <input
                {...commonInputProps}
                className="field-input field-input--checkbox"
                type="checkbox"
                checked={coerceToCheckbox(field.value)}
                onChange={handleCheckboxChange(field)}
              />
            ) : field.type === 'radio' ? (
              <input
                {...commonInputProps}
                className="field-input field-input--radio"
                type="radio"
                name={field.radioGroupId || field.radioGroupKey || inputName}
                checked={radioChecked}
                onClick={handleRadioClick(field, radioChecked)}
                onChange={handleRadioChange(field)}
              />
            ) : field.type === 'date' ? (
              <input
                {...commonInputProps}
                className="field-input"
                type="date"
                style={inputTextStyle}
                value={activeDraftValues[field.id] ?? coerceToString(field.value)}
                onChange={handleTextChange(field)}
                onBlur={handleBlur(field)}
              />
            ) : field.type === 'signature' ? (
              <input
                {...commonInputProps}
                className="field-input field-input--signature"
                type="text"
                value={activeDraftValues[field.id] ?? coerceToString(field.value)}
                onChange={handleTextChange(field)}
                placeholder="Sign here"
                onBlur={handleBlur(field)}
              />
            ) : (
              <input
                {...commonInputProps}
                className="field-input"
                type="text"
                style={inputTextStyle}
                value={activeDraftValues[field.id] ?? coerceToString(field.value)}
                onChange={handleTextChange(field)}
                placeholder=""
                onBlur={handleBlur(field)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
