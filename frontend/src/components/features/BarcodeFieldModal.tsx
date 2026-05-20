/**
 * Setup dialog for pdf417 / 1D barcode / qr fields. The creator defines a list
 * of user-named "classes", each mapped either to a manual value or another
 * field on the form. A live preview renders alongside the configuration so the
 * creator can see exactly what will encode.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import type { BarcodeClass, PdfField } from '../../types';
import {
  dependencySourceFields,
  dependencyRefForField,
  generateBarcodeClassId,
  legacyBarcodeClassesFor,
  resolveBarcodeClasses,
} from '../../utils/appOnlyFieldDependencies';
import { buildPdf417ScanTextFromClasses, generatePdf417DataUrl } from '../../utils/pdf417';
import { BARCODE_ID_LENGTH, generateBarcodeDataUrl } from '../../utils/barcode';
import { QR_VALUE_MAX_LENGTH, generateQrDataUrl } from '../../utils/qr';
import { DialogCloseButton, DialogFrame } from '../ui/Dialog';
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

function fieldLabelForType(type: PdfField['type']): { title: string; description: string; allowMultiple: boolean } {
  if (type === 'pdf417') {
    return {
      title: 'PDF417 setup',
      description: 'Add one class for every label you want encoded in the barcode. Classes are concatenated as LABEL: value lines.',
      allowMultiple: true,
    };
  }
  if (type === 'barcode') {
    return {
      title: '1D barcode setup',
      description: 'Map the 9 digit value: type it directly, or pull it from another field on the form.',
      allowMultiple: false,
    };
  }
  return {
    title: 'QR code setup',
    description: 'Set the text encoded by the QR code: type it directly, or pull it from another field on the form.',
    allowMultiple: false,
  };
}

export function BarcodeFieldModal({ open, field, fields, onClose, onSave }: BarcodeFieldModalProps) {
  if (!open || !field) return null;
  if (field.type !== 'pdf417' && field.type !== 'barcode' && field.type !== 'qr') return null;
  return <BarcodeFieldModalContent open={open} field={field} fields={fields} onClose={onClose} onSave={onSave} />;
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

  useEffect(() => {
    if (open) {
      setClasses(initialClassesForField(field));
    }
  }, [open, field.id]);

  const { title, description, allowMultiple } = useMemo(() => fieldLabelForType(field.type), [field.type]);
  const selectableFields = useMemo(
    () => dependencySourceFields(fields, field.id),
    [fields, field.id],
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
    return generateBarcodeDataUrl(first.value) ?? generateQrDataUrl(first.value);
  }, [field.type, resolution]);

  const previewText = useMemo(() => {
    if (field.type === 'pdf417') return buildPdf417ScanTextFromClasses(resolution.classes);
    const first = resolution.classes[0];
    if (!first || (first.status !== 'ready' && first.status !== 'manual')) return '';
    return first.value;
  }, [field.type, resolution]);

  const previewWarnings = resolution.messages;

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
    const cleaned = classes
      .map((entry) => ({
        ...entry,
        label: String(entry.label || '').trim(),
        manualValue: entry.mode === 'manual' ? String(entry.manualValue || '') : null,
        fieldRef: entry.mode === 'field' ? entry.fieldRef ?? null : null,
      }))
      .filter((entry) => entry.label || entry.manualValue || entry.fieldRef);
    onSave(field.id, {
      barcodeClasses: cleaned,
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
      <div className="barcode-modal__header">
        <div>
          <h2 id={dialogTitleId}>{title}</h2>
          <p id={dialogDescriptionId}>{description}</p>
        </div>
        <DialogCloseButton onClick={onClose} label={`Close ${title}`} />
      </div>
      <div className="barcode-modal__body">
        <section className="barcode-modal__config">
          <div className="barcode-modal__config-header">
            <h3>Classes</h3>
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
            <p className="barcode-modal__empty">No classes yet. Add one to start encoding values.</p>
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
                  if (isPlaceholder) {
                    setClasses([{ ...entry, id: generateBarcodeClassId(), manualValue: event.target.value }]);
                  } else {
                    handleUpdate(entry.id, { manualValue: event.target.value });
                  }
                };
                const handleFieldChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
                  const sourceId = event.target.value;
                  const sourceField = selectableFields.find((candidate) => candidate.id === sourceId);
                  const fieldRef = sourceField ? dependencyRefForField(sourceField) : null;
                  if (isPlaceholder) {
                    setClasses([{ ...entry, id: generateBarcodeClassId(), fieldRef }]);
                  } else {
                    handleUpdate(entry.id, { fieldRef });
                  }
                };
                return (
                  <li key={entry.id} className="barcode-modal__class-row">
                    <div className="barcode-modal__class-grid">
                      <label className="barcode-modal__label">
                        <span>Label</span>
                        <input
                          type="text"
                          value={entry.label}
                          onChange={handleLabel}
                          placeholder={field.type === 'pdf417' ? 'e.g. ACCOUNT ID' : 'Value'}
                          maxLength={64}
                        />
                      </label>
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
                          <span>Value</span>
                          <input
                            type="text"
                            value={entry.manualValue ?? ''}
                            onChange={handleManual}
                            placeholder={field.type === 'barcode' ? '9 digits' : 'Enter value'}
                            maxLength={field.type === 'qr' ? QR_VALUE_MAX_LENGTH : undefined}
                          />
                        </label>
                      ) : (
                        <label className="barcode-modal__label">
                          <span>Source field</span>
                          <select
                            value={entry.fieldRef?.fieldId ?? ''}
                            onChange={handleFieldChange}
                          >
                            <option value="">Select a field…</option>
                            {selectableFields.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.name}
                              </option>
                            ))}
                          </select>
                        </label>
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
        </section>
        <section className="barcode-modal__preview">
          <h3>Preview</h3>
          <div className="barcode-modal__preview-image">
            {previewDataUrl ? (
              <img src={previewDataUrl} alt="Barcode preview" />
            ) : (
              <div className="barcode-modal__preview-empty">Add a class with a value to see the preview.</div>
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
        <button type="button" className="ui-button ui-button--primary" onClick={handleSave}>
          Save barcode setup
        </button>
      </div>
    </DialogFrame>
  );
}
