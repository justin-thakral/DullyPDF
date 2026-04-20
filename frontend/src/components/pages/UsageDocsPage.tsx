import { useEffect, useMemo } from 'react';
import type { UsageDocsPageKey } from './usageDocsContent';
import {
  getUsageDocsPage,
  getUsageDocsPages,
  usageDocsHref,
} from './usageDocsContent';
import './UsageDocsPage.css';
import { applyRouteSeo } from '../../utils/seo';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { PublicSiteFrame } from '../ui/PublicSiteFrame';
import type { IntentPageKey } from '../../config/intentPages';
import { getIntentPage } from '../../config/intentPages';
import { getBlogGuideLinksForUsageDocsPage } from '../../config/blogRelations';
import {
  FILL_PDF_FROM_FILE_DEMO_VIDEO,
  FULL_FEATURE_DEMO_VIDEO,
  PDF_TO_FILLABLE_DEMO_VIDEO,
  WEB_FORM_AND_SIGN_DEMO_VIDEO,
} from '../../config/publicVideoContent';
import PublicVideoPanel from './PublicVideoPanel';
import PublicProfileLinksPanel from './PublicProfileLinksPanel';

type UsageDocsPageProps = {
  pageKey: UsageDocsPageKey;
};

const UsageDocsPage = ({ pageKey }: UsageDocsPageProps) => {
  const page = getUsageDocsPage(pageKey);
  const pages = getUsageDocsPages();
  const pageVideo = pageKey === 'index'
    ? FULL_FEATURE_DEMO_VIDEO
    : pageKey === 'getting-started'
      ? PDF_TO_FILLABLE_DEMO_VIDEO
      : pageKey === 'search-fill'
        ? FILL_PDF_FROM_FILE_DEMO_VIDEO
        : pageKey === 'fill-by-link'
          ? WEB_FORM_AND_SIGN_DEMO_VIDEO
          : null;

  const relatedWorkflows = useMemo(() => {
    const keys: IntentPageKey[] = page.relatedWorkflowKeys ?? [];
    return keys.map((key) => {
      const p = getIntentPage(key);
      return { label: p.navLabel, href: p.path };
    });
  }, [page.relatedWorkflowKeys]);
  const relatedGuides = useMemo(
    () => getBlogGuideLinksForUsageDocsPage(page.key, page.relatedWorkflowKeys ?? []),
    [page.key, page.relatedWorkflowKeys],
  );
  const adjacentDocs = useMemo(() => {
    const currentIndex = pages.findIndex((entry) => entry.key === pageKey);
    return pages.filter((entry, index) => entry.key !== pageKey && Math.abs(index - currentIndex) <= 2);
  }, [pageKey, pages]);

  useEffect(() => {
    applyRouteSeo({ kind: 'usage-docs', pageKey });
  }, [pageKey]);

  const breadcrumbItems = pageKey === 'index'
    ? [{ label: 'Home', href: '/' }, { label: 'Usage Docs' }]
    : [{ label: 'Home', href: '/' }, { label: 'Usage Docs', href: '/usage-docs' }, { label: page.title }];

  return (
    <PublicSiteFrame activeNavKey="usage-docs" bodyClassName="usage-docs-page">
      <div className="usage-docs-page__local-nav" aria-label="Usage docs utility navigation">
        <a href="/usage-docs" className="usage-docs-page__local-link usage-docs-page__local-link--active">Usage Docs</a>
        <a href="/privacy" className="usage-docs-page__local-link">Privacy Policy</a>
        <a href="/terms" className="usage-docs-page__local-link">Terms of Service</a>
      </div>

      <div className="usage-docs-page__surface">
        <section className="usage-docs-hero">
          <Breadcrumbs items={breadcrumbItems} />
          <span className="usage-docs-kicker">Usage docs</span>
          <h1 className="usage-docs-title">{page.title}</h1>
          <p className="usage-docs-summary">{page.summary}</p>
        </section>

        <div className="usage-docs-layout">
          <aside className="usage-docs-sidebar" aria-label="Usage docs sidebar">
            <div className="usage-docs-sidebar__group">
              <h2>Pages</h2>
              <div className="usage-docs-sidebar__pages">
                {pages.map((entry) => {
                  const active = entry.key === page.key;
                  return (
                    <a
                      key={entry.key}
                      href={usageDocsHref(entry.key)}
                      className={active ? 'usage-docs-sidebar__page usage-docs-sidebar__page--active' : 'usage-docs-sidebar__page'}
                      aria-current={active ? 'page' : undefined}
                    >
                      {entry.navLabel}
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="usage-docs-sidebar__group">
              <h2>On this page</h2>
              <div className="usage-docs-sidebar__sections">
                {page.sections.map((section) => (
                  <a key={section.id} href={`#${section.id}`} className="usage-docs-sidebar__section-link">
                    {section.title}
                  </a>
                ))}
              </div>
            </div>
          </aside>

          <main className="usage-docs-content">
            <section className="usage-docs-section">
              <h2>How to use this docs page</h2>
              <p>
                This page is meant to answer one operational stage of the DullyPDF workflow well enough that you can
                run a controlled test without guessing. Read the sections below, validate the behavior against one
                representative document, and only then move to the next linked page.
              </p>
              <p>
                That order matters because most setup failures come from mixing detection, mapping, fill validation,
                and sharing into one unstructured pass. A narrower review loop keeps troubleshooting faster and makes
                the template easier to trust once you save it for reuse.
              </p>
            </section>

            {pageVideo ? <PublicVideoPanel {...pageVideo} /> : null}

            {pageKey === 'index' ? (
              <PublicProfileLinksPanel
                title="Official DullyPDF profiles"
                description="These links help operators move between the public docs, product demos, company presence, and open-source implementation without falling back to the homepage."
              />
            ) : null}

            {page.sections.map((section) => (
              <section key={section.id} id={section.id} className="usage-docs-section">
                <h2>{section.title}</h2>
                {section.body}
              </section>
            ))}

            {adjacentDocs.length > 0 && (
              <section className="usage-docs-section usage-docs-section--related">
                <h2>Continue through the docs</h2>
                <p>
                  Move to the next closest docs page instead of skipping ahead to unrelated features. That keeps the
                  rollout sequence easier to validate and reduces setup drift between templates.
                </p>
                <ul>
                  {adjacentDocs.map((entry) => (
                    <li key={entry.key}>
                      <a href={usageDocsHref(entry.key)}>{entry.title}</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {relatedWorkflows.length > 0 && (
              <section className="usage-docs-section usage-docs-section--related">
                <h2>Related workflows</h2>
                <p>
                  These workflow pages explain the public search-intent side of the same feature area, which is useful
                  when you need a higher-level route summary before returning to the operational docs.
                </p>
                <ul>
                  {relatedWorkflows.map((link) => (
                    <li key={link.href}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {relatedGuides.length > 0 && (
              <section className="usage-docs-section usage-docs-section--related">
                <h2>Related guides</h2>
                <p>
                  These blog posts show concrete rollout examples and comparisons for the same workflow area, which is
                  useful when you want a narrower example before returning to the operational docs.
                </p>
                <ul>
                  {relatedGuides.map((guide) => (
                    <li key={guide.href}>
                      <a href={guide.href}>{guide.title}</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </main>
        </div>
      </div>
    </PublicSiteFrame>
  );
};

export default UsageDocsPage;
