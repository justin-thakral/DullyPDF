import { OFFICIAL_PUBLIC_PROFILE_LINKS } from '../../config/publicProfiles';
import './PublicProfileLinksPanel.css';

type PublicProfileLinksPanelProps = {
  title?: string;
  description?: string;
};

const PublicProfileLinksPanel = ({
  title = 'Official DullyPDF links',
  description = 'Use these official profiles when you want demos, product updates, or the public codebase alongside the docs and workflow routes on this site.',
}: PublicProfileLinksPanelProps) => (
  <section className="public-profile-links-panel">
    <h2>{title}</h2>
    <p>{description}</p>
    <div className="public-profile-links-panel__grid">
      {OFFICIAL_PUBLIC_PROFILE_LINKS.map((link) => (
        <a
          key={link.href}
          aria-label={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="public-profile-links-panel__card"
        >
          <div className="public-profile-links-panel__card-header">
            <span>{link.label}</span>
            <span className="public-profile-links-panel__arrow" aria-hidden="true">↗</span>
          </div>
          <p>{link.description}</p>
        </a>
      ))}
    </div>
  </section>
);

export default PublicProfileLinksPanel;
