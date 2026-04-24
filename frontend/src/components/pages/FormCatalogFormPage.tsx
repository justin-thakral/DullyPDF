import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import './FormCatalogPage.css';
import { SiteFooter } from '../ui/SiteFooter';
import {
  FORM_CATALOG_BY_SLUG,
  FORM_CATALOG_ENTRIES,
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
  isPriorYear: boolean;
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
const ENTRIES = FORM_CATALOG_ENTRIES as FormCatalogEntry[];

function compareFormCatalogEntries(left: FormCatalogEntry, right: FormCatalogEntry): number {
  return left.formNumber.localeCompare(right.formNumber, 'en', { numeric: true })
    || left.title.localeCompare(right.title)
    || left.slug.localeCompare(right.slug);
}

const ACTIVE_ENTRIES_BY_SECTION = new Map<string, FormCatalogEntry[]>();

for (const entry of ENTRIES) {
  if (entry.isPriorYear) {
    continue;
  }

  const sectionEntries = ACTIVE_ENTRIES_BY_SECTION.get(entry.section) ?? [];
  sectionEntries.push(entry);
  ACTIVE_ENTRIES_BY_SECTION.set(entry.section, sectionEntries);
}

for (const sectionEntries of ACTIVE_ENTRIES_BY_SECTION.values()) {
  sectionEntries.sort(compareFormCatalogEntries);
}

// Keep the related-forms block symmetric around the current entry instead of
// always taking the first N forms in a category. That circular window keeps the
// catalog graph evenly connected, and after the pool is built the walk is O(m)
// where m is the number of forms in the resolved category cluster.
const RELATED_FORMS_LIMIT = 20;

function resolveRelatedSections(entry: FormCatalogEntry, category: FormCatalogCategory | null): Set<string> {
  const sections = category?.sections && category.sections.length > 0
    ? category.sections
    : [entry.section];
  return new Set(sections);
}

function buildRelatedEntryPool(entry: FormCatalogEntry, category: FormCatalogCategory | null): FormCatalogEntry[] {
  const sections = Array.from(resolveRelatedSections(entry, category));
  if (sections.length === 1) {
    return ACTIVE_ENTRIES_BY_SECTION.get(sections[0]) ?? [];
  }

  const seenSlugs = new Set<string>();
  const mergedEntries: FormCatalogEntry[] = [];

  sections.forEach((section) => {
    (ACTIVE_ENTRIES_BY_SECTION.get(section) ?? []).forEach((candidate) => {
      if (seenSlugs.has(candidate.slug)) {
        return;
      }

      seenSlugs.add(candidate.slug);
      mergedEntries.push(candidate);
    });
  });

  return mergedEntries.sort(compareFormCatalogEntries);
}

function pickCircularRelatedEntries(
  pool: FormCatalogEntry[],
  currentSlug: string,
  limit: number,
): FormCatalogEntry[] {
  const maxRelatedEntries = Math.min(limit, Math.max(pool.length - 1, 0));
  if (maxRelatedEntries === 0) {
    return [];
  }

  const currentIndex = pool.findIndex((candidate) => candidate.slug === currentSlug);
  if (currentIndex < 0) {
    return pool.slice(0, maxRelatedEntries);
  }

  const seenSlugs = new Set([currentSlug]);
  const relatedEntries: FormCatalogEntry[] = [];

  for (let distance = 1; distance < pool.length && relatedEntries.length < maxRelatedEntries; distance += 1) {
    const forwardEntry = pool[(currentIndex + distance) % pool.length];
    if (!seenSlugs.has(forwardEntry.slug)) {
      seenSlugs.add(forwardEntry.slug);
      relatedEntries.push(forwardEntry);
    }

    if (relatedEntries.length >= maxRelatedEntries) {
      break;
    }

    const backwardEntry = pool[(currentIndex - distance + pool.length) % pool.length];
    if (!seenSlugs.has(backwardEntry.slug)) {
      seenSlugs.add(backwardEntry.slug);
      relatedEntries.push(backwardEntry);
    }
  }

  return relatedEntries;
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFormDisplayName(entry: FormCatalogEntry): string {
  return entry.formNumber ? `${entry.formNumber} — ${entry.title}` : entry.title;
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
  const relatedEntries = useMemo<FormCatalogEntry[]>(() => {
    if (!entry) return [];
    const relatedEntryPool = buildRelatedEntryPool(entry, category);
    return pickCircularRelatedEntries(relatedEntryPool, entry.slug, RELATED_FORMS_LIMIT);
  }, [entry, category]);
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
    if (
      typeof window !== 'undefined'
      && window.matchMedia('(max-width: 768px)').matches
    ) {
      window.alert('DullyPDF Workspace is only available on Desktop');
      return;
    }
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

  const openButtonLabel = openInProgress ? 'Loading into editor…' : 'Open in the DullyPDF Workspace';
  const downloadLabel = entry
    ? `Download ${entry.formNumber || entry.title} fillable form`
    : 'Download fillable form';
  const displayName = formatFormDisplayName(entry);
  const categoryLabel = category?.label || entry.section;
  const formHandle = entry.formNumber || 'this form';
  const workflowPurpose = entry.useCase
    || `Use it for repeat ${categoryLabel.toLowerCase()} work where the official PDF layout needs to stay intact.`;
  const pageCountLabel = entry.pageCount
    ? `${entry.pageCount} ${entry.pageCount === 1 ? 'page' : 'pages'}`
    : 'its source pages';
  const stableSourceUrl = entry.sourceUrl
    ? getStableSourceUrl({
      sourceUrl: entry.sourceUrl,
      formNumber: entry.formNumber,
      section: entry.section,
    })
    : null;
  const sourceLabel = entry.sourceUrl
    ? getStableSourceLabel(stableSourceUrl || entry.sourceUrl)
    : null;

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
            <p className="form-catalog-detail__meta-title">{entry.title}</p>
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
            </div>
            {openError ? (
              <p className="form-catalog-detail__error">{openError}</p>
            ) : null}

            <div className="form-catalog-detail__explainer">
              <h3 className="form-catalog-detail__explainer-heading">
                The DullyPDF Workspace
              </h3>
              <p className="form-catalog-detail__explainer-body">
                The DullyPDF Workspace is a form automation builder.{' '}
                <a href="/pdf-to-fillable-form">
                  Open any PDF to auto-detect its fields with AI
                </a>
                , then reuse the template across workflows:{' '}
                <a href="/fill-pdf-from-csv">
                  fill from CSV, Excel, JSON, or SQL
                </a>{' '}
                with Search &amp; Fill;{' '}
                <a href="/fill-pdf-by-link">publish a shareable web form</a>{' '}
                with Fill By Link;{' '}
                <a href="/pdf-fill-api">call a JSON-to-PDF API</a> from your
                backend; or add{' '}
                <a href="/esign-ueta-pdf-workflow">
                  E-SIGN / UETA–compliant signatures
                </a>
                .
              </p>
            </div>

            <a
              className="form-catalog-detail__button form-catalog-detail__button--secondary form-catalog-detail__download"
              href={entry.pdfUrl}
              download={entry.filename}
            >
              {downloadLabel}
            </a>

            {entry.sourceUrl ? (() => {
              return (
                <p className="form-catalog-detail__source">
                  Public-domain source:{' '}
                  {stableSourceUrl ? (
                    <a href={stableSourceUrl} target="_blank" rel="noreferrer noopener">
                      {sourceLabel}
                    </a>
                  ) : (
                    <span>{sourceLabel}</span>
                  )}
                </p>
              );
            })() : null}
          </aside>
        </div>

        <section
          className="form-catalog-detail__workflow"
          aria-labelledby="form-workflow-heading"
        >
          <span className="form-catalog-detail__workflow-kicker">
            PDF automation context
          </span>
          <h2 id="form-workflow-heading" className="form-catalog-detail__workflow-heading">
            How {formHandle} fits into a repeat PDF workflow
          </h2>
          <p>
            {displayName} is listed in the {categoryLabel} catalog. {workflowPurpose}{' '}
            Treat the blank PDF as the controlled starting point: keep the official
            layout intact, then add reviewed fields and mappings before using it
            for live records.
          </p>
          <ul className="form-catalog-detail__workflow-list">
            <li>
              <strong>Template setup:</strong> open the blank PDF in DullyPDF,
              run field detection, and review text boxes, checkboxes, radio
              groups, dates, and signature areas before saving the template.
            </li>
            <li>
              <strong>Data fill:</strong> map the detected fields to CSV,
              Excel, JSON, or SQL-backed schema headers so the same reviewed
              PDF can be filled from repeat records.
            </li>
            <li>
              <strong>Output paths:</strong> download the completed PDF, collect
              respondent answers with Fill By Link, call API Fill, or route the
              prepared record into a signature workflow.
            </li>
          </ul>
          <p>
            The catalog keeps {pageCountLabel}, file size, category, and
            {sourceLabel ? ` source attribution to ${sourceLabel}` : ' source attribution'} visible
            before automation starts, which helps teams confirm they are working
            from the right official blank form before saving a template.
          </p>
        </section>

        {relatedEntries.length > 0 ? (
          <section
            className="form-catalog-detail__related"
            aria-labelledby="related-forms-heading"
          >
            <h2 id="related-forms-heading" className="form-catalog-detail__related-heading">
              {category ? `More ${category.label} forms` : 'More forms in this catalog'}
            </h2>
            <ul className="form-catalog-detail__related-list">
              {relatedEntries.map((related) => {
                const label = related.formNumber
                  ? `${related.formNumber} — ${related.title}`
                  : related.title;
                return (
                  <li key={related.slug} className="form-catalog-detail__related-item">
                    <a
                      href={`/forms/${related.slug}`}
                      onClick={(event) => {
                        event.preventDefault();
                        onNavigate({ kind: 'form-catalog-form', slug: related.slug });
                      }}
                    >
                      {label}
                    </a>
                  </li>
                );
              })}
            </ul>
            {category ? (
              <p className="form-catalog-detail__related-footer">
                <a
                  href={`/forms?category=${encodeURIComponent(category.key)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate({ kind: 'form-catalog-index', category: category.key });
                  }}
                >
                  Browse all {category.label} forms →
                </a>
              </p>
            ) : null}
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
};

export default FormCatalogFormPage;
