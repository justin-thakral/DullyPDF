/** React entrypoint that mounts the application shell. */
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import './index.css';
import './styles/public-routes.css';
import {
  ACCOUNT_ACTION_ROUTE_PATH,
  LEGACY_ACCOUNT_ACTION_ROUTE_PATH,
} from './config/accountActionRoutes';
import {
  resolveUsageDocsPath,
} from './components/pages/usageDocsContent';
import { initializeGoogleAds } from './utils/googleAds';
import {
  parseWorkspaceBrowserRoute,
  type WorkspaceBrowserRoute,
} from './utils/workspaceRoutes';
import { shouldActivateAppRouteHydrationCover } from './utils/appRouteHydrationCover';
import type { HydratablePublicRoute } from './publicRouteRouting';
import { resolveHydratablePublicRoute } from './publicRouteRouting';
import { renderPublicRouteForClient } from './publicRouteClient';
import App from './App';

const PublicNotFoundPage = lazy(() => import('./components/pages/PublicNotFoundPage'));
const FillLinkPublicPage = lazy(() => import('./components/pages/FillLinkPublicPage'));
const PublicSigningPage = lazy(() => import('./components/pages/PublicSigningPage'));
const PublicSigningValidationPage = lazy(() => import('./components/pages/PublicSigningValidationPage'));
const AccountActionPage = lazy(() => import('./components/pages/AccountActionPage'));
const UsageDocsNotFoundPage = lazy(() => import('./components/pages/UsageDocsNotFoundPage'));
const SeoLayoutPreviewPage = lazy(() => import('./components/pages/SeoLayoutPreviewPage'));

type AppRoute =
  | HydratablePublicRoute
  | { kind: 'app'; browserRoute: WorkspaceBrowserRoute }
  | { kind: 'fill-link-public'; token: string }
  | { kind: 'signing-public'; token: string }
  | { kind: 'signing-validation'; token: string }
  | { kind: 'account-action' }
  | { kind: 'usage-docs-not-found'; requestedPath: string }
  | { kind: 'seo-layout-preview' }
  | { kind: 'not-found'; requestedPath: string };

declare global {
  interface Window {
    __dullyPdfRoot?: Root;
    __dullyPdfRootElement?: HTMLElement | null;
  }
}

const APP_ROUTE_HYDRATION_COVER_ATTRIBUTE = 'data-app-route-hydration-cover';

const replaceBrowserPath = (targetPath: string): void => {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === targetPath) return;
  window.history.replaceState({}, '', `${targetPath}${window.location.search}${window.location.hash}`);
};

const dismissAppRouteHydrationCover = (): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.removeAttribute(APP_ROUTE_HYDRATION_COVER_ATTRIBUTE);
};

const resolveRoute = (): AppRoute => {
  if (typeof window === 'undefined') {
    return { kind: 'home' };
  }
  const path = window.location.pathname || '/';
  const normalizedPath = path.replace(/\/+$/, '') || '/';

  if (normalizedPath === '/') {
    return { kind: 'home' };
  }

  const workspaceBrowserRoute = parseWorkspaceBrowserRoute(path, window.location.search);
  if (workspaceBrowserRoute) {
    return {
      kind: 'app',
      browserRoute: workspaceBrowserRoute,
    };
  }

  if (normalizedPath === '/privacy' || normalizedPath === '/privacy-policy') {
    return { kind: 'legal', legalKind: 'privacy' };
  }
  if (normalizedPath === '/terms' || normalizedPath === '/terms-of-service') {
    return { kind: 'legal', legalKind: 'terms' };
  }
  if (normalizedPath === ACCOUNT_ACTION_ROUTE_PATH || normalizedPath === LEGACY_ACCOUNT_ACTION_ROUTE_PATH) {
    if (normalizedPath === LEGACY_ACCOUNT_ACTION_ROUTE_PATH || path !== ACCOUNT_ACTION_ROUTE_PATH) {
      replaceBrowserPath(ACCOUNT_ACTION_ROUTE_PATH);
    }
    return { kind: 'account-action' };
  }

  if (normalizedPath.startsWith('/respond/')) {
    const token = normalizedPath.slice('/respond/'.length);
    if (token && !token.includes('/')) {
      if (path !== normalizedPath) replaceBrowserPath(normalizedPath);
      return { kind: 'fill-link-public', token };
    }
  }
  if (normalizedPath.startsWith('/sign/')) {
    const token = normalizedPath.slice('/sign/'.length);
    if (token && !token.includes('/')) {
      if (path !== normalizedPath) replaceBrowserPath(normalizedPath);
      return { kind: 'signing-public', token };
    }
  }
  if (normalizedPath.startsWith('/verify-signing/')) {
    const token = normalizedPath.slice('/verify-signing/'.length);
    if (token && !token.includes('/')) {
      if (path !== normalizedPath) replaceBrowserPath(normalizedPath);
      return { kind: 'signing-validation', token };
    }
  }

  if (normalizedPath === '/blog') {
    if (path !== normalizedPath) replaceBrowserPath(normalizedPath);
    return { kind: 'blog-index' };
  }
  if (normalizedPath === '/blog/layout-preview') {
    if (path !== normalizedPath) replaceBrowserPath(normalizedPath);
    return { kind: 'seo-layout-preview' };
  }

  const usageDocsRoute = resolveUsageDocsPath(normalizedPath);
  if (usageDocsRoute) {
    if (usageDocsRoute.kind === 'redirect') {
      replaceBrowserPath(usageDocsRoute.targetPath);
      const canonicalRoute = resolveUsageDocsPath(usageDocsRoute.targetPath);
      if (canonicalRoute?.kind === 'canonical') {
        return {
          kind: 'usage-docs',
          pageKey: canonicalRoute.pageKey,
        };
      }
      return {
        kind: 'usage-docs-not-found',
        requestedPath: usageDocsRoute.targetPath,
      };
    }

    if (usageDocsRoute.kind === 'canonical') {
      if (path !== normalizedPath) replaceBrowserPath(normalizedPath);
      return {
        kind: 'usage-docs',
        pageKey: usageDocsRoute.pageKey,
      };
    }

    if (path !== normalizedPath) replaceBrowserPath(normalizedPath);
    return {
      kind: 'usage-docs-not-found',
      requestedPath: usageDocsRoute.requestedPath,
    };
  }

  const publicRoute = resolveHydratablePublicRoute(normalizedPath);
  if (publicRoute) {
    if (path !== normalizedPath) replaceBrowserPath(normalizedPath);
    return publicRoute;
  }

  return { kind: 'not-found', requestedPath: normalizedPath };
};

const isHydratablePublicRoute = (route: AppRoute): route is HydratablePublicRoute => (
  route.kind === 'home' ||
  route.kind === 'legal' ||
  route.kind === 'intent' ||
  route.kind === 'intent-hub' ||
  route.kind === 'feature-plan' ||
  route.kind === 'usage-docs' ||
  route.kind === 'blog-index' ||
  route.kind === 'blog-post'
);

const renderRoute = (route: AppRoute) => {
  if (isHydratablePublicRoute(route)) {
    return renderPublicRouteForClient(route);
  }

  switch (route.kind) {
    case 'fill-link-public':
      return <FillLinkPublicPage token={route.token} />;
    case 'signing-public':
      return <PublicSigningPage token={route.token} />;
    case 'signing-validation':
      return <PublicSigningValidationPage token={route.token} />;
    case 'account-action':
      return <AccountActionPage />;
    case 'usage-docs-not-found':
      return <UsageDocsNotFoundPage requestedPath={route.requestedPath} />;
    case 'seo-layout-preview':
      return <SeoLayoutPreviewPage />;
    case 'not-found':
      return <PublicNotFoundPage requestedPath={route.requestedPath} />;
    case 'app':
      return <App initialBrowserRoute={route.browserRoute} />;
  }

  const exhaustiveCheck: never = route;
  return exhaustiveCheck;
};

const route = resolveRoute();

if (typeof window !== 'undefined' && (route.kind === 'app' || route.kind === 'home')) {
  initializeGoogleAds();
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element for DullyPDF.');
}

const appTree = (
  <StrictMode>
    <Suspense fallback={null}>
      {renderRoute(route)}
    </Suspense>
  </StrictMode>
);
const shouldHydrate = isHydratablePublicRoute(route) && rootElement.hasChildNodes();
const shouldResetPrerenderedRoot = (
  typeof window !== 'undefined'
  && shouldActivateAppRouteHydrationCover(window.location.pathname, window.location.search)
);

if (shouldHydrate) {
  const root = hydrateRoot(rootElement, appTree);
  if (typeof window !== 'undefined') {
    window.__dullyPdfRoot = root;
    window.__dullyPdfRootElement = rootElement;
  }
  dismissAppRouteHydrationCover();
} else {
  const existingRoot = typeof window !== 'undefined' && window.__dullyPdfRootElement === rootElement
    ? window.__dullyPdfRoot
    : undefined;
  if (!existingRoot && shouldResetPrerenderedRoot && rootElement.hasChildNodes()) {
    // Firebase Hosting rewrites these routes to the prerendered homepage HTML.
    // Clear that static shell before createRoot mounts, otherwise users can see
    // homepage content while the lazy public/app route chunks are still loading.
    rootElement.innerHTML = '';
  }
  const root = existingRoot || createRoot(rootElement);
  if (typeof window !== 'undefined') {
    window.__dullyPdfRoot = root;
    window.__dullyPdfRootElement = rootElement;
  }
  root.render(appTree);
  dismissAppRouteHydrationCover();
}
