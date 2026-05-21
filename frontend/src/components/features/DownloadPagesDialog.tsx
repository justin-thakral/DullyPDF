import { useMemo, useState } from 'react';
import type { MaterializePdfExportMode } from '../../services/api';
import { parsePdfPageSelection, summarizePdfPageSelection } from '../../utils/pdfPageRanges';
import { openUsageDocsWindow, USAGE_DOCS_ROUTES } from '../../utils/usageDocs';
import { DialogCloseButton, DialogFrame } from '../ui/Dialog';
import './DownloadPagesDialog.css';

export type DownloadPagesPayload = {
  pages: number[];
  exportMode: MaterializePdfExportMode;
};

type DownloadPagesDialogProps = {
  open: boolean;
  pageCount: number;
  currentPage: number;
  sourceFileName?: string | null;
  downloading?: boolean;
  onClose: () => void;
  onDownload: (payload: DownloadPagesPayload) => void;
};

function clampPage(page: number, pageCount: number): number {
  if (pageCount < 1) return 1;
  return Math.min(Math.max(1, page), pageCount);
}

function buildAllPages(pageCount: number): number[] {
  return Array.from({ length: Math.max(0, pageCount) }, (_, index) => index + 1);
}

function normalizeSelectedPages(pages: number[], pageCount: number): number[] {
  const seen = new Set<number>();
  const next: number[] = [];
  for (const rawPage of pages) {
    const page = Number(rawPage);
    if (!Number.isInteger(page) || page < 1 || page > pageCount || seen.has(page)) continue;
    seen.add(page);
    next.push(page);
  }
  return next;
}

export function DownloadPagesDialog({
  open,
  pageCount,
  currentPage,
  sourceFileName,
  downloading = false,
  onClose,
  onDownload,
}: DownloadPagesDialogProps) {
  if (!open) return null;
  const dialogSessionKey = `${pageCount}:${currentPage}:${sourceFileName || ''}`;
  return (
    <DownloadPagesDialogContent
      key={dialogSessionKey}
      open={open}
      pageCount={pageCount}
      currentPage={currentPage}
      sourceFileName={sourceFileName}
      downloading={downloading}
      onClose={onClose}
      onDownload={onDownload}
    />
  );
}

function DownloadPagesDialogContent({
  open,
  pageCount,
  currentPage,
  sourceFileName,
  downloading = false,
  onClose,
  onDownload,
}: DownloadPagesDialogProps) {
  const initialPage = clampPage(currentPage, pageCount);
  const [selectedPages, setSelectedPages] = useState<number[]>(() => pageCount > 0 ? [initialPage] : []);
  const [rangeInput, setRangeInput] = useState(() => pageCount > 0 ? String(initialPage) : '');
  const [exportMode, setExportMode] = useState<MaterializePdfExportMode>('editable');
  const [error, setError] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selectedPages), [selectedPages]);
  const summary = useMemo(() => summarizePdfPageSelection(selectedPages), [selectedPages]);
  const pageButtons = useMemo(() => buildAllPages(pageCount), [pageCount]);

  const applyRangeInput = () => {
    try {
      const pages = normalizeSelectedPages(parsePdfPageSelection(rangeInput, pageCount), pageCount);
      if (!pages.length) {
        setError('Choose at least one page to download.');
        return;
      }
      setSelectedPages(pages);
      setError(null);
    } catch (rangeError) {
      setError(rangeError instanceof Error ? rangeError.message : 'Could not read that page range.');
    }
  };

  const togglePage = (page: number) => {
    setSelectedPages((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(page)) {
        nextSet.delete(page);
      } else {
        nextSet.add(page);
      }
      return Array.from(nextSet).sort((left, right) => left - right);
    });
    setError(null);
  };

  const handleDownload = () => {
    const pages = normalizeSelectedPages(selectedPages, pageCount);
    if (!pages.length) {
      setError('Choose at least one page to download.');
      return;
    }
    onDownload({ pages, exportMode });
  };

  return (
    <DialogFrame
      open={open}
      onClose={downloading ? undefined : onClose}
      className="download-pages-dialog"
      labelledBy="download-pages-dialog-title"
      closeOnBackdrop={false}
    >
      <header className="download-pages-dialog__header">
        <div>
          <p className="download-pages-dialog__eyebrow">Download</p>
          <h2 id="download-pages-dialog-title">Download Specific Pages</h2>
          <p>{sourceFileName || 'Current PDF'}</p>
        </div>
        <div className="download-pages-dialog__header-actions">
          <button
            type="button"
            className="ui-button ui-button--ghost ui-button--compact"
            onClick={() => openUsageDocsWindow(USAGE_DOCS_ROUTES.saveDownloadProfile)}
          >
            Usage Docs
          </button>
          <DialogCloseButton onClick={downloading ? () => {} : onClose} />
        </div>
      </header>

      <div className="download-pages-dialog__body">
        <section className="download-pages-dialog__section">
          <div className="download-pages-dialog__section-heading">
            <h3>Pages</h3>
            <span>{selectedPages.length} selected</span>
          </div>
          <div className="download-pages-dialog__range-row">
            <label className="download-pages-dialog__field">
              <span>Page range</span>
              <input
                type="text"
                value={rangeInput}
                disabled={downloading}
                onChange={(event) => setRangeInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyRangeInput();
                  }
                }}
                placeholder="1, 3-5, last"
              />
            </label>
            <button
              type="button"
              className="ui-button ui-button--secondary ui-button--compact"
              disabled={downloading || pageCount < 1}
              onClick={applyRangeInput}
            >
              Apply Range
            </button>
          </div>
          <div className="download-pages-dialog__quick-actions" aria-label="Quick page selections">
            <button
              type="button"
              className="ui-button ui-button--ghost ui-button--compact"
              disabled={downloading || pageCount < 1}
              onClick={() => {
                const page = clampPage(currentPage, pageCount);
                setSelectedPages([page]);
                setRangeInput(String(page));
                setError(null);
              }}
            >
              Current Page
            </button>
            <button
              type="button"
              className="ui-button ui-button--ghost ui-button--compact"
              disabled={downloading || pageCount < 1}
              onClick={() => {
                setSelectedPages(buildAllPages(pageCount));
                setRangeInput('all');
                setError(null);
              }}
            >
              All Pages
            </button>
            <button
              type="button"
              className="ui-button ui-button--ghost ui-button--compact"
              disabled={downloading || !selectedPages.length}
              onClick={() => {
                setSelectedPages([]);
                setRangeInput('');
                setError(null);
              }}
            >
              Clear
            </button>
          </div>
          <div className="download-pages-dialog__page-grid" aria-label="Select pages">
            {pageButtons.map((page) => (
              <button
                key={page}
                type="button"
                className="download-pages-dialog__page-button"
                aria-pressed={selectedSet.has(page)}
                disabled={downloading}
                onClick={() => togglePage(page)}
              >
                {page}
              </button>
            ))}
          </div>
          <p className="download-pages-dialog__summary">Selected pages: {summary}</p>
          {error ? <p className="download-pages-dialog__error">{error}</p> : null}
        </section>

        <section className="download-pages-dialog__section">
          <div className="download-pages-dialog__section-heading">
            <h3>Output</h3>
          </div>
          <div className="download-pages-dialog__mode-control" role="group" aria-label="Download format">
            <button
              type="button"
              className="download-pages-dialog__mode-button"
              aria-pressed={exportMode === 'editable'}
              disabled={downloading}
              onClick={() => setExportMode('editable')}
            >
              Editable PDF
            </button>
            <button
              type="button"
              className="download-pages-dialog__mode-button"
              aria-pressed={exportMode === 'flat'}
              disabled={downloading}
              onClick={() => setExportMode('flat')}
            >
              Flat PDF
            </button>
          </div>
          <p className="download-pages-dialog__note">
            DullyPDF keeps the same export behavior as the regular download, but only includes fields on the selected pages.
          </p>
        </section>
      </div>

      <footer className="download-pages-dialog__footer">
        <button
          type="button"
          className="ui-button ui-button--ghost"
          disabled={downloading}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="ui-button ui-button--primary"
          disabled={downloading || !selectedPages.length}
          onClick={handleDownload}
        >
          {downloading ? 'Downloading...' : 'Download Selected Pages'}
        </button>
      </footer>
    </DialogFrame>
  );
}
