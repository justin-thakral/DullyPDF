import { useCallback, useId, useRef } from 'react';
import { DialogFrame, DialogCloseButton } from '../ui/Dialog';
import type { ExtractedField, ImageFillCreditEstimate } from '../../hooks/useImageFill';
import { openUsageDocsWindow, USAGE_DOCS_ROUTES } from '../../utils/usageDocs';
import './ImageFillDialog.css';

type ImageFillDialogProps = {
  open: boolean;
  onClose: () => void;
  files: File[];
  extractedFields: ExtractedField[];
  loading: boolean;
  error: string | null;
  creditEstimate: ImageFillCreditEstimate;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onRunExtraction: (files: File[]) => void;
  onUpdateFieldValue: (index: number, value: string) => void;
  onRejectField: (index: number) => void;
  onApplyFields: () => void;
};

function confidenceClass(confidence: number): string {
  if (confidence >= 80) return 'image-fill-dialog__field-confidence--high';
  if (confidence >= 50) return 'image-fill-dialog__field-confidence--medium';
  return 'image-fill-dialog__field-confidence--low';
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function ImageFillDialog({
  open,
  onClose,
  files,
  extractedFields,
  loading,
  error,
  creditEstimate,
  onAddFiles,
  onRemoveFile,
  onRunExtraction,
  onUpdateFieldValue,
  onRejectField,
  onApplyFields,
}: ImageFillDialogProps) {
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = event.target.files;
      if (!selectedFiles || selectedFiles.length === 0) return;
      const fileArray = Array.from(selectedFiles);
      onAddFiles(fileArray);
      event.target.value = '';
    },
    [onAddFiles],
  );

  const handleSend = useCallback(() => {
    onRunExtraction(files);
  }, [onRunExtraction, files]);

  const acceptedCount = extractedFields.filter((f) => !f.rejected).length;
  const canSend = files.length > 0 && !loading;
  const canFill = extractedFields.length > 0 && acceptedCount > 0 && !loading;

  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      className="image-fill-dialog__card"
      labelledBy={titleId}
      closeOnBackdrop={false}
      closeOnEscape={true}
    >
      {/* Header */}
      <header className="image-fill-dialog__header">
        <h2 className="image-fill-dialog__title" id={titleId}>
          Fill from information extracted from images and documents
        </h2>
        <button
          className="ui-button ui-button--ghost ui-button--compact"
          type="button"
          onClick={handleUploadClick}
          disabled={loading}
        >
          Upload
        </button>
        <button
          className="ui-button ui-button--primary ui-button--compact"
          type="button"
          onClick={handleSend}
          disabled={!canSend}
        >
          Send
        </button>
        <button
          className="ui-button ui-button--primary ui-button--compact"
          type="button"
          onClick={onApplyFields}
          disabled={!canFill}
        >
          Fill ({acceptedCount})
        </button>
        <button
          className="ui-button ui-button--ghost ui-button--compact"
          type="button"
          onClick={() => openUsageDocsWindow(USAGE_DOCS_ROUTES.fillFromImages)}
          title="Open Fill from Images and Documents usage docs in a new window"
        >
          Usage Docs
        </button>
        <DialogCloseButton onClick={onClose} label="Close image fill dialog" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </header>

      {/* Warning */}
      <div className="image-fill-dialog__warning">
        <span className="image-fill-dialog__warning-icon">!</span>
        Fields must be named before using this feature.
      </div>

      {/* Uploaded Documents */}
      <div className="image-fill-dialog__documents">
        <p className="image-fill-dialog__documents-label">Uploaded Documents</p>
        {files.length > 0 ? (
          <div className="image-fill-dialog__documents-list">
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} className="image-fill-dialog__document-row">
                <span className="image-fill-dialog__document-name">{file.name}</span>
                <button
                  className="image-fill-dialog__document-remove"
                  type="button"
                  onClick={() => onRemoveFile(index)}
                  aria-label={`Remove ${file.name}`}
                  disabled={loading}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="image-fill-dialog__documents-empty">
            No documents uploaded yet. Click Upload to add images or PDFs.
          </p>
        )}
      </div>

      {/* Body: Found Fields */}
      <div className="image-fill-dialog__body">
        {error ? (
          <div className="image-fill-dialog__error">{error}</div>
        ) : null}

        {loading ? (
          <div className="image-fill-dialog__loading">
            <div className="image-fill-dialog__spinner" />
            Extracting information from documents...
          </div>
        ) : extractedFields.length > 0 ? (
          <>
            <p className="image-fill-dialog__fields-label">Found Fields</p>
            <div className="image-fill-dialog__fields-list">
              {extractedFields.map((field, index) => (
                <div
                  key={`${field.fieldName}-${index}`}
                  className={`image-fill-dialog__field-row${field.rejected ? ' image-fill-dialog__field-row--rejected' : ''}`}
                >
                  <span className="image-fill-dialog__field-name" title={field.fieldName}>
                    {field.fieldName}
                  </span>
                  <span className="image-fill-dialog__field-eq">=</span>
                  <input
                    className="image-fill-dialog__field-value"
                    type="text"
                    value={field.value}
                    onChange={(e) => onUpdateFieldValue(index, e.target.value)}
                    disabled={field.rejected}
                  />
                  <span className={`image-fill-dialog__field-confidence ${confidenceClass(field.confidence)}`}>
                    {field.confidence}%
                  </span>
                  <button
                    className={`image-fill-dialog__field-reject${field.rejected ? ' image-fill-dialog__field-reject--active' : ''}`}
                    type="button"
                    onClick={() => onRejectField(index)}
                  >
                    {field.rejected ? 'Undo' : 'Reject'}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : !loading && files.length === 0 ? (
          <div className="image-fill-dialog__empty">
            Upload documents to extract field values.
          </div>
        ) : !loading && files.length > 0 && !error ? (
          <div className="image-fill-dialog__empty">
            Click Send to extract information from the uploaded documents.
          </div>
        ) : null}
      </div>

      {/* Footer: Credit cost breakdown */}
      {files.length > 0 ? (
        <div className="image-fill-dialog__footer">
          <div className="image-fill-dialog__credit-breakdown">
            <span className="image-fill-dialog__credit-label">Credit cost:</span>
            <span className="image-fill-dialog__credit-details">
              {creditEstimate.imageCount > 0 ? (
                <span>
                  {creditEstimate.imageCount} {pluralize(creditEstimate.imageCount, 'image', 'images')} = {creditEstimate.imageCredits} {pluralize(creditEstimate.imageCredits, 'credit', 'credits')}
                </span>
              ) : null}
              {creditEstimate.imageCount > 0 && creditEstimate.docCount > 0 ? (
                <span className="image-fill-dialog__credit-separator"> + </span>
              ) : null}
              {creditEstimate.docCount > 0 ? (
                <span>
                  {creditEstimate.docCount} {pluralize(creditEstimate.docCount, 'document', 'documents')} = {creditEstimate.docCredits}+ {pluralize(creditEstimate.docCredits, 'credit', 'credits')} (1 per 5 pages)
                </span>
              ) : null}
            </span>
            <span className="image-fill-dialog__credit-total">
              Total: {creditEstimate.totalCredits}+ {pluralize(creditEstimate.totalCredits, 'credit', 'credits')}
            </span>
          </div>
        </div>
      ) : null}
    </DialogFrame>
  );
}

export default ImageFillDialog;
