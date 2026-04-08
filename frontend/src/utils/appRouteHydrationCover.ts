import {
  ACCOUNT_ACTION_ROUTE_PATH,
  LEGACY_ACCOUNT_ACTION_ROUTE_PATH,
} from '../config/accountActionRoutes';
import { parseWorkspaceBrowserRoute } from './workspaceRoutes';

type AppRouteHydrationCoverConfig = {
  exactPaths: string[];
  singleSegmentPrefixes: string[];
  workspaceDynamicPrefixes: string[];
};

const APP_ROUTE_HYDRATION_COVER_CONFIG: AppRouteHydrationCoverConfig = {
  exactPaths: [
    ACCOUNT_ACTION_ROUTE_PATH,
    LEGACY_ACCOUNT_ACTION_ROUTE_PATH,
    '/upload',
    '/ui',
    '/ui/profile',
  ],
  singleSegmentPrefixes: [
    '/respond/',
    '/sign/',
    '/verify-signing/',
  ],
  workspaceDynamicPrefixes: [
    '/ui/forms/',
    '/ui/groups/',
  ],
};

function normalizeRoutePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function matchesSingleSegmentPrefix(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) {
    return false;
  }
  const suffix = pathname.slice(prefix.length);
  return suffix.length > 0 && !suffix.includes('/');
}

export function shouldActivateAppRouteHydrationCover(
  pathname: string,
  search = '',
): boolean {
  const normalizedPath = normalizeRoutePath(pathname);
  const workspaceRoute = parseWorkspaceBrowserRoute(pathname, search);
  if (workspaceRoute && workspaceRoute.kind !== 'homepage') {
    return true;
  }
  if (APP_ROUTE_HYDRATION_COVER_CONFIG.exactPaths.includes(normalizedPath)) {
    return true;
  }
  if (APP_ROUTE_HYDRATION_COVER_CONFIG.workspaceDynamicPrefixes.some((prefix) => (
    matchesSingleSegmentPrefix(normalizedPath, prefix)
  ))) {
    return true;
  }
  return APP_ROUTE_HYDRATION_COVER_CONFIG.singleSegmentPrefixes.some((prefix) => (
    matchesSingleSegmentPrefix(normalizedPath, prefix)
  ));
}

export function buildAppRouteHydrationCoverBootstrapScript(): string {
  return `(() => {
    const normalizedPath = window.location.pathname.replace(/\\/+$/, '') || '/';
    const exactPaths = ${JSON.stringify(APP_ROUTE_HYDRATION_COVER_CONFIG.exactPaths)};
    const singleSegmentPrefixes = ${JSON.stringify(APP_ROUTE_HYDRATION_COVER_CONFIG.singleSegmentPrefixes)};
    const workspaceDynamicPrefixes = ${JSON.stringify(APP_ROUTE_HYDRATION_COVER_CONFIG.workspaceDynamicPrefixes)};
    const matchesSingleSegmentPrefix = (pathname, prefix) => {
      if (!pathname.startsWith(prefix)) {
        return false;
      }
      const suffix = pathname.slice(prefix.length);
      return suffix.length > 0 && !suffix.includes('/');
    };
    const shouldCover =
      exactPaths.includes(normalizedPath) ||
      workspaceDynamicPrefixes.some((prefix) => matchesSingleSegmentPrefix(normalizedPath, prefix)) ||
      singleSegmentPrefixes.some((prefix) => matchesSingleSegmentPrefix(normalizedPath, prefix));

    if (shouldCover) {
      document.documentElement.setAttribute('data-app-route-hydration-cover', 'active');
    }
  })();`;
}
