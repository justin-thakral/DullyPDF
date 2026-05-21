import type { ReactNode } from 'react';
import { SiteFooter } from './SiteFooter';
import { PublicSiteHeader, type PublicSiteHeaderNavKey } from './PublicSiteHeader';
import './PublicSiteFrame.css';

type PublicSiteFrameProps = {
  activeNavKey?: PublicSiteHeaderNavKey | null;
  bodyClassName?: string;
  hideFormCatalog?: boolean;
  locale?: 'en' | 'es';
  children: ReactNode;
};

export const PublicSiteFrame = ({
  activeNavKey = null,
  bodyClassName,
  hideFormCatalog = false,
  locale = 'en',
  children,
}: PublicSiteFrameProps) => (
  <div className="public-site-frame">
    <PublicSiteHeader activeNavKey={activeNavKey} locale={locale} hideFormCatalog={hideFormCatalog} />
    <main className={bodyClassName ? `public-site-frame__body ${bodyClassName}` : 'public-site-frame__body'}>
      {children}
    </main>
    <SiteFooter hideFormCatalog={hideFormCatalog} locale={locale} />
  </div>
);
