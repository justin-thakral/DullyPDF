import {
  FORM_CATALOG_CATEGORIES,
  FORM_CATALOG_TOTAL_COUNT,
} from './formCatalogCategories.mjs';

const ACTIVE_FORM_CATALOG_CATEGORIES = FORM_CATALOG_CATEGORIES.filter((category) => !category.empty);

const FORM_CATALOG_INDEX_TITLE =
  `Free Fillable PDF Form Catalog — ${FORM_CATALOG_TOTAL_COUNT.toLocaleString()}+ Official Forms | DullyPDF`;
const FORM_CATALOG_INDEX_DESCRIPTION =
  `Browse ${FORM_CATALOG_TOTAL_COUNT.toLocaleString()} free fillable PDF forms across ${
    ACTIVE_FORM_CATALOG_CATEGORIES.length
  } categories. Open any form in DullyPDF to fill online, auto-detect fields, or e-sign.`;
const FORM_CATALOG_INDEX_KEYWORDS = [
  'free fillable pdf forms',
  'fillable pdf form library',
  'official government pdf forms',
  'irs fillable pdf forms',
  'uscis fillable pdf forms',
  'pdf form catalog',
  'fillable pdf templates',
  'w-9 fillable pdf',
  'w-4 fillable pdf',
  'i-9 fillable pdf',
  '1099 fillable pdf',
  'fillable pdf form downloads',
  'free pdf form templates',
  'dullypdf form catalog',
];

const FORM_CATALOG_INDEX_OG_IMAGE_PATH = '/blog/irs-w4-official-1.png';
const FORM_CATALOG_INDEX_OG_IMAGE_ALT = 'Official blank form preview from the DullyPDF form catalog.';

const FORM_CATALOG_CATEGORY_BY_KEY = new Map(
  FORM_CATALOG_CATEGORIES.map((category) => [category.key, category]),
);

const normalizeKeywordLabel = (label) =>
  label
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/&/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildFormCatalogCategoryDescription = (category) =>
  `Browse ${category.count.toLocaleString()} free fillable PDFs in the ${category.label} category. Open any form in DullyPDF to fill online, auto-detect fields, or e-sign.`;

export const getFormCatalogCategory = (categoryKey) =>
  (categoryKey ? FORM_CATALOG_CATEGORY_BY_KEY.get(categoryKey) ?? null : null);

export const buildFormCatalogIndexSeo = ({ categoryKey = null } = {}) => {
  const category = getFormCatalogCategory(categoryKey);
  const normalizedCategoryLabel =
    category && !category.empty ? normalizeKeywordLabel(category.label) : null;

  return {
    title: FORM_CATALOG_INDEX_TITLE,
    description:
      category && !category.empty
        ? buildFormCatalogCategoryDescription(category)
        : FORM_CATALOG_INDEX_DESCRIPTION,
    canonicalPath: '/forms',
    ogImagePath: FORM_CATALOG_INDEX_OG_IMAGE_PATH,
    ogImageAlt: FORM_CATALOG_INDEX_OG_IMAGE_ALT,
    keywords:
      normalizedCategoryLabel
        ? [
            ...FORM_CATALOG_INDEX_KEYWORDS,
            `${normalizedCategoryLabel} pdf forms`,
            `${normalizedCategoryLabel} fillable pdf`,
          ]
        : FORM_CATALOG_INDEX_KEYWORDS,
  };
};

export {
  FORM_CATALOG_INDEX_DESCRIPTION,
  FORM_CATALOG_INDEX_KEYWORDS,
  FORM_CATALOG_INDEX_OG_IMAGE_ALT,
  FORM_CATALOG_INDEX_OG_IMAGE_PATH,
  FORM_CATALOG_INDEX_TITLE,
};
