import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import './FormCatalogPage.css';
import { SiteFooter } from '../ui/SiteFooter';
import {
  FORM_CATALOG_BY_SLUG,
} from '../../config/formCatalogData.mjs';
import { FORM_CATALOG_CATEGORIES } from '../../config/formCatalogCategories.mjs';
import {
  buildWorkspaceBrowserHref,
  type WorkspaceBrowserRoute,
} from '../../utils/workspaceRoutes';
import { getStableSourceUrl, getStableSourceLabel } from '../../utils/stableSourceUrl';

const defaultStandaloneNavigate = (route: WorkspaceBrowserRoute) => {
  if (typeof window === 'undefined') return;
  window.location.href = buildWorkspaceBrowserHref(route);
};

const defaultStandaloneRequestSignIn = () => {
  if (typeof window === 'undefined') return;
  window.location.href = '/upload';
};

const defaultStandaloneOpenInWorkspace = async (entry: { slug: string }) => {
  if (typeof window === 'undefined') return;
  window.location.href = `/upload?catalogSlug=${encodeURIComponent(entry.slug)}`;
};

type FormCatalogEntry = {
  slug: string;
  formNumber: string;
  title: string;
  section: string;
  filename: string;
  sourceUrl: string;
  bytes: number | null;
  pageCount: number | null;
  pdfUrl: string;
  thumbnailUrl: string;
  description: string;
  useCase: string;
};

type FormCatalogCategory = {
  key: string;
  label: string;
  sections?: string[];
  count: number;
  empty: boolean;
  emptyReason: string | null;
};

type FormCatalogFormPageProps = {
  slug: string;
  verifiedUser?: User | null;
  onRequestSignIn?: () => void;
  onNavigate?: (route: WorkspaceBrowserRoute, options?: { replace?: boolean }) => void;
  onOpenInWorkspace?: (entry: FormCatalogEntry) => Promise<void>;
};

const CATEGORIES = FORM_CATALOG_CATEGORIES as FormCatalogCategory[];
const BY_SLUG = FORM_CATALOG_BY_SLUG as Record<string, FormCatalogEntry>;

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FormCatalogFormPage = ({
  slug,
  verifiedUser = null,
  onRequestSignIn = defaultStandaloneRequestSignIn,
  onNavigate = defaultStandaloneNavigate,
  onOpenInWorkspace = defaultStandaloneOpenInWorkspace,
}: FormCatalogFormPageProps) => {
  const entry = useMemo<FormCatalogEntry | null>(() => BY_SLUG[slug] || null, [slug]);
  const category = useMemo(
    () => (entry ? CATEGORIES.find((c) => c.key === entry.section) || null : null),
    [entry],
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [openInProgress, setOpenInProgress] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      document.title = `${entry.formNumber ? `${entry.formNumber} — ` : ''}${entry.title} | DullyPDF Form Catalog`;
    } else {
      document.title = 'Form Catalog — DullyPDF';
    }
  }, [entry]);

  useEffect(() => {
    if (!entry) {
      return;
    }
    let cancelled = false;
    setPreviewError(null);
    setPreviewLoading(true);

    const renderPreview = async () => {
      try {
        // Dynamic import keeps pdfjs-dist out of the SSR bundle and delays
        // the heavy worker setup until a real browser visit.
        await import('../../utils/pdf');
        const { getDocument } = await import('pdfjs-dist');
        const response = await fetch(entry.pdfUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        const doc = await getDocument({ data: buffer, enableXfa: true }).promise;
        if (cancelled) {
          void doc.destroy().catch(() => {});
          return;
        }
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const canvas = canvasRef.current;
        if (!canvas) {
          void doc.destroy().catch(() => {});
          return;
        }
        const targetWidth = Math.min(680, canvas.parentElement?.clientWidth ?? 680);
        const scale = targetWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });
        const context = canvas.getContext('2d');
        if (!context) {
          void doc.destroy().catch(() => {});
          return;
        }
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
        if (cancelled) return;
        setPreviewLoading(false);
        void doc.destroy().catch(() => {});
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to load preview';
        setPreviewError(message);
        setPreviewLoading(false);
      }
    };

    void renderPreview();
    return () => {
      cancelled = true;
    };
  }, [entry]);

  const handleOpenInWorkspace = useCallback(async () => {
    if (!entry) return;
    setOpenError(null);
    setOpenInProgress(true);
    try {
      await onOpenInWorkspace(entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open form';
      setOpenError(message);
      setOpenInProgress(false);
    }
  }, [entry, onOpenInWorkspace]);

  const renderHeader = () => (
    <header className="form-catalog__header">
      <a
        className="form-catalog__brand"
        href="/"
        onClick={(event) => {
          event.preventDefault();
          onNavigate({ kind: 'homepage' });
        }}
      >
        DullyPDF
      </a>
      <nav className="form-catalog__breadcrumbs" aria-label="Breadcrumb">
        <a
          href="/"
          onClick={(event) => {
            event.preventDefault();
            onNavigate({ kind: 'homepage' });
          }}
        >
          Home
        </a>
        <span aria-hidden="true">›</span>
        <a
          href="/forms"
          onClick={(event) => {
            event.preventDefault();
            onNavigate({ kind: 'form-catalog-index' });
          }}
        >
          Form Catalog
        </a>
        {category ? (
          <>
            <span aria-hidden="true">›</span>
            <a
              href={`/forms?category=${encodeURIComponent(category.key)}`}
              onClick={(event) => {
                event.preventDefault();
                onNavigate({ kind: 'form-catalog-index', category: category.key });
              }}
            >
              {category.label}
            </a>
          </>
        ) : null}
      </nav>
      <div className="form-catalog__header-actions">
        {verifiedUser ? null : (
          <button
            type="button"
            className="form-catalog__header-button"
            onClick={onRequestSignIn}
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );

  if (!entry) {
    return (
      <div className="form-catalog">
        {renderHeader()}
        <main className="form-catalog__main">
          <div className="form-catalog__empty">
            <h3>Form not found</h3>
            <p>
              We could not locate a form with slug “{slug}”.{' '}
              <a
                href="/forms"
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate({ kind: 'form-catalog-index' });
                }}
              >
                Back to the catalog
              </a>
            </p>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const openButtonLabel = openInProgress ? 'Loading into editor…' : 'Open in DullyPDF';

  return (
    <div className="form-catalog">
      {renderHeader()}
      <main className="form-catalog__main">
        <section className="form-catalog__hero">
          <div className="form-catalog__hero-kicker">{category?.label || 'Form catalog'}</div>
          <h1 className="form-catalog__hero-title">
            {entry.formNumber ? `${entry.formNumber} — ` : ''}
            {entry.title}
          </h1>
          {entry.description ? (
            <p className="form-catalog__hero-summary">{entry.description}</p>
          ) : null}
        </section>

        <div className="form-catalog-detail__grid">
          <div className="form-catalog-detail__preview">
            {previewError ? (
              <span>Preview unavailable ({previewError})</span>
            ) : (
              <>
                {previewLoading ? <span>Loading preview…</span> : null}
                <canvas
                  ref={canvasRef}
                  aria-label={`Preview of ${entry.formNumber || entry.title}`}
                  style={previewLoading ? { display: 'none' } : undefined}
                />
              </>
            )}
          </div>

          <aside className="form-catalog-detail__meta">
            <span className="form-catalog-detail__meta-kicker">
              {category?.label || 'Form catalog'}
            </span>
            <h1>{entry.title}</h1>
            {entry.description ? (
              <p className="form-catalog-detail__description">{entry.description}</p>
            ) : null}
            {entry.useCase ? (
              <p className="form-catalog-detail__use-case">
                <strong>Use case: </strong>
                {entry.useCase}
              </p>
            ) : null}

            <dl className="form-catalog-detail__facts">
              {entry.formNumber ? (
                <div>
                  <dt>Form number</dt>
                  <dd>{entry.formNumber}</dd>
                </div>
              ) : null}
              <div>
                <dt>Category</dt>
                <dd>{category?.label || entry.section}</dd>
              </div>
              {entry.pageCount ? (
                <div>
                  <dt>Pages</dt>
                  <dd>{entry.pageCount}</dd>
                </div>
              ) : null}
              <div>
                <dt>File size</dt>
                <dd>{formatBytes(entry.bytes)}</dd>
              </div>
            </dl>

            <div className="form-catalog-detail__actions">
              <button
                type="button"
                className="form-catalog-detail__button form-catalog-detail__button--primary"
                onClick={handleOpenInWorkspace}
                disabled={openInProgress}
              >
                {openButtonLabel}
              </button>
              <a
                className="form-catalog-detail__button form-catalog-detail__button--secondary"
                href={entry.pdfUrl}
                download={entry.filename}
              >
                Download blank PDF
              </a>
            </div>
            {openError ? (
              <p className="form-catalog-detail__error">{openError}</p>
            ) : null}

            {entry.sourceUrl ? (() => {
              // Several federal agencies (USCIS, SBA, CBP, FEMA, DOL) gate
              // their PDFs behind 403 to crawlers and frequently move their
              // CMS paths. Rewrite to a stable per-form landing page (or the
              // agency forms hub) so external link health stays clean. See
              // utils/stableSourceUrl.ts for the host map.
              const stableUrl = getStableSourceUrl({
                sourceUrl: entry.sourceUrl,
                formNumber: entry.formNumber,
                section: entry.section,
              });
              const stableLabel = getStableSourceLabel(stableUrl);
              return (
                <p className="form-catalog-detail__source">
                  Public-domain source:{' '}
                  <a href={stableUrl} target="_blank" rel="noreferrer noopener">
                    {stableLabel}
                  </a>
                </p>
              );
            })() : null}
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default FormCatalogFormPage;
