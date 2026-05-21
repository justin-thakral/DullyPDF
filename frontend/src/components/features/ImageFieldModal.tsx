/**
 * Setup dialog for image helper fields. Image uploads, preview state, and
 * export color scaling live here so image helpers follow the same edit pattern
 * as calculation and barcode helper fields.
 */
import { useId, useState, type ChangeEvent } from 'react';
import type { ImageColorMode, PdfField } from '../../types';
import {
  DEFAULT_IMAGE_COLOR_MODE,
  IMAGE_ACCEPT,
  IMAGE_COLOR_MODE_OPTIONS,
  imagePreviewStyleForColorMode,
  normalizeImageColorMode,
  readImageFileAsDataUrl,
} from '../../utils/images';
import { DialogCloseButton, DialogFrame } from '../ui/Dialog';
import './ImageFieldModal.css';

type ImageFieldModalProps = {
  open: boolean;
  field: PdfField | null;
  onClose: () => void;
  onSave: (fieldId: string, updates: Partial<PdfField>) => void;
};

export function ImageFieldModal({ open, field, onClose, onSave }: ImageFieldModalProps) {
  if (!open || !field || field.type !== 'image') return null;
  return <ImageFieldModalContent key={field.id} open={open} field={field} onClose={onClose} onSave={onSave} />;
}

function ImageFieldModalContent({
  open,
  field,
  onClose,
  onSave,
}: ImageFieldModalProps & { field: PdfField }) {
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(field.imageDataUrl ?? null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(field.imageMimeType ?? null);
  const [imageName, setImageName] = useState<string | null>(field.imageName ?? null);
  const [imageColorMode, setImageColorMode] = useState<ImageColorMode>(
    normalizeImageColorMode(field.imageColorMode ?? DEFAULT_IMAGE_COLOR_MODE),
  );
  const [error, setError] = useState<string | null>(null);

  const handleImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const image = await readImageFileAsDataUrl(file);
      setImageDataUrl(image.imageDataUrl);
      setImageMimeType(image.imageMimeType);
      setImageName(image.imageName);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Unable to read this image file.');
    }
  };

  const handleClearImage = () => {
    setImageDataUrl(null);
    setImageMimeType(null);
    setImageName(null);
    setError(null);
  };

  const handleSave = () => {
    onSave(field.id, {
      imageDataUrl,
      imageMimeType,
      imageName,
      imageColorMode,
      value: null,
    });
    onClose();
  };

  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      className="image-modal"
      labelledBy={dialogTitleId}
      describedBy={dialogDescriptionId}
    >
      <header className="image-modal__header">
        <div>
          <h2 id={dialogTitleId}>Image Setup</h2>
          <p id={dialogDescriptionId}>Attach a PNG or JPEG image and choose how it should render into PDF output.</p>
        </div>
        <DialogCloseButton onClick={onClose} label="Close Image Setup" />
      </header>
      <div className="image-modal__body">
        <section className="image-modal__panel" aria-labelledby={`${dialogTitleId}-source`}>
          <div className="image-modal__section-header">
            <div>
              <h3 id={`${dialogTitleId}-source`}>Image Source</h3>
              <p>Upload or clear the image attached to this helper field.</p>
            </div>
          </div>
          <label className="image-modal__label" htmlFor="image-field-file">
            <span>File</span>
            <input
              id="image-field-file"
              name="image-field-file"
              type="file"
              accept={IMAGE_ACCEPT}
              onChange={handleImageFileChange}
            />
          </label>
          {imageName ? <p className="image-modal__filename">{imageName}</p> : null}
          <button
            type="button"
            className="ui-button ui-button--ghost ui-button--compact"
            onClick={handleClearImage}
            disabled={!imageDataUrl && !imageName && !imageMimeType}
          >
            Clear image
          </button>
          {error ? <p className="image-modal__error">{error}</p> : null}
        </section>
        <section className="image-modal__panel" aria-labelledby={`${dialogTitleId}-color`}>
          <div className="image-modal__section-header">
            <div>
              <h3 id={`${dialogTitleId}-color`}>Color Scale</h3>
              <p>Choose the color treatment used when the image is stamped into flat PDFs.</p>
            </div>
          </div>
          <div className="image-modal__mode-group" role="radiogroup" aria-label="Image color scale">
            {IMAGE_COLOR_MODE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`image-modal__mode${imageColorMode === option.value ? ' image-modal__mode--active' : ''}`}
              >
                <input
                  type="radio"
                  name="image-color-mode"
                  checked={imageColorMode === option.value}
                  onChange={() => setImageColorMode(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </section>
        <section className="image-modal__panel image-modal__preview" aria-labelledby={`${dialogTitleId}-preview`}>
          <div className="image-modal__section-header">
            <div>
              <h3 id={`${dialogTitleId}-preview`}>Preview</h3>
              <p>Review the image at the selected color scale before saving.</p>
            </div>
          </div>
          <div className="image-modal__preview-frame">
            {imageDataUrl ? (
              <img src={imageDataUrl} alt="" style={imagePreviewStyleForColorMode(imageColorMode)} />
            ) : (
              <span>No image selected.</span>
            )}
          </div>
        </section>
      </div>
      <div className="image-modal__actions">
        <button type="button" className="ui-button ui-button--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="ui-button ui-button--primary" onClick={handleSave}>
          Save Image Setup
        </button>
      </div>
    </DialogFrame>
  );
}
