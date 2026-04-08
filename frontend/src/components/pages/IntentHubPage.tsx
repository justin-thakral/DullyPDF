import { useEffect } from 'react';
import {
  applyRouteSeo,
} from '../../utils/seo';
import { resolveRouteSeoBodyContent, type RouteBodySection } from '../../config/routeSeo';
import {
  getFeaturedIndustryIntentPages,
  getFeaturedWorkflowIntentPages,
} from '../../config/intentPages';
import { IntentPageShell } from './IntentPageShell';

type IntentHubKey = 'workflows' | 'industries';

type IntentHubPageProps = {
  hubKey: IntentHubKey;
};

const HUB_BREADCRUMB_LABEL: Record<IntentHubKey, string> = {
  workflows: 'Workflows',
  industries: 'Industries',
};

const IntentHubPage = ({ hubKey }: IntentHubPageProps) => {
  const bodyContent = resolveRouteSeoBodyContent({ kind: 'intent-hub', hubKey });
  const pageSections = (bodyContent?.sections ?? []) as RouteBodySection[];
  const featuredPages = hubKey === 'workflows'
    ? getFeaturedWorkflowIntentPages()
    : getFeaturedIndustryIntentPages();
  const featuredHrefSet = new Set(featuredPages.map((page) => page.path));
  const supplementalSections = pageSections.filter((section) => !featuredHrefSet.has(section.href ?? ''));

  useEffect(() => {
    applyRouteSeo({ kind: 'intent-hub', hubKey });
  }, [hubKey]);

  return (
    <IntentPageShell
      breadcrumbItems={[{ label: 'Home', href: '/' }, { label: HUB_BREADCRUMB_LABEL[hubKey] }]}
      activeNavKey={hubKey === 'workflows' ? 'workflows' : 'industries'}
      usePublicChrome
      heroKicker={bodyContent?.heroKicker ?? 'Hub'}
      heroTitle={bodyContent?.heading ?? 'Public route library'}
      heroSummary={bodyContent?.paragraphs?.[0] ?? ''}
    >
      <section className="intent-page__panel">
        <h2>{bodyContent?.panelTitle ?? 'Pages'}</h2>
        <p>{bodyContent?.panelDescription ?? ''}</p>
        {featuredPages.length ? (
          <div className="intent-page__hub-card-grid">
            {featuredPages.map((page) => (
              <a key={page.path} href={page.path} className="intent-page__hub-card">
                <span className="intent-page__hub-card-media">
                  <img
                    src={page.hubImage.src}
                    alt={page.hubImage.alt}
                    loading="eager"
                    decoding="async"
                    style={page.hubImage.objectPosition ? { objectPosition: page.hubImage.objectPosition } : undefined}
                    className="intent-page__hub-card-image"
                  />
                </span>
                <span className="intent-page__hub-card-body">
                  {page.hubImage.eyebrow ? <span className="intent-page__hub-card-eyebrow">{page.hubImage.eyebrow}</span> : null}
                  <span className="intent-page__hub-card-title">{page.navLabel}</span>
                  <span className="intent-page__hub-card-summary">{page.heroSummary}</span>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <div className="intent-page__related-links">
            {pageSections.map((section) => (
              <a key={section.href ?? section.title} href={section.href ?? '#'} className="intent-page__related-link">
                {section.title}
              </a>
            ))}
          </div>
        )}
      </section>

      {supplementalSections.length ? (
        <section className="intent-page__panel">
          <h2>{hubKey === 'workflows' ? 'More workflow pages' : 'More industry pages'}</h2>
          <p>
            {hubKey === 'workflows'
              ? 'These route pages stay in the library too, even when they do not need a larger screenshot treatment.'
              : 'These industry routes remain part of the public library even when the top section already highlights the main vertical entry points.'}
          </p>
          <div className="intent-page__related-links">
            {supplementalSections.map((section) => (
              <a key={section.href ?? section.title} href={section.href ?? '#'} className="intent-page__related-link">
                {section.title}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {(bodyContent?.supportSections ?? []).map((section) => (
        <section
          key={section.title}
          className={section.paragraphs?.length ? 'intent-page__panel intent-page__panel--article' : 'intent-page__panel'}
        >
          <h2>{section.title}</h2>
          {section.paragraphs?.length ? (
            <div className="intent-page__article-copy">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
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
    </IntentPageShell>
  );
};

export default IntentHubPage;
