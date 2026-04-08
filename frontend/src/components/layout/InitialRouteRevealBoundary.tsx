import { useEffect, type ReactNode } from 'react';

const APP_ROUTE_HYDRATION_COVER_ATTRIBUTE = 'data-app-route-hydration-cover';
const INITIAL_ROUTE_HYDRATION_SETTLE_MS = 120;
const INITIAL_ROUTE_HYDRATION_MAX_WAIT_MS = 1200;
const INITIAL_ROUTE_FONT_WAIT_MAX_MS = 1200;

type InitialRouteRevealBoundaryProps = {
  active: boolean;
  rootElement: HTMLElement;
  children: ReactNode;
};

const dismissInitialRouteHydrationCovers = (): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.removeAttribute(APP_ROUTE_HYDRATION_COVER_ATTRIBUTE);
};

export function InitialRouteRevealBoundary({
  active,
  rootElement,
  children,
}: InitialRouteRevealBoundaryProps) {
  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      dismissInitialRouteHydrationCovers();
      return;
    }

    let cancelled = false;
    let idleTimer = 0;
    let maxWaitTimer = 0;
    let fontWaitTimer = 0;
    let domSettled = false;
    let fontsReady = false;
    let observer: MutationObserver | null = null;

    const maybeDismiss = () => {
      if (cancelled || !domSettled || !fontsReady) {
        return;
      }
      dismissInitialRouteHydrationCovers();
    };

    const markDomSettled = () => {
      if (domSettled) {
        return;
      }
      domSettled = true;
      if (idleTimer) {
        window.clearTimeout(idleTimer);
      }
      if (maxWaitTimer) {
        window.clearTimeout(maxWaitTimer);
      }
      observer?.disconnect();
      maybeDismiss();
    };

    const scheduleDomSettle = () => {
      if (!rootElement.hasChildNodes()) {
        return;
      }
      if (idleTimer) {
        window.clearTimeout(idleTimer);
      }
      idleTimer = window.setTimeout(markDomSettled, INITIAL_ROUTE_HYDRATION_SETTLE_MS);
    };

    const markFontsReady = () => {
      if (fontsReady) {
        return;
      }
      fontsReady = true;
      if (fontWaitTimer) {
        window.clearTimeout(fontWaitTimer);
      }
      maybeDismiss();
    };

    observer = new MutationObserver(() => {
      scheduleDomSettle();
    });
    observer.observe(rootElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    maxWaitTimer = window.setTimeout(markDomSettled, INITIAL_ROUTE_HYDRATION_MAX_WAIT_MS);
    scheduleDomSettle();

    fontWaitTimer = window.setTimeout(markFontsReady, INITIAL_ROUTE_FONT_WAIT_MAX_MS);
    const fontSet = typeof document !== 'undefined' && 'fonts' in document ? document.fonts : null;
    if (fontSet?.ready) {
      fontSet.ready.then(markFontsReady, markFontsReady);
    } else {
      markFontsReady();
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (idleTimer) {
        window.clearTimeout(idleTimer);
      }
      if (maxWaitTimer) {
        window.clearTimeout(maxWaitTimer);
      }
      if (fontWaitTimer) {
        window.clearTimeout(fontWaitTimer);
      }
    };
  }, [active, rootElement]);

  return <>{children}</>;
}
