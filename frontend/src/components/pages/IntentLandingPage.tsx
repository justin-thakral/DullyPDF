import { useEffect, useMemo, type ReactNode } from 'react';
import FormCatalogThumbnail from './FormCatalogThumbnail';
import {
  getIntentPage,
  getIntentPageArticleFigures,
  getIntentPages,
  type IntentPageKey,
} from '../../config/intentPages';
import {
  buildIntentCatalogWorkflowSteps,
  getIntentCatalogShowcase,
  getIntentCatalogCategorySummaries,
} from '../../config/intentCatalogShowcases.mjs';
import {
  ESIGN_PIPELINE_DEMO_VIDEO,
  FILL_PDF_FROM_FILE_DEMO_VIDEO,
  PDF_TO_FILLABLE_DEMO_VIDEO,
  WEB_FORM_AND_SIGN_DEMO_VIDEO,
} from '../../config/publicVideoContent';
import { getUsageDocsPage, usageDocsHref } from './usageDocsContent';
import { applyRouteSeo } from '../../utils/seo';
import { IntentPageShell } from './IntentPageShell';
import PublicVideoPanel from './PublicVideoPanel';

type IntentLandingPageProps = {
  pageKey: IntentPageKey;
};

const FOOTNOTE_TOKEN = /\[\^([a-z0-9-]+)\]/gi;

function getFootnoteMatches(text: string): RegExpMatchArray[] {
  return Array.from(text.matchAll(FOOTNOTE_TOKEN));
}

const getFootnoteSuffix = (referenceIndex: number): string => {
  let remaining = referenceIndex;
  let suffix = '';

  while (remaining > 0) {
    remaining -= 1;
    suffix = String.fromCharCode(97 + (remaining % 26)) + suffix;
    remaining = Math.floor(remaining / 26);
  }

  return suffix;
};

type IntentCatalogDocument = {
  slug: string;
  formNumber: string;
  title: string;
  description: string;
  pageCount: number | null;
  pdfUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  sectionLabel: string;
  editorHref: string;
  catalogHref: string;
};

type IntentCatalogWorkflowStep = {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
};

type IntentCatalogShowcase = {
  title: string;
  description: string;
  categoryLinks?: Array<{ label: string; href: string }>;
  documents: IntentCatalogDocument[];
  featuredDocuments: IntentCatalogDocument[];
};

type IntentCatalogCategorySummary = {
  key: string;
  label: string;
  count: number;
  empty: boolean;
  emptyReason: string | null;
  description: string;
  browseHref: string | null;
  representativeDocument: {
    formLabel: string;
    pdfUrl: string;
    thumbnailUrl: string;
  } | null;
};

const IntentLandingPage = ({ pageKey }: IntentLandingPageProps) => {
  const page = getIntentPage(pageKey);
  const articleFigures = getIntentPageArticleFigures(pageKey);
  const catalogShowcase = getIntentCatalogShowcase(pageKey) as IntentCatalogShowcase | null;
  const catalogCategorySummaries = useMemo<IntentCatalogCategorySummary[]>(
    () => getIntentCatalogCategorySummaries(pageKey) as IntentCatalogCategorySummary[],
    [pageKey],
  );
  const catalogWorkflowSteps = useMemo<IntentCatalogWorkflowStep[]>(
    () => (catalogShowcase ? buildIntentCatalogWorkflowSteps(catalogShowcase) as IntentCatalogWorkflowStep[] : []),
    [catalogShowcase],
  );
  const pageVideo = pageKey === 'pdf-to-fillable-form'
    ? PDF_TO_FILLABLE_DEMO_VIDEO
    : pageKey === 'fill-pdf-from-csv'
      ? FILL_PDF_FROM_FILE_DEMO_VIDEO
      : pageKey === 'fill-pdf-by-link'
        ? WEB_FORM_AND_SIGN_DEMO_VIDEO
        : pageKey === 'pdf-signature-workflow'
          || pageKey === 'esign-ueta-pdf-workflow'
          || pageKey === 'pdf-fill-api'
          ? ESIGN_PIPELINE_DEMO_VIDEO
          : null;
  const footnoteNumberById = useMemo(
    () => new Map((page.footnotes ?? []).map((footnote, index) => [footnote.id, index + 1])),
    [page.footnotes],
  );
  const footnoteReferenceTotalById = useMemo(
    () => {
      const totals = new Map<string, number>();
      const collect = (text: string) => {
        for (const match of getFootnoteMatches(text)) {
          const footnoteId = match[1];
          totals.set(footnoteId, (totals.get(footnoteId) ?? 0) + 1);
        }
      };

      page.articleSections?.forEach((section) => {
        section.paragraphs.forEach(collect);
        section.bullets?.forEach(collect);
      });
      page.valuePoints.forEach(collect);
      page.proofPoints.forEach(collect);
      page.faqs.forEach((faq) => collect(faq.answer));
      page.supportSections?.forEach((section) => {
        section.paragraphs?.forEach(collect);
      });

      return totals;
    },
    [page.articleSections, page.faqs, page.proofPoints, page.supportSections, page.valuePoints],
  );
  const footnoteReferenceCounts = new Map<string, number>();
  const relatedPages = useMemo(
    () => {
      if (page.relatedIntentPages?.length) {
        return page.relatedIntentPages.map((key) => getIntentPage(key));
      }

      const remaining = getIntentPages().filter((entry) => entry.key !== pageKey);
      const sameCategory = remaining.filter((entry) => entry.category === page.category);
      const otherCategory = remaining.filter((entry) => entry.category !== page.category);
      return [...sameCategory, ...otherCategory];
    },
    [page.category, page.relatedIntentPages, pageKey],
  );
  const relatedDocs = useMemo(
    () => {
      const pageKeys = page.relatedDocs ?? ['getting-started', 'detection', 'rename-mapping', 'search-fill'];
      return pageKeys.map((key) => {
        const doc = getUsageDocsPage(key);
        return { label: doc.title, href: usageDocsHref(key) };
      });
    },
    [page.relatedDocs],
  );
  const routeFocusLabel = page.navLabel.toLowerCase();
  const relatedRoutesSummary = page.category === 'industry'
    ? `These adjacent routes cover neighboring document workflows and team use cases that usually get evaluated alongside ${routeFocusLabel}.`
    : `These adjacent workflow pages cover nearby search intents teams compare while evaluating ${routeFocusLabel}.`;

  const renderFootnotedText = (text: string) => {
    const parts: ReactNode[] = [];
    let lastIndex = 0;

    for (const match of getFootnoteMatches(text)) {
      const matchIndex = match.index ?? lastIndex;
      if (matchIndex > lastIndex) {
        parts.push(text.slice(lastIndex, matchIndex));
      }

      const footnoteId = match[1];
      const footnoteNumber = footnoteNumberById.get(footnoteId);
      if (!footnoteNumber) {
        parts.push(match[0]);
      } else {
        const nextReferenceCount = (footnoteReferenceCounts.get(footnoteId) ?? 0) + 1;
        footnoteReferenceCounts.set(footnoteId, nextReferenceCount);
        const totalReferenceCount = footnoteReferenceTotalById.get(footnoteId) ?? 1;
        const footnoteMarker = totalReferenceCount > 1
          ? `${footnoteNumber}${getFootnoteSuffix(nextReferenceCount)}`
          : `${footnoteNumber}`;
        const referenceId = `footnote-ref-${footnoteId}-${nextReferenceCount}`;
        parts.push(
          <sup key={`${footnoteId}-${matchIndex}`} className="intent-page__footnote-ref">
            <a
              id={referenceId}
              href={`#footnote-${footnoteId}`}
              aria-label={`See legal footnote ${footnoteMarker}`}
            >
              {footnoteMarker}
            </a>
          </sup>,
        );
      }

      lastIndex = matchIndex + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length ? parts : text;
  };

  useEffect(() => {
    applyRouteSeo({ kind: 'intent', intentKey: pageKey });
  }, [pageKey]);

  return (
    <IntentPageShell
      breadcrumbItems={[
        { label: 'Home', href: '/' },
        { label: page.category === 'industry' ? 'Industries' : 'Workflows' },
        { label: page.navLabel },
      ]}
      activeNavKey={page.category === 'industry' ? 'industries' : 'workflows'}
      usePublicChrome
      heroKicker={page.category === 'industry' ? 'Industry workflow page' : 'Commercial workflow page'}
      heroTitle={page.heroTitle}
      heroSummary={page.heroSummary}
    >
      {articleFigures.length ? (
        <section className="intent-page__panel">
          <h2>Workflow examples for {page.navLabel}</h2>
          <div className="intent-page__figure-grid">
            {articleFigures.map((figure) => (
              <figure key={`${figure.src}-${figure.caption}`} className="intent-page__figure">
                <img
                  src={figure.src}
                  alt={figure.alt}
                  loading="eager"
                  decoding="async"
                  className="intent-page__figure-image"
                  style={figure.objectPosition ? { objectPosition: figure.objectPosition } : undefined}
                />
                <figcaption>{figure.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {pageVideo ? <PublicVideoPanel {...pageVideo} /> : null}

      {catalogShowcase ? (
        <>
          <section className="intent-page__panel">
            <h2>{catalogShowcase.title}</h2>
            <p>{catalogShowcase.description}</p>
            {catalogShowcase.categoryLinks?.length ? (
              <div className="intent-page__catalog-link-row">
                {catalogShowcase.categoryLinks.map((link) => (
                  <a key={`${link.label}-${link.href}`} href={link.href}>
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}
            <div className="intent-page__catalog-grid">
                {catalogShowcase.featuredDocuments.map((document) => (
                  <article key={document.slug} className="intent-page__catalog-card">
                    <a href={document.editorHref} className="intent-page__catalog-card-link">
                      <div className="intent-page__catalog-image-shell">
                        <FormCatalogThumbnail thumbnailUrl={document.thumbnailUrl} formNumber={document.formNumber} />
                      </div>
                    </a>
                    <div className="intent-page__catalog-card-copy">
                    <p className="intent-page__catalog-card-kicker">{document.sectionLabel}</p>
                    <h3>
                      <a href={document.catalogHref}>
                        {document.formNumber ? `${document.formNumber} — ` : ''}
                        {document.title}
                      </a>
                    </h3>
                    <p>{document.description}</p>
                    <p className="intent-page__catalog-card-meta">
                      {document.pageCount ? `${document.pageCount} ${document.pageCount === 1 ? 'page' : 'pages'} • ` : ''}
                      Blank official PDF
                    </p>
                  </div>
                  <div className="intent-page__catalog-actions">
                    <a
                      href={document.editorHref}
                      className="intent-page__catalog-action intent-page__catalog-action--primary"
                      aria-label={`Open ${document.formNumber || document.title} in DullyPDF`}
                    >
                      Open in DullyPDF
                    </a>
                    <a
                      href={document.pdfUrl}
                      className="intent-page__catalog-action intent-page__catalog-action--secondary"
                      aria-label={`Download blank PDF for ${document.formNumber || document.title}`}
                    >
                      Download blank PDF
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="intent-page__grid">
            <article className="intent-page__panel">
              <h2>10 specific forms to automate on this route</h2>
              <div className="intent-page__catalog-list">
                {catalogShowcase.documents.map((document) => (
                  <article key={document.slug} className="intent-page__catalog-list-item">
                    <div className="intent-page__catalog-list-copy">
                      <h3>
                        <a href={document.catalogHref}>
                          {document.formNumber ? `${document.formNumber} — ` : ''}
                          {document.title}
                        </a>
                      </h3>
                      <p>{document.description}</p>
                      <p className="intent-page__catalog-list-meta">
                        {document.sectionLabel}
                        {document.pageCount ? ` • ${document.pageCount} ${document.pageCount === 1 ? 'page' : 'pages'}` : ''}
                        {' • '}
                        <a href={document.sourceUrl}>Official source</a>
                      </p>
                    </div>
                    <div className="intent-page__catalog-list-actions">
                      <a href={document.editorHref}>Open in DullyPDF</a>
                      <a href={document.pdfUrl}>Blank PDF</a>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="intent-page__panel">
              <h2>How to open these PDFs in DullyPDF and automate them</h2>
              <div className="intent-page__workflow-grid">
                {catalogWorkflowSteps.map((step) => (
                  <article key={step.title} className="intent-page__workflow-card">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    <a href={step.href}>{step.linkLabel}</a>
                  </article>
                ))}
              </div>
            </article>
          </section>
        </>
      ) : null}

      {catalogCategorySummaries.length ? (
        <section className="intent-page__panel">
          <h2>All form catalog categories in DullyPDF</h2>
          <p>
            Every category below now carries a short explanation of what that bucket contains. Non-empty categories
            also show a representative mirrored PDF so the page reads like a real catalog overview instead of a text-only route.
          </p>
          <div className="intent-page__catalog-category-grid">
                {catalogCategorySummaries.map((category) => (
                  <article
                    key={category.key}
                className={`intent-page__catalog-category-card${
                  category.empty ? ' intent-page__catalog-category-card--empty' : ''
                }`}
              >
                {category.representativeDocument ? (
                  <div className="intent-page__catalog-category-media">
                    <div className="intent-page__catalog-category-image-shell">
                      <FormCatalogThumbnail
                        thumbnailUrl={category.representativeDocument.thumbnailUrl}
                        formNumber={category.representativeDocument.formLabel}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="intent-page__catalog-category-media intent-page__catalog-category-media--placeholder">
                    <span>External source bucket</span>
                  </div>
                )}
                <div className="intent-page__catalog-category-copy">
                  <p className="intent-page__catalog-category-kicker">{category.label}</p>
                  <h3>{category.count.toLocaleString()} {category.count === 1 ? 'form' : 'forms'}</h3>
                  <p>{category.description}</p>
                  <p className="intent-page__catalog-category-meta">
                    {category.empty
                      ? category.emptyReason || 'Catalog coverage described here; source forms remain external.'
                      : `Representative PDF: ${category.representativeDocument?.formLabel}. Browsable in the mirrored DullyPDF catalog and openable directly in the editor.`}
                  </p>
                </div>
                <div className="intent-page__catalog-category-actions">
                  {category.browseHref ? (
                    <a href={category.browseHref}>Browse {category.label}</a>
                  ) : (
                    <span>External-only source note</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {page.articleSections?.map((section) => (
        <section key={section.title} className="intent-page__panel intent-page__panel--article">
          <h2>{section.title}</h2>
          <div className="intent-page__article-copy">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{renderFootnotedText(paragraph)}</p>
            ))}
            {section.bullets?.length ? (
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{renderFootnotedText(bullet)}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ))}

      <section className="intent-page__grid">
        <article className="intent-page__panel">
          <h2>Why teams use {page.navLabel}</h2>
          <ul>
            {page.valuePoints.map((point) => (
              <li key={point}>{renderFootnotedText(point)}</li>
            ))}
          </ul>
        </article>

        <article className="intent-page__panel">
          <h2>Implementation signals for {page.navLabel}</h2>
          <ul>
            {page.proofPoints.map((point) => (
              <li key={point}>{renderFootnotedText(point)}</li>
            ))}
          </ul>
          <p>
            Need deeper technical details about {routeFocusLabel}? Use the
            {' '}
            <a href="/usage-docs/rename-mapping">Rename + Mapping docs</a>
            {' '}
            and
            {' '}
            <a href="/usage-docs/search-fill">Search &amp; Fill docs</a>
            {' '}
            to validate exact behavior.
          </p>
        </article>
      </section>

      <section className="intent-page__panel">
        <h2>Frequently asked questions about {page.navLabel}</h2>
        <div className="intent-page__faq-list">
          {page.faqs.map((faq) => (
            <article key={faq.question} className="intent-page__faq-item">
              <h3>{faq.question}</h3>
              <p>{renderFootnotedText(faq.answer)}</p>
            </article>
          ))}
        </div>
      </section>

      {page.footnotes?.length ? (
        <section className="intent-page__panel intent-page__panel--article">
          <h2>Legal footnotes and sources for {page.navLabel}</h2>
          <ol className="intent-page__footnote-list">
            {page.footnotes.map((footnote, index) => (
              <li key={footnote.id} id={`footnote-${footnote.id}`} className="intent-page__footnote-item">
                <span className="intent-page__footnote-number">{index + 1}.</span>
                <a href={footnote.href} className="intent-page__footnote-link">
                  {footnote.label}
                </a>
                <a
                  href={`#footnote-ref-${footnote.id}-1`}
                  className="intent-page__footnote-backlink"
                  aria-label={`Back to first reference for footnote ${
                    (footnoteReferenceTotalById.get(footnote.id) ?? 0) > 1 ? `${index + 1}a` : `${index + 1}`
                  }`}
                >
                  ↩
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {(page.supportSections ?? []).map((section) => (
        <section
          key={section.title}
          className={section.paragraphs?.length ? 'intent-page__panel intent-page__panel--article' : 'intent-page__panel'}
        >
          <h2>{section.title}</h2>
          {section.paragraphs?.length ? (
            <div className="intent-page__article-copy">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{renderFootnotedText(paragraph)}</p>
              ))}
            </div>
          ) : null}
          {section.links?.length ? (
            <div className="intent-page__related-links">
              {section.links.map((link) => (
                <a key={link.href} href={link.href} className="intent-page__related-link">
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}
        </section>
      ))}

      <section className="intent-page__panel">
        <h2>Docs for {page.navLabel}</h2>
        <p>
          Use these docs pages to verify the exact DullyPDF behavior behind {routeFocusLabel} before you ship it as a
          repeat workflow.
        </p>
        <div className="intent-page__related-links">
          {relatedDocs.map((doc) => (
            <a key={doc.href} href={doc.href} className="intent-page__related-link">
              {doc.label}
            </a>
          ))}
        </div>
      </section>

      <section className="intent-page__panel">
        <h2>Related routes for {page.navLabel}</h2>
        <p>
          {relatedRoutesSummary}
        </p>
        <div className="intent-page__related-links">
          {relatedPages.map((entry) => (
            <a key={entry.key} href={entry.path} className="intent-page__related-link">
              {entry.navLabel}
            </a>
          ))}
        </div>
      </section>
    </IntentPageShell>
  );
};

export default IntentLandingPage;
