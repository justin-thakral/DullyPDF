import { useEffect, useMemo, useRef, useState } from 'react';
import type { PdfPageToolFinalPage } from '../../services/api';
import { loadPdfPageCountFromFile } from '../../utils/pdf';
import { parsePdfPageSelection } from '../../utils/pdfPageRanges';
import { openUsageDocsWindow, USAGE_DOCS_ROUTES } from '../../utils/usageDocs';
import { DialogCloseButton, DialogFrame } from '../ui/Dialog';
import './ManagePagesDialog.css';

type PageRotation = 0 | 90 | 180 | 270;

type CurrentPageSlot = {
  id: string;
  source: 'current';
  originalPage: number;
  rotate: PageRotation;
  deleted: boolean;
};

type InsertedPageSlot = {
  id: string;
  source: 'insert';
  insertSourceId: string;
  sourceName: string;
  page: number;
  rotate: PageRotation;
  deleted: boolean;
};

type PageSlot = CurrentPageSlot | InsertedPageSlot;

type InsertSource = {
  id: string;
  file: File;
  name: string;
  pageCount: number;
};

export type ManagePagesCurrentTransform = {
  originalPage: number;
  nextPage: number;
  rotate: PageRotation;
};

export type ManagePagesApplyPayload = {
  finalPages: PdfPageToolFinalPage[];
  insertFiles: File[];
  currentTransforms: ManagePagesCurrentTransform[];
  removedCurrentPages: number[];
};

type ManagePagesDialogProps = {
  open: boolean;
  pageCount: number;
  currentPage: number;
  sourceFileName?: string | null;
  applying?: boolean;
  onClose: () => void;
  onApply: (payload: ManagePagesApplyPayload) => void;
};

const INSERT_POSITIONS = [
  { value: 'after-current', label: 'After current page' },
  { value: 'before-current', label: 'Before current page' },
  { value: 'end', label: 'End of PDF' },
  { value: 'start', label: 'Start of PDF' },
] as const;

type InsertPosition = (typeof INSERT_POSITIONS)[number]['value'];

function rotateClockwise(value: PageRotation): PageRotation {
  return ((value + 90) % 360) as PageRotation;
}

function makeCurrentSlots(pageCount: number): PageSlot[] {
  return Array.from({ length: Math.max(0, pageCount) }, (_, index) => {
    const page = index + 1;
    return {
      id: `current-${page}`,
      source: 'current',
      originalPage: page,
      rotate: 0,
      deleted: false,
    };
  });
}

function insertIndexForPosition(slots: PageSlot[], position: InsertPosition, currentPage: number): number {
  if (position === 'start') return 0;
  if (position === 'end') return slots.length;
  const currentIndex = slots.findIndex((slot) => slot.source === 'current' && slot.originalPage === currentPage);
  if (currentIndex < 0) return slots.length;
  return position === 'before-current' ? currentIndex : currentIndex + 1;
}

function slotPageLabel(slot: PageSlot): string {
  if (slot.source === 'current') return `Page ${slot.originalPage}`;
  return `${slot.sourceName} p.${slot.page}`;
}

function moveSlot(slots: PageSlot[], index: number, direction: -1 | 1): PageSlot[] {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= slots.length) return slots;
  const next = [...slots];
  const [slot] = next.splice(index, 1);
  next.splice(nextIndex, 0, slot);
  return next;
}

function summarizeChanges(slots: PageSlot[], originalPageCount: number): string {
  const activeSlots = slots.filter((slot) => !slot.deleted);
  const deleted = slots.filter((slot) => slot.deleted && slot.source === 'current').length;
  const inserted = activeSlots.filter((slot) => slot.source === 'insert').length;
  const rotated = activeSlots.filter((slot) => slot.rotate !== 0).length;
  const reordered = activeSlots.some((slot, index) => (
    slot.source !== 'current' || slot.originalPage !== index + 1
  ));
  const parts = [
    deleted ? `${deleted} deleted` : null,
    inserted ? `${inserted} inserted` : null,
    rotated ? `${rotated} rotated` : null,
    reordered ? 'order changed' : null,
  ].filter(Boolean);
  if (!parts.length && activeSlots.length === originalPageCount) return 'No page changes staged.';
  return `${parts.join(', ')}. Final PDF has ${activeSlots.length} page${activeSlots.length === 1 ? '' : 's'}.`;
}

export function ManagePagesDialog({
  open,
  pageCount,
  currentPage,
  sourceFileName,
  applying = false,
  onClose,
  onApply,
}: ManagePagesDialogProps) {
  const [slots, setSlots] = useState<PageSlot[]>(() => makeCurrentSlots(pageCount));
  const [insertSources, setInsertSources] = useState<InsertSource[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [insertFile, setInsertFile] = useState<File | null>(null);
  const [insertPageCount, setInsertPageCount] = useState(0);
  const [insertRange, setInsertRange] = useState('all');
  const [insertPosition, setInsertPosition] = useState<InsertPosition>('after-current');
  const [insertLoading, setInsertLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insertLoadRequestRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    insertLoadRequestRef.current += 1;
    setSlots(makeCurrentSlots(pageCount));
    setInsertSources([]);
    setSelectedIds([]);
    setInsertFile(null);
    setInsertPageCount(0);
    setInsertRange('all');
    setInsertPosition('after-current');
    setError(null);
  }, [open, pageCount]);

  const activeSlots = useMemo(() => slots.filter((slot) => !slot.deleted), [slots]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const summary = useMemo(() => summarizeChanges(slots, pageCount), [slots, pageCount]);
  const hasChanges = summary !== 'No page changes staged.';

  const updateSelectedSlots = (updater: (slot: PageSlot) => PageSlot) => {
    if (!selectedIds.length) return;
    setSlots((prev) => prev.map((slot) => selectedSet.has(slot.id) ? updater(slot) : slot));
  };

  const handleInsertFileChange = async (file: File | null) => {
    const requestId = insertLoadRequestRef.current + 1;
    insertLoadRequestRef.current = requestId;
    setInsertFile(file);
    setInsertPageCount(0);
    setError(null);
    setInsertLoading(false);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Choose a PDF file to insert pages.');
      setInsertFile(null);
      return;
    }
    setInsertLoading(true);
    try {
      const count = await loadPdfPageCountFromFile(file);
      if (insertLoadRequestRef.current !== requestId) return;
      setInsertPageCount(count);
      setInsertRange('all');
    } catch (loadError) {
      if (insertLoadRequestRef.current !== requestId) return;
      setInsertFile(null);
      setError(loadError instanceof Error ? loadError.message : 'Unable to read inserted PDF pages.');
    } finally {
      if (insertLoadRequestRef.current === requestId) {
        setInsertLoading(false);
      }
    }
  };

  const handleAddInsertPages = () => {
    if (!insertFile || !insertPageCount) {
      setError('Choose an inserted PDF first.');
      return;
    }
    try {
      const pages = parsePdfPageSelection(insertRange, insertPageCount);
      const sourceId = `insert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const source: InsertSource = {
        id: sourceId,
        file: insertFile,
        name: insertFile.name,
        pageCount: insertPageCount,
      };
      const newSlots: PageSlot[] = pages.map((page, index) => ({
        id: `${sourceId}-${page}-${index}`,
        source: 'insert',
        insertSourceId: sourceId,
        sourceName: insertFile.name,
        page,
        rotate: 0,
        deleted: false,
      }));
      setInsertSources((prev) => [...prev, source]);
      setSlots((prev) => {
        const insertAt = insertIndexForPosition(prev, insertPosition, currentPage);
        return [...prev.slice(0, insertAt), ...newSlots, ...prev.slice(insertAt)];
      });
      setSelectedIds(newSlots.map((slot) => slot.id));
      setInsertFile(null);
      setInsertPageCount(0);
      setInsertRange('all');
      setError(null);
    } catch (insertError) {
      setError(insertError instanceof Error ? insertError.message : 'Unable to stage inserted pages.');
    }
  };

  const handleApply = () => {
    if (!activeSlots.length) {
      setError('The final PDF must keep at least one page.');
      return;
    }
    const activeInsertSourceIds = new Set(
      activeSlots
        .filter((slot): slot is InsertedPageSlot => slot.source === 'insert')
        .map((slot) => slot.insertSourceId),
    );
    const activeInsertSources = insertSources.filter((source) => activeInsertSourceIds.has(source.id));
    const sourceIndexById = new Map(activeInsertSources.map((source, index) => [source.id, index]));
    const finalPages: PdfPageToolFinalPage[] = activeSlots.map((slot) => {
      if (slot.source === 'current') {
        return { source: 'current', page: slot.originalPage, rotate: slot.rotate };
      }
      const fileIndex = sourceIndexById.get(slot.insertSourceId);
      if (fileIndex === undefined) {
        throw new Error('Inserted PDF source is missing.');
      }
      return { source: 'insert', fileIndex, page: slot.page, rotate: slot.rotate };
    });
    const currentTransforms: ManagePagesCurrentTransform[] = activeSlots.flatMap((slot, index) => (
      slot.source === 'current'
        ? [{ originalPage: slot.originalPage, nextPage: index + 1, rotate: slot.rotate }]
        : []
    ));
    const keptPages = new Set(currentTransforms.map((entry) => entry.originalPage));
    const removedCurrentPages = Array.from({ length: pageCount }, (_, index) => index + 1)
      .filter((page) => !keptPages.has(page));
    onApply({
      finalPages,
      insertFiles: activeInsertSources.map((source) => source.file),
      currentTransforms,
      removedCurrentPages,
    });
  };

  return (
    <DialogFrame
      open={open}
      onClose={applying ? undefined : onClose}
      className="manage-pages-dialog"
      labelledBy="manage-pages-dialog-title"
      closeOnBackdrop={false}
    >
      <header className="manage-pages-dialog__header">
        <div>
          <p className="manage-pages-dialog__eyebrow">PDF Tools</p>
          <h2 id="manage-pages-dialog-title">Manage Pages</h2>
          <p>{sourceFileName || 'Current PDF'}</p>
        </div>
        <div className="manage-pages-dialog__header-actions">
          <button
            type="button"
            className="ui-button ui-button--ghost ui-button--compact"
            onClick={() => openUsageDocsWindow(USAGE_DOCS_ROUTES.pdfTools)}
          >
            Usage Docs
          </button>
          <DialogCloseButton onClick={applying ? () => {} : onClose} />
        </div>
      </header>

      <div className="manage-pages-dialog__body">
        <aside className="manage-pages-dialog__tools" aria-label="Page tools">
          <section className="manage-pages-dialog__tool-section">
            <h3>Selected Pages</h3>
            <div className="manage-pages-dialog__button-grid">
              <button
                type="button"
                className="ui-button ui-button--secondary ui-button--compact"
                disabled={!selectedIds.length || applying}
                onClick={() => updateSelectedSlots((slot) => ({ ...slot, rotate: rotateClockwise(slot.rotate) }))}
              >
                Rotate
              </button>
              <button
                type="button"
                className="ui-button ui-button--secondary ui-button--compact"
                disabled={!selectedIds.length || applying}
                onClick={() => updateSelectedSlots((slot) => ({ ...slot, deleted: true }))}
              >
                Delete
              </button>
              <button
                type="button"
                className="ui-button ui-button--secondary ui-button--compact"
                disabled={!selectedIds.length || applying}
                onClick={() => updateSelectedSlots((slot) => ({ ...slot, deleted: false }))}
              >
                Restore
              </button>
            </div>
          </section>

          <section className="manage-pages-dialog__tool-section">
            <h3>Insert From PDF</h3>
            <label className="manage-pages-dialog__field">
              <span>PDF file</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={applying || insertLoading}
                onChange={(event) => {
                  void handleInsertFileChange(event.currentTarget.files?.[0] || null);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            {insertFile ? (
              <p className="manage-pages-dialog__micro">
                {insertFile.name} {insertPageCount ? `(${insertPageCount} page${insertPageCount === 1 ? '' : 's'})` : ''}
              </p>
            ) : null}
            <label className="manage-pages-dialog__field">
              <span>Pages</span>
              <input
                type="text"
                value={insertRange}
                disabled={!insertFile || applying || insertLoading}
                onChange={(event) => setInsertRange(event.target.value)}
                placeholder="all, 1, 2-4, last"
              />
            </label>
            <label className="manage-pages-dialog__field">
              <span>Insert position</span>
              <select
                value={insertPosition}
                disabled={applying}
                onChange={(event) => setInsertPosition(event.target.value as InsertPosition)}
              >
                {INSERT_POSITIONS.map((position) => (
                  <option key={position.value} value={position.value}>{position.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="ui-button ui-button--primary ui-button--compact"
              disabled={!insertFile || insertLoading || applying}
              onClick={handleAddInsertPages}
            >
              {insertLoading ? 'Reading PDF...' : 'Stage Insert'}
            </button>
          </section>

          <section className="manage-pages-dialog__tool-section">
            <h3>Summary</h3>
            <p className="manage-pages-dialog__summary">{summary}</p>
            {error ? <p className="manage-pages-dialog__error">{error}</p> : null}
          </section>
        </aside>

        <section className="manage-pages-dialog__pages" aria-label="Staged page order">
          <div className="manage-pages-dialog__pages-header">
            <h3>Page Order</h3>
            <button
              type="button"
              className="ui-button ui-button--ghost ui-button--compact"
              disabled={applying}
              onClick={() => {
                setSlots(makeCurrentSlots(pageCount));
                setInsertSources([]);
                setSelectedIds([]);
                setError(null);
              }}
            >
              Reset
            </button>
          </div>
          <div className="manage-pages-dialog__page-list">
            {slots.map((slot, index) => {
              const selected = selectedSet.has(slot.id);
              const finalIndex = slots.slice(0, index + 1).filter((entry) => !entry.deleted).length;
              return (
                <article
                  key={slot.id}
                  className={[
                    'manage-pages-dialog__page-card',
                    selected ? 'manage-pages-dialog__page-card--selected' : '',
                    slot.deleted ? 'manage-pages-dialog__page-card--deleted' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <label className="manage-pages-dialog__page-select">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={applying}
                      onChange={(event) => {
                        setSelectedIds((prev) => {
                          if (event.target.checked) return [...prev, slot.id];
                          return prev.filter((id) => id !== slot.id);
                        });
                      }}
                    />
                    <span>{slot.deleted ? 'Removed' : `Final ${finalIndex}`}</span>
                  </label>
                  <div className="manage-pages-dialog__page-preview" aria-hidden="true">
                    <span>{slot.source === 'current' ? slot.originalPage : slot.page}</span>
                  </div>
                  <div className="manage-pages-dialog__page-meta">
                    <strong>{slotPageLabel(slot)}</strong>
                    <span>{slot.source === 'current' ? 'Current PDF' : 'Inserted PDF'}</span>
                    {slot.rotate ? <span>Rotate {slot.rotate}°</span> : null}
                  </div>
                  <div className="manage-pages-dialog__page-actions">
                    <button
                      type="button"
                      className="ui-button ui-button--ghost ui-button--compact"
                      disabled={index === 0 || applying}
                      onClick={() => setSlots((prev) => moveSlot(prev, index, -1))}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button--ghost ui-button--compact"
                      disabled={index === slots.length - 1 || applying}
                      onClick={() => setSlots((prev) => moveSlot(prev, index, 1))}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button--ghost ui-button--compact"
                      disabled={applying}
                      onClick={() => setSlots((prev) => prev.map((entry) => (
                        entry.id === slot.id ? { ...entry, rotate: rotateClockwise(entry.rotate) } : entry
                      )))}
                    >
                      Rotate
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button--ghost ui-button--compact"
                      disabled={applying}
                      onClick={() => setSlots((prev) => prev.map((entry) => (
                        entry.id === slot.id ? { ...entry, deleted: !entry.deleted } : entry
                      )))}
                    >
                      {slot.deleted ? 'Restore' : 'Delete'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <footer className="manage-pages-dialog__footer">
        <button
          type="button"
          className="ui-button ui-button--ghost"
          disabled={applying}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="ui-button ui-button--primary"
          disabled={!hasChanges || !activeSlots.length || applying}
          onClick={handleApply}
        >
          {applying ? 'Applying...' : 'Apply Changes'}
        </button>
      </footer>
    </DialogFrame>
  );
}
