import { useEffect, useMemo } from 'react';
import { getIntentPage } from '../../config/intentPages';
import { applyNoIndexSeo } from '../../utils/seo';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { SiteFooter } from '../ui/SiteFooter';
import { getUsageDocsPage, usageDocsHref } from './usageDocsContent';
import './SeoLayoutPreviewPage.css';

const HEADER_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Usage Docs', href: '/usage-docs' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
];

const PREVIEW_ROUTE_PATH = '/blog/layout-preview';
const PREVIEW_INTENT_KEY = 'pdf-to-fillable-form' as const;
const PREVIEW_DOC_KEYS = ['getting-started', 'rename-mapping', 'search-fill'] as const;

const EDITORIAL_PRINCIPLES = [
  'Use one narrow reading column so the text feels like an article instead of a dashboard.',
  'Keep one lightweight CTA band near the top and one near the bottom instead of repeating button blocks in every section.',
  'Use semantic sections, real subheads, and inline links so the layout reads naturally before any React interaction.',
];

const PAGE_SCOPE_NOTES = [
  'Intent and workflow landing pages are the best candidates for this treatment.',
  'Usage Docs should stay more operational and scannable, with navigation optimized for task completion.',
  'Privacy and Terms should remain plain legal pages with high legibility, not marketing-style long-form shells.',
];

const SeoLayoutPreviewPage = () => {
  const page = getIntentPage(PREVIEW_INTENT_KEY);

  const relatedDocs = useMemo(
    () => PREVIEW_DOC_KEYS.map((key) => {
      const doc = getUsageDocsPage(key);
      return { label: doc.title, href: usageDocsHref(key) };
    }),
    [],
  );

  const relatedIntentLinks = useMemo(
    () => (page.relatedIntentPages ?? []).slice(0, 3).map((key) => {
      const relatedPage = getIntentPage(key);
      return { label: relatedPage.navLabel, href: relatedPage.path };
    }),
    [page.relatedIntentPages],
  );

  useEffect(() => {
    applyNoIndexSeo({
      title: 'SEO Layout Preview | DullyPDF',
      description: 'Internal noindex preview of a lighter editorial layout for DullyPDF intent pages.',
      canonicalPath: PREVIEW_ROUTE_PATH,
    });
  }, []);

  return (
    <div className="seo-layout-preview">
      <header className="seo-layout-preview__masthead">
        <div className="seo-layout-preview__masthead-inner">
          <a href="/" className="seo-layout-preview__brand">
            <picture>
              <source srcSet="/DullyPDFLogoImproved.webp" type="image/webp" />
              <img
                src="/DullyPDFLogoImproved.png"
                alt="DullyPDF"
                className="seo-layout-preview__brand-logo"
                decoding="async"
              />
            </picture>
            <span className="seo-layout-preview__brand-copy">
              <span className="seo-layout-preview__brand-name">DullyPDF</span>
              <span className="seo-layout-preview__brand-tagline">Editorial layout preview</span>
            </span>
          </a>

          <nav className="seo-layout-preview__nav" aria-label="Preview navigation">
            {HEADER_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="seo-layout-preview__nav-link">
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="seo-layout-preview__main">
        <div className="seo-layout-preview__article-wrap">
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/' },
              { label: 'Blog', href: '/blog' },
              { label: 'Layout Preview' },
            ]}
          />

          <article className="seo-layout-preview__article">
            <header className="seo-layout-preview__hero">
              <p className="seo-layout-preview__eyebrow">Noindex preview route</p>
              <h1>{page.heroTitle}</h1>
              <p className="seo-layout-preview__summary">{page.heroSummary}</p>

              <div className="seo-layout-preview__hero-meta">
                <span>Using real content from `{page.path}`</span>
                <span>Preview target: lighter authority-page shell</span>
              </div>

              <div className="seo-layout-preview__hero-actions">
                <a href="/" className="seo-layout-preview__button seo-layout-preview__button--primary">
                  Try DullyPDF Now
                </a>
                <a
                  href="/usage-docs/getting-started"
                  className="seo-layout-preview__button seo-layout-preview__button--secondary"
                >
                  View Getting Started Docs
                </a>
              </div>
            </header>

            <div className="seo-layout-preview__content-grid">
              <div className="seo-layout-preview__primary">
                <section className="seo-layout-preview__intro">
                  <p>
                    This page is meant to answer the exact design question before a broader restyle happens:
                    what if the workflow routes read more like focused product articles and less like boxed app cards?
                    The content here is intentionally real DullyPDF workflow copy so the decision is based on your
                    actual information density, not a fake mock.
                  </p>
                </section>

                {page.articleSections?.map((section) => (
                  <section key={section.title} className="seo-layout-preview__section">
                    <h2>{section.title}</h2>
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {section.bullets?.length ? (
                      <ul>
                        {section.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}

                <section className="seo-layout-preview__section seo-layout-preview__section--callout">
                  <h2>How teams put this into production</h2>
                  <p>
                    A stronger SEO layout should still guide the user into a concrete operating pattern. That means
                    keeping the narrative readable, then placing the validation checklist directly in the body instead
                    of boxing every idea into isolated cards.
                  </p>
                  <ol>
                    <li>Pick one recurring PDF and make that template reliable before scaling the workflow.</li>
                    <li>Check field geometry, names, checkbox groups, and date behavior before you optimize for speed.</li>
                    <li>Run one real record end-to-end, inspect the output, and only then publish links or API flows.</li>
                  </ol>
                </section>

                <section className="seo-layout-preview__section">
                  <h2>Frequently asked questions</h2>
                  {page.faqs.slice(0, 4).map((faq) => (
                    <div key={faq.question} className="seo-layout-preview__faq">
                      <h3>{faq.question}</h3>
                      <p>{faq.answer}</p>
                    </div>
                  ))}
                </section>

                <section className="seo-layout-preview__section seo-layout-preview__section--links">
                  <h2>Continue into the product</h2>
                  <p>
                    The article shell should still hand off cleanly into operational docs and adjacent workflow pages.
                    That handoff matters more than whether the outer container looks like a card.
                  </p>
                  <div className="seo-layout-preview__link-grid">
                    {relatedDocs.map((link) => (
                      <a key={link.href} href={link.href} className="seo-layout-preview__resource-link">
                        {link.label}
                      </a>
                    ))}
                    {relatedIntentLinks.map((link) => (
                      <a key={link.href} href={link.href} className="seo-layout-preview__resource-link">
                        {link.label}
                      </a>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="seo-layout-preview__sidebar">
                <section className="seo-layout-preview__rail-card">
                  <p className="seo-layout-preview__rail-label">Preview goals</p>
                  <h2>What is changing here</h2>
                  <ul>
                    {EDITORIAL_PRINCIPLES.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>

                <section className="seo-layout-preview__rail-card">
                  <p className="seo-layout-preview__rail-label">Scope decision</p>
                  <h2>Should every public page follow this?</h2>
                  <ul>
                    {PAGE_SCOPE_NOTES.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>

                <section className="seo-layout-preview__rail-card">
                  <p className="seo-layout-preview__rail-label">Current route</p>
                  <h2>Where to compare</h2>
                  <p>
                    Compare this preview against the live intent shell at <a href={page.path}>{page.path}</a>. If you
                    like the direction, the next step would be to apply the shell change to intent pages only, not to
                    usage docs or legal pages.
                  </p>
                </section>
              </aside>
            </div>
          </article>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default SeoLayoutPreviewPage;
