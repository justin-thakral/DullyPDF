/**
 * Overlay layer that renders input elements aligned to PDF fields.
 */
import { useMemo, useState, type ChangeEvent, type FocusEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type {
  FieldFontChoice,
  FieldFontColorChoice,
  FieldFontSizeChoice,
  FieldTextAlignmentChoice,
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
  resolveEffectiveFieldTextAlignment,
} from '../../utils/fieldFonts';
import { IMAGE_ACCEPT, readImageFileAsDataUrl } from '../../utils/images';
import { buildPdf417ScanText, generatePdf417DataUrl } from '../../utils/pdf417';
import { BARCODE_ID_LENGTH, barcodeDigitsFromValue, generateBarcodeDataUrl, isCompleteBarcodeValue } from '../../utils/barcode';
import { generateQrDataUrl, isCompleteQrValue } from '../../utils/qr';
import { resolveBarcodeValue, resolvePdf417Data, resolveQrValue } from '../../utils/appOnlyFieldDependencies';

type FieldInputOverlayProps = {
  fields: PdfField[];
  pageSize: PageSize;
  scale: number;
  globalFieldFont: FieldFontChoice;
  globalFieldFontSize: FieldFontSizeChoice;
  globalFieldFontColor: FieldFontColorChoice;
  globalFieldAlignment: FieldTextAlignmentChoice;
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
  globalFieldAlignment,
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

  const handleBarcodeChange = (field: PdfField) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = barcodeDigitsFromValue(event.target.value);
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

  const handleImageChange = (field: PdfField) => async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    try {
      const image = await readImageFileAsDataUrl(file);
      onUpdateField(field.id, { ...image, value: null });
    } catch {
      // Keep the current field unchanged when an unsupported or unreadable image is selected.
    }
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
      if (field.type === 'barcode') {
        if (field.barcodeSourceField) {
          return;
        }
        const normalized = barcodeDigitsFromValue(nextValue);
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
        const isTextLikeField = field.type === 'text';
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
        const inputTextAlign = isTextLikeField
          ? resolveEffectiveFieldTextAlignment(field, globalFieldAlignment)
          : undefined;
        const inputTextStyle =
          inputFontStyle || inputTextColor || inputTextAlign
            ? {
                ...inputFontStyle,
                ...(inputTextColor ? { color: inputTextColor } : {}),
                ...(inputTextAlign ? { textAlign: inputTextAlign } : {}),
              }
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
        const resolvedBarcode = field.type === 'barcode' ? resolveBarcodeValue(field, fields) : null;
        const resolvedPdf417 = field.type === 'pdf417' ? resolvePdf417Data(field, fields) : null;
        const resolvedQr = field.type === 'qr' ? resolveQrValue(field, fields) : null;
        const barcodeValue = field.type === 'barcode'
          ? field.barcodeSourceField
            ? resolvedBarcode?.digits ?? ''
            : activeDraftValues[field.id] ?? barcodeDigitsFromValue(field.value)
          : '';
        const barcodeDataUrl = field.type === 'barcode' ? generateBarcodeDataUrl(barcodeValue) : null;
        const pdf417Text = resolvedPdf417 ? buildPdf417ScanText(resolvedPdf417.data) : '';
        const pdf417DataUrl = field.type === 'pdf417' ? generatePdf417DataUrl(pdf417Text) : null;
        const qrText = resolvedQr?.value ?? '';
        const qrDataUrl = field.type === 'qr' ? generateQrDataUrl(qrText) : null;
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
            ) : field.type === 'image' ? (
              <label
                className={`field-image-input${field.imageDataUrl ? ' field-image-input--filled' : ''}`}
                htmlFor={inputId}
                title={field.imageName || inputName}
                onClick={() => onSelectField(field.id)}
              >
                {field.imageDataUrl ? (
                  <img src={field.imageDataUrl} alt="" />
                ) : (
                  <span>Image</span>
                )}
                <input
                  {...commonInputProps}
                  className="field-image-input__control"
                  type="file"
                  accept={IMAGE_ACCEPT}
                  onChange={handleImageChange(field)}
                />
              </label>
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
            ) : field.type === 'pdf417' ? (
              <button
                {...commonInputProps}
                className="field-pdf417-preview"
                type="button"
                onClick={() => onSelectField(field.id)}
                title={pdf417Text}
              >
                {pdf417DataUrl ? (
                  <img src={pdf417DataUrl} alt="" />
                ) : (
                  <span>PDF417</span>
                )}
              </button>
            ) : field.type === 'barcode' ? (
              <div className="field-barcode-control">
                <div className="field-barcode-preview" aria-hidden="true">
                  {barcodeDataUrl ? (
                    <img src={barcodeDataUrl} alt="" />
                  ) : (
                    <span>{isCompleteBarcodeValue(barcodeValue) ? 'Barcode' : '9 digit ID'}</span>
                  )}
                </div>
                <input
                  {...commonInputProps}
                  className="field-barcode-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={BARCODE_ID_LENGTH}
                  value={barcodeValue}
                  readOnly={Boolean(field.barcodeSourceField)}
                  onChange={field.barcodeSourceField ? undefined : handleBarcodeChange(field)}
                  onBlur={handleBlur(field)}
                />
              </div>
            ) : field.type === 'qr' ? (
              <button
                {...commonInputProps}
                className="field-qr-preview"
                type="button"
                onClick={() => onSelectField(field.id)}
                title={qrText}
              >
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="" />
                ) : (
                  <span>{isCompleteQrValue(qrText) ? 'QR Code' : 'QR'}</span>
                )}
              </button>
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
