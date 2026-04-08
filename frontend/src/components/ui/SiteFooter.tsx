import './SiteFooter.css';
import { OFFICIAL_PUBLIC_PROFILE_LINKS } from '../../config/publicProfiles';

const PRODUCT_LINKS = [
  { label: 'Getting Started', href: '/usage-docs/getting-started' },
  { label: 'Usage Docs', href: '/usage-docs' },
];

const RESOURCE_LINKS = [
  { label: 'Blog', href: '/blog' },
  { label: 'Troubleshooting', href: '/usage-docs/troubleshooting' },
];

const LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
];

const SOLUTION_LINKS = [
  { label: 'Workflow Library', href: '/workflows' },
  { label: 'Industry Solutions', href: '/industries' },
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
        rel="noopener noreferrer"
        aria-label={link.label}
      >
        <img className="site-footer__social-icon" src={link.iconSrc} alt="" aria-hidden="true" />
      </a>
    ))}
  </div>
);

export const SiteFooter = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__bar">
        <div className="site-footer__section site-footer__section--left">
          <InlineLinkGroup className="site-footer__group--product" title="Product" links={PRODUCT_LINKS} />
          <InlineLinkGroup className="site-footer__group--resources" title="Resources" links={RESOURCE_LINKS} />
          <SocialLinkGroup links={LEFT_SOCIAL_LINKS} />
        </div>
        <div className="site-footer__section site-footer__section--center">
          <div className="site-footer__copyright">&copy; {year} DullyPDF</div>
        </div>
        <div className="site-footer__section site-footer__section--right">
          <SocialLinkGroup links={RIGHT_SOCIAL_LINKS} />
          <InlineLinkGroup className="site-footer__group--legal" title="Legal" links={LEGAL_LINKS} />
          <InlineLinkGroup className="site-footer__group--solutions" title="Solutions" links={SOLUTION_LINKS} />
        </div>
      </div>
      <div className="site-footer__mobile">
        <div className="site-footer__mobile-rows">
          <div className="site-footer__mobile-row">
            <InlineLinkGroup title="Product" links={PRODUCT_LINKS} />
          </div>
          <div className="site-footer__mobile-row">
            <InlineLinkGroup title="Resources" links={RESOURCE_LINKS} />
          </div>
          <div className="site-footer__mobile-row">
            <InlineLinkGroup title="Legal" links={LEGAL_LINKS} />
          </div>
          <div className="site-footer__mobile-row">
            <InlineLinkGroup title="Solutions" links={SOLUTION_LINKS} />
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
