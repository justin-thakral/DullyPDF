import {
  PUBLIC_SITE_BRAND_TAGLINE,
  PUBLIC_SITE_NAV_LINKS,
} from '../../config/publicSiteChrome.mjs';
import './PublicSiteHeader.css';

export type PublicSiteHeaderNavKey = 'workflows' | 'industries' | 'usage-docs' | 'blog';

type PublicSiteNavLink = {
  key: PublicSiteHeaderNavKey;
  label: string;
  href: string;
};

type PublicSiteHeaderProps = {
  activeNavKey?: PublicSiteHeaderNavKey | null;
  brandTagline?: string;
  hideFormCatalog?: boolean;
  navAriaLabel?: string;
  locale?: 'en' | 'es';
};

export const PublicSiteHeader = ({
  activeNavKey = null,
  brandTagline = PUBLIC_SITE_BRAND_TAGLINE,
  hideFormCatalog = false,
  navAriaLabel = 'Primary navigation',
  locale = 'en',
}: PublicSiteHeaderProps) => {
  const isSpanish = locale === 'es';
  const isIndia = hideFormCatalog && !isSpanish;
  const navLinks = isSpanish
    ? [
        { key: 'workflows', label: 'Flujos', href: '/es/flujos-de-trabajo' },
        { key: 'industries', label: 'Industrias', href: '/es/industrias' },
        { key: 'usage-docs', label: 'Docs', href: '/es/usage-docs' },
        { key: 'blog', label: 'Blog', href: '/es/blog' },
      ] as PublicSiteNavLink[]
    : isIndia
      ? [
          { key: 'workflows', label: 'India Workflows', href: '/in/fill-pdf-from-excel' },
          { key: 'industries', label: 'India Solutions', href: '/in/kyc-pdf-automation' },
          { key: 'usage-docs', label: 'Usage Docs', href: '/es/usage-docs' },
          { key: 'blog', label: 'Blog', href: '/in/blog' },
        ] as PublicSiteNavLink[]
    : (PUBLIC_SITE_NAV_LINKS as PublicSiteNavLink[]);
  const resolvedBrandTagline = isSpanish
    ? 'Formularios PDF rellenables'
    : isIndia
      ? 'India PDF automation'
      : brandTagline;
  const homeHref = isSpanish ? '/es' : isIndia ? '/in' : '/';
  const homeLabel = isSpanish ? 'Inicio de DullyPDF' : isIndia ? 'DullyPDF India' : 'DullyPDF home';

  return (
  <header className="public-site-header">
    <div className="public-site-header__inner">
      <a href={homeHref} className="public-site-header__brand" aria-label={homeLabel}>
        <picture>
          <source srcSet="/DullyPDF_logo_social_full_bleed.webp" type="image/webp" />
          <img
            src="/DullyPDF_logo_social_full_bleed.png"
            alt="DullyPDF"
            className="public-site-header__logo"
            decoding="async"
          />
        </picture>
        <span className="public-site-header__brand-copy">
          <span className="public-site-header__brand-name">DullyPDF</span>
          <span className="public-site-header__brand-tagline">{resolvedBrandTagline}</span>
        </span>
      </a>

      <div className="public-site-header__actions">
        <nav className="public-site-header__nav" aria-label={navAriaLabel}>
          {navLinks.map((link) => {
            const active = activeNavKey === link.key;
            return (
              <a
                key={link.href}
                href={link.href}
                className={active ? 'public-site-header__nav-link public-site-header__nav-link--active' : 'public-site-header__nav-link'}
                aria-current={active ? 'page' : undefined}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        <a href={homeHref} className="public-site-header__cta">
          {isSpanish ? 'Probar DullyPDF' : 'Try DullyPDF'}
        </a>
      </div>
    </div>
  </header>
  );
};
