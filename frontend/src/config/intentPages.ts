import type { UsageDocsPageKey } from '../components/pages/usageDocsContent';
import { INTENT_PAGES as SHARED_INTENT_PAGES } from './publicRouteSeoData.mjs';
import { INTENT_VISUALS as SHARED_INTENT_VISUALS } from './intentVisuals.mjs';

export type IntentPageKey =
  | 'pdf-to-fillable-form'
  | 'pdf-image-qr-barcode-fields'
  | 'add-image-field-to-pdf'
  | 'add-qr-code-field-to-pdf'
  | 'add-pdf417-barcode-field-to-pdf'
  | 'add-1d-barcode-field-to-pdf'
  | 'add-barcode-to-pdf-form'
  | 'pdf417-vs-qr-code-pdf-forms'
  | 'generate-pdf-barcodes-from-csv'
  | 'image-upload-fields-pdf-forms'
  | 'add-code-128-barcode-to-pdf'
  | 'work-order-barcode-pdf'
  | 'asset-tag-barcode-pdf-form'
  | 'qr-code-verification-pdf'
  | 'qr-code-payment-link-pdf'
  | 'qr-code-record-lookup-pdf'
  | 'scannable-pdf-form'
  | 'pdf-photo-upload-field'
  | 'id-photo-field-pdf-form'
  | 'receipt-upload-field-pdf-form'
  | 'pdf-to-database-template'
  | 'pdf-form-catalog'
  | 'fill-pdf-from-csv'
  | 'fill-pdf-by-link'
  | 'pdf-signature-workflow'
  | 'esign-ueta-pdf-workflow'
  | 'pdf-fill-api'
  | 'fill-information-in-pdf'
  | 'fillable-form-field-name'
  | 'fillable-pdf-fonts-colors'
  | 'acroform-field-appearance'
  | 'pdf-calculation-fields'
  | 'pdf-form-calculations-not-working'
  | 'add-calculated-field-to-pdf'
  | 'fillable-pdf-total-field'
  | 'api-fill-calculated-pdf'
  | 'pdf-form-javascript-calculation-alternative'
  | 'pdf-calculation-order'
  | 'pdf-invoice-calculation-template'
  | 'pdf-order-form-calculations'
  | 'pdf-estimate-quote-calculations'
  | 'calculated-pdf-from-csv'
  | 'fill-by-link-calculated-pdf'
  | 'flat-vs-editable-calculated-pdf'
  | 'pdf-expense-report-calculations'
  | 'pdf-timesheet-calculations'
  | 'pdf-purchase-order-calculations'
  | 'pdf-construction-bid-calculations'
  | 'pdf-change-order-calculations'
  | 'pdf-mileage-reimbursement-calculation'
  | 'pdf-inspection-score-calculations'
  | 'ai-pdf-field-renaming'
  | 'fill-pdf-from-image'
  | 'save-reusable-pdf-template'
  | 'pdf-packet-workflow'
  | 'merge-fillable-pdf-forms'
  | 'reorder-fillable-pdf-pages'
  | 'rotate-fillable-pdf-pages'
  | 'split-fillable-pdf-forms'
  | 'delete-pages-from-fillable-pdf'
  | 'compress-fillable-pdf-forms'
  | 'fill-pdf-link-signature'
  | 'pdf-signature-audit-trail'
  | 'flat-vs-editable-pdf'
  | 'search-fill-pdf-review'
  | 'openai-pdf-data-privacy'
  | 'mobile-fillable-pdf-form'
  | 'stored-fill-by-link-responses'
  | 'group-api-fill-zip-packet'
  | 'batch-rename-map-pdf-group'
  | 'verify-signed-pdf'
  | 'no-code-pdf-automation'
  | 'fill-pdf-from-google-sheets'
  | 'airtable-to-pdf-template'
  | 'google-forms-to-filled-pdf'
  | 'microsoft-forms-to-filled-pdf'
  | 'typeform-to-pdf-template'
  | 'hubspot-to-pdf-template'
  | 'notion-database-to-pdf-form'
  | 'salesforce-to-pdf-template'
  | 'power-automate-fill-pdf-template'
  | 'zapier-webhook-to-pdf'
  | 'make-webhook-to-pdf'
  | 'webhook-json-to-pdf-form'
  | 'php-fill-pdf-api'
  | 'java-fill-pdf-api'
  | 'csharp-fill-pdf-api'
  | 'go-fill-pdf-api'
  | 'ruby-fill-pdf-api'
  | 'turn-pdf-into-online-form'
  | 'one-web-form-fill-multiple-pdfs'
  | 'one-json-fill-multiple-pdfs'
  | 'respondent-download-filled-pdf'
  | 'online-form-to-signed-pdf'
  | 'excel-to-fillable-pdf-template'
  | 'sql-database-to-pdf-form-api'
  | 'flatten-filled-pdf-form'
  | 'filled-pdf-fields-not-showing'
  | 'make-pdf-read-only-after-filling'
  | 'pdf-checkbox-values-csv'
  | 'pdf-radio-button-values-json'
  | 'pdf-date-format-csv-fill'
  | 'duplicate-pdf-field-names'
  | 'pdf-template-versioning'
  | 'india-pdf-to-fillable-form'
  | 'india-fill-pdf-from-excel'
  | 'india-fill-pdf-from-csv'
  | 'india-fill-by-link'
  | 'india-pdf-fill-api'
  | 'india-pdf-field-detection'
  | 'india-rename-map-pdf-fields'
  | 'india-fill-pdf-from-documents'
  | 'india-pdf-packet-workflow'
  | 'india-pdf-calculations'
  | 'india-kyc-pdf-automation'
  | 'india-vendor-onboarding-pdf-automation'
  | 'india-hr-joining-pdf-automation'
  | 'india-gst-invoice-pdf-automation'
  | 'india-school-admissions-pdf-automation'
  | 'india-clinic-intake-pdf-automation'
  | 'india-loan-application-pdf-automation'
  | 'india-delivery-challan-pdf-automation'
  | 'india-tenant-onboarding-pdf-automation'
  | 'india-purchase-order-pdf-automation'
  | 'es-healthcare-pdf-automation'
  | 'es-hr-pdf-automation'
  | 'es-real-estate-pdf-automation'
  | 'es-education-pdf-automation'
  | 'es-finance-loan-pdf-automation'
  | 'es-logistics-pdf-automation'
  | 'es-accounting-invoice-pdf-automation'
  | 'es-construction-pdf-automation'
  | 'es-field-service-pdf-automation'
  | 'es-procurement-pdf-automation'
  | 'es-create-fillable-pdf-form'
  | 'es-fill-pdf-from-excel'
  | 'es-fill-pdf-from-csv'
  | 'es-fill-pdf-by-link'
  | 'es-pdf-fill-api'
  | 'es-ai-pdf-field-detection'
  | 'es-ai-pdf-field-renaming'
  | 'es-map-data-to-pdf'
  | 'es-reusable-pdf-template'
  | 'es-pdf-packet-workflow'
  | 'healthcare-pdf-automation'
  | 'acord-form-automation'
  | 'insurance-pdf-automation'
  | 'real-estate-pdf-automation'
  | 'government-form-automation'
  | 'finance-loan-pdf-automation'
  | 'hr-pdf-automation'
  | 'legal-pdf-workflow-automation'
  | 'education-form-automation'
  | 'nonprofit-pdf-form-automation'
  | 'logistics-pdf-automation'
  | 'batch-fill-pdf-forms'
  | 'pdf-checkbox-automation'
  | 'pdf-radio-button-editor'
  | 'pdf-field-detection-tool'
  | 'construction-pdf-automation'
  | 'accounting-tax-pdf-automation'
  | 'invoice-pdf-processing'
  | 'manufacturing-pdf-automation'
  | 'field-service-pdf-automation'
  | 'warehouse-inventory-pdf-automation'
  | 'procurement-pdf-automation'
  | 'utilities-energy-pdf-automation'
  | 'anvil-alternative'
  | 'pdf-fill-api-nodejs'
  | 'pdf-fill-api-python'
  | 'pdf-fill-api-curl'
  | 'pdf-field-detection-accuracy';

export type IntentPageCategory = 'workflow' | 'industry';

export type IntentFaq = {
  question: string;
  answer: string;
};

export type IntentArticleSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export type IntentSupportLink = {
  label: string;
  href: string;
  description?: string;
};

export type IntentSupportSection = {
  title: string;
  paragraphs?: string[];
  links?: IntentSupportLink[];
};

export type IntentHubImage = {
  src: string;
  alt: string;
  objectPosition?: string;
  eyebrow?: string;
};

export type IntentFigure = {
  src: string;
  alt: string;
  caption: string;
  objectPosition?: string;
};

export type IntentFootnote = {
  id: string;
  label: string;
  href?: string;
};

export type IntentPage = {
  key: IntentPageKey;
  category: IntentPageCategory;
  path: string;
  navLabel: string;
  heroTitle: string;
  heroSummary: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  valuePoints: string[];
  proofPoints: string[];
  faqs: IntentFaq[];
  articleSections?: IntentArticleSection[];
  footnotes?: IntentFootnote[];
  supportSections?: IntentSupportSection[];
  relatedIntentPages?: IntentPageKey[];
  relatedDocs?: UsageDocsPageKey[];
};

export type FeaturedHubIntentPage = IntentPage & {
  hubImage: IntentHubImage;
};

export type FeaturedWorkflowIntentPage = FeaturedHubIntentPage;
export type FeaturedIndustryIntentPage = FeaturedHubIntentPage;

type IntentVisuals = {
  hubImage?: IntentHubImage;
  articleFigures?: IntentFigure[];
};

const INTENT_PAGES = SHARED_INTENT_PAGES as IntentPage[];

const WORKFLOW_LIBRARY_SHOWCASE_KEYS: IntentPageKey[] = [
  'pdf-to-fillable-form',
  'pdf-image-qr-barcode-fields',
  'pdf-to-database-template',
  'pdf-form-catalog',
  'fill-pdf-from-csv',
  'fill-pdf-by-link',
  'pdf-signature-workflow',
  'fillable-form-field-name',
  'fillable-pdf-fonts-colors',
  'acroform-field-appearance',
  'pdf-calculation-fields',
  'pdf-packet-workflow',
  'merge-fillable-pdf-forms',
  'reorder-fillable-pdf-pages',
  'rotate-fillable-pdf-pages',
  'split-fillable-pdf-forms',
  'delete-pages-from-fillable-pdf',
  'compress-fillable-pdf-forms',
  'batch-fill-pdf-forms',
  'pdf-checkbox-automation',
  'pdf-field-detection-tool',
];

const INDUSTRY_LIBRARY_SHOWCASE_KEYS: IntentPageKey[] = [
  'healthcare-pdf-automation',
  'acord-form-automation',
  'insurance-pdf-automation',
  'real-estate-pdf-automation',
  'government-form-automation',
  'finance-loan-pdf-automation',
  'hr-pdf-automation',
  'legal-pdf-workflow-automation',
  'education-form-automation',
  'nonprofit-pdf-form-automation',
  'logistics-pdf-automation',
  'construction-pdf-automation',
  'accounting-tax-pdf-automation',
  'invoice-pdf-processing',
  'manufacturing-pdf-automation',
  'field-service-pdf-automation',
  'warehouse-inventory-pdf-automation',
  'procurement-pdf-automation',
  'utilities-energy-pdf-automation',
];

const INTENT_VISUALS = SHARED_INTENT_VISUALS as Partial<Record<IntentPageKey, IntentVisuals>>;

const PAGE_BY_KEY = new Map<IntentPageKey, IntentPage>(INTENT_PAGES.map((page) => [page.key, page]));
const PAGE_BY_PATH = new Map<string, IntentPage>(INTENT_PAGES.map((page) => [page.path, page]));

export const getIntentPages = (): IntentPage[] => INTENT_PAGES;

export const getIntentPage = (key: IntentPageKey): IntentPage => {
  const page = PAGE_BY_KEY.get(key);
  if (!page) throw new Error(`Unknown intent page key: ${key}`);
  return page;
};

export const getFeaturedWorkflowIntentPages = (): FeaturedWorkflowIntentPage[] =>
  WORKFLOW_LIBRARY_SHOWCASE_KEYS.flatMap((key) => {
    const page = PAGE_BY_KEY.get(key);
    const hubImage = INTENT_VISUALS[key]?.hubImage;
    return page && hubImage ? [{ ...page, hubImage }] : [];
  });

export const getFeaturedIndustryIntentPages = (): FeaturedIndustryIntentPage[] =>
  INDUSTRY_LIBRARY_SHOWCASE_KEYS.flatMap((key) => {
    const page = PAGE_BY_KEY.get(key);
    const hubImage = INTENT_VISUALS[key]?.hubImage;
    return page && hubImage ? [{ ...page, hubImage }] : [];
  });

export const getIntentPageArticleFigures = (pageKey: IntentPageKey): IntentFigure[] =>
  INTENT_VISUALS[pageKey]?.articleFigures ?? [];

export const resolveIntentPath = (pathname: string): IntentPageKey | null => {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const page = PAGE_BY_PATH.get(normalizedPath);
  return page?.key ?? null;
};
