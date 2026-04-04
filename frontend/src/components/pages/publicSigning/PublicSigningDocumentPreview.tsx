import { useEffect, useMemo, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import type { PageSize, PdfField, RadioGroupSuggestion } from '../../../types';
import type { SigningAnchorPayload } from '../../../services/api';
import { loadPageSizes, loadPdfFromFile } from '../../../utils/pdf';
import { PdfViewer } from '../../viewer/PdfViewer';

type PublicSigningDocumentPreviewProps = {
  anchors: SigningAnchorPayload[];
  documentBlob: Blob | null;
  documentObjectUrl: string | null;
};

const EMPTY_PAGE_SIZES: Record<number, PageSize> = {};
const EMPTY_PENDING_RADIO_IDS: string[] = [];
const EMPTY_RADIO_SUGGESTIONS = new Map<string, RadioGroupSuggestion>();

function destroyPdfDocument(pdfDoc: PDFDocumentProxy | null) {
  if (!pdfDoc || typeof pdfDoc.destroy !== 'function') return;
  void pdfDoc.destroy().catch(() => {});
}

function buildSignaturePreviewName(index: number, total: number): string {
  if (total > 1) return `Sign here ${index + 1}`;
  return 'Sign here';
}

function buildPreviewFields(anchors: SigningAnchorPayload[]): PdfField[] {
  const signatureAnchors = anchors.filter((anchor) => anchor.kind === 'signature');
  return signatureAnchors.map((anchor, index) => ({
    id: String(anchor.fieldId || `public-signing-anchor-${index + 1}`),
    name: buildSignaturePreviewName(index, signatureAnchors.length),
    type: 'signature',
    page: Math.max(1, Number(anchor.page) || 1),
    rect: {
      x: anchor.rect.x,
      y: anchor.rect.y,
      width: anchor.rect.width,
      height: anchor.rect.height,
    },
  }));
}

function resolveInitialPage(anchors: SigningAnchorPayload[]): number {
  const firstAnchorPage = anchors.find((anchor) => anchor.kind === 'signature' && Number(anchor.page) > 0)?.page
    ?? anchors.find((anchor) => Number(anchor.page) > 0)?.page;
  return Math.max(1, Number(firstAnchorPage) || 1);
}

export function PublicSigningDocumentPreview({
  anchors,
  documentBlob,
  documentObjectUrl,
}: PublicSigningDocumentPreviewProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>(EMPTY_PAGE_SIZES);
  const initialPage = useMemo(() => resolveInitialPage(anchors), [anchors]);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [pendingPageJump, setPendingPageJump] = useState<number | null>(initialPage);
  const previewFields = useMemo(() => buildPreviewFields(anchors), [anchors]);

  useEffect(() => {
    setPageNumber(initialPage);
    setPendingPageJump(initialPage);
  }, [initialPage]);

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PDFDocumentProxy | null = null;

    setPageSizes(EMPTY_PAGE_SIZES);
    setPdfDoc((current) => {
      destroyPdfDocument(current);
      return null;
    });

    if (!documentBlob) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const filename = documentBlob instanceof File && documentBlob.name
        ? documentBlob.name
        : 'signing-document.pdf';
      const documentFile = new File([documentBlob], filename, {
        type: documentBlob.type || 'application/pdf',
      });
      const nextPdfDoc = await loadPdfFromFile(documentFile);
      const nextPageSizes = await loadPageSizes(nextPdfDoc);
      if (cancelled) {
        destroyPdfDocument(nextPdfDoc);
        return;
      }
      loadedDocument = nextPdfDoc;
      setPdfDoc(nextPdfDoc);
      setPageSizes(nextPageSizes);
      setPageNumber((current) => {
        const preferredPage = initialPage;
        if (preferredPage <= nextPdfDoc.numPages) return preferredPage;
        if (current >= 1 && current <= nextPdfDoc.numPages) return current;
        return 1;
      });
      setPendingPageJump((current) => {
        if (current !== null && current >= 1 && current <= nextPdfDoc.numPages) {
          return current;
        }
        return initialPage <= nextPdfDoc.numPages ? initialPage : 1;
      });
    })().catch(() => {
      if (cancelled) return;
      setPdfDoc(null);
      setPageSizes(EMPTY_PAGE_SIZES);
    });

    return () => {
      cancelled = true;
      destroyPdfDocument(loadedDocument);
    };
  }, [anchors, documentBlob, initialPage]);

  if (pdfDoc && Object.keys(pageSizes).length > 0) {
    return (
      <div className="public-signing-page__document-frame public-signing-page__document-frame--viewer">
        <PdfViewer
          pdfDoc={pdfDoc}
          pageNumber={pageNumber}
          scale={1}
          pageSizes={pageSizes}
          fields={previewFields}
          showFields
          showFieldNames
          showFieldInfo={false}
          moveEnabled={false}
          resizeEnabled={false}
          createEnabled={false}
          activeCreateTool={null}
          selectedFieldId={null}
          pendingQuickRadioFieldIds={EMPTY_PENDING_RADIO_IDS}
          radioSuggestionByFieldId={EMPTY_RADIO_SUGGESTIONS}
          onSelectField={() => {}}
          onUpdateField={() => {}}
          onUpdateFieldGeometry={() => {}}
          onCreateFieldWithRect={() => {}}
          onQuickRadioSelect={() => {}}
          onSelectRadioField={() => {}}
          onBeginFieldChange={() => {}}
          onCommitFieldChange={() => {}}
          onPageChange={setPageNumber}
          pendingPageJump={pendingPageJump}
          onPageJumpComplete={() => setPendingPageJump(null)}
        />
      </div>
    );
  }

  return (
    <div className="public-signing-page__document-frame">
      {documentObjectUrl ? (
        <iframe title="Signing document preview" src={documentObjectUrl} />
      ) : (
        <div className="public-signing-page__document-preview-placeholder">
          Unable to load the immutable signing document preview.
        </div>
      )}
    </div>
  );
}
