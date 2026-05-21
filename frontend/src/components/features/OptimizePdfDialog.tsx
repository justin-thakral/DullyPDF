import { openUsageDocsWindow, USAGE_DOCS_ROUTES } from '../../utils/usageDocs';
import { DialogCloseButton, DialogFrame } from '../ui/Dialog';
import './OptimizePdfDialog.css';

type OptimizePdfDialogProps = {
  open: boolean;
  sourceFileName?: string | null;
  sourceFileSize?: number | null;
  optimizing?: boolean;
  onClose: () => void;
  onOptimize: () => void;
};

function formatBytes(value?: number | null): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

export function OptimizePdfDialog({
  open,
  sourceFileName,
  sourceFileSize,
  optimizing = false,
  onClose,
  onOptimize,
}: OptimizePdfDialogProps) {
  return (
    <DialogFrame
      open={open}
      onClose={optimizing ? undefined : onClose}
      className="optimize-pdf-dialog"
      labelledBy="optimize-pdf-dialog-title"
      closeOnBackdrop={false}
    >
      <header className="optimize-pdf-dialog__header">
        <div>
          <p className="optimize-pdf-dialog__eyebrow">PDF Tools</p>
          <h2 id="optimize-pdf-dialog-title">Compress / Optimize PDF</h2>
          <p>{sourceFileName || 'Current PDF'}</p>
        </div>
        <div className="optimize-pdf-dialog__header-actions">
          <button
            type="button"
            className="ui-button ui-button--ghost ui-button--compact"
            onClick={() => openUsageDocsWindow(USAGE_DOCS_ROUTES.pdfTools)}
          >
            Usage Docs
          </button>
          <DialogCloseButton onClick={optimizing ? () => {} : onClose} />
        </div>
      </header>

      <div className="optimize-pdf-dialog__body">
        <dl className="optimize-pdf-dialog__stats">
          <div>
            <dt>Current size</dt>
            <dd>{formatBytes(sourceFileSize)}</dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>Lossless cleanup</dd>
          </div>
        </dl>

        <section className="optimize-pdf-dialog__panel">
          <h3>What This Does</h3>
          <ul>
            <li>Removes unreachable PDF objects and rewrites object streams.</li>
            <li>Deflates page, image, and font streams without intentionally lowering image quality.</li>
            <li>Keeps the same pages and field geometry in the active workspace.</li>
          </ul>
        </section>

        <p className="optimize-pdf-dialog__note">
          If the optimized result is larger, DullyPDF keeps the current PDF bytes instead of replacing them with a larger file.
        </p>
      </div>

      <footer className="optimize-pdf-dialog__footer">
        <button
          type="button"
          className="ui-button ui-button--ghost"
          disabled={optimizing}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="ui-button ui-button--primary"
          disabled={optimizing}
          onClick={onOptimize}
        >
          {optimizing ? 'Optimizing...' : 'Optimize PDF'}
        </button>
      </footer>
    </DialogFrame>
  );
}
