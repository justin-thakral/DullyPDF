import type { ReactNode } from 'react';
import { SiteFooter } from './SiteFooter';
import { PublicSiteHeader, type PublicSiteHeaderNavKey } from './PublicSiteHeader';
import './PublicSiteFrame.css';

type PublicSiteFrameProps = {
  activeNavKey?: PublicSiteHeaderNavKey | null;
  bodyClassName?: string;
  children: ReactNode;
};

export const PublicSiteFrame = ({
  activeNavKey = null,
  bodyClassName,
  children,
}: PublicSiteFrameProps) => (
  <div className="public-site-frame">
    <PublicSiteHeader activeNavKey={activeNavKey} />
    <main className={bodyClassName ? `public-site-frame__body ${bodyClassName}` : 'public-site-frame__body'}>
      {children}
    </main>
    <SiteFooter />
  </div>
);
