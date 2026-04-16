import type { LegalPageKind } from './components/pages/LegalPage';
import {
  resolveUsageDocsPath,
  type UsageDocsPageKey,
} from './components/pages/usageDocsContent';
import { resolveFeaturePlanPath, type FeaturePlanPageKey } from './config/featurePlanPages';
import { resolveIntentPath, type IntentPageKey } from './config/intentPages';

export type HydratablePublicRoute =
  | { kind: 'home' }
  | { kind: 'legal'; legalKind: LegalPageKind }
  | { kind: 'intent'; intentKey: IntentPageKey }
  | { kind: 'intent-hub'; hubKey: 'workflows' | 'industries' }
  | { kind: 'feature-plan'; planKey: FeaturePlanPageKey }
  | { kind: 'usage-docs'; pageKey: UsageDocsPageKey }
  | { kind: 'blog-index' }
  | { kind: 'blog-post'; slug: string }
  | { kind: 'form-catalog-index' }
  | { kind: 'form-catalog-form'; slug: string };

export function resolveHydratablePublicRoute(pathname: string): HydratablePublicRoute | null {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';

  if (normalizedPath === '/') {
    return { kind: 'home' };
  }

  if (normalizedPath === '/privacy' || normalizedPath === '/privacy-policy') {
    return { kind: 'legal', legalKind: 'privacy' };
  }

  if (normalizedPath === '/terms' || normalizedPath === '/terms-of-service') {
    return { kind: 'legal', legalKind: 'terms' };
  }

  if (normalizedPath === '/blog') {
    return { kind: 'blog-index' };
  }

  if (normalizedPath.startsWith('/blog/')) {
    const slug = normalizedPath.slice('/blog/'.length);
    if (slug && !slug.includes('/')) {
      return { kind: 'blog-post', slug };
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

  if (normalizedPath === '/workflows' || normalizedPath === '/industries') {
    return {
      kind: 'intent-hub',
      hubKey: normalizedPath === '/workflows' ? 'workflows' : 'industries',
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
