import { FORM_CATALOG_CATEGORIES } from './formCatalogCategories.mjs';
import { FORM_CATALOG_ENTRIES } from './formCatalogData.mjs';
import { buildFormCatalogAssetUrl } from './formCatalogAssetBase.mjs';

const FORM_SECTION_LABELS = {
  healthcare: 'Healthcare & Medicine',
  tax_individual: 'Tax — Individual',
  tax_business: 'Tax — Business',
  tax_payroll: 'Tax — Payroll',
  hr_onboarding: 'HR & Onboarding',
  customs_logistics: 'Customs & Logistics',
  nonprofit: 'Nonprofit',
  immigration: 'Immigration & USCIS',
  social_security: 'Social Security',
  veterans: 'Veterans (VA)',
  state_department: 'State Department (DS forms)',
  patient_intake: 'Patient Health & Appeals',
};

const SECTION_WORKFLOW_CONTEXT = {
  healthcare:
    'That makes it useful for intake, credentialing, and appeals teams that need one reviewed blank PDF before mapping provider, patient, or claim data.',
  tax_individual:
    'It fits best when preparers want a stable filing template tied to client organizers, spreadsheet exports, or guided intake answers.',
  tax_business:
    'It is a strong accounting-side template when entity, owner, and reporting data already lives in a ledger, tax workbook, or practice-management system.',
  tax_payroll:
    'It is worthwhile when payroll and finance teams need the official filing layout to stay fixed while quarter-by-quarter values come from structured exports.',
  hr_onboarding:
    'It is a practical HR template because the hiring packet repeats while the employee record is what should change from run to run.',
  customs_logistics:
    'It works well for trade and shipment teams that already track vessel, zone, duty, or broker data outside the PDF itself.',
  nonprofit:
    'It is worth curating for recurring exempt-organization filings that pull the same board, donor, grant, and finance records every cycle.',
  immigration:
    'It is useful for case-intake workflows where applicant identity, household, or filing details should be captured once and reused accurately.',
  social_security:
    'It is worthwhile when claimant and benefit data comes from an intake workflow but still has to land inside the official SSA layout.',
  veterans:
    'It is a strong fit for veterans-service workflows that repeatedly collect claimant, dependent, representative, training, housing, memorial, and supporting-party details for official packets.',
  state_department:
    'It is a good candidate for passport and consular workflows where the agency layout stays fixed but traveler data changes for each submission.',
};

const TITLE_SIGNAL_CONTEXT = [
  {
    pattern: /authorization|disclose|release/i,
    text: 'Disclosure and authorization packets are worth featuring because names, dates, and signer details need to land in the exact right fields every time.',
  },
  {
    pattern: /application/i,
    text: 'Application-style forms are worthwhile when teams repeatedly collect the same party, eligibility, or entity details before preparing the official packet.',
  },
  {
    pattern: /request/i,
    text: 'Request forms make good template candidates when staff should reuse the same subject, claimant, or supporting-party details without rekeying the packet by hand.',
  },
  {
    pattern: /return/i,
    text: 'Return filings are strong candidates for DullyPDF because the reporting numbers usually come from structured books or payroll systems, not from manual PDF editing.',
  },
  {
    pattern: /statement/i,
    text: 'Statement-style forms are useful when the reporting layout is fixed but the values change every filing cycle.',
  },
  {
    pattern: /schedule/i,
    text: 'Schedules are worth surfacing because they are usually assembled from structured source data rather than drafted freehand.',
  },
  {
    pattern: /election/i,
    text: 'Election forms are worthwhile because entity setup details, ownership data, and effective dates usually come from a controlled intake workflow.',
  },
  {
    pattern: /agreement/i,
    text: 'Agreement packets benefit from a saved template because the party data and dates repeat far more often than the legal layout does.',
  },
  {
    pattern: /verification|certificate/i,
    text: 'Verification and certificate forms are good fits when teams need the official wording to stay fixed while the submitted record changes.',
  },
];

const needsCuratedDescription = (description = '') => /^Use Form\b/i.test(description.trim());

const buildCuratedDescription = (document) => {
  const titleSignal =
    TITLE_SIGNAL_CONTEXT.find(({ pattern }) => pattern.test(document.title))?.text ??
    'This is a worthwhile template when the official blank PDF needs to stay intact while the underlying record changes from one submission to the next.';
  const sectionSignal =
    SECTION_WORKFLOW_CONTEXT[document.section] ??
    'It works best when the official PDF stays fixed and the structured source data changes between submissions.';
  return `${titleSignal} ${sectionSignal}`;
};

const STATIC_FORM_CATALOG_ASSET_PREFIX = '/form-catalog-assets/';

const rebaseCatalogAssetUrl = (url = '') => {
  if (!String(url).startsWith(STATIC_FORM_CATALOG_ASSET_PREFIX)) {
    return url;
  }
  return buildFormCatalogAssetUrl(url.slice(STATIC_FORM_CATALOG_ASSET_PREFIX.length));
};

const toCatalogDocument = (document) => ({
  ...document,
  pdfUrl: rebaseCatalogAssetUrl(document.pdfUrl),
  thumbnailUrl: rebaseCatalogAssetUrl(document.thumbnailUrl),
  description: needsCuratedDescription(document.description)
    ? buildCuratedDescription(document)
    : document.description,
  sectionLabel: FORM_SECTION_LABELS[document.section] ?? document.section,
  editorHref: `/upload?catalogSlug=${encodeURIComponent(document.slug)}`,
  catalogHref: `/forms/${encodeURIComponent(document.slug)}`,
});

const createShowcase = (definition) => {
  const documents = definition.documents.map(toCatalogDocument);
  return {
    ...definition,
    documents,
    featuredDocuments: documents.slice(0, 4),
  };
};

const FORM_CATALOG_CATEGORY_DETAILS = {
  real_estate_housing: {
    description:
      'Settlement statements, tenant packets, housing disclosures, and borrower-facing real-estate forms that usually need structured party, property, and transaction data applied into a fixed layout.',
  },
  tax_individual: {
    description:
      'IRS individual returns, statements, elections, and client-facing filing forms used when taxpayer data already exists in organizers, worksheets, or prep software.',
  },
  tax_business: {
    description:
      'Entity returns, elections, and business reporting forms that fit accounting workflows where company, owner, and filing-period data should be reused consistently.',
  },
  tax_payroll: {
    description:
      'Payroll returns, withholding, and employer tax forms that are typically driven from payroll systems instead of manual PDF editing.',
  },
  immigration: {
    description:
      'USCIS petitions, appearance notices, and immigration packets where applicant, sponsor, and filing data should be captured once and reused accurately.',
  },
  nonprofit: {
    description:
      'Exempt-organization returns, registrations, and compliance forms for teams that repeatedly prepare governance, donation, and filing packets.',
  },
  customs_logistics: {
    description:
      'Customs, bonded-shipment, protest, and trade paperwork that depends on shipment, broker, and importer data already tracked outside the PDF.',
  },
  patient_intake: {
    description:
      'Patient-facing enrollment, complaint, consent, reimbursement, and appeal forms used when respondent or staff-collected data still has to land in an official healthcare layout.',
  },
  small_business: {
    description:
      'SBA lending, certification, servicing, and compliance forms that benefit from turning recurring small-business paperwork into reusable templates.',
  },
  criminal_justice: {
    description:
      'Federal criminal summonses, warrants, and court-adjacent paperwork that follow fixed judiciary layouts and recurring party or case data.',
  },
  social_security: {
    description:
      'SSA benefit, identity, and representative forms for claimant workflows that repeat across intake, updates, and supporting submissions.',
  },
  veterans: {
    description:
      'VA claims, appeals, education, housing, debt, insurance, memorial, and service-related forms used when claimant and supporting-party data must be applied into official veteran-facing packets.',
  },
  civil_litigation: {
    description:
      'Federal civil litigation notices, consent forms, and court administration documents with fixed judiciary layouts and recurring case metadata.',
  },
  bankruptcy: {
    description:
      'Petitions, schedules, and debtor statements that often start from official judiciary PDFs but still need a controlled template workflow before filing or review.',
  },
  hr_onboarding: {
    description:
      'Hiring, eligibility, withholding, benefits, direct-deposit, and personnel-security forms that recur during onboarding and map cleanly from HRIS or spreadsheet exports.',
  },
  practice_intake: {
    description:
      'Generic practice and office-intake templates that are not tied to a single government agency but still benefit from saved reusable client or patient layouts.',
  },
  healthcare: {
    description:
      'A broader medical catalog bucket that combines provider-side Medicare forms with patient-health enrollment, claim, authorization, and appeal workflows.',
  },
  state_department: {
    description:
      'Passport, visa, citizenship, consular, and State Department personnel DS forms used when identity, eligibility, or staffing data must land in official government layouts.',
  },
  contracts_procurement: {
    description:
      'Federal quotation, vendor, and acquisition forms used in procurement workflows where request, vendor, and contract metadata already exists elsewhere.',
  },
  disaster_emergency: {
    description:
      'FEMA forms used for public assistance, flood insurance, map-revision, labor, and recovery workflows once the core incident or property data is already known.',
  },
  labor_employment: {
    description:
      'OSHA, FMLA, FECA, and federal-employment forms that support leave, injury, compliance, and screening workflows built on recurring worker and employer data.',
  },
  acord: {
    description:
      'ACORD insurance workflows are represented here for planning, but the actual forms stay externally sourced because the PDFs are copyright-restricted.',
  },
  hipaa: {
    description:
      'HIPAA-specific buckets are included so the catalog page explains the workflow coverage, but those source documents stay externally linked instead of mirrored inside DullyPDF.',
  },
  nar_realtor: {
    description:
      'NAR / Realtor form families are called out here for real-estate workflow coverage, but the PDFs remain externally sourced because the forms are copyright-restricted.',
  },
};

const FIRST_FORM_CATALOG_ENTRY_BY_SECTION = new Map();
for (const entry of FORM_CATALOG_ENTRIES ?? []) {
  if (!entry?.section || FIRST_FORM_CATALOG_ENTRY_BY_SECTION.has(entry.section)) continue;
  FIRST_FORM_CATALOG_ENTRY_BY_SECTION.set(entry.section, entry);
}

const FORM_CATALOG_CATEGORY_SUMMARIES = (FORM_CATALOG_CATEGORIES ?? []).map((category) => {
  const details = FORM_CATALOG_CATEGORY_DETAILS[category.key] ?? {};
  const categorySections = Array.isArray(category.sections) && category.sections.length > 0
    ? category.sections
    : [category.key];
  const representativeEntry = category.empty
    ? null
    : categorySections.map((sectionKey) => FIRST_FORM_CATALOG_ENTRY_BY_SECTION.get(sectionKey)).find(Boolean) ?? null;
  return {
    key: category.key,
    label: category.label,
    count: category.count,
    empty: category.empty,
    emptyReason: category.emptyReason,
    description:
      details.description ??
      `${category.label} forms are part of the broader DullyPDF catalog coverage for repeat PDF workflows.`,
    browseHref: category.empty ? null : `/forms?category=${encodeURIComponent(category.key)}`,
    representativeDocument: representativeEntry
      ? {
          formLabel: representativeEntry.formNumber
            ? `${representativeEntry.formNumber} — ${representativeEntry.title}`
            : representativeEntry.title,
          pdfUrl: representativeEntry.pdfUrl,
          thumbnailUrl: representativeEntry.thumbnailUrl,
        }
      : null,
  };
});

const SHOWCASES = {
  'healthcare-pdf-automation': createShowcase({
    title: 'Featured healthcare and medical PDFs from the DullyPDF catalog',
    description:
      'These are real CMS, Medicare, and patient-health PDFs already mirrored inside the DullyPDF catalog. Open any blank form in the editor, map it once, then reuse it for Search & Fill, API Fill, Fill By Link, or signature workflows.',
    categoryLinks: [
      { label: 'Browse all healthcare forms', href: '/forms?category=healthcare' },
    ],
    documents: [
      {
        slug: 'cms-855i',
        formNumber: 'CMS-855I',
        title: 'Medicare Enrollment Application - Physicians',
        section: 'healthcare',
        pageCount: 26,
        pdfUrl: '/form-catalog-assets/healthcare/cms-855i__cms855i.pdf',
        thumbnailUrl: '/form-catalog-assets/healthcare/cms-855i__cms855i.webp',
        description: 'Use Form CMS-855I for medicare enrollment application - physicians.',
        sourceUrl: 'https://www.cms.gov/Medicare/CMS-Forms/CMS-Forms/downloads/CMS855I.pdf',
      },
      {
        slug: 'cms-40b',
        formNumber: 'CMS-40B',
        title: 'Application for Enrollment in Medicare Part B',
        section: 'patient_intake',
        pageCount: 3,
        pdfUrl: '/form-catalog-assets/patient_intake/cms_40b__cms40b-e.pdf',
        thumbnailUrl: '/form-catalog-assets/patient_intake/cms_40b__cms40b-e.webp',
        description: 'Use Form CMS-40B to apply for enrollment in medicare part B.',
        sourceUrl: 'https://www.cms.gov/Medicare/CMS-Forms/CMS-Forms/downloads/CMS40B-E.pdf',
      },
      {
        slug: 'cms-10106',
        formNumber: 'CMS-10106',
        title: 'Authorization to Disclose Personal Health Information',
        section: 'patient_intake',
        pageCount: 6,
        pdfUrl: '/form-catalog-assets/patient_intake/cms_10106__cms10106.pdf',
        thumbnailUrl: '/form-catalog-assets/patient_intake/cms_10106__cms10106.webp',
        description: 'Use Form CMS-10106 to authorize disclose personal health information.',
        sourceUrl: 'https://www.cms.gov/Medicare/CMS-Forms/CMS-Forms/downloads/cms10106.pdf',
      },
      {
        slug: 'cms-1490s',
        formNumber: 'CMS-1490S',
        title: "Patient's Request for Medical Payment",
        section: 'patient_intake',
        pageCount: 18,
        pdfUrl: '/form-catalog-assets/patient_intake/cms_1490s__cms1490s-english.pdf',
        thumbnailUrl: '/form-catalog-assets/patient_intake/cms_1490s__cms1490s-english.webp',
        description: "Use Form CMS-1490S for patient's request for medical payment.",
        sourceUrl: 'https://www.cms.gov/Medicare/CMS-Forms/CMS-Forms/downloads/CMS1490S-English.pdf',
      },
      {
        slug: 'cms-855a',
        formNumber: 'CMS-855A',
        title: 'Medicare Enrollment Application - Institutional Provider',
        section: 'healthcare',
        pageCount: 72,
        pdfUrl: '/form-catalog-assets/healthcare/cms-855a__cms855a.pdf',
        thumbnailUrl: '/form-catalog-assets/healthcare/cms-855a__cms855a.webp',
        description: 'Use Form CMS-855A for medicare enrollment application - institutional provider.',
        sourceUrl: 'https://www.cms.gov/Medicare/CMS-Forms/CMS-Forms/downloads/CMS855A.pdf',
      },
      {
        slug: 'cms-855b',
        formNumber: 'CMS-855B',
        title: 'Medicare Enrollment Application - Clinics',
        section: 'healthcare',
        pageCount: 49,
        pdfUrl: '/form-catalog-assets/healthcare/cms-855b__cms855b.pdf',
        thumbnailUrl: '/form-catalog-assets/healthcare/cms-855b__cms855b.webp',
        description: 'Use Form CMS-855B for medicare enrollment application - clinics.',
        sourceUrl: 'https://www.cms.gov/Medicare/CMS-Forms/CMS-Forms/downloads/CMS855B.pdf',
      },
      {
        slug: 'cms-855s',
        formNumber: 'CMS-855S',
        title: 'Medicare Enrollment Application - DMEPOS Suppliers',
        section: 'healthcare',
        pageCount: 39,
        pdfUrl: '/form-catalog-assets/healthcare/cms-855s__cms855s.pdf',
        thumbnailUrl: '/form-catalog-assets/healthcare/cms-855s__cms855s.webp',
        description: 'Use Form CMS-855S for medicare enrollment application - DMEPOS suppliers.',
        sourceUrl: 'https://www.cms.gov/Medicare/CMS-Forms/CMS-Forms/downloads/CMS855S.pdf',
      },
      {
        slug: 'cms-460',
        formNumber: 'CMS-460',
        title: 'Medicare Participating Physician or Supplier Agreement',
        section: 'healthcare',
        pageCount: 5,
        pdfUrl: '/form-catalog-assets/healthcare/cms-460__cms460.pdf',
        thumbnailUrl: '/form-catalog-assets/healthcare/cms-460__cms460.webp',
        description: 'Use Form CMS-460 for medicare participating physician or supplier agreement.',
        sourceUrl: 'https://www.cms.gov/Medicare/CMS-Forms/CMS-Forms/downloads/CMS460.pdf',
      },
      {
        slug: 'cms-20027',
        formNumber: 'CMS-20027',
        title: 'Medicare Redetermination Request Form',
        section: 'patient_intake',
        pageCount: 1,
        pdfUrl: '/form-catalog-assets/patient_intake/cms_20027__cms20027.pdf',
        thumbnailUrl: '/form-catalog-assets/patient_intake/cms_20027__cms20027.webp',
        description: 'Use Form CMS-20027 for medicare redetermination request form.',
        sourceUrl: 'https://www.cms.gov/Medicare/CMS-Forms/CMS-Forms/downloads/CMS20027.pdf',
      },
      {
        slug: 'cms-20033',
        formNumber: 'CMS-20033',
        title: 'Medicare Reconsideration Request',
        section: 'patient_intake',
        pageCount: 1,
        pdfUrl: '/form-catalog-assets/patient_intake/cms_20033__cms20033.pdf',
        thumbnailUrl: '/form-catalog-assets/patient_intake/cms_20033__cms20033.webp',
        description: 'Use Form CMS-20033 for medicare reconsideration request.',
        sourceUrl: 'https://www.cms.gov/Medicare/CMS-Forms/CMS-Forms/downloads/CMS20033.pdf',
      },
    ],
  }),
  'hr-pdf-automation': createShowcase({
    title: 'Featured HR, onboarding, and payroll PDFs from the DullyPDF catalog',
    description:
      'These examples show the mix of hiring, withholding, contractor, and payroll forms teams can open directly in DullyPDF. Start from the blank official PDF, map it once, then fill it from employee records, APIs, or respondent data.',
    categoryLinks: [
      { label: 'Browse HR & onboarding forms', href: '/forms?category=hr_onboarding' },
      { label: 'Browse payroll tax forms', href: '/forms?category=tax_payroll' },
    ],
    documents: [
      {
        slug: 'i-9',
        formNumber: 'I-9',
        title: 'Employment Eligibility Verification',
        section: 'hr_onboarding',
        pageCount: 4,
        pdfUrl: '/form-catalog-assets/hr_onboarding/i-9__i-9.pdf',
        thumbnailUrl: '/form-catalog-assets/hr_onboarding/i-9__i-9.webp',
        description: 'Use Form I-9 for employment eligibility verification.',
        sourceUrl: 'https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf',
      },
      {
        slug: 'w-4',
        formNumber: 'W-4',
        title: "Employee's Withholding Certificate",
        section: 'hr_onboarding',
        pageCount: 5,
        pdfUrl: '/form-catalog-assets/hr_onboarding/w-4__fw4.pdf',
        thumbnailUrl: '/form-catalog-assets/hr_onboarding/w-4__fw4.webp',
        description: "Use Form W-4 for employee's withholding certificate.",
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/fw4.pdf',
      },
      {
        slug: 'w-9',
        formNumber: 'W-9',
        title: 'Request for Taxpayer Identification Number',
        section: 'hr_onboarding',
        pageCount: 6,
        pdfUrl: '/form-catalog-assets/hr_onboarding/w-9__fw9.pdf',
        thumbnailUrl: '/form-catalog-assets/hr_onboarding/w-9__fw9.webp',
        description: 'Use Form W-9 to request taxpayer identification number.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/fw9.pdf',
      },
      {
        slug: '2553',
        formNumber: '2553',
        title: 'Election by a Small Business Corporation',
        section: 'tax_business',
        pageCount: 4,
        pdfUrl: '/form-catalog-assets/tax_business/2553__f2553.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_business/2553__f2553.webp',
        description: 'Use Form 2553 for election by a small business corporation.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f2553.pdf',
      },
      {
        slug: 'ss-4',
        formNumber: 'SS-4',
        title: 'Application for Employer Identification Number (EIN)',
        section: 'hr_onboarding',
        pageCount: 2,
        pdfUrl: '/form-catalog-assets/hr_onboarding/ss-4__fss4.pdf',
        thumbnailUrl: '/form-catalog-assets/hr_onboarding/ss-4__fss4.webp',
        description: 'Use Form SS-4 to apply for employer identification number (EIN).',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/fss4.pdf',
      },
      {
        slug: 'ss-8',
        formNumber: 'SS-8',
        title: 'Determination of Worker Status',
        section: 'hr_onboarding',
        pageCount: 5,
        pdfUrl: '/form-catalog-assets/hr_onboarding/ss-8__fss8.pdf',
        thumbnailUrl: '/form-catalog-assets/hr_onboarding/ss-8__fss8.webp',
        description: 'Use Form SS-8 for determination of worker status.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/fss8.pdf',
      },
      {
        slug: 'w-8ben',
        formNumber: 'W-8BEN',
        title: 'Certificate of Foreign Status - Individuals',
        section: 'hr_onboarding',
        pageCount: 1,
        pdfUrl: '/form-catalog-assets/hr_onboarding/w-8ben__fw8ben.pdf',
        thumbnailUrl: '/form-catalog-assets/hr_onboarding/w-8ben__fw8ben.webp',
        description: 'Use Form W-8BEN for certificate of foreign status - individuals.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/fw8ben.pdf',
      },
      {
        slug: '8832',
        formNumber: '8832',
        title: 'Entity Classification Election',
        section: 'tax_business',
        pageCount: 8,
        pdfUrl: '/form-catalog-assets/tax_business/8832__f8832.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_business/8832__f8832.webp',
        description: 'Use Form 8832 for entity classification election.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f8832.pdf',
      },
      {
        slug: '941-x',
        formNumber: '941-X',
        title: "Adjusted Employer's Quarterly Federal Tax Return",
        section: 'tax_payroll',
        pageCount: 6,
        pdfUrl: '/form-catalog-assets/tax_payroll/941-x__f941x.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_payroll/941-x__f941x.webp',
        description: "Use Form 941-X for adjusted employer's quarterly federal tax return.",
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f941x.pdf',
      },
      {
        slug: 'w-2',
        formNumber: 'W-2',
        title: 'Wage and Tax Statement',
        section: 'tax_payroll',
        pageCount: 11,
        pdfUrl: '/form-catalog-assets/tax_payroll/w-2__fw2.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_payroll/w-2__fw2.webp',
        description: 'Use Form W-2 for wage and tax statement.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/fw2.pdf',
      },
    ],
  }),
  'logistics-pdf-automation': createShowcase({
    title: 'Featured customs and logistics PDFs from the DullyPDF catalog',
    description:
      'These CBP forms are real logistics documents already mirrored in the DullyPDF catalog. Open one in the editor, map it once, and then reuse the same template for shipment records, fee reporting, intake links, API calls, or signature handoff.',
    categoryLinks: [
      { label: 'Browse all customs & logistics forms', href: '/forms?category=customs_logistics' },
    ],
    documents: [
      {
        slug: 'cbp-19',
        formNumber: 'CBP 19',
        title: 'Protest',
        section: 'customs_logistics',
        pageCount: 3,
        pdfUrl: '/form-catalog-assets/customs_logistics/cbp_19__cbp_form_19.pdf',
        thumbnailUrl: '/form-catalog-assets/customs_logistics/cbp_19__cbp_form_19.webp',
        description: 'Use Form CBP 19 for protest.',
        sourceUrl: 'https://www.cbp.gov/sites/default/files/2024-05/cbp_form_19.pdf',
      },
      {
        slug: 'cbp-214',
        formNumber: 'CBP 214',
        title: 'Application for Foreign-Trade Zone Admission and/or Status Designation',
        section: 'customs_logistics',
        pageCount: 1,
        pdfUrl: '/form-catalog-assets/customs_logistics/cbp_214__CBP_Form_214.pdf',
        thumbnailUrl: '/form-catalog-assets/customs_logistics/cbp_214__CBP_Form_214.webp',
        description: 'Use Form CBP 214 to apply for foreign-trade zone admission and/or status designation.',
        sourceUrl: 'https://www.cbp.gov/sites/default/files/assets/documents/2023-Dec/CBP%20Form%20214.pdf',
      },
      {
        slug: 'cbp-1300',
        formNumber: 'CBP 1300',
        title: 'Vessel Entrance or Clearance Statement',
        section: 'customs_logistics',
        pageCount: 2,
        pdfUrl: '/form-catalog-assets/customs_logistics/cbp_1300__cbp_form_1300.pdf',
        thumbnailUrl: '/form-catalog-assets/customs_logistics/cbp_1300__cbp_form_1300.webp',
        description: 'Use Form CBP 1300 for vessel entrance or clearance statement.',
        sourceUrl: 'https://www.cbp.gov/sites/default/files/2025-06/cbp_form_1300.pdf',
      },
      {
        slug: 'cbp-349',
        formNumber: 'CBP 349',
        title: 'Harbor Maintenance Fee Quarterly Summary Report',
        section: 'customs_logistics',
        pageCount: 2,
        pdfUrl: '/form-catalog-assets/customs_logistics/cbp_349__cbp_form_349.pdf',
        thumbnailUrl: '/form-catalog-assets/customs_logistics/cbp_349__cbp_form_349.webp',
        description: 'Use Form CBP 349 for harbor maintenance fee quarterly summary report.',
        sourceUrl: 'https://www.cbp.gov/sites/default/files/2024-05/cbp_form_349.pdf',
      },
      {
        slug: 'cbp-28',
        formNumber: 'CBP 28',
        title: 'Request for Information',
        section: 'customs_logistics',
        pageCount: 3,
        pdfUrl: '/form-catalog-assets/customs_logistics/cbp_28__cbp_form_28.pdf',
        thumbnailUrl: '/form-catalog-assets/customs_logistics/cbp_28__cbp_form_28.webp',
        description: 'Use Form CBP 28 to request information.',
        sourceUrl: 'https://www.cbp.gov/sites/default/files/2025-05/cbp_form_28.pdf',
      },
      {
        slug: 'cbp-214a',
        formNumber: 'CBP 214A',
        title: 'Application for Foreign-Trade Zone Admission',
        section: 'customs_logistics',
        pageCount: 2,
        pdfUrl: '/form-catalog-assets/customs_logistics/cbp_214a__cbp_form_214a.pdf',
        thumbnailUrl: '/form-catalog-assets/customs_logistics/cbp_214a__cbp_form_214a.webp',
        description: 'Use Form CBP 214A to apply for foreign-trade zone admission.',
        sourceUrl: 'https://www.cbp.gov/sites/default/files/2024-05/cbp_form_214a.pdf',
      },
      {
        slug: 'cbp-216',
        formNumber: 'CBP 216',
        title: 'Application for Foreign-Trade Zone Activity Permit',
        section: 'customs_logistics',
        pageCount: 1,
        pdfUrl: '/form-catalog-assets/customs_logistics/cbp_216__cbp_form_216.pdf',
        thumbnailUrl: '/form-catalog-assets/customs_logistics/cbp_216__cbp_form_216.webp',
        description: 'Use Form CBP 216 to apply for foreign-trade zone activity permit.',
        sourceUrl: 'https://www.cbp.gov/sites/default/files/2024-12/cbp_form_216.pdf',
      },
      {
        slug: 'cbp-226',
        formNumber: 'CBP 226',
        title: 'Record of Vessel Foreign Repair or Equipment Purchase',
        section: 'customs_logistics',
        pageCount: 2,
        pdfUrl: '/form-catalog-assets/customs_logistics/cbp_226__cbp_form_226.pdf',
        thumbnailUrl: '/form-catalog-assets/customs_logistics/cbp_226__cbp_form_226.webp',
        description: 'Use Form CBP 226 to record vessel foreign repair or equipment purchase.',
        sourceUrl: 'https://www.cbp.gov/sites/default/files/2024-05/cbp_form_226.pdf',
      },
      {
        slug: 'cbp-300',
        formNumber: 'CBP 300',
        title: "Bonded Warehouse Proprietor's Submission",
        section: 'customs_logistics',
        pageCount: 2,
        pdfUrl: '/form-catalog-assets/customs_logistics/cbp_300__cbp_form_300.pdf',
        thumbnailUrl: '/form-catalog-assets/customs_logistics/cbp_300__cbp_form_300.webp',
        description: "Use Form CBP 300 for bonded warehouse proprietor's submission.",
        sourceUrl: 'https://www.cbp.gov/sites/default/files/2024-08/cbp_form_300.pdf',
      },
      {
        slug: 'cbp-3173',
        formNumber: 'CBP 3173',
        title: 'Application for Extension of Bond for Temporary Importation',
        section: 'customs_logistics',
        pageCount: 2,
        pdfUrl: '/form-catalog-assets/customs_logistics/cbp_3173__cbp_form_3173.pdf',
        thumbnailUrl: '/form-catalog-assets/customs_logistics/cbp_3173__cbp_form_3173.webp',
        description: 'Use Form CBP 3173 to apply for extension of bond for temporary importation.',
        sourceUrl: 'https://www.cbp.gov/sites/default/files/2024-07/cbp_form_3173.pdf',
      },
    ],
  }),
  'nonprofit-pdf-form-automation': createShowcase({
    title: 'Featured nonprofit filing PDFs from the DullyPDF catalog',
    description:
      'These are real exempt-organization returns and schedules from the IRS subset in the DullyPDF catalog. Open a blank filing packet in the editor, map your reporting fields, and then drive repeat output from structured finance data or intake responses.',
    categoryLinks: [
      { label: 'Browse all nonprofit forms', href: '/forms?category=nonprofit' },
    ],
    documents: [
      {
        slug: '990',
        formNumber: '990',
        title: 'Return of Organization Exempt From Income Tax',
        section: 'nonprofit',
        pageCount: 12,
        pdfUrl: '/form-catalog-assets/nonprofit/990__f990.pdf',
        thumbnailUrl: '/form-catalog-assets/nonprofit/990__f990.webp',
        description: 'Use Form 990 for return of organization exempt from income tax.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f990.pdf',
      },
      {
        slug: '990-schedule-a',
        formNumber: '990 Schedule A',
        title: 'Public Charity Status and Public Support',
        section: 'nonprofit',
        pageCount: 8,
        pdfUrl: '/form-catalog-assets/nonprofit/990_schedule_a__f990sa.pdf',
        thumbnailUrl: '/form-catalog-assets/nonprofit/990_schedule_a__f990sa.webp',
        description: 'Use Form 990 Schedule A for public charity status and public support.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f990sa.pdf',
      },
      {
        slug: '990-ez',
        formNumber: '990-EZ',
        title: 'Short Form Return of Organization Exempt',
        section: 'nonprofit',
        pageCount: 4,
        pdfUrl: '/form-catalog-assets/nonprofit/990-ez__f990ez.pdf',
        thumbnailUrl: '/form-catalog-assets/nonprofit/990-ez__f990ez.webp',
        description: 'Use Form 990-EZ for short form return of organization exempt.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f990ez.pdf',
      },
      {
        slug: '990-schedule-g',
        formNumber: '990 Schedule G',
        title: 'Fundraising or Gaming Activities',
        section: 'nonprofit',
        pageCount: 3,
        pdfUrl: '/form-catalog-assets/nonprofit/990_schedule_g__f990sg.pdf',
        thumbnailUrl: '/form-catalog-assets/nonprofit/990_schedule_g__f990sg.webp',
        description: 'Use Form 990 Schedule G for fundraising or gaming activities.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f990sg.pdf',
      },
      {
        slug: '990-schedule-d',
        formNumber: '990 Schedule D',
        title: 'Supplemental Financial Statements',
        section: 'nonprofit',
        pageCount: 5,
        pdfUrl: '/form-catalog-assets/nonprofit/990_schedule_d__f990sd.pdf',
        thumbnailUrl: '/form-catalog-assets/nonprofit/990_schedule_d__f990sd.webp',
        description: 'Use Form 990 Schedule D for supplemental financial statements.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f990sd.pdf',
      },
      {
        slug: '990-schedule-i',
        formNumber: '990 Schedule I',
        title: 'Grants and Other Assistance',
        section: 'nonprofit',
        pageCount: 2,
        pdfUrl: '/form-catalog-assets/nonprofit/990_schedule_i__f990si.pdf',
        thumbnailUrl: '/form-catalog-assets/nonprofit/990_schedule_i__f990si.webp',
        description: 'Use Form 990 Schedule I for grants and other assistance.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f990si.pdf',
      },
      {
        slug: '990-schedule-j',
        formNumber: '990 Schedule J',
        title: 'Compensation Information',
        section: 'nonprofit',
        pageCount: 3,
        pdfUrl: '/form-catalog-assets/nonprofit/990_schedule_j__f990sj.pdf',
        thumbnailUrl: '/form-catalog-assets/nonprofit/990_schedule_j__f990sj.webp',
        description: 'Use Form 990 Schedule J for compensation information.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f990sj.pdf',
      },
      {
        slug: '990-schedule-o',
        formNumber: '990 Schedule O',
        title: 'Supplemental Information',
        section: 'nonprofit',
        pageCount: 1,
        pdfUrl: '/form-catalog-assets/nonprofit/990_schedule_o__f990so.pdf',
        thumbnailUrl: '/form-catalog-assets/nonprofit/990_schedule_o__f990so.webp',
        description: 'Use Form 990 Schedule O for supplemental information.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f990so.pdf',
      },
      {
        slug: '990-schedule-r',
        formNumber: '990 Schedule R',
        title: 'Related Organizations and Unrelated Partnerships',
        section: 'nonprofit',
        pageCount: 5,
        pdfUrl: '/form-catalog-assets/nonprofit/990_schedule_r__f990sr.pdf',
        thumbnailUrl: '/form-catalog-assets/nonprofit/990_schedule_r__f990sr.webp',
        description: 'Use Form 990 Schedule R for related organizations and unrelated partnerships.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f990sr.pdf',
      },
      {
        slug: '990-bl',
        formNumber: '990-BL',
        title: 'Information and Initial Excise Tax Return for Black Lung Benefit Trusts',
        section: 'nonprofit',
        pageCount: 3,
        pdfUrl: '/form-catalog-assets/nonprofit/990-bl__f990bl.pdf',
        thumbnailUrl: '/form-catalog-assets/nonprofit/990-bl__f990bl.webp',
        description: 'Use Form 990-BL for information and initial excise tax return for black lung benefit trusts.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f990bl.pdf',
      },
    ],
  }),
  'government-form-automation': createShowcase({
    title: 'Featured government-service PDFs from the DullyPDF catalog',
    description:
      'These examples pull from the public-domain government categories already in the DullyPDF catalog: passport, immigration, Social Security, and VA packets. Open the blank official PDF first, then reuse the template for Search & Fill, APIs, web forms, or e-sign routing.',
    categoryLinks: [
      { label: 'Browse immigration forms', href: '/forms?category=immigration' },
      { label: 'Browse Social Security forms', href: '/forms?category=social_security' },
      { label: 'Browse VA forms', href: '/forms?category=veterans' },
      { label: 'Browse State Department forms', href: '/forms?category=state_department' },
    ],
    documents: [
      {
        slug: 'ds-11',
        formNumber: 'DS-11',
        title: 'Application for a U.S. Passport',
        section: 'state_department',
        pageCount: 6,
        pdfUrl: '/form-catalog-assets/state_department/ds-11__ds11_pdf.pdf',
        thumbnailUrl: '/form-catalog-assets/state_department/ds-11__ds11_pdf.webp',
        description: 'Use Form DS-11 to apply for a U.S. passport.',
        sourceUrl: 'https://eforms.state.gov/Forms/ds11_pdf.PDF',
      },
      {
        slug: 'i-130',
        formNumber: 'I-130',
        title: 'Petition for Alien Relative',
        section: 'immigration',
        pageCount: 12,
        pdfUrl: '/form-catalog-assets/immigration/i-130__i-130.pdf',
        thumbnailUrl: '/form-catalog-assets/immigration/i-130__i-130.webp',
        description: 'Use Form I-130 to petition for alien relative.',
        sourceUrl: 'https://www.uscis.gov/sites/default/files/document/forms/i-130.pdf',
      },
      {
        slug: 'ss-5',
        formNumber: 'SS-5',
        title: 'Application for a Social Security Card',
        section: 'social_security',
        pageCount: 5,
        pdfUrl: '/form-catalog-assets/social_security/ss-5__ss-5.pdf',
        thumbnailUrl: '/form-catalog-assets/social_security/ss-5__ss-5.webp',
        description: 'Use Form SS-5 to apply for a social security card.',
        sourceUrl: 'https://www.ssa.gov/forms/ss-5.pdf',
      },
      {
        slug: 'va-21-526ez',
        formNumber: 'VA 21-526EZ',
        title: 'Application for Disability Compensation',
        section: 'veterans',
        pageCount: 15,
        pdfUrl: '/form-catalog-assets/veterans/va_21-526ez__vba-21-526ez-are.pdf',
        thumbnailUrl: '/form-catalog-assets/veterans/va_21-526ez__vba-21-526ez-are.webp',
        description: 'Use Form VA 21-526EZ to apply for disability compensation.',
        sourceUrl: 'https://www.vba.va.gov/pubs/forms/VBA-21-526EZ-ARE.pdf',
      },
      {
        slug: 'ds-82',
        formNumber: 'DS-82',
        title: 'U.S. Passport Renewal Application by Mail',
        section: 'state_department',
        pageCount: 6,
        pdfUrl: '/form-catalog-assets/state_department/ds-82__ds82_pdf.pdf',
        thumbnailUrl: '/form-catalog-assets/state_department/ds-82__ds82_pdf.webp',
        description: 'Use Form DS-82 for U.S. passport renewal application by mail.',
        sourceUrl: 'https://eforms.state.gov/Forms/ds82_pdf.PDF',
      },
      {
        slug: 'g-639',
        formNumber: 'G-639',
        title: 'Freedom of Information/Privacy Act Request',
        section: 'immigration',
        pageCount: 11,
        pdfUrl: '/form-catalog-assets/immigration/g-639__g-639.pdf',
        thumbnailUrl: '/form-catalog-assets/immigration/g-639__g-639.webp',
        description: 'Use Form G-639 for freedom of information/privacy act request.',
        sourceUrl: 'https://www.uscis.gov/sites/default/files/document/forms/g-639.pdf',
      },
      {
        slug: 'i-90',
        formNumber: 'I-90',
        title: 'Application to Replace Permanent Resident Card',
        section: 'immigration',
        pageCount: 7,
        pdfUrl: '/form-catalog-assets/immigration/i-90__i-90.pdf',
        thumbnailUrl: '/form-catalog-assets/immigration/i-90__i-90.webp',
        description: 'Use Form I-90 to apply to replace permanent resident card.',
        sourceUrl: 'https://www.uscis.gov/sites/default/files/document/forms/i-90.pdf',
      },
      {
        slug: 'ssa-16',
        formNumber: 'SSA-16',
        title: 'Application for Disability Insurance Benefits',
        section: 'social_security',
        pageCount: 7,
        pdfUrl: '/form-catalog-assets/social_security/ssa-16__ssa-16-bk.pdf',
        thumbnailUrl: '/form-catalog-assets/social_security/ssa-16__ssa-16-bk.webp',
        description: 'Use Form SSA-16 to apply for disability insurance benefits.',
        sourceUrl: 'https://www.ssa.gov/forms/ssa-16-bk.pdf',
      },
      {
        slug: 'va-21-8940',
        formNumber: 'VA 21-8940',
        title: 'Application for Increased Compensation Based on Unemployability',
        section: 'veterans',
        pageCount: 4,
        pdfUrl: '/form-catalog-assets/veterans/va_21-8940__vba-21-8940-are.pdf',
        thumbnailUrl: '/form-catalog-assets/veterans/va_21-8940__vba-21-8940-are.webp',
        description: 'Use Form VA 21-8940 to apply for increased compensation based on unemployability.',
        sourceUrl: 'https://www.vba.va.gov/pubs/forms/VBA-21-8940-ARE.pdf',
      },
      {
        slug: 'va-21-4142',
        formNumber: 'VA 21-4142',
        title: 'Authorization to Disclose Information to VA',
        section: 'veterans',
        pageCount: 5,
        pdfUrl: '/form-catalog-assets/veterans/va_21-4142__vba-21-4142-are.pdf',
        thumbnailUrl: '/form-catalog-assets/veterans/va_21-4142__vba-21-4142-are.webp',
        description: 'Use Form VA 21-4142 to authorize disclose information to VA.',
        sourceUrl: 'https://www.vba.va.gov/pubs/forms/VBA-21-4142-ARE.pdf',
      },
    ],
  }),
  'accounting-tax-pdf-automation': createShowcase({
    title: 'Featured accounting and tax PDFs from the DullyPDF catalog',
    description:
      'These IRS forms come from the public-domain accounting and tax slices already mirrored inside the DullyPDF catalog. Open a blank return or reporting form in the editor, map it once, and then reuse it for spreadsheets, APIs, web-form intake, or signature handoff.',
    categoryLinks: [
      { label: 'Browse individual tax forms', href: '/forms?category=tax_individual' },
      { label: 'Browse business tax forms', href: '/forms?category=tax_business' },
      { label: 'Browse payroll tax forms', href: '/forms?category=tax_payroll' },
    ],
    documents: [
      {
        slug: '1040',
        formNumber: '1040',
        title: 'U.S. Individual Income Tax Return',
        section: 'tax_individual',
        pageCount: 2,
        pdfUrl: '/form-catalog-assets/tax_individual/1040__f1040.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_individual/1040__f1040.webp',
        description: 'Use Form 1040 for U.S. individual income tax return.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f1040.pdf',
      },
      {
        slug: '1099-misc',
        formNumber: '1099-MISC',
        title: 'Miscellaneous Information',
        section: 'tax_individual',
        pageCount: 6,
        pdfUrl: '/form-catalog-assets/tax_individual/1099-misc__f1099msc.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_individual/1099-misc__f1099msc.webp',
        description: 'Use Form 1099-MISC for miscellaneous information.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f1099msc.pdf',
      },
      {
        slug: '1120',
        formNumber: '1120',
        title: 'U.S. Corporation Income Tax Return',
        section: 'tax_business',
        pageCount: 6,
        pdfUrl: '/form-catalog-assets/tax_business/1120__f1120.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_business/1120__f1120.webp',
        description: 'Use Form 1120 for U.S. corporation income tax return.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f1120.pdf',
      },
      {
        slug: '941',
        formNumber: '941',
        title: "Employer's Quarterly Federal Tax Return",
        section: 'tax_payroll',
        pageCount: 3,
        pdfUrl: '/form-catalog-assets/tax_payroll/941__f941.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_payroll/941__f941.webp',
        description: "Use Form 941 for employer's quarterly federal tax return.",
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f941.pdf',
      },
      {
        slug: '1040-es',
        formNumber: '1040-ES',
        title: 'Estimated Tax for Individuals',
        section: 'tax_individual',
        pageCount: 16,
        pdfUrl: '/form-catalog-assets/tax_individual/1040-es__f1040es.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_individual/1040-es__f1040es.webp',
        description: 'Use Form 1040-ES for estimated tax for individuals.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f1040es.pdf',
      },
      {
        slug: '1040-nr',
        formNumber: '1040-NR',
        title: 'U.S. Nonresident Alien Income Tax Return',
        section: 'tax_individual',
        pageCount: 2,
        pdfUrl: '/form-catalog-assets/tax_individual/1040-nr__f1040nr.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_individual/1040-nr__f1040nr.webp',
        description: 'Use Form 1040-NR for U.S. nonresident alien income tax return.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f1040nr.pdf',
      },
      {
        slug: '1099-nec',
        formNumber: '1099-NEC',
        title: 'Nonemployee Compensation',
        section: 'tax_individual',
        pageCount: 6,
        pdfUrl: '/form-catalog-assets/tax_individual/1099-nec__f1099nec.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_individual/1099-nec__f1099nec.webp',
        description: 'Use Form 1099-NEC for nonemployee compensation.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f1099nec.pdf',
      },
      {
        slug: '1120-s',
        formNumber: '1120-S',
        title: 'U.S. Income Tax Return for an S Corporation',
        section: 'tax_business',
        pageCount: 5,
        pdfUrl: '/form-catalog-assets/tax_business/1120-s__f1120s.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_business/1120-s__f1120s.webp',
        description: 'Use Form 1120-S for U.S. income tax return for an S corporation.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f1120s.pdf',
      },
      {
        slug: '1065',
        formNumber: '1065',
        title: 'U.S. Return of Partnership Income',
        section: 'tax_business',
        pageCount: 6,
        pdfUrl: '/form-catalog-assets/tax_business/1065__f1065.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_business/1065__f1065.webp',
        description: 'Use Form 1065 for U.S. return of partnership income.',
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f1065.pdf',
      },
      {
        slug: '940',
        formNumber: '940',
        title: "Employer's Annual Federal Unemployment (FUTA) Tax Return",
        section: 'tax_payroll',
        pageCount: 3,
        pdfUrl: '/form-catalog-assets/tax_payroll/940__f940.pdf',
        thumbnailUrl: '/form-catalog-assets/tax_payroll/940__f940.webp',
        description: "Use Form 940 for employer's annual federal unemployment (FUTA) tax return.",
        sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f940.pdf',
      },
    ],
  }),
};

export const INTENT_CATALOG_SHOWCASE_PAGE_KEYS = Object.keys(SHOWCASES);

export const getIntentCatalogShowcase = (pageKey) => SHOWCASES[pageKey] ?? null;

export const getIntentCatalogCategorySummaries = (pageKey) => (
  pageKey === 'pdf-form-catalog' ? FORM_CATALOG_CATEGORY_SUMMARIES : []
);

export const buildIntentCatalogWorkflowSteps = (showcase) => {
  if (!showcase?.featuredDocuments?.length) return [];
  const primaryDocument = showcase.featuredDocuments[0];
  const subject = showcase.title.replace(/^Featured\s+/i, '').replace(/\s+from the DullyPDF catalog$/i, '');

  return [
    {
      title: `Open a blank ${subject} PDF in DullyPDF`,
      description:
        'Use any "Open in DullyPDF" button below to land on the upload route with the catalog slug already selected so the blank official PDF loads directly into the workspace.',
      href: primaryDocument.editorHref,
      linkLabel: `Open ${primaryDocument.formNumber || primaryDocument.title} in DullyPDF`,
    },
    {
      title: 'Map fields once for CSV, XLSX, JSON, or schema-only SQL imports',
      description:
        'Rename weak field labels, align them to schema headers, and use SQL only when you need the schema without row data yet.',
      href: '/usage-docs/rename-mapping',
      linkLabel: 'Rename + Mapping docs',
    },
    {
      title: 'Run Search & Fill from structured records',
      description:
        'Load CSV, XLSX, or JSON rows, search for the right record, and fill the saved template without retyping the PDF.',
      href: '/usage-docs/search-fill',
      linkLabel: 'Search & Fill docs',
    },
    {
      title: 'Publish API Fill for server-side JSON-to-PDF workflows',
      description:
        'When another system should call the template directly, publish a template-scoped API Fill endpoint and send JSON instead of using the browser workflow.',
      href: '/usage-docs/api-fill',
      linkLabel: 'API Fill docs',
    },
    {
      title: 'Collect answers through native DullyPDF web forms',
      description:
        'Use Fill By Link when the row data does not exist yet and a respondent should submit web-form answers before the PDF is generated.',
      href: '/usage-docs/fill-by-link',
      linkLabel: 'Fill By Link docs',
    },
    {
      title: 'Freeze the completed packet and route it into signature',
      description:
        'Once the final filled record is correct, move it into the signature workflow so the immutable PDF, signer ceremony, and audit artifacts all stay attached to one retained document.',
      href: '/usage-docs/signature-workflow',
      linkLabel: 'Signature workflow docs',
    },
  ];
};
