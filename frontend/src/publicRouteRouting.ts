import type { LegalPageKind } from './components/pages/LegalPage';
import {
  resolveUsageDocsPath,
  type UsageDocsPageKey,
} from './components/pages/usageDocsContent';
import { resolveFeaturePlanPath, type FeaturePlanPageKey } from './config/featurePlanPages';
import { resolveIntentPath, type IntentPageKey } from './config/intentPages';
import type { HomepageMarket } from './components/pages/Homepage';

export type HydratablePublicRoute =
  | { kind: 'home'; market?: HomepageMarket }
  | { kind: 'legal'; legalKind: LegalPageKind }
  | { kind: 'intent'; intentKey: IntentPageKey }
  | { kind: 'intent-hub'; hubKey: 'workflows' | 'industries'; locale?: 'es' }
  | { kind: 'feature-plan'; planKey: FeaturePlanPageKey }
  | { kind: 'usage-docs'; pageKey: UsageDocsPageKey }
  | { kind: 'blog-index'; locale?: 'es' | 'in' }
  | { kind: 'blog-post'; slug: string; locale?: 'es' | 'in' }
  | { kind: 'form-catalog-index' }
  | { kind: 'form-catalog-form'; slug: string };

export function resolveHydratablePublicRoute(pathname: string): HydratablePublicRoute | null {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';

  if (normalizedPath === '/') {
    return { kind: 'home', market: 'global' };
  }

  if (normalizedPath === '/in') {
    return { kind: 'home', market: 'india' };
  }

  if (normalizedPath === '/es') {
    return { kind: 'home', market: 'spanish' };
  }

  if (normalizedPath === '/privacy' || normalizedPath === '/privacy-policy') {
    return { kind: 'legal', legalKind: 'privacy' };
  }

  if (normalizedPath === '/terms' || normalizedPath === '/terms-of-service') {
    return { kind: 'legal', legalKind: 'terms' };
  }

  if (
    normalizedPath === '/refund-policy' ||
    normalizedPath === '/refund-and-return-policy' ||
    normalizedPath === '/return-policy'
  ) {
    return { kind: 'legal', legalKind: 'refund' };
  }

  if (normalizedPath === '/es/blog') {
    return { kind: 'blog-index', locale: 'es' };
  }

  if (normalizedPath === '/in/blog') {
    return { kind: 'blog-index', locale: 'in' };
  }

  if (normalizedPath.startsWith('/es/blog/')) {
    const slug = normalizedPath.slice('/es/blog/'.length);
    if (slug && !slug.includes('/')) {
      return { kind: 'blog-post', slug, locale: 'es' };
    }
  }

  if (normalizedPath.startsWith('/in/blog/')) {
    const slug = normalizedPath.slice('/in/blog/'.length);
    if (slug && !slug.includes('/')) {
      return { kind: 'blog-post', slug, locale: 'in' };
    }
  }

  if (normalizedPath === '/forms') {
    return { kind: 'form-catalog-index' };
  }

  if (normalizedPath.startsWith('/forms/')) {
    const slug = normalizedPath.slice('/forms/'.length);
    if (slug && !slug.includes('/')) {
      return { kind: 'form-catalog-form', slug };
    }
  }

  if (normalizedPath === '/es/flujos-de-trabajo' || normalizedPath === '/es/industrias') {
    return {
      kind: 'intent-hub',
      hubKey: normalizedPath === '/es/flujos-de-trabajo' ? 'workflows' : 'industries',
      locale: 'es',
    };
  }

  const featurePlanKey = resolveFeaturePlanPath(normalizedPath);
  if (featurePlanKey) {
    return { kind: 'feature-plan', planKey: featurePlanKey };
  }

  const intentKey = resolveIntentPath(normalizedPath);
  if (intentKey) {
    return { kind: 'intent', intentKey };
  }

  const usageDocsRoute = resolveUsageDocsPath(normalizedPath);
  if (usageDocsRoute?.kind === 'canonical') {
    return { kind: 'usage-docs', pageKey: usageDocsRoute.pageKey };
  }

  return null;
}
