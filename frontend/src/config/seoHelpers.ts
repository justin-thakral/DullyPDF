export type SeoStructuredDataEntry = Record<string, unknown>;

export type SeoBreadcrumbItem = {
  label: string;
  href?: string;
};

const SITE_ORIGIN = 'https://dullypdf.com';
const OFFICIAL_PUBLIC_PROFILE_URLS = [
  'https://www.linkedin.com/company/dullypdf',
  'https://github.com/justin-thakral/DullyPDF',
  'https://www.youtube.com/@DullyPDF',
  'https://x.com/DullyPDF',
];

export const buildBreadcrumbSchema = (items: SeoBreadcrumbItem[]): SeoStructuredDataEntry => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.label,
    ...(item.href ? { item: `${SITE_ORIGIN}${item.href}` } : {}),
  })),
});

export const appendStructuredData = (
  existingEntries: SeoStructuredDataEntry[] | undefined,
  nextEntry: SeoStructuredDataEntry,
): SeoStructuredDataEntry[] => [...(existingEntries ?? []), nextEntry];

export const buildIntentSeoTitle = (heroTitle: string): string => `${heroTitle} | DullyPDF`;

export const buildIntentSeoDescription = (heroSummary: string): string => heroSummary;

export const buildCollectionPageSchema = (
  name: string,
  description: string,
  path: string,
): SeoStructuredDataEntry => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name,
  description,
  url: `${SITE_ORIGIN}${path}`,
});

export const buildTechArticleSchema = (
  headline: string,
  description: string,
  path: string,
): SeoStructuredDataEntry => ({
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline,
  description,
  url: `${SITE_ORIGIN}${path}`,
  author: {
    '@type': 'Organization',
    name: 'DullyPDF',
    sameAs: OFFICIAL_PUBLIC_PROFILE_URLS,
  },
  publisher: {
    '@type': 'Organization',
    name: 'DullyPDF',
    sameAs: OFFICIAL_PUBLIC_PROFILE_URLS,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_ORIGIN}/DullyPDFLogoImproved.png`,
    },
  },
});
