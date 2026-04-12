export type WorkspaceBrowserRoute =
  | { kind: 'homepage' }
  | { kind: 'upload-root'; catalogSlug?: string }
  | { kind: 'ui-root' }
  | { kind: 'profile' }
  | { kind: 'saved-form'; formId: string }
  | { kind: 'group'; groupId: string; templateId: string | null }
  | { kind: 'form-catalog-index'; category?: string; query?: string; page?: number }
  | { kind: 'form-catalog-form'; slug: string };

function normalizeRoutePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function parseWorkspaceBrowserRoute(
  pathname: string,
  search = '',
): WorkspaceBrowserRoute | null {
  const normalizedPath = normalizeRoutePath(pathname);
  if (normalizedPath === '/') {
    return { kind: 'homepage' };
  }
  if (normalizedPath === '/upload') {
    const params = new URLSearchParams(search);
    const rawCatalogSlug = params.get('catalogSlug');
    const catalogSlug = rawCatalogSlug ? decodeURIComponent(rawCatalogSlug) : undefined;
    return catalogSlug ? { kind: 'upload-root', catalogSlug } : { kind: 'upload-root' };
  }
  if (normalizedPath === '/forms') {
    const params = new URLSearchParams(search);
    const rawCategory = params.get('category');
    const rawQuery = params.get('q');
    const rawPage = params.get('page');
    const pageNumber = rawPage ? Math.max(0, Number.parseInt(rawPage, 10) || 0) : 0;
    const next: WorkspaceBrowserRoute = { kind: 'form-catalog-index' };
    if (rawCategory) next.category = decodeURIComponent(rawCategory);
    if (rawQuery) next.query = rawQuery;
    if (pageNumber > 0) next.page = pageNumber;
    return next;
  }
  if (normalizedPath.startsWith('/forms/')) {
    const rawSlug = normalizedPath.slice('/forms/'.length);
    if (!rawSlug || rawSlug.includes('/')) {
      return null;
    }
    return { kind: 'form-catalog-form', slug: decodeURIComponent(rawSlug) };
  }
  if (normalizedPath === '/ui') {
    return { kind: 'ui-root' };
  }
  if (normalizedPath === '/ui/profile') {
    return { kind: 'profile' };
  }
  if (normalizedPath.startsWith('/ui/forms/')) {
    const rawFormId = normalizedPath.slice('/ui/forms/'.length);
    if (!rawFormId || rawFormId.includes('/')) {
      return null;
    }
    return {
      kind: 'saved-form',
      formId: decodeURIComponent(rawFormId),
    };
  }
  if (normalizedPath.startsWith('/ui/groups/')) {
    const rawGroupId = normalizedPath.slice('/ui/groups/'.length);
    if (!rawGroupId || rawGroupId.includes('/')) {
      return null;
    }
    const params = new URLSearchParams(search);
    const rawTemplateId = params.get('template');
    return {
      kind: 'group',
      groupId: decodeURIComponent(rawGroupId),
      templateId: rawTemplateId ? decodeURIComponent(rawTemplateId) : null,
    };
  }
  return null;
}

export function buildWorkspaceBrowserHref(route: WorkspaceBrowserRoute): string {
  switch (route.kind) {
    case 'homepage':
      return '/';
    case 'upload-root': {
      if (!route.catalogSlug) return '/upload';
      const params = new URLSearchParams();
      params.set('catalogSlug', route.catalogSlug);
      return `/upload?${params.toString()}`;
    }
    case 'ui-root':
      return '/ui';
    case 'profile':
      return '/ui/profile';
    case 'saved-form':
      return `/ui/forms/${encodeURIComponent(route.formId)}`;
    case 'group': {
      const basePath = `/ui/groups/${encodeURIComponent(route.groupId)}`;
      if (!route.templateId) {
        return basePath;
      }
      const params = new URLSearchParams();
      params.set('template', route.templateId);
      return `${basePath}?${params.toString()}`;
    }
    case 'form-catalog-index': {
      const params = new URLSearchParams();
      if (route.category) params.set('category', route.category);
      if (route.query) params.set('q', route.query);
      if (route.page && route.page > 0) params.set('page', String(route.page));
      const qs = params.toString();
      return qs ? `/forms?${qs}` : '/forms';
    }
    case 'form-catalog-form':
      return `/forms/${encodeURIComponent(route.slug)}`;
    default:
      return '/';
  }
}

export function getWorkspaceBrowserRouteKey(route: WorkspaceBrowserRoute): string {
  return buildWorkspaceBrowserHref(route);
}

export function isWorkspaceWorkflowRoute(route: WorkspaceBrowserRoute): boolean {
  return (
    route.kind === 'upload-root' ||
    route.kind === 'ui-root' ||
    route.kind === 'saved-form' ||
    route.kind === 'group' ||
    route.kind === 'form-catalog-index' ||
    route.kind === 'form-catalog-form'
  );
}

export function isFormCatalogRoute(route: WorkspaceBrowserRoute): boolean {
  return route.kind === 'form-catalog-index' || route.kind === 'form-catalog-form';
}

export function areWorkspaceBrowserRoutesEqual(
  left: WorkspaceBrowserRoute | null | undefined,
  right: WorkspaceBrowserRoute | null | undefined,
): boolean {
  if (!left || !right) {
    return left === right;
  }
  return getWorkspaceBrowserRouteKey(left) === getWorkspaceBrowserRouteKey(right);
}
