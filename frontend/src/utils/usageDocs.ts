export const USAGE_DOCS_ROUTES = {
  schemaSearchFill: '/es/usage-docs/search-fill',
  renameMapping: '/es/usage-docs/rename-mapping',
  editorWorkflow: '/es/usage-docs/editor-workflow',
  pdfTools: '/es/usage-docs/editor-workflow#herramientas-pdf',
  calculationFields: '/es/usage-docs/editor-workflow#campos-de-calculo',
  fillFromImages: '/es/usage-docs/fill-from-images',
  fillByLink: '/es/usage-docs/fill-by-link',
  signatureWorkflow: '/es/usage-docs/signature-workflow',
  apiFill: '/es/usage-docs/api-fill',
  createGroup: '/es/usage-docs/create-group',
  saveDownloadProfile: '/es/usage-docs/save-download-profile',
} as const;

export function openUsageDocsWindow(path: string): Window | null {
  if (typeof window === 'undefined') return null;
  return window.open(path, '_blank', 'noopener,noreferrer');
}
