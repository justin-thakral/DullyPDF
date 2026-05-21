import type { ReactNode } from 'react';
import { Breadcrumbs, type BreadcrumbItem } from '../ui/Breadcrumbs';
import { SiteFooter } from '../ui/SiteFooter';
import type { PublicSiteHeaderNavKey } from '../ui/PublicSiteHeader';
import { PublicSiteFrame } from '../ui/PublicSiteFrame';
import './IntentLandingPage.css';

type IntentPageShellProps = {
  breadcrumbItems: BreadcrumbItem[];
  heroKicker: string;
  heroTitle: string;
  heroSummary: string;
  activeNavKey?: PublicSiteHeaderNavKey | null;
  hideFormCatalog?: boolean;
  usePublicChrome?: boolean;
  locale?: 'en' | 'es';
  children: ReactNode;
};

export const IntentPageShell = ({
  breadcrumbItems,
  heroKicker,
  heroTitle,
  heroSummary,
  activeNavKey = null,
  hideFormCatalog = false,
  usePublicChrome = false,
  locale = 'en',
  children,
}: IntentPageShellProps) => {
  const isSpanish = locale === 'es';
  const ctaCopy = isSpanish
    ? {
        primaryLabel: 'Probar DullyPDF',
        primaryHref: '/es',
        secondaryLabel: 'Ver documentación de uso',
      }
    : {
        primaryLabel: 'Try DullyPDF Now',
        primaryHref: '/',
        secondaryLabel: 'View Getting Started Docs',
      };

  if (usePublicChrome) {
    return (
      <PublicSiteFrame
        activeNavKey={activeNavKey}
        bodyClassName="intent-page__content intent-page__content--public"
        hideFormCatalog={hideFormCatalog}
        locale={locale}
      >
        <Breadcrumbs items={breadcrumbItems} />

        <section className="intent-page__hero">
          <p className="intent-page__kicker">{heroKicker}</p>
          <h1>{heroTitle}</h1>
          <p>{heroSummary}</p>
          <div className="intent-page__cta-row">
            <a href={ctaCopy.primaryHref} className="intent-page__cta intent-page__cta--primary">
              {ctaCopy.primaryLabel}
            </a>
            <a href="/es/usage-docs/getting-started" className="intent-page__cta intent-page__cta--secondary">
              {ctaCopy.secondaryLabel}
            </a>
          </div>
        </section>

        {children}
      </PublicSiteFrame>
    );
  }

  return (
    <div className="intent-page">
      <div className="intent-page__card">
        <header className="intent-page__header">
          <div className="intent-page__brand">
            <picture>
              <source srcSet="/DullyPDF_logo_social_full_bleed.webp" type="image/webp" />
              <img src="/DullyPDF_logo_social_full_bleed.png" alt="DullyPDF" className="intent-page__logo" decoding="async" />
            </picture>
            <div>
              <div className="intent-page__brand-name">DullyPDF</div>
              <div className="intent-page__brand-tagline">PDF automation workflows</div>
            </div>
          </div>
          <nav className="intent-page__nav" aria-label="Primary navigation">
            <a href="/" className="intent-page__nav-link">Home</a>
            <a href="/es/usage-docs" className="intent-page__nav-link">Usage Docs</a>
            <a href="/privacy" className="intent-page__nav-link">Privacy</a>
            <a href="/terms" className="intent-page__nav-link">Terms</a>
          </nav>
        </header>

        <main className="intent-page__content">
          <Breadcrumbs items={breadcrumbItems} />

          <section className="intent-page__hero">
            <p className="intent-page__kicker">{heroKicker}</p>
            <h1>{heroTitle}</h1>
            <p>{heroSummary}</p>
            <div className="intent-page__cta-row">
              <a href={ctaCopy.primaryHref} className="intent-page__cta intent-page__cta--primary">
                {ctaCopy.primaryLabel}
              </a>
              <a href="/es/usage-docs/getting-started" className="intent-page__cta intent-page__cta--secondary">
                {ctaCopy.secondaryLabel}
              </a>
            </div>
          </section>

          {children}
        </main>

        <SiteFooter hideFormCatalog={hideFormCatalog} locale={locale} />
      </div>
    </div>
  );
};
