export const USAGE_DOCS_ROUTES = {
  schemaSearchFill: '/usage-docs/search-fill',
  renameMapping: '/usage-docs/rename-mapping',
  editorWorkflow: '/usage-docs/editor-workflow',
  fillFromImages: '/usage-docs/fill-from-images',
  fillByLink: '/usage-docs/fill-by-link',
  signatureWorkflow: '/usage-docs/signature-workflow',
  apiFill: '/usage-docs/api-fill',
  createGroup: '/usage-docs/create-group',
} as const;

export function openUsageDocsWindow(path: string): Window | null {
  if (typeof window === 'undefined') return null;
  return window.open(path, '_blank', 'noopener,noreferrer');
}
