import './SiteFooter.css';
import { OFFICIAL_PUBLIC_PROFILE_LINKS } from '../../config/publicProfiles';

const PRODUCT_LINKS = [
  { label: 'Form Catalog', href: '/forms' },
  { label: 'Getting Started', href: '/es/usage-docs/getting-started' },
  { label: 'Usage Docs', href: '/es/usage-docs' },
];

const PRODUCT_LINKS_WITHOUT_FORM_CATALOG = [
  { label: 'Getting Started', href: '/es/usage-docs/getting-started' },
  { label: 'Usage Docs', href: '/es/usage-docs' },
  { label: 'Free Features', href: '/free-features' },
];

const SPANISH_PRODUCT_LINKS = [
  { label: 'Primeros pasos', href: '/es/usage-docs/getting-started' },
  { label: 'Documentación de uso', href: '/es/usage-docs' },
  { label: 'Funciones gratis', href: '/free-features' },
];

const RESOURCE_LINKS = [
  { label: 'Blog', href: '/es/blog' },
  { label: 'Troubleshooting', href: '/es/usage-docs/troubleshooting' },
];

const INDIA_RESOURCE_LINKS = [
  { label: 'Blog', href: '/in/blog' },
  { label: 'Troubleshooting', href: '/es/usage-docs/troubleshooting' },
];

const SPANISH_RESOURCE_LINKS = [
  { label: 'Blog', href: '/es/blog' },
  { label: 'Solución de problemas', href: '/es/usage-docs/troubleshooting' },
];

const LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Refund Policy', href: '/refund-policy' },
];

const SPANISH_LEGAL_LINKS = [
  { label: 'Privacidad', href: '/privacy' },
  { label: 'Términos', href: '/terms' },
  { label: 'Reembolsos', href: '/refund-policy' },
];

const SOLUTION_LINKS = [
  { label: 'Workflow Library', href: '/es/flujos-de-trabajo' },
  { label: 'Industry Solutions', href: '/es/industrias' },
];

const INDIA_SOLUTION_LINKS = [
  { label: 'Workflows', href: '/in/fill-pdf-from-excel' },
  { label: 'Solutions', href: '/in/kyc-pdf-automation' },
];

const SPANISH_SOLUTION_LINKS = [
  { label: 'Flujos de trabajo', href: '/es/flujos-de-trabajo' },
  { label: 'Industrias', href: '/es/industrias' },
];

const LEFT_SOCIAL_LINKS = OFFICIAL_PUBLIC_PROFILE_LINKS
  .filter((link) => link.label === 'LinkedIn' || link.label === 'GitHub')
  .map((link) => ({ label: link.label, href: link.href, iconSrc: link.iconSrc! }));

const RIGHT_SOCIAL_LINKS = OFFICIAL_PUBLIC_PROFILE_LINKS
  .filter((link) => link.label === 'YouTube' || link.label === 'X')
  .map((link) => ({ label: link.label, href: link.href, iconSrc: link.iconSrc! }));

type FooterLink = {
  label: string;
  href: string;
};

type SocialLink = FooterLink & {
  iconSrc: string;
};

const InlineLinkGroup = ({
  title,
  links,
  className,
}: {
  title: string;
  links: FooterLink[];
  className?: string;
}) => (
  <div className={`site-footer__link-group${className ? ` ${className}` : ''}`}>
    <span className="site-footer__label">{title}:</span>
    <div className="site-footer__links">
      {links.map((link) => (
        <a key={link.href} href={link.href}>
          {link.label}
        </a>
      ))}
    </div>
  </div>
);

const SocialLinkGroup = ({ links }: { links: SocialLink[] }) => (
  <div className="site-footer__social-links">
    {links.map((link) => (
      <a
        key={link.label}
        className="site-footer__social-link"
        href={link.href}
        target="_blank"
        rel="nofollow me noopener noreferrer"
        aria-label={link.label}
      >
        {/* alt fills in for crawlers (Ahrefs, Google Image, etc.) while
            aria-hidden prevents screen readers from double-announcing the
            link's accessible name + the icon's alt. */}
        <img
          className="site-footer__social-icon"
          src={link.iconSrc}
          alt={`${link.label} icon`}
          aria-hidden="true"
        />
      </a>
    ))}
  </div>
);

type SiteFooterProps = {
  hideFormCatalog?: boolean;
  locale?: 'en' | 'es';
};

export const SiteFooter = ({ hideFormCatalog = false, locale = 'en' }: SiteFooterProps) => {
  const year = new Date().getFullYear();
  const isIndia = hideFormCatalog && locale !== 'es';
  const productLinks = locale === 'es'
    ? SPANISH_PRODUCT_LINKS
    : hideFormCatalog
      ? PRODUCT_LINKS_WITHOUT_FORM_CATALOG
      : PRODUCT_LINKS;
  const resourceLinks = locale === 'es'
    ? SPANISH_RESOURCE_LINKS
    : isIndia
      ? INDIA_RESOURCE_LINKS
      : RESOURCE_LINKS;
  const legalLinks = locale === 'es' ? SPANISH_LEGAL_LINKS : LEGAL_LINKS;
  const solutionLinks = locale === 'es'
    ? SPANISH_SOLUTION_LINKS
    : isIndia
      ? INDIA_SOLUTION_LINKS
      : SOLUTION_LINKS;
  const groupTitles = locale === 'es'
    ? { product: 'Producto', resources: 'Recursos', legal: 'Legal', solutions: 'Soluciones' }
    : { product: 'Product', resources: 'Resources', legal: 'Legal', solutions: 'Solutions' };

  return (
    <footer className={isIndia ? 'site-footer site-footer--compact' : 'site-footer'}>
      <div className="site-footer__bar">
        <div className="site-footer__section site-footer__section--left">
          <InlineLinkGroup className="site-footer__group--product" title={groupTitles.product} links={productLinks} />
          <InlineLinkGroup className="site-footer__group--resources" title={groupTitles.resources} links={resourceLinks} />
          <SocialLinkGroup links={LEFT_SOCIAL_LINKS} />
        </div>
        <div className="site-footer__section site-footer__section--center">
          <div className="site-footer__copyright">&copy; {year} DullyPDF</div>
        </div>
        <div className="site-footer__section site-footer__section--right">
          <SocialLinkGroup links={RIGHT_SOCIAL_LINKS} />
          <InlineLinkGroup className="site-footer__group--legal" title={groupTitles.legal} links={legalLinks} />
          <InlineLinkGroup className="site-footer__group--solutions" title={groupTitles.solutions} links={solutionLinks} />
        </div>
      </div>
      <div className="site-footer__mobile">
        <div className="site-footer__mobile-rows">
          <div className="site-footer__mobile-row">
            <InlineLinkGroup title={groupTitles.product} links={productLinks} />
          </div>
          <div className="site-footer__mobile-row">
            <InlineLinkGroup title={groupTitles.resources} links={resourceLinks} />
          </div>
          <div className="site-footer__mobile-row">
            <InlineLinkGroup title={groupTitles.legal} links={legalLinks} />
          </div>
          <div className="site-footer__mobile-row">
            <InlineLinkGroup title={groupTitles.solutions} links={solutionLinks} />
          </div>
        </div>
        <div className="site-footer__meta site-footer__mobile-bottom">
          <SocialLinkGroup links={LEFT_SOCIAL_LINKS} />
          <div className="site-footer__copyright">&copy; {year} DullyPDF</div>
          <SocialLinkGroup links={RIGHT_SOCIAL_LINKS} />
        </div>
      </div>
    </footer>
  );
};
