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
  navAriaLabel?: string;
};

export const PublicSiteHeader = ({
  activeNavKey = null,
  brandTagline = PUBLIC_SITE_BRAND_TAGLINE,
  navAriaLabel = 'Primary navigation',
}: PublicSiteHeaderProps) => (
  <header className="public-site-header">
    <div className="public-site-header__inner">
      <a href="/" className="public-site-header__brand" aria-label="DullyPDF home">
        <picture>
          <source srcSet="/DullyPDFLogoImproved.webp" type="image/webp" />
          <img
            src="/DullyPDFLogoImproved.png"
            alt="DullyPDF"
            className="public-site-header__logo"
            decoding="async"
          />
        </picture>
        <span className="public-site-header__brand-copy">
          <span className="public-site-header__brand-name">DullyPDF</span>
          <span className="public-site-header__brand-tagline">{brandTagline}</span>
        </span>
      </a>

      <div className="public-site-header__actions">
        <nav className="public-site-header__nav" aria-label={navAriaLabel}>
          {(PUBLIC_SITE_NAV_LINKS as PublicSiteNavLink[]).map((link) => {
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

        <a href="/" className="public-site-header__cta">
          Try DullyPDF
        </a>
      </div>
    </div>
  </header>
);
