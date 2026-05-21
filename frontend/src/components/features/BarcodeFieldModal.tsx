/**
 * Setup dialog for pdf417 / 1D barcode / qr fields. The creator defines a list
 * of user-named "classes", each mapped either to a manual value or another
 * field on the form. A live preview renders alongside the configuration so the
 * creator can see exactly what will encode.
 */
import { useId, useMemo, useState } from 'react';
import type { BarcodeClass, PdfField } from '../../types';
import {
  dependencySourceFields,
  dependencyRefForField,
  generateBarcodeClassId,
  legacyBarcodeClassesFor,
  resolveBarcodeClasses,
} from '../../utils/appOnlyFieldDependencies';
import { buildPdf417ScanTextFromClasses, generatePdf417DataUrl } from '../../utils/pdf417';
import { BARCODE_ID_LENGTH, barcodeDigitsFromValue, generateBarcodeDataUrl } from '../../utils/barcode';
import { QR_VALUE_MAX_LENGTH, generateQrDataUrl } from '../../utils/qr';
import { DialogCloseButton, DialogFrame } from '../ui/Dialog';
import { FieldDependencyPicker, type FieldDependencyPickerOption } from './FieldDependencyPicker';
import './BarcodeFieldModal.css';

type BarcodeFieldModalProps = {
  open: boolean;
  field: PdfField | null;
  fields: PdfField[];
  onClose: () => void;
  onSave: (fieldId: string, updates: Partial<PdfField>) => void;
};

function initialClassesForField(field: PdfField): BarcodeClass[] {
  if (Array.isArray(field.barcodeClasses)) return field.barcodeClasses;
  const migrated = legacyBarcodeClassesFor(field);
  return migrated ?? [];
}

type BarcodeModalCopy = {
  title: string;
  description: string;
  allowMultiple: boolean;
  contentTitle: string;
  contentDescription: string;
  valueLabel: string;
  valuePlaceholder: string;
  previewEmpty: string;
  saveLabel: string;
};

function fieldLabelForType(type: PdfField['type']): BarcodeModalCopy {
  if (type === 'pdf417') {
    return {
      title: 'PDF417 Setup',
      description: 'Build a labeled PDF417 payload from manual values or fields on this form.',
      allowMultiple: true,
      contentTitle: 'Encoded Classes',
      contentDescription: 'Add each class in the order it should appear in the scan text.',
      valueLabel: 'Class value',
      valuePlaceholder: 'Enter value',
      previewEmpty: 'Add a class with a value to see the PDF417 preview.',
      saveLabel: 'Save PDF417 Setup',
    };
  }
  if (type === 'barcode') {
    return {
      title: '1D Code 128 Setup',
      description: 'Encode one 9 digit Code 128 value from manual text or a source field.',
      allowMultiple: false,
      contentTitle: 'Encoded Value',
      contentDescription: 'Choose a manual 9 digit value or connect one field that supplies it.',
      valueLabel: '9 digit value',
      valuePlaceholder: '9 digits',
      previewEmpty: 'Enter 9 digits to see the barcode preview.',
      saveLabel: 'Save 1D Code 128 Setup',
    };
  }
  return {
    title: 'QR Code Setup',
    description: 'Encode one QR text value from manual text or a source field.',
    allowMultiple: false,
    contentTitle: 'Encoded Value',
    contentDescription: 'Choose manual text or connect one field that supplies the QR payload.',
    valueLabel: 'QR text',
    valuePlaceholder: 'Enter QR text',
    previewEmpty: 'Enter text to see the QR preview.',
    saveLabel: 'Save QR Code Setup',
  };
}

export function BarcodeFieldModal({ open, field, fields, onClose, onSave }: BarcodeFieldModalProps) {
  if (!open || !field) return null;
  if (field.type !== 'pdf417' && field.type !== 'barcode' && field.type !== 'qr') return null;
  return <BarcodeFieldModalContent key={field.id} open={open} field={field} fields={fields} onClose={onClose} onSave={onSave} />;
}

function BarcodeFieldModalContent({
  open,
  field,
  fields,
  onClose,
  onSave,
}: BarcodeFieldModalProps & { field: PdfField }) {
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const [classes, setClasses] = useState<BarcodeClass[]>(() => initialClassesForField(field));

  const modalCopy = useMemo(() => fieldLabelForType(field.type), [field.type]);
  const { title, description, allowMultiple } = modalCopy;
  const selectableFields = useMemo(
    () => dependencySourceFields(fields, field.id),
    [fields, field.id],
  );
  const selectableFieldOptions = useMemo<FieldDependencyPickerOption[]>(
    () => selectableFields.map((candidate) => ({
      field: candidate,
      label: candidate.name,
      meta: `Page ${candidate.page}`,
      searchText: `${candidate.name} ${candidate.id} ${candidate.type}`,
    })),
    [selectableFields],
  );

  const draftField = useMemo<PdfField>(
    () => ({ ...field, barcodeClasses: classes }),
    [field, classes],
  );

  const resolution = useMemo(
    () => resolveBarcodeClasses(draftField, fields),
    [draftField, fields],
  );

  const previewDataUrl = useMemo(() => {
    if (field.type === 'pdf417') {
      const scanText = buildPdf417ScanTextFromClasses(resolution.classes);
      return scanText ? generatePdf417DataUrl(scanText) : null;
    }
    if (field.type === 'barcode') {
      const first = resolution.classes[0];
      if (!first || (first.status !== 'ready' && first.status !== 'manual')) return null;
      const digits = first.value.replace(/\D/g, '').slice(0, BARCODE_ID_LENGTH);
      if (digits.length !== BARCODE_ID_LENGTH) return null;
      return generateBarcodeDataUrl(digits);
    }
    const first = resolution.classes[0];
    if (!first || (first.status !== 'ready' && first.status !== 'manual')) return null;
    return generateQrDataUrl(first.value);
  }, [field.type, resolution]);

  const previewText = useMemo(() => {
    if (field.type === 'pdf417') return buildPdf417ScanTextFromClasses(resolution.classes);
    const first = resolution.classes[0];
    if (!first || (first.status !== 'ready' && first.status !== 'manual')) return '';
    return first.value;
  }, [field.type, resolution]);

  const previewWarnings = resolution.messages;
  const cleanedClasses = useMemo(
    () => {
      const normalized = classes
        .map((entry) => ({
          ...entry,
          label: String(entry.label || '').trim(),
          manualValue: entry.mode === 'manual'
            ? field.type === 'barcode'
              ? barcodeDigitsFromValue(entry.manualValue ?? '')
              : String(entry.manualValue || '')
            : null,
          fieldRef: entry.mode === 'field' ? entry.fieldRef ?? null : null,
        }))
        .filter((entry) => entry.label || entry.manualValue || entry.fieldRef);
      return allowMultiple ? normalized : normalized.slice(0, 1);
    },
    [allowMultiple, classes, field.type],
  );
  const validationMessage = useMemo(() => {
    if (field.type !== 'barcode') return null;
    const first = cleanedClasses[0];
    if (!first) return 'Enter exactly 9 digits or choose a source field.';
    if (first.mode === 'manual') {
      return barcodeDigitsFromValue(first.manualValue ?? '').length === BARCODE_ID_LENGTH
        ? null
        : 'Enter exactly 9 digits for the Code 128 value.';
    }
    return first.fieldRef ? null : 'Choose a source field for the Code 128 value.';
  }, [cleanedClasses, field.type]);

  const handleAddClass = () => {
    setClasses((prev) => [
      ...prev,
      {
        id: generateBarcodeClassId(),
        label: '',
        mode: 'manual',
        manualValue: '',
        fieldRef: null,
      },
    ]);
  };

  const handleRemoveClass = (id: string) => {
    setClasses((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleUpdate = (id: string, updates: Partial<BarcodeClass>) => {
    setClasses((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)));
  };

  const handleSave = () => {
    if (validationMessage) return;
    onSave(field.id, {
      barcodeClasses: cleanedClasses,
      // Clear legacy storage so the new model is the single source of truth.
      pdf417Name: null,
      pdf417Dob: null,
      pdf417Data: null,
      pdf417FieldMappings: null,
      barcodeSourceField: null,
      qrSourceField: null,
    });
    onClose();
  };

  const showAddButton = allowMultiple;
  const displayClasses = (!allowMultiple && classes.length === 0)
    ? [{
        id: 'placeholder',
        label: '',
        mode: 'manual' as const,
        manualValue: '',
        fieldRef: null,
      }]
    : classes;

  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      className="barcode-modal"
      labelledBy={dialogTitleId}
      describedBy={dialogDescriptionId}
    >
      <header className="barcode-modal__header">
        <div>
          <h2 id={dialogTitleId}>{title}</h2>
          <p id={dialogDescriptionId}>{description}</p>
        </div>
        <DialogCloseButton onClick={onClose} label={`Close ${title}`} />
      </header>
      <div className="barcode-modal__body">
        <section className="barcode-modal__panel barcode-modal__config" aria-labelledby={`${dialogTitleId}-content`}>
          <div className="barcode-modal__section-header">
            <div>
              <h3 id={`${dialogTitleId}-content`}>{modalCopy.contentTitle}</h3>
              <p>{modalCopy.contentDescription}</p>
            </div>
            {showAddButton ? (
              <button
                type="button"
                className="ui-button ui-button--ghost ui-button--compact"
                onClick={handleAddClass}
              >
                + Add class
              </button>
            ) : null}
          </div>
          {displayClasses.length === 0 ? (
            <p className="barcode-modal__empty">No classes configured yet. Add one to start encoding values.</p>
          ) : (
            <ul className="barcode-modal__class-list">
              {displayClasses.map((entry) => {
                const isPlaceholder = entry.id === 'placeholder';
                const handleLabel = (event: React.ChangeEvent<HTMLInputElement>) => {
                  if (isPlaceholder) {
                    setClasses([{ ...entry, id: generateBarcodeClassId(), label: event.target.value }]);
                  } else {
                    handleUpdate(entry.id, { label: event.target.value });
                  }
                };
                const handleMode = (mode: 'manual' | 'field') => {
                  if (isPlaceholder) {
                    setClasses([{ ...entry, id: generateBarcodeClassId(), mode }]);
                  } else {
                    handleUpdate(entry.id, { mode });
                  }
                };
                const handleManual = (event: React.ChangeEvent<HTMLInputElement>) => {
                  const manualValue = field.type === 'barcode'
                    ? barcodeDigitsFromValue(event.target.value)
                    : event.target.value;
                  if (isPlaceholder) {
                    setClasses([{ ...entry, id: generateBarcodeClassId(), manualValue }]);
                  } else {
                    handleUpdate(entry.id, { manualValue });
                  }
                };
                const handleFieldSelect = (sourceField: PdfField | null) => {
                  const fieldRef = sourceField ? dependencyRefForField(sourceField) : null;
                  if (isPlaceholder) {
                    setClasses([{ ...entry, id: generateBarcodeClassId(), fieldRef }]);
                  } else {
                    handleUpdate(entry.id, { fieldRef });
                  }
                };
                return (
                  <li key={entry.id} className="barcode-modal__class-row">
                    <div
                      className={`barcode-modal__class-grid${
                        allowMultiple ? '' : ' barcode-modal__class-grid--single'
                      }`}
                    >
                      {allowMultiple ? (
                        <label className="barcode-modal__label">
                          <span>Label</span>
                          <input
                            type="text"
                            value={entry.label}
                            onChange={handleLabel}
                            placeholder="e.g. ACCOUNT ID"
                            maxLength={64}
                          />
                        </label>
                      ) : null}
                      <div className="barcode-modal__mode-group" role="radiogroup">
                        <label className={`barcode-modal__mode${entry.mode === 'manual' ? ' barcode-modal__mode--active' : ''}`}>
                          <input
                            type="radio"
                            checked={entry.mode === 'manual'}
                            onChange={() => handleMode('manual')}
                          />
                          <span>Manual</span>
                        </label>
                        <label className={`barcode-modal__mode${entry.mode === 'field' ? ' barcode-modal__mode--active' : ''}`}>
                          <input
                            type="radio"
                            checked={entry.mode === 'field'}
                            onChange={() => handleMode('field')}
                          />
                          <span>From field</span>
                        </label>
                      </div>
                      {entry.mode === 'manual' ? (
                        <label className="barcode-modal__label">
                          <span>{modalCopy.valueLabel}</span>
                          <input
                            type="text"
                            value={entry.manualValue ?? ''}
                            onChange={handleManual}
                            placeholder={modalCopy.valuePlaceholder}
                            inputMode={field.type === 'barcode' ? 'numeric' : undefined}
                            pattern={field.type === 'barcode' ? '[0-9]*' : undefined}
                            maxLength={field.type === 'qr' ? QR_VALUE_MAX_LENGTH : field.type === 'barcode' ? BARCODE_ID_LENGTH : undefined}
                          />
                        </label>
                      ) : (
                        <FieldDependencyPicker
                          label="Source field"
                          placeholder="Filter by field name"
                          options={selectableFieldOptions}
                          selectedFieldId={entry.fieldRef?.fieldId ?? ''}
                          onSelect={handleFieldSelect}
                          emptyMessage="No source fields available."
                          noMatchesMessage="No source fields match."
                          clearLabel="Clear"
                        />
                      )}
                    </div>
                    {showAddButton && !isPlaceholder ? (
                      <button
                        type="button"
                        className="barcode-modal__remove"
                        aria-label="Remove class"
                        onClick={() => handleRemoveClass(entry.id)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {validationMessage ? (
            <p className="barcode-modal__validation" role="alert">{validationMessage}</p>
          ) : null}
        </section>
        <section className="barcode-modal__panel barcode-modal__preview" aria-labelledby={`${dialogTitleId}-preview`}>
          <div className="barcode-modal__section-header">
            <div>
              <h3 id={`${dialogTitleId}-preview`}>Preview</h3>
              <p>Review the generated image and encoded text before saving.</p>
            </div>
          </div>
          <div className="barcode-modal__preview-image">
            {previewDataUrl ? (
              <img src={previewDataUrl} alt="Barcode preview" />
            ) : (
              <div className="barcode-modal__preview-empty">{modalCopy.previewEmpty}</div>
            )}
          </div>
          {field.type === 'pdf417' || previewText ? (
            <textarea
              className="barcode-modal__preview-text"
              readOnly
              value={previewText}
              aria-label="Encoded text preview"
              rows={field.type === 'pdf417' ? 8 : 3}
            />
          ) : null}
          {previewWarnings.length ? (
            <ul className="barcode-modal__warnings">
              {previewWarnings.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
      <div className="barcode-modal__actions">
        <button type="button" className="ui-button ui-button--ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="ui-button ui-button--primary"
          disabled={Boolean(validationMessage)}
          onClick={handleSave}
        >
          {modalCopy.saveLabel}
        </button>
      </div>
    </DialogFrame>
  );
}
