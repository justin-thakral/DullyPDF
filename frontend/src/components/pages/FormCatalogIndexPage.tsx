import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import './FormCatalogPage.css';
import FormCatalogThumbnail from './FormCatalogThumbnail';
import { SiteFooter } from '../ui/SiteFooter';
import {
  FORM_CATALOG_ENTRIES,
} from '../../config/formCatalogData.mjs';
import { FORM_CATALOG_CATEGORIES } from '../../config/formCatalogCategories.mjs';
import { FORM_CATALOG_EXTERNAL_SOURCES } from '../../config/formCatalogExternalSources.mjs';
import {
  buildWorkspaceBrowserHref,
  type WorkspaceBrowserRoute,
} from '../../utils/workspaceRoutes';
import { applySeoMetadata } from '../../utils/seo';
import { buildFormCatalogIndexSeo } from '../../config/formCatalogSeo.mjs';

const defaultStandaloneNavigate = (
  route: WorkspaceBrowserRoute,
  options?: { replace?: boolean },
) => {
  if (typeof window === 'undefined') return;
  const href = buildWorkspaceBrowserHref(route);
  if (route.kind === 'form-catalog-index' && options?.replace) {
    window.history.replaceState({}, '', href);
    return;
  }
  window.location.href = href;
};

const defaultStandaloneRequestSignIn = () => {
  if (typeof window === 'undefined') return;
  window.location.href = '/upload';
};

type FormCatalogEntry = {
  slug: string;
  formNumber: string;
  title: string;
  section: string;
  filename: string;
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

type FormCatalogExternalSourceLink = {
  label: string;
  url: string;
};

type FormCatalogExternalSource = {
  key: string;
  label: string;
  sourceFile: string;
  links: FormCatalogExternalSourceLink[];
};

type FormCatalogIndexPageProps = {
  verifiedUser?: User | null;
  initialCategory?: string;
  initialQuery?: string;
  initialPage?: number;
  onRequestSignIn?: () => void;
  onNavigate?: (route: WorkspaceBrowserRoute, options?: { replace?: boolean }) => void;
};

// Popular / commonly-requested forms surfaced first in the "All categories" view
// when the user has not yet narrowed by category. Ordered by rough demand so the
// most-recognised forms appear at the top of the landing grid.
const FEATURED_FORM_NUMBERS: ReadonlyArray<string> = [
  'W-9',
  'W-4',
  'I-9',
  '1040',
  '1040-ES',
  '1099-MISC',
  'W-2',
  '941',
  '990',
  'CMS-1500',
  'SS-4',
  'DS-11',
  'DS-82',
  'W-7',
  'W-8BEN',
  'I-130',
  'I-765',
  'I-864',
  'VA 21-526EZ',
  '1040-SR',
  '4506-T',
  '8843',
];

const PAGE_BATCH = 20;
const CATEGORIES = FORM_CATALOG_CATEGORIES as FormCatalogCategory[];
const ENTRIES = FORM_CATALOG_ENTRIES as FormCatalogEntry[];
const EXTERNAL_SOURCES = FORM_CATALOG_EXTERNAL_SOURCES as Record<string, FormCatalogExternalSource>;

const resolveFeaturedEntries = (): FormCatalogEntry[] => {
  const featured: FormCatalogEntry[] = [];
  for (const formNumber of FEATURED_FORM_NUMBERS) {
    const entry = ENTRIES.find((candidate) => (
      candidate.formNumber === formNumber && !candidate.isPriorYear
    ));
    if (entry) featured.push(entry);
  }
  return featured;
};

const FEATURED_ENTRIES = resolveFeaturedEntries();

const resolveCategorySections = (categoryRecord: FormCatalogCategory | null, fallbackKey: string): string[] => {
  const sections = categoryRecord?.sections;
  if (Array.isArray(sections) && sections.length > 0) {
    return sections;
  }
  return [fallbackKey];
};

const FormCatalogIndexPage = ({
  verifiedUser = null,
  initialCategory,
  initialQuery,
  initialPage = 0,
  onRequestSignIn = defaultStandaloneRequestSignIn,
  onNavigate = defaultStandaloneNavigate,
}: FormCatalogIndexPageProps) => {
  const [category, setCategory] = useState<string>(initialCategory || 'all');
  const [query, setQuery] = useState<string>(initialQuery || '');
  const [visibleCount, setVisibleCount] = useState<number>(
    Math.max(PAGE_BATCH, (initialPage + 1) * PAGE_BATCH),
  );

  useEffect(() => {
    // Back/forward navigation pushes new props in. Sync local state and reset the
    // visible window so the grid starts from the top of the filtered list.
    setCategory(initialCategory || 'all');
    setQuery(initialQuery || '');
    setVisibleCount(Math.max(PAGE_BATCH, (initialPage + 1) * PAGE_BATCH));
  }, [initialCategory, initialQuery, initialPage]);

  useEffect(() => {
    // Standalone hydration path (no initial props from a parent): read URL query
    // params on mount so direct visits to /forms?category=healthcare still apply
    // the filter after the SSR-matched default render.
    if (typeof window === 'undefined') return;
    if (initialCategory !== undefined || initialQuery !== undefined || initialPage) return;
    const params = new URLSearchParams(window.location.search);
    const urlCategory = params.get('category');
    const urlQuery = params.get('q');
    const urlPageRaw = params.get('page');
    const urlPage = urlPageRaw ? Math.max(0, Number.parseInt(urlPageRaw, 10) || 0) : 0;
    if (urlCategory) setCategory(urlCategory);
    if (urlQuery) setQuery(urlQuery);
    if (urlPage) setVisibleCount(Math.max(PAGE_BATCH, (urlPage + 1) * PAGE_BATCH));
    // Intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushRoute = useCallback(
    (nextCategory: string, nextQuery: string) => {
      const nextRoute: WorkspaceBrowserRoute = { kind: 'form-catalog-index' };
      if (nextCategory && nextCategory !== 'all') nextRoute.category = nextCategory;
      if (nextQuery) nextRoute.query = nextQuery;
      onNavigate(nextRoute, { replace: true });
    },
    [onNavigate],
  );

  const handleCategoryChange = useCallback(
    (nextKey: string) => {
      setCategory(nextKey);
      setVisibleCount(PAGE_BATCH);
      pushRoute(nextKey, '');
      setQuery('');
    },
    [pushRoute],
  );

  const handleQueryChange = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      setVisibleCount(PAGE_BATCH);
      pushRoute(category, nextQuery);
    },
    [category, pushRoute],
  );

  const activeCategory = useMemo(
    () => CATEGORIES.find((c) => c.key === category) || null,
    [category],
  );

  const activeExternalSource = useMemo(
    () => (category !== 'all' ? EXTERNAL_SOURCES[category] || null : null),
    [category],
  );

  const searchEnabled = category !== 'all' && !activeExternalSource;

  const filteredEntries = useMemo<FormCatalogEntry[]>(() => {
    if (category === 'all') {
      // All-categories default view surfaces the curated featured list only.
      // Users narrow by clicking a category chip to open the full list.
      return FEATURED_ENTRIES;
    }
    if (activeExternalSource) {
      return [];
    }
    const scopedSections = new Set(resolveCategorySections(activeCategory, category));
    const bySection = ENTRIES.filter((entry) => scopedSections.has(entry.section));
    if (!query.trim()) return bySection;
    const q = query.trim().toLowerCase();
    return bySection.filter((entry) => (
      entry.title.toLowerCase().includes(q)
      || entry.formNumber.toLowerCase().includes(q)
      || (entry.description && entry.description.toLowerCase().includes(q))
    ));
  }, [activeCategory, activeExternalSource, category, query]);

  const clampedVisible = Math.min(visibleCount, filteredEntries.length);
  const pageSlice = filteredEntries.slice(0, clampedVisible);
  const hasMore = filteredEntries.length > clampedVisible;

  const allChip: FormCatalogCategory = {
    key: 'all',
    label: 'Featured',
    count: FEATURED_ENTRIES.length,
    empty: false,
    emptyReason: null,
  };

  const resultsLabel = useMemo(() => {
    if (category === 'all') {
      return `${filteredEntries.length} featured forms${filteredEntries.length ? ' • Pick a category for more' : ''}`;
    }
    if (activeExternalSource) {
      return `External source links for ${activeExternalSource.label}`;
    }
    const total = filteredEntries.length;
    const showing = Math.min(total, clampedVisible);
    const scope = activeCategory?.label || category;
    const base = query.trim()
      ? `${total} forms in ${scope} match “${query.trim()}”`
      : `${total} forms in ${scope}`;
    return total > showing ? `${base} • Showing ${showing}` : base;
  }, [activeCategory, activeExternalSource, category, clampedVisible, filteredEntries.length, query]);

  useEffect(() => {
    applySeoMetadata(
      buildFormCatalogIndexSeo({
        categoryKey: category !== 'all' ? category : null,
      }),
    );
  }, [category]);

  const renderCatalog = () => (
    <>
      <section className="form-catalog__filters" aria-label="Filter forms">
        <div className="form-catalog__search-row">
          <input
            type="search"
            className="form-catalog__search-input"
            value={query}
            placeholder={
              searchEnabled
                ? `Search ${activeCategory?.label ?? 'forms'} by title or form number`
                : 'Pick a category below to search its forms'
            }
            onChange={(event) => handleQueryChange(event.target.value)}
            disabled={!searchEnabled}
            aria-label="Search forms in the active category"
          />
        </div>
        <div className="form-catalog__chips" role="tablist" aria-label="Form categories">
          {[allChip, ...CATEGORIES].map((cat) => {
            const isActive = category === cat.key;
            const hasExternalSource = Boolean(EXTERNAL_SOURCES[cat.key]);
            const isDisabled = cat.key !== 'all' && cat.empty && !hasExternalSource;
            return (
              <button
                key={cat.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`form-catalog__chip${isActive ? ' form-catalog__chip--active' : ''}`}
                onClick={() => handleCategoryChange(cat.key)}
                disabled={isDisabled}
                title={cat.empty && cat.emptyReason ? cat.emptyReason : undefined}
              >
                <span>{cat.label}</span>
                {hasExternalSource ? null : (
                  <span className="form-catalog__chip-count">{cat.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <p className="form-catalog__result-meta">{resultsLabel}</p>

      {activeExternalSource ? (
        <section className="form-catalog__external-list" aria-label={`${activeExternalSource.label} external sources`}>
          <div className="form-catalog__external-kicker">External source list</div>
          <h3>{activeExternalSource.label}</h3>
          <p className="form-catalog__external-copy">
            These forms stay external to DullyPDF. Use the links below to open the official source pages or
            download pages referenced in <code>{activeExternalSource.sourceFile}</code>, then upload the PDF you
            need into DullyPDF when you want field detection, filling, or signatures.
          </p>
          <ul className="form-catalog__external-links">
            {activeExternalSource.links.map((link) => (
              <li key={`${activeExternalSource.key}:${link.url}`}>
                <a href={link.url} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
                <span>{link.url}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : pageSlice.length === 0 ? (
        <div className="form-catalog__empty">
          <h3>No forms match your filters</h3>
          <p>Try a different category or clear the search box.</p>
        </div>
      ) : (
        <div className="form-catalog__grid">
          {pageSlice.map((entry) => (
            <a
              key={entry.slug}
              href={`/forms/${encodeURIComponent(entry.slug)}`}
              className="form-catalog__card"
              onClick={(event) => {
                event.preventDefault();
                onNavigate({ kind: 'form-catalog-form', slug: entry.slug });
              }}
            >
              <FormCatalogThumbnail
                thumbnailUrl={entry.thumbnailUrl}
                formNumber={entry.formNumber}
                title={entry.title}
              />
              <div className="form-catalog__card-meta">
                {entry.formNumber ? (
                  <span className="form-catalog__card-number">{entry.formNumber}</span>
                ) : null}
                {entry.pageCount ? (
                  <span className="form-catalog__card-pages" aria-label={`${entry.pageCount} page PDF`}>
                    {entry.pageCount} {entry.pageCount === 1 ? 'page' : 'pages'}
                  </span>
                ) : null}
              </div>
              <h3 className="form-catalog__card-title">{entry.title}</h3>
              {entry.description ? (
                <p className="form-catalog__card-description">{entry.description}</p>
              ) : null}
            </a>
          ))}
        </div>
      )}

      {hasMore && !activeExternalSource ? (
        <div className="form-catalog__pagination">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + PAGE_BATCH)}
          >
            Load more forms
          </button>
          <span className="form-catalog__pagination-status">
            Showing {clampedVisible} of {filteredEntries.length}
          </span>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="form-catalog">
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
          <span>Form Catalog</span>
        </nav>
        <div className="form-catalog__header-actions">
          {verifiedUser ? (
            <button
              type="button"
              className="form-catalog__header-button"
              onClick={() => onNavigate({ kind: 'upload-root' })}
            >
              Upload your own PDF
            </button>
          ) : (
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

      <main className="form-catalog__main">
        <section className="form-catalog__hero">
          <div className="form-catalog__hero-kicker">Form catalog</div>
          <h1 className="form-catalog__hero-title">Pre-made fillable PDF templates</h1>
          <p className="form-catalog__hero-summary">
            Browse {ENTRIES.length.toLocaleString()} free, public-domain government and industry forms across{' '}
            {CATEGORIES.filter((c) => !c.empty).length} categories. Pick a category to search within it, then
            open any form directly in the DullyPDF editor to fill, save, or auto-fill from your data.
          </p>
        </section>

        {renderCatalog()}
      </main>
      <SiteFooter />
    </div>
  );
};

export default FormCatalogIndexPage;
