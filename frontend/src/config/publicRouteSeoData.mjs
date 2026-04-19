/**
 * Shared public-route dataset for both the React runtime and the build-time SEO
 * generators. Keep user-facing public content in this module whenever it must
 * be reused by route metadata, sitemap generation, or static HTML rendering.
 */
import {
  FREE_PLAN_CREDITS,
  FREE_PLAN_LIMITS,
  PREMIUM_PLAN_CREDITS,
  PREMIUM_PLAN_LIMITS,
  formatPlanLimitCount,
} from './planLimits.mjs';
import { BLOG_POSTS } from './blogContent.mjs';
import {
  buildIntentCatalogWorkflowSteps,
  getIntentCatalogShowcase,
} from './intentCatalogShowcases.mjs';
import { FORM_CATALOG_ENTRIES } from './formCatalogData.mjs';
import {
  FORM_CATALOG_CATEGORIES,
  FORM_CATALOG_TOTAL_COUNT,
} from './formCatalogCategories.mjs';

export const SITE_ORIGIN = 'https://dullypdf.com';
export const DEFAULT_SOCIAL_IMAGE_PATH = '/DullyPDFLogoImproved.png';
const OFFICIAL_PUBLIC_PROFILE_URLS = [
  'https://www.linkedin.com/company/dullypdf',
  'https://github.com/justin-thakral/DullyPDF',
  'https://www.youtube.com/@DullyPDF',
  'https://x.com/DullyPDF',
];

// ---------------------------------------------------------------------------
// Intent pages
// ---------------------------------------------------------------------------

const INTENT_PAGES = [
  {
    key: 'pdf-to-fillable-form',
    category: 'workflow',
    path: '/pdf-to-fillable-form',
    navLabel: 'PDF to Fillable Form',
    heroTitle: 'Convert PDF to Fillable Form Templates in Minutes',
    heroSummary:
      'Upload a raw PDF, detect candidate fields, clean geometry in the editor, and save a reusable fillable template for repeat workflows.',
    seoTitle: 'Convert Any PDF to a Fillable Form — Free AI Field Detection',
    seoDescription:
      'Upload a PDF, let AI detect every field, rename and map them to your data, then reuse the template forever. No Acrobat required. Free to start.',
    seoKeywords: [
      'pdf to fillable form',
      'free pdf to fillable form',
      'automatic pdf to fillable form',
      'pdf form builder',
      'build fillable form from pdf',
      'fillable pdf builder',
      'convert pdf to fillable template',
      'fillable form template workflow',
      'make pdf fillable online free',
      'turn pdf into fillable form',
      'create fillable pdf from existing document',
      'pdf to editable form converter',
      'scan to fillable pdf',
    ],
    valuePoints: [
      'Convert scanned or native PDFs into editable fillable templates.',
      'Review field candidates with confidence scoring before finalizing.',
      'Use visual tools to resize, rename, and type fields with precision.',
    ],
    proofPoints: [
      'Supports PDF uploads up to 50MB.',
      'Search & Fill uses local CSV/XLSX/JSON rows in-browser.',
      'Templates can be saved and reopened for repeat intake cycles.',
    ],
    articleSections: [
      {
        title: 'Why teams search for a PDF to fillable form workflow',
        paragraphs: [
          'Most teams looking for a PDF to fillable form tool are not trying to design a brand-new form from scratch. They already have an intake packet, insurance form, permit, onboarding document, or client worksheet that exists as a PDF and needs to become reusable. The real problem is turning that fixed layout into something you can review, map, save, and fill again later without rebuilding it every time.',
          'That is where DullyPDF is narrower than a general PDF editor and more useful for repeat operations. It is built for existing PDFs that need field detection, cleanup, naming, mapping, and repeat filling. If you need full document authoring or page redesign, use a general editor. If you need to convert the same document type into a reusable workflow, the template approach is the better fit.',
        ],
        bullets: [
          'Best fit: recurring PDFs with a stable visual layout and changing underlying record data.',
          'Less ideal: one-off editing, page redesign, or general-purpose annotation work.',
        ],
      },
      {
        title: 'How DullyPDF converts an existing PDF into a reusable template',
        paragraphs: [
          'The workflow starts with upload and detection. DullyPDF renders each page, runs the CommonForms detector, and proposes candidate text, checkbox, date, and signature fields. Instead of blindly trusting the model output, you review the results in the editor with confidence cues and geometry controls so the field set becomes clean before anyone relies on it downstream.',
          'Once the field geometry is stable, you can rename fields, map them to schema headers, and save the result as a reusable template. That matters because the real value is not simply making a PDF fillable once. The value is creating a versioned, reopenable template that can support repeat Search & Fill runs, QA loops, saved-form reuse, and later updates when the source form changes.',
        ],
        bullets: [
          'Upload the source PDF.',
          'Review AI-detected field candidates and clean the layout.',
          'Rename and map fields when the document will be filled from structured data.',
          'Save the template so future fills do not require full setup again.',
        ],
      },
      {
        title: 'What makes a converted fillable PDF reliable in production',
        paragraphs: [
          'A usable template is more than a set of boxes on a page. Reliable production output depends on stable field names, predictable field types, and enough QA that teams trust the result. Text fields need names that make sense to humans and to mapping logic. Checkboxes need correct grouping and option keys. Date fields need consistent normalization. If those details are weak, the document may technically be fillable while still failing as an operational workflow.',
          'The practical standard is simple: test one real record end to end before rolling the template out to a team. Open the saved template, fill it from representative data, inspect the output, clear the fields, and run the fill again. That loop catches most issues early and keeps the template from becoming a fragile one-time conversion that nobody wants to reuse.',
        ],
      },
      {
        title: 'Where AI field detection still needs human review',
        paragraphs: [
          'Detection is fastest when the PDF is clean, high contrast, and visually consistent. Native PDFs with obvious form lines usually need less cleanup. Scanned forms, dense table layouts, decorative borders, and tightly packed checkbox groups usually need more review. That is normal. The goal is not zero manual input. The goal is moving the operator from full manual field creation to targeted cleanup of a mostly-correct draft.',
          'A strong review order is to start with low-confidence items, then scan for duplicated labels, misclassified checkboxes, and fields that are slightly shifted relative to the printed form line. If a detector misses something important, the editor still lets you add or correct fields manually. The combination of detection plus human cleanup is what makes the template dependable.',
        ],
      },
      {
        title: 'Flat, scanned, and already-fillable PDFs need different review expectations',
        paragraphs: [
          'A flat native PDF with clear lines usually moves through detection faster than a skewed scan or a noisy legacy document. Scanned packets tend to need more geometry cleanup because line quality, contrast, and spacing are less predictable. Already-fillable PDFs may still need review too, especially when the embedded field set is incomplete, poorly named, or out of sync with the real operational workflow.',
          'That is why conversion should not be judged by whether the file technically opens in a PDF tool. The better standard is whether the saved template is clean enough to support repeat filling without hidden geometry problems or naming drift.',
        ],
      },
      {
        title: 'A template readiness checklist before you save',
        paragraphs: [
          'Before you save the converted template, confirm that every required field exists, low-confidence detections have been reviewed, dates and checkbox groups are named clearly, and one representative record fills correctly end to end. That checklist is what separates a reusable template from a one-time draft that happens to look finished on screen.',
          'A short checklist is especially important when more than one person will rely on the template later. The goal is not just to make the PDF fillable. It is to make the workflow dependable enough that someone else can reopen the template and trust what happens next.',
        ],
      },
      {
        title: 'When you need a reusable template instead of a one-time conversion',
        paragraphs: [
          'A one-time conversion may be enough if the document will never appear again. Most teams landing on this page do not have that problem. They have a recurring form, packet, or certificate that comes back every week or every month with different data.',
          'That is where the reusable template model wins. It preserves the cleanup work, the naming work, and the mapping work so the next fill starts from a stable baseline instead of another ad hoc conversion. That difference is what keeps this page distinct from lightweight “make this PDF editable” tools or quick-fix blog tutorials.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF convert non-fillable PDFs into fillable forms?',
        answer:
          'Yes. DullyPDF detects likely field regions, then lets you refine and save them as a fillable template.',
      },
      {
        question: 'Do I need to edit the PDF file directly?',
        answer:
          'No. You edit overlay field metadata and geometry in the app, without changing the source PDF layout.',
      },
      {
        question: 'Can I reuse a converted fillable template later?',
        answer:
          'Yes. Saved forms preserve PDF bytes and field metadata so you can reopen and refill without rerunning full setup.',
      },
    ],
    relatedIntentPages: ['pdf-field-detection-tool', 'pdf-to-database-template', 'fill-pdf-from-csv'],
    relatedDocs: ['getting-started', 'detection', 'editor-workflow'],
  },
  {
    key: 'pdf-to-database-template',
    category: 'workflow',
    path: '/pdf-to-database-template',
    navLabel: 'PDF to Database Template',
    heroTitle: 'Map PDF Fields to Database Template Columns',
    heroSummary:
      'Standardize field names, align them to schema headers, and build repeatable PDF-to-database templates for intake operations.',
    seoTitle: 'Free Automatic PDF to Database Template Mapping | DullyPDF',
    seoDescription:
      'Use free automatic PDF mapping to connect detected fields to database headers and build repeatable templates for row-based fill workflows.',
    seoKeywords: [
      'pdf to database template',
      'free pdf to database template',
      'automatic pdf to database mapping',
      'map pdf fields to database columns',
      'pdf schema mapping workflow',
      'pdf to structured data',
      'pdf form to spreadsheet mapping',
      'extract pdf fields to database',
      'pdf field column alignment tool',
    ],
    valuePoints: [
      'Map detected fields to CSV/SQL/XLSX/JSON schema headers.',
      'Use OpenAI rename + mapping for faster standardization.',
      'Keep checkbox groups and option keys aligned to data columns.',
    ],
    proofPoints: [
      'Schema metadata can be persisted for template remap workflows.',
      'Mapping and rename confidence outputs are visible for review.',
      'Works for recurring packets where naming is inconsistent.',
    ],
    articleSections: [
      {
        title: 'What a PDF to database template actually means',
        paragraphs: [
          'A normal fillable PDF can still be a dead end if the field names do not line up with your real data. A PDF to database template is different because it explicitly connects the PDF field set to the column structure you already use in CSV exports, spreadsheets, JSON records, or application data. That mapping step is what turns a PDF from a visual form into a repeatable data-entry workflow.',
          'This matters most when teams are handling the same document type over and over again. If the PDF fields are mapped to a stable schema, one record can fill predictably today and another record can fill predictably next month even after staff changes. The template becomes an operational asset instead of a fragile manual process that depends on whoever happens to know the form best.',
        ],
      },
      {
        title: 'Why rename usually comes before map',
        paragraphs: [
          'Many PDFs start with weak field identifiers such as generic labels, repeated names, or values inherited from older authoring tools. Mapping directly from those names to a database schema can work on simple forms, but it tends to break down on longer packets and checkbox-heavy documents. Rename improves the odds by turning vague field names into clearer template metadata before the mapping pass runs.',
          'DullyPDF supports rename-only, map-only, and combined Rename + Map workflows. In practice, combined workflows are useful when the source document is visually clear but the field names are weak. You get more meaningful names, better schema alignment, and less manual cleanup in the editor afterward.',
        ],
        bullets: [
          'Run map-only when the field names are already clean and descriptive.',
          'Run rename first when the PDF contains generic, duplicated, or inconsistent field names.',
          'Use combined Rename + Map when you want the fastest first-pass setup on recurring forms.',
        ],
      },
      {
        title: 'How to handle checkboxes and structured values',
        paragraphs: [
          'Database mapping gets harder when the source form uses checkbox groups, yes-no pairs, list-style selections, or option-driven logic. Those cases cannot be treated like plain text boxes. They need group keys, option keys, and clear rule types so the fill step knows whether the incoming value should behave like a boolean, enum, presence signal, or multi-select list.',
          'That is why DullyPDF treats checkbox handling as part of the template definition rather than an afterthought. When the checkbox metadata is configured well, mapped fills become much more stable. When it is not, teams end up with half-working templates where the text is right but the selected options drift or fail silently.',
        ],
      },
      {
        title: 'How to maintain a mapped template as your schema changes',
        paragraphs: [
          'A good PDF to database template should survive routine operational changes. New columns appear, naming conventions tighten, and forms get revised. The safest maintenance pattern is to keep the template as the canonical document setup, then reopen it when your schema changes, adjust the field map, test with a representative row, and save the updated version. That keeps history anchored to one known template instead of proliferating near-duplicates.',
          'If a team is supporting multiple recurring forms, the discipline is the same: decide which form is canonical, keep the schema naming conventions tight, and make the smallest possible correction when the business process changes. Consolidation is usually better than cloning lightly different versions for every minor variation.',
        ],
      },
      {
        title: 'When this landing page is the right route versus docs or API Fill',
        paragraphs: [
          'This page should rank for the commercial task of turning a PDF into a mapped template. The Rename + Mapping docs are narrower: they explain the runtime behavior, confidence review, checkbox rules, and operator sequence once you are already inside DullyPDF. API Fill is different again because it assumes the mapped template already exists and the next step is publishing a hosted endpoint, not teaching a person how to align fields to columns.',
          'That separation matters for SEO and for users. Someone searching for a PDF to database template usually needs the workflow shape and the decision criteria first. Someone already implementing the template needs the docs. Someone integrating another system needs the API page. Keeping those routes distinct reduces query overlap and makes the internal-link path clearer.',
        ],
      },
    ],
    faqs: [
      {
        question: 'How is a PDF database template different from a normal fillable PDF?',
        answer:
          'A database template is explicitly mapped to data headers so rows can be filled predictably instead of manually.',
      },
      {
        question: 'Can I map checkboxes to database values?',
        answer:
          'Yes. DullyPDF supports checkbox grouping metadata and rule-based mapping for boolean, enum, and list-style values.',
      },
      {
        question: 'Can I update mappings later?',
        answer:
          'Yes. Saved templates can be reopened, remapped, and retested as your schema evolves.',
      },
    ],
    relatedIntentPages: ['fillable-form-field-name', 'fill-pdf-from-csv', 'pdf-fill-api'],
    relatedDocs: ['rename-mapping', 'getting-started', 'api-fill'],
  },
  {
    key: 'pdf-form-catalog',
    category: 'workflow',
    path: '/pdf-form-catalog',
    navLabel: 'PDF Form Catalog',
    heroTitle: 'Browse a PDF Form Catalog of Official Blank Forms',
    heroSummary:
      'Start from curated public-domain forms instead of rebuilding layouts from scratch. Open blank PDFs in DullyPDF, save them as reusable templates, and connect them to Search & Fill, API Fill, Fill By Link, or signatures.',
    seoTitle: 'PDF Form Catalog of Official Blank Forms | DullyPDF',
    seoDescription:
      'Browse DullyPDF’s PDF form catalog of official blank forms. Open a form in the editor, save it as a template, then map, fill, publish, or sign it.',
    seoKeywords: [
      'pdf form catalog',
      'official blank pdf forms',
      'fillable form catalog',
      'government pdf form library',
      'pdf template library',
      'pre made pdf forms',
      'blank pdf form catalog',
      'public domain pdf forms',
      'fillable pdf template catalog',
      'official form pdf library',
    ],
    valuePoints: [
      'Start from real blank forms that already have a fixed official layout.',
      'Use deep links from the catalog into DullyPDF instead of downloading and reuploading every source PDF manually.',
      'Treat catalog forms like reusable workflow inputs once they are saved, mapped, and validated.',
    ],
    proofPoints: [
      'Catalog entries include form-number/title context, category grouping, page counts, blank PDF assets, and editor-open links.',
      'The catalog is built around public-domain and official-source-style forms that fit repeat operations better than blank document authoring.',
      'After opening a catalog PDF in DullyPDF, the downstream workflow is the same as any other template: detect, rename, map, fill, publish, or sign.',
    ],
    articleSections: [
      {
        title: 'What the DullyPDF form catalog is actually for',
        paragraphs: [
          'The catalog is for teams that already know which document they need. They are not searching for a generic PDF editor. They need an official-looking blank form such as a W-4, W-9, CMS packet, onboarding document, immigration form, or other repeat layout that should stay visually intact while the underlying record changes from run to run.',
          'That makes the catalog a workflow shortcut, not a final workflow by itself. It reduces the setup cost of finding and staging the source PDF, then hands the document into the normal DullyPDF process where the operator can detect fields, review the geometry, map the schema, and save a reusable template.',
        ],
      },
      {
        title: 'What the catalog contains',
        paragraphs: [
          'The catalog is built around blank public-domain and official-source-style PDF forms that fit recurring operations. The strongest fit is government, healthcare, HR, payroll, tax, immigration, veterans, and other regulated or semi-regulated document families where the visual layout is fixed and the data should be applied consistently.',
          'In practice that means the catalog is closer to a source-document library than to a finished template marketplace. It contains the blank PDF foundation for a workflow, not a promise that every form is already mapped to your exact schema or ready for production use without review.',
        ],
        bullets: [
          'Good fit: recurring official forms with stable layouts and changing row data.',
          'Less ideal: ad hoc custom documents, heavy page redesign, or workflows that need custom authoring instead of form reuse.',
        ],
      },
      {
        title: 'What each catalog entry contains',
        paragraphs: [
          'Each entry is meant to answer the practical questions an operator has before opening the document. The useful metadata is not just the title. A strong catalog entry should tell you what the form is, where it belongs, how large it is, and whether it is worth opening in the editor for your specific workflow.',
          'That is why the DullyPDF catalog pairs the PDF asset with form identifiers, category context, page counts, thumbnails, lightweight descriptions, and direct open-in-editor paths. When the official source is known, the catalog can also preserve that provenance so operators can verify the blank document they are starting from.',
        ],
        bullets: [
          'Form number and title for recognition and search.',
          'Category grouping so similar workflows stay clustered together.',
          'Page count, blank PDF asset, and thumbnail preview.',
          'Direct link to open the form inside DullyPDF without a manual reupload step.',
        ],
      },
      {
        title: 'How the catalog fits the actual DullyPDF workflow',
        paragraphs: [
          'Opening a catalog document is the beginning of the workflow, not the end. Once the blank PDF is opened in DullyPDF, the operator still needs to review the detected or embedded fields, fix naming, align the template to the real schema, and run at least one representative fill before treating the template as production-ready.',
          'That distinction matters because it keeps expectations clean. The catalog saves time on source acquisition and document selection. The editor, Search & Fill, API Fill, Fill By Link, and signing surfaces are what turn that blank form into a reliable operational asset.',
        ],
      },
      {
        title: 'What the catalog does not contain',
        paragraphs: [
          'The catalog is not your saved-template workspace, and it is not a legal claim that every form revision is always the right one for your jurisdiction or filing date. It gives you a structured starting point, but the operator still owns validation, mapping quality, and source-version review before shipping a workflow.',
          'That is especially important for official forms that change periodically. If a filing, agency, or partner requires a specific revision, use the catalog metadata as a convenience layer, then confirm the version and test the filled output before relying on it downstream.',
        ],
      },
      {
        title: 'When to use the catalog versus uploading your own PDF',
        paragraphs: [
          'Use the catalog when the source form is already a known recurring document and the cost of locating and staging it manually adds no value. Use upload when your organization has a custom packet, partner-specific layout, or revised internal form that is not represented in the catalog.',
          'That separation keeps the product honest. The catalog accelerates repeat work on widely recognized blank forms. The upload flow stays the better answer for proprietary layouts and one-off documents that only your team controls.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Are catalog forms already mapped to my data?',
        answer:
          'No. The catalog provides the blank source PDF and entry metadata. You still need to review fields, map the schema, and validate one representative fill for your own workflow.',
      },
      {
        question: 'Can I save a catalog form as my own reusable template?',
        answer:
          'Yes. Once opened in DullyPDF, a catalog PDF can be reviewed, saved, and reused like any other template in the workspace.',
      },
      {
        question: 'Does the catalog replace source-version review?',
        answer:
          'No. Treat the catalog as a structured starting point and confirm the required agency or partner revision before depending on it in production.',
      },
    ],
    supportSections: [
      {
        title: 'Browse the live catalog and adjacent routes',
        paragraphs: [
          'Use the links below when you want the actual catalog browser or nearby route pages that already show catalog-backed examples in context.',
        ],
        links: [
          { label: 'Browse Form Catalog', href: '/forms' },
          { label: 'Workflow Library', href: '/workflows' },
          { label: 'Government Form Automation', href: '/government-form-automation' },
          { label: 'HR PDF Automation', href: '/hr-pdf-automation' },
          { label: 'Healthcare PDF Automation', href: '/healthcare-pdf-automation' },
        ],
      },
    ],
    relatedIntentPages: [
      'pdf-to-fillable-form',
      'fill-pdf-from-csv',
      'government-form-automation',
      'hr-pdf-automation',
      'healthcare-pdf-automation',
    ],
    relatedDocs: ['getting-started', 'detection', 'search-fill', 'api-fill'],
  },
  {
    key: 'fill-pdf-from-csv',
    category: 'workflow',
    path: '/fill-pdf-from-csv',
    navLabel: 'Fill PDF From CSV',
    heroTitle: 'Fill PDF From CSV, SQL, Excel, or JSON Data',
    heroSummary:
      'Search your records, pick a row, and fill mapped PDF templates in seconds for repeat data-entry workflows.',
    seoTitle: 'Fill PDF Forms From CSV, SQL, Excel, or JSON — Map Fields in Minutes',
    seoDescription:
      'Upload a PDF and a spreadsheet, map columns to form fields, and batch-fill hundreds of PDFs in one click. Works with CSV, Excel, JSON, and SQL. Free tier available.',
    seoKeywords: [
      'fill pdf from csv',
      'free pdf fill from csv',
      'automatic pdf fill from csv',
      'fill pdf from sql',
      'fill pdf from excel',
      'fill pdf from json',
      'populate pdf from spreadsheet',
      'auto fill pdf from data',
      'pdf mail merge from csv',
      'bulk fill pdf from excel rows',
    ],
    valuePoints: [
      'Load CSV, XLSX, or JSON rows and search records quickly.',
      'Choose contains/equals matching and fill by selected row.',
      'Use clear + refill loops to validate mapping quality before export.',
    ],
    proofPoints: [
      'Search result sets are capped for controlled review workflows.',
      'Parser guardrails handle duplicate headers and schema normalization.',
      'Filled output can be downloaded immediately, saved to profile, or driven from stored Fill By Link respondents.',
    ],
    articleSections: [
      {
        title: 'Why filling PDFs from CSV usually breaks down in manual workflows',
        paragraphs: [
          'The promise sounds simple: take spreadsheet rows and put them into a PDF. In practice, teams usually hit the same problems immediately. Column headers do not match field names, dates are formatted inconsistently, duplicate headers cause ambiguity, checkbox values need interpretation, and operators waste time searching for the right record before they even test the fill.',
          'That is why the spreadsheet itself is only part of the workflow. Reliable PDF fill from CSV depends on a mapped template, predictable field naming, and a controlled record-selection step. Without those pieces, the process turns into another copy-paste task with slightly better tooling around it.',
        ],
      },
      {
        title: 'How Search and Fill works once the template is mapped',
        paragraphs: [
          'DullyPDF treats the PDF template and the row data as two separate layers. First you create or reopen a saved template with a stable field map. Then you load CSV, XLSX, or JSON data and use Search & Fill to locate the right record. The operator chooses a record, fills the document, reviews the result, and can clear and refill again without rebuilding the template.',
          'That structure is important because it gives teams a QA loop instead of a blind batch export. Search is case-insensitive, result sets are capped for controlled review, and the operator can validate the chosen row before the document is downloaded or saved. For many business workflows, that deliberate review step is more useful than a high-volume black-box batch generator.',
        ],
        bullets: [
          'Upload or reopen the mapped PDF template.',
          'Load CSV, XLSX, or JSON row data.',
          'Search for the correct record using contains or equals matching.',
          'Fill the PDF, inspect the result, then clear and refill if needed.',
        ],
      },
      {
        title: 'How to prepare your spreadsheet for better fill accuracy',
        paragraphs: [
          'The fastest wins come from cleaning the schema, not from forcing more keywords into the page. Header names should be stable and descriptive, duplicate columns should be resolved intentionally, and dates or checkbox columns should follow a consistent pattern. DullyPDF normalizes headers and handles duplicate names, but the cleaner the source data is, the less template cleanup you need later.',
          'A practical rule is to test with the row that is most likely to expose edge cases. Pick a record with long names, populated dates, and checkbox values that actually exercise the form. If that record fills cleanly, simpler rows usually follow without surprise.',
        ],
      },
      {
        title: 'Where Fill By Link fits into the same row-based workflow',
        paragraphs: [
          'Not every workflow starts from a local spreadsheet. Some teams need to collect the row data first. DullyPDF Fill By Link supports that by storing respondent submissions as structured records that can be selected later from the same Search & Fill flow. That lets teams mix operational sources: spreadsheet rows for internal exports and stored respondents for externally collected form data.',
          'The important distinction is that the PDF still fills from structured records, not from ad hoc manual typing into the document. Whether the row came from CSV, XLSX, JSON, or a saved respondent submission, the template logic stays the same.',
        ],
      },
      {
        title: 'When to use this page versus Fill By Link or API Fill',
        paragraphs: [
          'This route is the right landing page when a human operator already has row data and needs to search, choose, and validate one record before output. Fill By Link is different because it collects the record from a respondent first. API Fill is different because another system calls a hosted endpoint and the operator is no longer choosing rows in the browser.',
          'Keeping those routes separated makes the query intent clearer. Spreadsheet-driven searches should land here. Respondent collection should land on Fill By Link. System-to-system generation should land on the API page. That helps searchers find the right workflow shape faster and reduces overlap between the main commercial pages.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I fill a PDF directly from CSV rows?',
        answer:
          'Yes. After mapping, select a row in Search & Fill and DullyPDF writes matching values into PDF fields.',
      },
      {
        question: 'Does DullyPDF support Excel and SQL files too?',
        answer:
          'Yes. XLSX is supported alongside CSV and JSON for row-based Search & Fill workflows. SQL files (CREATE TABLE definitions) are supported for schema-only mapping without row data.',
      },
      {
        question: 'What if some fields do not fill correctly?',
        answer:
          'Review mappings and checkbox rules, then run a clear-and-refill verification pass before production output.',
      },
      {
        question: 'Can I use stored Fill By Link submissions in the same workflow?',
        answer:
          'Yes. Owners can publish a Fill By Link from a saved template and then select respondent records from the same Search & Fill flow used for local rows.',
      },
    ],
    relatedIntentPages: ['batch-fill-pdf-forms', 'fill-pdf-by-link', 'pdf-fill-api'],
    relatedDocs: ['search-fill', 'rename-mapping', 'fill-by-link'],
  },
  {
    key: 'fill-pdf-by-link',
    category: 'workflow',
    path: '/fill-pdf-by-link',
    navLabel: 'Fill PDF By Link',
    heroTitle: 'Collect PDF Answers With Native Fill By Link',
    heroSummary:
      'Start from a saved DullyPDF template, publish a mobile-friendly form link, collect respondent answers, and either let respondents download their submitted copy after submit or generate the filled PDF later in the workspace.',
    seoTitle: 'Free Automatic PDF Fill By Link and Web Forms | DullyPDF',
    seoDescription:
      'Use free automatic Fill By Link workflows to send web forms, collect respondent answers, and fill mapped PDFs later in DullyPDF.',
    seoKeywords: [
      'fill pdf by link',
      'free fill pdf by link',
      'automatic pdf web form fill',
      'shareable pdf form link',
      'pdf form respondent link',
      'collect pdf form responses',
      'html form to fill pdf',
      'send pdf form to fill online',
      'client intake form link',
      'online form to pdf converter',
      'web form that generates pdf',
    ],
    valuePoints: [
      'Publish a DullyPDF-hosted HTML form from any saved template.',
      'Store respondent answers as structured records under the template owner account.',
      'Optionally let template respondents download their submitted PDF copy on the success screen.',
      'Pick a respondent later in the workspace and fill the source PDF on demand.',
    ],
    proofPoints: [
      'Base includes monthly Fill By Link collection with 25 accepted responses across the account.',
      'Premium unlocks high-volume Fill By Link collection with up to 10,000 accepted responses per month across the account.',
      'Respondent records can be reused through the same Search & Fill workflow before download.',
    ],
    articleSections: [
      {
        title: 'Why collecting answers by link is different from sending a PDF',
        paragraphs: [
          'Many teams do not actually want respondents opening and editing a PDF on a phone. They want the information collected in a simpler web form, then they want the final PDF generated later in a controlled owner workflow. That distinction matters because it separates data collection from document generation.',
          'DullyPDF Fill By Link is built around that separation. The respondent submits answers through a mobile-friendly HTML form, while the owner keeps the saved template, stored responses, and final PDF generation workflow inside the workspace. That usually creates a cleaner process than emailing PDFs back and forth or relying on manual re-entry after someone submits a form.',
        ],
      },
      {
        title: 'How the owner workflow works in DullyPDF',
        paragraphs: [
          'The workflow starts from a saved template or saved-form group. The owner publishes a link, configures the respondent-facing form, collects responses, and then reviews those records later in the workspace. At that point the owner can choose a respondent, run the fill step, and generate the final PDF on demand.',
          'This is useful because the template remains the canonical source of truth. You do not lose control over field mapping, document versioning, or output QA just because the data arrived through a link. The same mapped template still drives the finished PDF.',
        ],
        bullets: [
          'Publish from a saved template or saved-form group.',
          'Collect structured responses through a mobile-friendly form.',
          'Review the saved responses in the workspace before generating the PDF.',
        ],
      },
      {
        title: 'When Fill By Link is a better fit than direct spreadsheet filling',
        paragraphs: [
          'If you already have the data in CSV, XLSX, or JSON, Search & Fill is usually the fastest route. Fill By Link becomes more valuable when the row data does not exist yet or when respondents need to provide it themselves. Intake forms, applicant workflows, patient questionnaires, and client-submitted requests are the natural fit.',
          'The key advantage is that you still end up with structured records that can flow into the same template logic used for local rows. It is not a separate system with a separate document model. It is another way to source the row data that the PDF template needs.',
        ],
      },
      {
        title: 'How Fill By Link differs from Search and Fill and from signature workflows',
        paragraphs: [
          'Search & Fill assumes the operator already has the row and wants to choose it inside the workspace. Fill By Link assumes the row does not exist yet and needs to be collected from a respondent first. Signature workflows are a third step entirely: they matter after the record is complete and a final immutable PDF is ready to be reviewed and signed.',
          'That progression is useful operationally. Data collection belongs here, row selection belongs in Search & Fill, and final signer action belongs in the signing routes. Treating those as separate pages reduces product confusion and lets each route answer a narrower search intent more clearly.',
        ],
      },
      {
        title: 'How to handle corrections, edits, and resubmission requests',
        paragraphs: [
          'Respondent collection rarely ends after the first submit. People mistype values, skip optional details, or need to update information after the owner reviews the response. The safest operating pattern is to treat the stored response as the review object, decide whether the response is usable, and only then materialize the final PDF. That keeps bad submissions from becoming premature output files.',
          'When corrections are common, the owner workflow matters more than the public form itself. Teams need a clear process for deciding whether to ask for another submission, edit the template, or simply select a corrected record before generating the document. Fill By Link works best when that review step is intentional instead of implied.',
        ],
      },
      {
        title: 'Why owner review should happen before the final PDF exists',
        paragraphs: [
          'A stored response is not yet the final document. It is the structured record that can drive the final document. That distinction helps teams catch missing values, confirm respondent identity or context, and decide whether the active template or group is still the right one before they generate the PDF.',
          'The operational win is control. Owners can inspect the submission, route it into Search & Fill, and generate the output only when the document is actually needed. That is usually safer than creating PDFs automatically for every submission regardless of quality.',
        ],
      },
      {
        title: 'When Fill By Link is better than sending a PDF or jumping straight to e-sign',
        paragraphs: [
          'Use Fill By Link when the main need is data collection from a respondent who should not be editing the actual PDF directly. Use a direct PDF workflow when the operator already has the data and only needs to materialize the file. Use the signature workflow after the record is complete and the final immutable version is ready for signer review.',
          'That sequence keeps the product model coherent. Fill By Link collects the row, Search & Fill materializes the row into the template, and signature routes only start after the record is finalized. Trying to collapse those stages too early usually creates weaker operational controls and weaker SEO separation between the routes.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Does the respondent fill the actual PDF?',
        answer:
          'No. The respondent fills a DullyPDF-hosted mobile-friendly HTML form. Template links can optionally expose a post-submit PDF download, but the owner still manages the saved response and final workflow in the workspace.',
      },
      {
        question: 'How many Fill By Link responses are allowed on free and premium?',
        answer:
          'Base includes 25 accepted Fill By Link responses per month across the account. Premium supports up to 10,000 accepted responses per month across the account.',
      },
      {
        question: 'Can I publish one link for every template?',
        answer:
          'Premium users can publish a shareable link for every saved template they keep in DullyPDF. Free users are limited to 1 active published link at a time.',
      },
    ],
    relatedIntentPages: ['fill-pdf-from-csv', 'pdf-signature-workflow', 'fill-information-in-pdf'],
    relatedDocs: ['fill-by-link', 'search-fill', 'signature-workflow'],
  },
  {
    key: 'pdf-signature-workflow',
    category: 'workflow',
    path: '/pdf-signature-workflow',
    navLabel: 'PDF Signature Workflow',
    heroTitle: 'Detailed PDF Signature Workflow for Email and Web-Form-to-Sign Pipelines',
    heroSummary:
      'DullyPDF keeps two signing entry paths split on purpose: send a final PDF directly by email, or collect answers through a hosted web form first and then freeze that exact filled PDF before signature. Both routes converge on one immutable-record signing engine with owner-visible artifacts.',
    seoTitle: 'Send a PDF for E-Signature by Email or Web Form',
    seoDescription:
      'Two ways to collect signatures: email a final PDF directly, or collect answers through a web form first, then freeze and sign. Full audit trail and immutable record included.',
    seoKeywords: [
      'send pdf for signature by email',
      'electronic signature workflow',
      'pdf signature workflow',
      'esign pdf by email',
      'web form to signed pdf',
      'collect information then sign pdf',
      'fillable web form with signature',
      'pdf signing audit trail',
      'us electronic signature workflow',
      'immutable pdf signing process',
      'email signature request workflow',
      'fill by web form then sign pdf',
      'supported esign documents',
    ],
    valuePoints: [
      'Run one PDF signing stack for two operational starts: direct email send or web-form-first intake.',
      'Freeze one immutable PDF before the signer reviews, adopts a signature, and finishes the request.',
      'Keep the owner artifact chain together: immutable source PDF, signed PDF, audit receipt, and request history.',
      'Support ordinary U.S. business records without marketing the platform as a catch-all solution for excluded or heavily regulated document classes.',
      'Explain what DullyPDF controls in the workflow and what the sender or business still must control outside the product.',
    ],
    proofPoints: [
      'The workflow is designed around 15 U.S.C. § 7001(a), (b), (c), and (d)[^esign-7001], plus UETA §§ 7, 8, 9, and 12[^ueta], by centering signer action on one exact retained record instead of a detached scribble layer.',
      'Consumer-facing requests add a separate disclosure, access-demonstration, and consent step before signing because 15 U.S.C. § 7001(c)(1)(A)-(C) imposes extra conditions for consumer electronic records.[^esign-7001]',
      'Manual fallback remains available because 15 U.S.C. § 7001(b)(2) does not require a person to agree to electronic records or signatures.[^esign-7001]',
      'Excluded categories under 15 U.S.C. § 7003[^esign-7003] and state-specific recording or notarization programs under 9 NYCRR Part 540[^ny-esra] and N.Y. Real Prop. Law § 291-i[^ny-rpl-291i] are intentionally kept out of the ordinary self-serve workflow story.',
      'The platform produces retained artifacts, but the business still owns transaction classification, sector-specific disclosure duties, signatory authority, and legal review for specialized programs.',
    ],
    articleSections: [
      {
        title: 'Why a real PDF signature workflow is more than drawing a name on a page',
        paragraphs: [
          'Teams looking for a PDF signature workflow usually do not need a decorative image tool. They need a process that can answer practical business questions later: What exact PDF was reviewed? Which signer session completed the request? Was the signer presented with the final record before completion? What artifacts can the owner retrieve after the fact? A page overlay by itself does not answer those questions.',
          'DullyPDF therefore treats signing as the last stage of a record workflow, not as a floating annotation step. The signer enters a dedicated ceremony, reviews the exact PDF that will be signed, adopts a signature inside that ceremony, and completes an explicit finish action. The resulting signed artifacts remain tied to the request and visible to the owner in the workspace rather than disappearing into a one-time browser event.',
        ],
      },
      {
        title: 'Direct email-to-sign pipeline step by step',
        paragraphs: [
          'The first route is the straightforward one: the owner already has the exact PDF that should be signed. In that case the workflow is current PDF -> materialized immutable snapshot -> signer request -> public signing ceremony -> signed artifact retrieval. The key control is that the owner is not emailing a mutable workspace object or relying on the recipient to sign whatever happens to be open in the editor later. DullyPDF freezes the source record before send.',
          'Once the immutable snapshot is created, the signer is invited into the public ceremony, not a generic download link. Business-mode requests move through review, adopt-signature, and finish-sign. Consumer-mode requests add the extra disclosure and access-check stage before signature because the legal standard is different when a consumer must consent to receiving required information electronically.[^esign-7001] The owner retains the request, the immutable source PDF, the final signed PDF, and the audit receipt in one place after completion.',
        ],
        bullets: [
          'Owner finalizes the current PDF in the workspace.',
          'DullyPDF materializes and stores one immutable source PDF for the request.',
          'The signer receives an email invitation into the bound public signing ceremony.',
          'The signer reviews the retained PDF, adopts a signature, and explicitly completes the request.',
          'The owner can later retrieve the signed PDF and audit receipt from the workspace.',
        ],
      },
      {
        title: 'Fill By Web Form to sign pipeline step by step',
        paragraphs: [
          'The second route starts with data collection, not with a final PDF. Here the public respondent first completes a DullyPDF-hosted HTML form. The response is stored. If the owner enabled required signature after submit, DullyPDF uses that stored response to materialize the filled PDF server-side and only then routes the signer into the same signing engine used for direct email sends. The signer is not signing an abstract set of web-form answers. The signer is signing one final PDF generated from the stored response.',
          'That distinction matters operationally and legally. It lets the owner prove which record moved from intake into signature, and it prevents drift between the collected answers and the PDF presented for signature. The respondent-side form can still be mobile-friendly and easier to complete than a raw PDF, but the signature event stays attached to one retained PDF output instead of a free-floating form session.',
        ],
        bullets: [
          'Public respondent answers are stored before signing begins.',
          'DullyPDF server-side materializes the exact filled PDF from the stored response.',
          'The signer receives an emailed signing request for that exact filled record.',
          'Signing completion remains visible from the linked Fill By Link response row in the owner workspace.',
        ],
      },
      {
        title: 'What the signer actually sees and why that matters',
        paragraphs: [
          'The signer does not drop a signature on a mutable editor view. The signer sees the exact PDF that has already been frozen for that request. For business-mode flows, the sequence is review -> adopt signature -> finish sign. For consumer-mode flows, the signer also gets the disclosure and access-check sequence first. That keeps the act of signing logically tied to the same retained record the owner will later rely on.',
          'This is the part of the workflow that makes the product more than a signature stamp utility. The signer experience is built to show one exact record, require a deliberate action, and produce a result that can be re-opened later by the owner. That is the useful operational outcome when a company needs signed service paperwork, acknowledgments, authorizations, intake packets, or receipt-style confirmations to stay available after the browser session is gone.',
        ],
      },
      {
        title: 'How the workflow maps to the U.S. e-sign rules that matter most in practice',
        paragraphs: [
          'For supported records, the workflow is designed around the main federal and uniform-law rules that operational teams actually need to understand. Under 15 U.S.C. § 7001(a)(1)-(2), a signature, contract, or record generally cannot be denied legal effect solely because it is electronic.[^esign-7001] UETA § 7 carries the same legal-recognition principle.[^ueta] DullyPDF supports that model by attaching the signer ceremony to one immutable PDF instead of letting the signature act drift away from the retained record.',
          '15 U.S.C. § 7001(b)(2) also matters because it says a person is not required to agree to use or accept electronic records or signatures.[^esign-7001] That is why the workflow still exposes manual fallback rather than presenting electronic signing as the only permissible option. And when the transaction is consumer-facing, 15 U.S.C. § 7001(c)(1)(A)-(C) matters because it requires affirmative consent, advance disclosures, and an access demonstration.[^esign-7001] DullyPDF therefore adds a separate consumer consent layer before signature completion in that mode.',
          'For retention, 15 U.S.C. § 7001(d)(1) and UETA § 12 matter because the retained record must remain accurate and accessible later.[^esign-7001][^ueta] That is why the workflow is built around the immutable source PDF, the final signed PDF, and a tied audit receipt rather than a transient event log alone. The product design choice is straightforward: preserve the record that was signed and preserve the owner retrieval path afterward.',
        ],
        bullets: [
          '15 U.S.C. § 7001(a)(1)-(2): electronic records and signatures are not denied effect solely because they are electronic.[^esign-7001]',
          '15 U.S.C. § 7001(b)(2): the product keeps manual fallback because electronic signing cannot simply be forced on every signer.[^esign-7001]',
          '15 U.S.C. § 7001(c)(1)(A)-(C): consumer requests require disclosure, consent, and access demonstration.[^esign-7001]',
          '15 U.S.C. § 7001(d)(1) and UETA § 12: retained records must stay accurate and accessible later.[^esign-7001][^ueta]',
          'UETA § 9 and 9 NYCRR 540.4(b): the process is designed so the signature remains logically associated with the PDF record.[^ueta][^ny-esra]',
        ],
      },
      {
        title: 'Supported document classes that fit DullyPDF well today',
        paragraphs: [
          'The best fit is ordinary U.S. business records where one signer should review one exact PDF and the owner needs the finished artifacts back in the same workspace. That includes service agreements, vendor acknowledgments, engagement letters, proposal acceptances, change-order acceptances, delivery receipts, work-order signoffs, equipment receipts, inspection acknowledgments, and similar records where the business benefit comes from a clear retained PDF and a recoverable signature trail.',
          'The workflow also fits many intake and authorization patterns. Examples include client or patient intake packets when the organization already handles any separate sector-specific disclosure duties outside the signing platform, routine authorization or consent forms, handbook acknowledgments, policy acknowledgments, volunteer releases, and internal onboarding packets. What matters is not the label alone. What matters is whether the organization needs a frozen PDF, a signer ceremony, and retained artifacts rather than a complex regulated delivery platform.',
        ],
        bullets: [
          'Good fit: service agreements, statements of work, engagement letters, and routine acceptance forms.',
          'Good fit: acknowledgments, receipts, field-service signoffs, delivery confirmations, and inspection records.',
          'Good fit: internal HR acknowledgments, equipment receipts, policy acknowledgments, and onboarding packets.',
          'Good fit: intake, consent, and authorization packets when the business separately owns any sector-specific disclosure obligations.',
          'Best fit pattern: one signer per request, one final PDF to review, and one retained artifact chain after completion.',
        ],
      },
      {
        title: 'Document classes that should stay out of the ordinary self-serve workflow',
        paragraphs: [
          'The workflow should not be marketed as suitable for every document that can physically hold a signature. 15 U.S.C. § 7003 excludes or carves out important categories, including wills and testamentary trusts, adoption and divorce matters or other family-law matters, court orders and notices, official court documents, cancellation or termination of utility services, default or acceleration or repossession or foreclosure notices for a primary residence, cancellation or termination of health or life insurance benefits, product recall or material-failure safety notices, and hazardous-material transport documentation.[^esign-7003]',
          '15 U.S.C. § 7003 also excludes the Uniform Commercial Code other than sections 1-107 and 1-206 and Articles 2 and 2A.[^esign-7003] In practical product terms, that means DullyPDF should not present the ordinary self-serve signing workflow as the compliance answer for negotiable instruments, bank collection items, funds transfers, letters of credit, documents of title, investment securities, or secured transaction records simply because they can be rendered as a PDF. Those areas need their own legal analysis and often their own specialized operational controls.',
          'Notarization, acknowledgment, witness, or filing regimes are another separate category. 15 U.S.C. § 7001(g) addresses notarization and acknowledgment requirements,[^esign-7001] and New York adds specific real-property recording rules in 9 NYCRR Part 540 and N.Y. Real Prop. Law § 291-i.[^ny-esra][^ny-rpl-291i] DullyPDF can support ordinary signing workflows, but it is not a blanket replacement for remote online notarization, county recording systems, or witness-managed execution programs.',
        ],
        bullets: [
          'Keep out: wills, codicils, and testamentary trust instruments under 15 U.S.C. § 7003(a)(1).[^esign-7003]',
          'Keep out: adoption, divorce, and other family-law records under 15 U.S.C. § 7003(a)(2).[^esign-7003]',
          'Keep out: court orders, pleadings, official notices, and service-bound court records under 15 U.S.C. § 7003(a)(2).[^esign-7003]',
          'Keep out: primary-residence foreclosure, eviction, utility shutoff, certain insurance cancellation, and safety or hazmat notices under 15 U.S.C. § 7003(b).[^esign-7003]',
          'Separate review required: excluded UCC records outside sections 1-107, 1-206, and Articles 2 and 2A under 15 U.S.C. § 7003(a)(3).[^esign-7003]',
          'Separate program required: notarized, acknowledged, witnessed, or recorded instruments.',
        ],
      },
      {
        title: 'What owners actually keep after signing is finished',
        paragraphs: [
          'A signature workflow is only useful if the owner can retrieve the finished artifacts later without depending on the signer to forward them back. DullyPDF stores the immutable source PDF, the final signed PDF, and a human-readable audit receipt tied to the request. For web-form-driven signature requests, the Fill By Web Form responses view also surfaces the linked signing status so the owner can see whether the response is waiting, signed, expired, revoked, or manually rerouted and can download the completed signed copy directly from that response row.',
          'That owner-visible artifact chain is what turns the workflow into repeatable operations instead of a one-time send-and-hope process. The signer can still download their completed copy, but the record does not disappear into the respondent side of the experience. The owner keeps the final artifacts in the same workspace that created the template, the intake form, or the signing request in the first place.',
        ],
      },
      {
        title: 'What DullyPDF controls and what your business still must control',
        paragraphs: [
          'DullyPDF controls the mechanics of the supported signing workflow: immutable-PDF generation, public signer session flow, review and sign sequence, consumer consent ceremony for consumer-mode requests, retained signed artifacts, and owner retrieval inside the workspace. That is the product boundary. It is a meaningful boundary, but it is not the whole compliance universe for every document or industry.',
          'The sender or business still owns transaction classification, whether the record belongs in a supported category, whether separate industry rules apply, whether the signer has authority and capacity to sign, whether witness or notary steps are required, whether additional identity proofing is needed, how paper copies and withdrawal requests are fulfilled operationally, and whether the retention period is sufficient for the governing legal regime. Those are not defects in the product. They are responsibilities that sit outside the workflow engine itself.',
          'That is the right way to position the platform publicly. DullyPDF supports a detailed, retained, ordinary-business PDF signing workflow. It does not promise that every PDF with a signature line becomes compliant just because it moves through an electronic ceremony.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF send a PDF for signature by email without using a web form first?',
        answer:
          'Yes. The direct signing path starts from the current PDF, freezes that exact document into an immutable source record, and then emails the signer into the public signing ceremony.',
      },
      {
        question: 'Can DullyPDF collect answers through a web form and then send the same filled PDF into signing?',
        answer:
          'Yes. Template web forms can require signature after submit, which stores the answers, materializes the exact filled PDF from that saved response, and then sends that same retained record into the signing flow.',
      },
      {
        question: 'What U.S. legal standards does this workflow target?',
        answer:
          'It is designed around the main rules that matter for supported ordinary-business e-sign workflows, including 15 U.S.C. § 7001(a), (b), (c), and (d), UETA §§ 7, 8, 9, and 12, and New York ESRA concepts in 9 NYCRR Part 540 for logical association and record handling.[^esign-7001][^ueta][^ny-esra]',
      },
      {
        question: 'Does DullyPDF force every signer to use electronic signing?',
        answer:
          'No. The workflow keeps a manual fallback path because 15 U.S.C. § 7001(b)(2) does not require a person to agree to use or accept electronic records or signatures.[^esign-7001]',
      },
      {
        question: 'Which documents are the best fit for this workflow?',
        answer:
          'The best fit is ordinary business records such as service agreements, acknowledgments, receipts, work-order signoffs, intake packets, routine authorization forms, and internal employment acknowledgments where one signer should act on one final PDF and the owner needs retained artifacts afterward.',
      },
      {
        question: 'Which documents should stay out of the ordinary self-serve flow?',
        answer:
          'Wills, family-law matters, court documents, certain foreclosure, utility, insurance, safety, or hazardous-material notices, excluded UCC records, and notarized or recorded instruments should stay blocked or go through separate legal review and specialized programs.[^esign-7003][^ny-esra][^ny-rpl-291i]',
      },
      {
        question: 'Does DullyPDF itself decide whether a document is legally allowed to use e-signature?',
        answer:
          'No. DullyPDF enforces supported workflow controls, but the sender or business still must classify the transaction correctly, decide whether a document belongs in a supported category, and account for any industry-specific rules, notary requirements, witness requirements, or retention obligations.',
      },
    ],
    footnotes: [
      { id: 'esign-7001', label: '15 U.S.C. § 7001 | General rule of validity and related provisions', href: 'https://www.law.cornell.edu/uscode/text/15/7001' },
      { id: 'esign-7003', label: '15 U.S.C. § 7003 | Federal exclusions and exceptions', href: 'https://www.law.cornell.edu/uscode/text/15/7003' },
      // The ULC's per-document URL (viewdocument/enactment-kit-17?CommunityKey=…)
      // 403s to crawlers and the CommunityKey query string is intrinsically
      // brittle. Wikipedia's UETA article is editorially stable and itself
      // cites the official ULC source.
      { id: 'ueta', label: 'Uniform Electronic Transactions Act | overview and authoritative sources', href: 'https://en.wikipedia.org/wiki/Uniform_Electronic_Transactions_Act' },
      { id: 'ny-esra', label: '9 NYCRR Part 540 | New York ESRA regulation', href: 'https://its.ny.gov/electronic-signatures-and-records-act-esra-regulation' },
      { id: 'ny-rpl-291i', label: 'N.Y. Real Prop. Law § 291-i | Electronic recording', href: 'https://www.nysenate.gov/legislation/laws/RPP/291-I' },
    ],
    relatedIntentPages: ['esign-ueta-pdf-workflow', 'fill-pdf-by-link', 'pdf-fill-api'],
    relatedDocs: ['signature-workflow', 'fill-by-link'],
  },
  {
    key: 'esign-ueta-pdf-workflow',
    category: 'workflow',
    path: '/esign-ueta-pdf-workflow',
    navLabel: 'E-SIGN / UETA PDF Workflow',
    heroTitle: 'Detailed U.S. E-SIGN and UETA Workflow for Supported Records',
    heroSummary:
      'This page is the legal-scope companion to the workflow page. It maps the DullyPDF signing pipeline to 15 U.S.C. §§ 7001-7003, UETA §§ 5, 7, 8, 9, and 12, New York ESRA rules in 9 NYCRR Part 540, and the categories that should remain outside ordinary self-serve signing.',
    seoTitle: 'US E-SIGN Act and UETA Compliance for PDF Signatures',
    seoDescription:
      'How PDF e-signatures align with 15 U.S.C. §§ 7001-7003 and UETA: consumer consent, immutable record freeze, retention, audit artifacts, and which document categories are excluded.',
    seoKeywords: [
      'esign pdf workflow',
      'ueta electronic signature workflow',
      'esign act pdf signature workflow',
      'electronic signature compliance workflow',
      'consumer consent electronic records pdf',
      'immutable pdf signing workflow',
      'pdf signature retention audit trail',
      '15 usc 7001 electronic signature workflow',
      '15 usc 7003 excluded electronic signature documents',
      'ueta section 9 attribution electronic signature',
      '15 usc 7001 c consumer consent',
      '9 nycrr part 540 electronic signatures',
      'real property law 291-i electronic recording',
    ],
    valuePoints: [
      'Map the actual DullyPDF signing behavior to the federal and uniform-law provisions most relevant to supported e-sign workflows.',
      'Separate supported ordinary-business records from excluded categories, state-recording programs, notarization flows, and specialized regulated-delivery regimes.',
      'Explain which controls live in the product and which remain the sender’s or business’s responsibility.',
      'Give legal-intent searchers a detailed page grounded in statutory sections and operational boundaries rather than vague “fully compliant” marketing.',
    ],
    proofPoints: [
      '15 U.S.C. § 7001(a)(1)-(2), UETA § 7, and UETA § 8 support the core recognition and writing-equivalence model behind the immutable-PDF ceremony.[^esign-7001][^ueta]',
      '15 U.S.C. § 7001(c)(1)(A)-(C) drives the consumer disclosure, consent, and access-demonstration flow in consumer-mode requests.[^esign-7001]',
      '15 U.S.C. § 7001(d)(1), 15 U.S.C. § 7001(e), and UETA § 12 drive the retention and reproducibility model for immutable source PDFs, signed PDFs, and audit artifacts.[^esign-7001][^ueta]',
      '15 U.S.C. § 7003 and 9 NYCRR Part 540 show why excluded records, recording programs, notarization flows, and specialized regulated documents should not be folded into the ordinary self-serve promise.[^esign-7003][^ny-esra]',
      '15 U.S.C. § 7001(b)(1) preserves other substantive duties, which is why sector-specific regimes such as 12 CFR § 1006.42, 29 CFR § 2520.104b-1, and 21 CFR Part 11 are not absorbed automatically by a general PDF signing workflow.[^esign-7001][^regf-1006-42][^erisa-2520-104b-1][^cfr-21-part-11]',
    ],
    articleSections: [
      {
        title: 'What this page covers and what it does not claim',
        paragraphs: [
          'This page explains how the DullyPDF signing pipeline is designed around the core U.S. rules that matter for supported electronic signature workflows.[^esign-7001][^ueta] It is not a substitute for legal advice, and it is not a promise that every document or industry program becomes compliant simply because a PDF can move through an electronic ceremony. The page is intentionally narrower than that.',
          'The right public claim is that DullyPDF supports an immutable-record PDF signing workflow designed around E-SIGN, UETA, and certain state-law concepts for supported records.[^esign-7001][^ueta][^ny-esra] The wrong claim is that DullyPDF is the compliance answer for every document, every state filing system, every notarization regime, every regulated consumer disclosure program, or every industry that has its own electronic-record requirements beyond E-SIGN.',
        ],
      },
      {
        title: 'The transaction model: two intake paths, one immutable record',
        paragraphs: [
          'DullyPDF supports two operational starts. The first is direct email-first signing, where the owner already has the final PDF. The second is Fill By Web Form to sign, where the public respondent answers a hosted HTML form first and the system materializes the final PDF from that stored response before signature. In either case the signing ceremony begins only after one immutable PDF exists for the request.',
          'That model matters because both E-SIGN and UETA are concerned with records, not just visible marks. The product therefore orients the workflow around the record that will be retained later. The signer is asked to review and act on that one record. The owner later retrieves that same record set from the workspace. That is the core architectural point behind the statutory mapping that follows.',
        ],
        bullets: [
          'Email-first path: current PDF -> immutable snapshot -> signer email -> ceremony -> artifacts.',
          'Web-form-to-sign path: stored response -> materialized filled PDF -> signer email -> same ceremony -> artifacts.',
          'One request always resolves to one retained immutable source PDF before signature completion.',
        ],
      },
      {
        title: '15 U.S.C. § 7001(a), § 7001(b), UETA § 7, and UETA § 8: legal recognition, writing, and consent to transact electronically',
        paragraphs: [
          '15 U.S.C. § 7001(a)(1)-(2) is the federal starting point: a signature, contract, or record generally may not be denied legal effect solely because it is electronic.[^esign-7001] UETA § 7 expresses the same recognition rule in the uniform-state-law model.[^ueta] UETA § 8 addresses when a legal requirement for a writing is satisfied by an electronic record.[^ueta] DullyPDF is aligned to that model by producing one retained electronic PDF record and collecting the signature act inside a ceremony logically associated with that record.',
          '15 U.S.C. § 7001(b)(1) is equally important because it says E-SIGN does not wipe away other substantive obligations.[^esign-7001] If some other law imposes content, timing, delivery, disclosure, or retention duties, those duties still exist. 15 U.S.C. § 7001(b)(2) also matters because no person is required to agree to electronic records or signatures.[^esign-7001] DullyPDF respects that by keeping manual fallback available rather than assuming an electronic ceremony is mandatory for every signer or every document.',
          'UETA § 5 also matters conceptually because UETA generally applies when the parties have agreed to conduct transactions by electronic means.[^ueta] In product terms, that is why DullyPDF positions the signing flow as a supported workflow choice for appropriate records rather than a magic layer that can be dropped onto every possible document. The product can control the ceremony mechanics. It cannot force the legal appropriateness of electronic execution for a transaction the business should not have routed electronically in the first place.',
        ],
        bullets: [
          '15 U.S.C. § 7001(a)(1)-(2): electronic form alone does not defeat validity.[^esign-7001]',
          '15 U.S.C. § 7001(b)(1): E-SIGN preserves other legal duties besides the paper-or-signature form requirement.[^esign-7001]',
          '15 U.S.C. § 7001(b)(2): the signer cannot simply be forced to accept electronic records.[^esign-7001]',
          'UETA § 7: legal recognition of electronic records and signatures.[^ueta]',
          'UETA § 8: writing requirements can be met by electronic records.[^ueta]',
          'UETA § 5: the transaction still has to be one the parties agreed to conduct electronically.[^ueta]',
        ],
      },
      {
        title: '15 U.S.C. § 7001(c)(1)(A)-(C): consumer disclosure, consent, and access demonstration',
        paragraphs: [
          'The biggest legal difference between ordinary business requests and consumer electronic records appears in 15 U.S.C. § 7001(c)(1)(A)-(C).[^esign-7001] When a law requires information to be provided to a consumer in writing, the sender needs affirmative consent, prior disclosures, and an electronic consent or confirmation process that reasonably demonstrates the consumer can access the form of electronic record that will actually be used. That is why DullyPDF splits business-mode and consumer-mode ceremony behavior instead of pretending every request can use the same short path.',
          'In consumer mode, DullyPDF stores a server-defined disclosure package, requires a distinct consent step, presents hardware and software expectations, supports withdrawal before completion, and requires an access demonstration tied to the format used in the ceremony. That is the product translation of 15 U.S.C. § 7001(c)(1)(B)(i)-(iv) and § 7001(c)(1)(C)(ii).[^esign-7001] The point is not to decorate the page with legal citations. The point is to show why the ceremony is actually different when consumer electronic-record consent rules apply.',
          'The business still must ensure the disclosure text is appropriate for its use case and that operational promises are real. If the disclosure says the consumer can request paper copies, withdraw consent, or update contact information, the business needs the support process to honor those commitments. Product controls help, but they do not replace internal operations or legal review of the disclosure language.',
        ],
        bullets: [
          '15 U.S.C. § 7001(c)(1)(A): affirmative consent is required.[^esign-7001]',
          '15 U.S.C. § 7001(c)(1)(B)(i)-(iv): disclosures must cover paper copies, withdrawal, scope, and hardware/software requirements.[^esign-7001]',
          '15 U.S.C. § 7001(c)(1)(C)(ii): consent must reasonably demonstrate access to the electronic form used.[^esign-7001]',
          'DullyPDF consumer mode exists because consumer-record consent is not the same problem as ordinary business signing.',
        ],
      },
      {
        title: '15 U.S.C. § 7001(d), § 7001(e), and UETA § 12: retention, accuracy, and later accessibility',
        paragraphs: [
          'A signature workflow is not complete once the browser says “done.” 15 U.S.C. § 7001(d)(1) requires retained electronic records to accurately reflect the information in the contract or other record and remain accessible for later reference.[^esign-7001] 15 U.S.C. § 7001(e) deals with accuracy and the ability to retain records.[^esign-7001] UETA § 12 likewise recognizes electronic records for retention purposes if the information remains accessible for later reference.[^ueta] That is why DullyPDF stores the immutable source PDF, the final signed PDF, and the audit artifacts together.',
          'This is also why retention is not just a marketing afterthought. The platform can preserve records and make them retrievable, but the business must still decide whether the configured retention period is enough for the governing legal regime. Seven years may be reasonable for many ordinary business cases. It is not a universal answer for every statute, every claim period, every regulator, or every industry recordkeeping duty.',
          'The right public promise is therefore specific: DullyPDF is built to retain reproducible signed artifacts for supported workflows. The wrong promise is that retention is “handled forever” or that the platform automatically satisfies every sector-specific retention requirement without regard to the governing law of the underlying transaction.',
        ],
      },
      {
        title: 'UETA § 9 and 9 NYCRR 540.4: attribution and logical association',
        paragraphs: [
          'UETA § 9 focuses on attribution and the effect of electronic records and signatures when they are attributable to a person.[^ueta] 9 NYCRR 540.4(b) similarly describes an electronic signature as an electronic sound, symbol, or process attached to or logically associated with an electronic record and executed or adopted with intent to sign.[^ny-esra] The important implementation point is that attribution is evaluated from the act and surrounding circumstances, not from a bare image pasted onto a page.',
          'DullyPDF therefore builds the ceremony around signer actions and request state, not around a visual mark alone. The signer enters a specific request, reviews a specific immutable PDF, adopts a signature inside the same process, and completes the request inside the same session boundary. That design is materially stronger than a generic “draw anywhere on a PDF” flow when later questions arise about what record was signed and how the act was associated with that record.',
          'That still does not mean every identity problem is solved by the platform. Email OTP and session controls help with the supported product scope. Higher-assurance identity proofing, witness-managed execution, or external credential requirements can still call for separate controls or separate providers depending on the transaction type.',
        ],
      },
      {
        title: '15 U.S.C. § 7001(g), 9 NYCRR Part 540, and N.Y. Real Prop. Law § 291-i: notarization, acknowledgment, and recording are separate programs',
        paragraphs: [
          '15 U.S.C. § 7001(g) states that if another law requires a signature or record to be notarized, acknowledged, verified, or made under oath, that requirement is satisfied only if the authorized person’s electronic signature and the other required information are attached to or logically associated with the record.[^esign-7001] That is not the same thing as an ordinary signer ceremony. It is a reminder that notarization and acknowledgment bring their own role-specific requirements.',
          'New York illustrates the point clearly. 9 NYCRR Part 540 gives electronic signatures and records legal force in many settings and establishes standards for how signatures and records are handled.[^ny-esra] But 9 NYCRR 540.7 and N.Y. Real Prop. Law § 291-i address real-property recording and the standards governing electronic recording systems.[^ny-esra][^ny-rpl-291i] Those are separate controls, separate participants, and separate risk profiles from an ordinary business PDF signing flow.',
          'So DullyPDF should talk plainly about this boundary. The platform supports supported-signing workflows. It is not marketed as the recording officer system, the notary platform, the county eRecording gateway, or the complete compliance stack for notarized and recorded instruments.',
        ],
      },
      {
        title: '15 U.S.C. § 7003: the federal excluded categories are not edge cases',
        paragraphs: [
          '15 U.S.C. § 7003 is where many overbroad e-sign claims fall apart.[^esign-7003] The statute excludes wills, codicils, and testamentary trusts under § 7003(a)(1). It excludes adoption, divorce, and other family-law matters under § 7003(a)(2). It excludes official court documents, including court orders or notices, pleadings, and other writings required to be executed in connection with court proceedings. Those are not minor footnotes. They are direct statutory reasons not to advertise a general self-serve PDF signing workflow for those categories.',
          'Section 7003(a)(3) also excludes the Uniform Commercial Code other than sections 1-107 and 1-206 and Articles 2 and 2A.[^esign-7003] In practice that means you should not market DullyPDF as the ordinary self-serve solution for excluded UCC records such as negotiable instruments, funds-transfer records, letters of credit, documents of title, investment securities, or secured transaction records. They may be electronic in some settings, but the general E-SIGN path is not the blanket rule there.',
          'Section 7003(b) adds additional protected consumer-notice categories: court-ordered notices or official notices related to the cancellation or termination of utility services; default, acceleration, repossession, foreclosure, or eviction notices for a primary residence; cancellation or termination of health insurance or life insurance benefits, excluding annuities; product recall or material-failure safety notices; and hazardous-material transport or handling papers.[^esign-7003] Those categories should stay blocked from ordinary self-serve positioning.',
        ],
        bullets: [
          '15 U.S.C. § 7003(a)(1): wills, codicils, testamentary trusts.[^esign-7003]',
          '15 U.S.C. § 7003(a)(2): family-law matters and official court documents.[^esign-7003]',
          '15 U.S.C. § 7003(a)(3): excluded UCC records outside sections 1-107, 1-206, and Articles 2 and 2A.[^esign-7003]',
          '15 U.S.C. § 7003(b): utility shutoff, primary-residence foreclosure or eviction, certain insurance cancellation, product safety recall, and hazmat notices.[^esign-7003]',
        ],
      },
      {
        title: 'Which records are a good fit for the current DullyPDF signing scope',
        paragraphs: [
          'The best fit is supported ordinary business records that can be routed to one signer per request and preserved as one final PDF with later owner retrieval. That includes engagement letters, service agreements, statements of work, routine contract acceptances, vendor acknowledgments, onboarding packets, handbook acknowledgments, policy acknowledgments, equipment issue or return receipts, delivery receipts, work-order completion forms, inspection acknowledgments, volunteer releases, and similar records.',
          'Intake and authorization flows are also a good fit when the business separately handles any domain-specific requirements beyond the signing ceremony itself. Examples include routine client intake packets, standard consent or authorization forms, routine intake acknowledgments, and web-form-first information capture that needs to become one retained PDF before signature. The product is strongest when the goal is clear: one signer, one record, one artifact chain, and one owner retrieval path.',
          'That is why these pages target ordinary business and operational search intents. They are a better fit for the actual workflow than trying to rank for every specialized legal or regulated-signature term on the internet.',
        ],
      },
      {
        title: 'What E-SIGN does not replace: specialized regulatory programs still exist',
        paragraphs: [
          '15 U.S.C. § 7001(b)(1) matters because it preserves legal duties other than the requirement that a record be written or signed in paper form.[^esign-7001] That means sector-specific programs can still impose their own electronic-delivery or recordkeeping rules. A general PDF signing workflow does not automatically satisfy them just because E-SIGN exists.',
          'Examples help. Debt-collection disclosures sent electronically can implicate 12 CFR § 1006.42 and related Regulation F rules about actual notice and later accessibility.[^regf-1006-42] Employee-benefit plan disclosures can implicate 29 CFR § 2520.104b-1 and related electronic-disclosure safe harbors.[^erisa-2520-104b-1] FDA-regulated electronic records can implicate 21 CFR Part 11, including system controls and signature-accountability rules.[^cfr-21-part-11] Those are different compliance programs with different control expectations.',
          'DullyPDF should therefore market itself accurately: it supports supported-signing workflows for supported records. If a business wants to use the platform inside a more regulated program, that business still needs legal review of the governing statute or regulation and may need additional operational or technical controls beyond the default product workflow.',
        ],
      },
      {
        title: 'Responsibility boundaries: what DullyPDF provides and what the sender still must own',
        paragraphs: [
          'DullyPDF provides workflow controls for supported transactions: immutable-PDF creation, signer ceremony sequencing, consumer-mode consent controls, session gating, retained artifacts, and owner retrieval. Those are real controls and they matter. They are also not the end of the analysis.',
          'The sender or business still owns document classification, signatory authority, industry-specific disclosure content, whether the transaction is one the parties may and should conduct electronically, whether paper-copy and withdrawal promises are fulfilled in practice, whether witness or notary steps are required, whether separate identity proofing is needed, and whether the chosen retention settings satisfy the governing legal regime. That is the correct responsibility split.',
          'That is also the right answer to the “who is at fault” instinct. The public page should not try to say DullyPDF is never at fault. It should explain the actual boundary: the product controls the supported ceremony and artifact pipeline, while the business remains responsible for legal classification and external obligations the platform cannot know or perform automatically.',
        ],
      },
    ],
    faqs: [
      {
        question: 'What U.S. laws does this signing workflow target?',
        answer:
          'The workflow is designed around 15 U.S.C. §§ 7001-7003, UETA §§ 5, 7, 8, 9, and 12, and, where relevant to state treatment of electronic signatures and records, New York ESRA concepts in 9 NYCRR Part 540 and N.Y. Real Prop. Law § 291-i.[^esign-7001][^esign-7003][^ueta][^ny-esra][^ny-rpl-291i]',
      },
      {
        question: 'Can DullyPDF send a PDF for signature by email and also support a web-form-to-sign flow?',
        answer:
          'Yes. DullyPDF supports both an email-first path and a Fill By Web Form path, but both converge on the same immutable-PDF signing engine before the signer reviews and signs.',
      },
      {
        question: 'Which documents are a good fit for the current DullyPDF signing workflow?',
        answer:
          'The best fit is supported ordinary business records such as service agreements, engagement letters, onboarding packets, acknowledgments, receipts, work-order signoffs, routine authorization forms, and similar one-record, one-signer workflows.',
      },
      {
        question: 'Which documents should not use the ordinary self-serve signing workflow?',
        answer:
          'Wills, family-law matters, court documents, excluded UCC records, certain utility or foreclosure notices, certain insurance cancellation notices, product-safety recall notices, hazardous-material transport documents, notarization-required workflows, and real-property recording workflows should stay blocked or go through separate legal review.[^esign-7003][^ny-esra][^ny-rpl-291i]',
      },
      {
        question: 'Does E-SIGN by itself make every regulated workflow compliant?',
        answer:
          'No. 15 U.S.C. § 7001(b)(1) preserves other substantive legal duties.[^esign-7001] Sector-specific regimes such as debt-collection disclosure rules, ERISA disclosure rules, FDA electronic-record requirements, or state recording systems can still require additional controls outside a general PDF signing workflow.[^regf-1006-42][^erisa-2520-104b-1][^cfr-21-part-11]',
      },
      {
        question: 'Does DullyPDF itself decide legal classification for my document?',
        answer:
          'No. DullyPDF provides the supported signing workflow controls, but the sender or business still must classify the document correctly, determine whether electronic execution is appropriate for that transaction, and account for any separate industry, notary, witness, filing, or retention requirements.',
      },
      {
        question: 'Is this page legal advice?',
        answer:
          'No. It is a product and workflow explanation tied to specific statutes and regulations. Businesses should still use counsel for document classification, disclosure text, and industry-specific compliance decisions.',
      },
    ],
    footnotes: [
      { id: 'esign-7001', label: '15 U.S.C. § 7001 | General rule of validity and related provisions', href: 'https://www.law.cornell.edu/uscode/text/15/7001' },
      { id: 'esign-7003', label: '15 U.S.C. § 7003 | Exceptions and exclusions', href: 'https://www.law.cornell.edu/uscode/text/15/7003' },
      // The ULC's per-document URL (viewdocument/enactment-kit-17?CommunityKey=…)
      // 403s to crawlers and the CommunityKey query string is intrinsically
      // brittle. Wikipedia's UETA article is editorially stable and itself
      // cites the official ULC source.
      { id: 'ueta', label: 'Uniform Electronic Transactions Act | overview and authoritative sources', href: 'https://en.wikipedia.org/wiki/Uniform_Electronic_Transactions_Act' },
      { id: 'ny-esra', label: '9 NYCRR Part 540 | New York ESRA regulation', href: 'https://its.ny.gov/electronic-signatures-and-records-act-esra-regulation' },
      { id: 'ny-rpl-291i', label: 'N.Y. Real Prop. Law § 291-i | Electronic recording', href: 'https://www.nysenate.gov/legislation/laws/RPP/291-I' },
      { id: 'regf-1006-42', label: '12 CFR § 1006.42 | Sending required disclosures', href: 'https://www.law.cornell.edu/cfr/text/12/1006.42' },
      { id: 'erisa-2520-104b-1', label: '29 CFR § 2520.104b-1 | ERISA disclosure', href: 'https://www.law.cornell.edu/cfr/text/29/2520.104b-1' },
      { id: 'cfr-21-part-11', label: '21 CFR Part 11 | Electronic records and electronic signatures', href: 'https://www.law.cornell.edu/cfr/text/21/part-11' },
    ],
    relatedIntentPages: ['pdf-signature-workflow', 'fill-pdf-by-link'],
    relatedDocs: ['signature-workflow', 'fill-by-link'],
  },
  {
    key: 'pdf-fill-api',
    category: 'workflow',
    path: '/pdf-fill-api',
    navLabel: 'PDF Fill API',
    heroTitle: 'Publish a JSON to PDF Fill API From Saved Templates',
    heroSummary:
      'Turn a reviewed saved template into a hosted JSON-to-PDF endpoint with schema downloads, key rotation, rate limits, and audit activity.',
    seoTitle: 'PDF Fill API — Publish a JSON-to-PDF Endpoint From Any Template',
    seoDescription:
      'Turn a saved PDF template into a hosted API endpoint. Send JSON, get a filled PDF back. Includes schema downloads, key rotation, rate limits, and audit logs.',
    seoKeywords: [
      'pdf fill api',
      'json to pdf api',
      'template api pdf',
      'pdf form api',
      'fillable pdf api',
      'hosted json to pdf endpoint',
      'pdf automation api',
      'generate pdf from json programmatically',
      'rest api fill pdf template',
      'pdf generation api',
      'document automation api endpoint',
    ],
    valuePoints: [
      'Publish one saved-template snapshot as a hosted JSON-to-PDF endpoint.',
      'Download the frozen schema, copy example requests, and rotate or revoke keys from the workspace.',
      'Keep API Fill separate from browser-local Search & Fill so server-side use stays explicit.',
    ],
    proofPoints: [
      'The public API path is template-scoped and governed by rate limits, monthly request caps, and endpoint audit activity.',
      'Radio groups are resolved deterministically as one selected option key instead of relying on legacy checkbox hints.',
      'The hosted API does not depend on the generic materialize endpoint or browser session state.',
    ],
    articleSections: [
      {
        title: 'Why teams search for a PDF fill API instead of a browser workflow',
        paragraphs: [
          'Some teams still want an operator in the loop, which is exactly what Search & Fill is for. But other teams already have the record data in another system and need a server-to-server way to turn that data into a filled PDF. In that case a JSON-to-PDF API is the better product shape because the external system can call one endpoint without recreating the template logic itself.',
          'That API only works well if it is tied to a reviewed template snapshot. Otherwise the caller is sending data into a moving target. DullyPDF treats API Fill as a published snapshot of a saved template so the schema, field rules, and output expectations stay stable until the owner intentionally republishes or rotates the endpoint.',
        ],
      },
      {
        title: 'How DullyPDF keeps API Fill different from Search and Fill',
        paragraphs: [
          'Search & Fill is browser-local: an operator loads data, searches rows, picks the record, and validates the result in the workspace. API Fill is a hosted runtime. The caller sends structured JSON, authenticates with the endpoint key, and receives a PDF back from the backend. Those are different trust boundaries and should not be blurred together.',
          'That distinction matters operationally too. Hosted API requests need their own rate limits, request caps, and audit activity. Browser-local Search & Fill does not. Keeping those boundaries explicit makes the product easier to reason about and easier to secure later.',
        ],
      },
      {
        title: 'Why radio groups and deterministic fill rules matter for APIs',
        paragraphs: [
          'An API caller cannot rely on informal UI hints. The template has to define exactly how text fields, checkbox rules, radio groups, and transforms behave when the JSON payload arrives. That is why DullyPDF exposes radio group expectations and deterministic fill rules as part of the frozen template schema instead of leaving those behaviors implicit.',
          'The result is a tighter contract between the saved template and the system calling it. When the template is updated, the endpoint and schema can be rotated intentionally rather than silently drifting under production traffic.',
        ],
      },
      {
        title: 'When to use this page versus Search and Fill or the API docs',
        paragraphs: [
          'This page is for the product decision: should a reviewed template become a hosted endpoint at all? Search & Fill remains the better fit when an operator still needs to search records in the browser and review each output manually. The API docs become more useful only after the hosted-endpoint decision is made and the team needs exact publication, schema, and key-management steps.',
          'That separation keeps the query intent cleaner. Commercial API terms should land on the hosted-endpoint route. Runtime setup questions should land on the docs. Operator-driven filling should land on the Search & Fill route. The more clearly those pages are separated, the less likely they are to compete with each other.',
        ],
      },
    ],
    faqs: [
      {
        question: 'What is DullyPDF API Fill?',
        answer:
          'It is a template-scoped JSON-to-PDF endpoint published from a saved DullyPDF template, with its own schema, key, rate limits, and audit activity.',
      },
      {
        question: 'How is API Fill different from Search and Fill?',
        answer:
          'Search and Fill keeps chosen row data local in the browser, while API Fill is a hosted backend runtime for other systems that need a JSON-to-PDF endpoint.',
      },
      {
        question: 'Does API Fill support checkbox and radio logic?',
        answer:
          'Yes. The published schema includes deterministic fill rules, including checkbox rules, radio group expectations, and text transforms from the frozen saved-template snapshot.',
      },
    ],
    relatedIntentPages: ['pdf-fill-api-nodejs', 'pdf-fill-api-python', 'pdf-fill-api-curl', 'anvil-alternative', 'pdf-to-database-template'],
    relatedDocs: ['api-fill', 'rename-mapping'],
  },
  {
    key: 'fill-information-in-pdf',
    category: 'workflow',
    path: '/fill-information-in-pdf',
    navLabel: 'Fill Information in PDF',
    heroTitle: 'Fill Information in PDF Forms With Structured Data',
    heroSummary:
      'If you need to fill information in PDF forms repeatedly, DullyPDF helps you map once and populate forms from searchable records.',
    seoTitle: 'Fill Out Any PDF Form Online — Map Fields and Auto-Fill',
    seoDescription:
      'Upload a PDF, map the form fields to your data source, and fill it instantly. Pull from CSV, Excel, JSON, or SQL — no special software required.',
    seoKeywords: [
      'fill information in pdf',
      'free automatic pdf form filling',
      'fill data in pdf forms',
      'automated pdf form filling',
      'how to fill out pdf form online',
      'auto populate pdf fields',
      'enter data into pdf fields automatically',
      'complete pdf form digitally',
    ],
    valuePoints: [
      'Turn manual copy/paste workflows into reusable mapped templates.',
      'Fill name, date, checkbox, and text fields from structured rows.',
      'Validate output with deterministic search and fill guardrails.',
    ],
    proofPoints: [
      'Date and checkbox handling include normalization and rule logic.',
      'Field edits can be audited through the editor and inspector panels.',
      'Templates can be reused across repeated packets, updates, and Fill By Link respondent collection.',
    ],
    articleSections: [
      {
        title: 'What people usually mean when they say fill information in PDF',
        paragraphs: [
          'In most business workflows, filling information in a PDF does not mean typing into a single document once. It means reusing the same document layout over and over again with new record data. Client details, patient demographics, employee onboarding data, policy information, or application fields all need to land in the right place repeatedly.',
          'That is why DullyPDF focuses on mapped templates instead of one-off document editing. The durable value comes from setting the form up once, then letting structured records drive the output each time the workflow repeats.',
        ],
      },
      {
        title: 'Why mapped templates beat repeated copy and paste',
        paragraphs: [
          'Manual PDF filling is slow mostly because the operator has to translate data mentally while moving between systems. They are not just typing. They are matching names, dates, checkbox meanings, and repeated sections of the same form. A mapped template removes that translation work and replaces it with reusable field-to-data relationships.',
          'Once the template is saved, the operator can search a record, fill the document, inspect the result, and move on. That is a fundamentally different workflow from opening a PDF and typing through every field again from scratch.',
        ],
      },
      {
        title: 'How DullyPDF supports repeat fill from rows or collected respondents',
        paragraphs: [
          'Some teams fill from internal spreadsheets or JSON exports. Others collect the information from respondents first. DullyPDF supports both patterns because the final fill step still depends on structured records. Search & Fill can work with CSV, XLSX, JSON, or stored Fill By Link responses without changing the underlying template logic.',
          'That shared workflow matters because it keeps the PDF template stable even as the source of the record changes. The same document can serve staff-driven filling and respondent-driven collection without creating multiple disconnected versions of the form.',
        ],
      },
      {
        title: 'Common fill patterns by data source',
        paragraphs: [
          'The strongest PDF filling workflows usually start from one of three data-source patterns. Internal operations teams often work from CSV, XLSX, or JSON exports. Respondent-driven teams collect the row first through Fill By Link. Product or engineering teams may eventually publish an API endpoint after the template is already stable. Each pattern can fill the same saved template, but each enters the workflow at a different stage.',
          'That is why this page stays broader than the spreadsheet, Fill By Link, or API routes. The underlying job is to fill information into a recurring PDF reliably. The neighboring pages exist to explain which data-source pattern is the best fit once that broader need is clear.',
        ],
      },
      {
        title: 'Which field types usually fail first and why',
        paragraphs: [
          'Text fields are often the easiest part of PDF filling. Dates, checkbox groups, repeated labels, and option-style fields are where workflows usually become unreliable first. Those fields require the template to interpret meaning, not just carry a value from one system into another.',
          'That is why field QA matters. A document can look mostly correct while still hiding weak checkbox rules, ambiguous date formatting, or duplicate names that only break when real records are tested. The template is ready only when those risky field types behave predictably under representative data.',
        ],
      },
      {
        title: 'A QA checklist worth using before repeat rollout',
        paragraphs: [
          'A dependable PDF filling workflow is usually the result of a short checklist repeated consistently. Confirm that every required field exists, test one realistic record with long values and non-empty dates, inspect checkbox behavior, clear the document, and fill it again. If the second pass still behaves cleanly, the template is much closer to being reusable.',
          'That QA loop matters more than feature count. Teams do not need a dramatic automation claim. They need a workflow they can trust the next time the same document comes back across their desk.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I fill patient or client information into a PDF quickly?',
        answer:
          'Yes. DullyPDF is designed for repeated intake and form workflows where data comes from structured records.',
      },
      {
        question: 'Do I have to re-map fields every time?',
        answer:
          'No. Once saved, templates retain mapping metadata so you can run repeat fills with less setup.',
      },
      {
        question: 'Does this work for checkbox-heavy forms?',
        answer:
          'Yes. Checkbox metadata and rule precedence are part of the mapping and fill workflow.',
      },
      {
        question: 'Can people submit their own information through a link first?',
        answer:
          'Yes. DullyPDF Fill By Link lets the template owner collect respondent answers first, then select that respondent inside the workspace when generating the PDF.',
      },
    ],
    relatedIntentPages: ['fill-pdf-from-csv', 'fill-pdf-by-link', 'pdf-to-database-template', 'invoice-pdf-processing'],
    relatedDocs: ['search-fill', 'fill-from-images', 'fill-by-link', 'rename-mapping'],
  },
  {
    key: 'fillable-form-field-name',
    category: 'workflow',
    path: '/fillable-form-field-name',
    navLabel: 'Fillable Form Field Name',
    heroTitle: 'Standardize Fillable Form Field Names for Reliable Auto-Fill',
    heroSummary:
      'Normalize fillable form field names, map them to schema columns, and keep naming consistent across complex PDF packets.',
    seoTitle: 'PDF Form Field Names — How to Rename and Map for Auto-Fill',
    seoDescription:
      'Understand PDF field names, bulk-rename them to match your database columns, and set up reliable auto-fill for recurring forms.',
    seoKeywords: [
      'fillable form field name',
      'automatic pdf field rename',
      'free fillable form field mapping',
      'pdf field naming standardization',
      'pdf field rename mapping',
      'rename pdf form fields in bulk',
      'standardize pdf field labels',
      'pdf field name best practices',
      'fix messy pdf field names',
    ],
    valuePoints: [
      'Use AI-assisted rename to convert inconsistent labels into stable names.',
      'Align renamed fields with schema headers for dependable fill behavior.',
      'Improve downstream search and fill quality with clean field naming.',
    ],
    proofPoints: [
      'Rename and map flows expose confidence output for QA review.',
      'Field naming updates can be verified before template save.',
      'Supports mixed field types including text, date, signature, and checkbox.',
    ],
    articleSections: [
      {
        title: 'Why bad field names break automation even when the PDF looks fine',
        paragraphs: [
          'A PDF can look perfectly usable to a person and still be weak for automation if the field names are vague, duplicated, or inherited from an old authoring tool. Search and mapping logic need a stable way to understand what each field represents. Names like Text1, Field_17, or repeated generic labels create ambiguity that causes mapping errors later.',
          'That is why field naming is not cosmetic. It is part of the template contract. Better names make mapping easier, make QA easier, and make future edits easier when someone reopens the template months later.',
        ],
      },
      {
        title: 'How AI rename improves downstream mapping quality',
        paragraphs: [
          'Rename helps by turning weak field metadata into something closer to the language used in your real schema. Instead of forcing the map step to guess from noisy names, DullyPDF can use visual context and surrounding labels to suggest more meaningful field identifiers first. That usually improves the quality of the mapping pass that follows.',
          'This is especially useful on dense packets, multi-page forms, and documents where similar labels repeat across sections. Better names create less cleanup work and reduce the chance that a field is technically mapped but semantically wrong.',
        ],
      },
      {
        title: 'A naming standard worth keeping across templates',
        paragraphs: [
          'The strongest teams keep naming conventions stable across all recurring templates. Dates should look like dates, checkbox groups should have coherent group keys, and person or policy fields should use consistent prefixes rather than whatever the PDF happened to suggest the first time.',
          'That discipline pays off later when templates are updated or grouped. Instead of debugging one-off naming oddities on each form, teams get a cleaner library of reusable templates that are easier to map, test, and maintain.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Why does fillable form field naming matter?',
        answer:
          'Consistent field names improve mapping accuracy and reduce missing values during automated fill runs.',
      },
      {
        question: 'Can I rename fields without changing PDF appearance?',
        answer:
          'Yes. Naming changes happen in template metadata and do not alter the visual PDF source layout.',
      },
      {
        question: 'Can I combine field rename with database mapping?',
        answer:
          'Yes. DullyPDF supports rename-only, map-only, and combined rename-plus-map workflows.',
      },
    ],
  },
  {
    key: 'healthcare-pdf-automation',
    category: 'industry',
    path: '/healthcare-pdf-automation',
    navLabel: 'Healthcare PDF Automation',
    heroTitle: 'Automate Medical Intake and Healthcare PDF Form Workflows',
    heroSummary:
      'Convert medical and dental intake, registration, history, consent, and HIPAA release PDFs into reusable templates that map directly to structured data columns.',
    seoTitle: 'Healthcare and Dental Intake PDF Form Automation | DullyPDF',
    seoDescription:
      'Automate medical and dental intake forms, map patient intake PDFs to database-ready templates, and fill healthcare PDFs from structured records.',
    seoKeywords: [
      'automate medical intake forms',
      'dental intake form automation',
      'dental patient intake pdf automation',
      'patient intake pdf to database',
      'healthcare pdf form automation',
      'patient registration form automation',
      'hipaa release form automation',
      'medical form digitization',
      'clinic intake workflow automation',
      'digital patient registration system',
      'healthcare document management software',
    ],
    valuePoints: [
      'Build reusable templates for medical and dental intake, registration, history, and consent packets.',
      'Normalize field names so front-desk teams can map once and reuse consistently.',
      'Support checkbox-heavy workflows for symptoms, disclosures, and releases.',
    ],
    proofPoints: [
      'CSV/XLSX/JSON rows are searchable in-browser for controlled patient record lookup.',
      'Native Fill By Link supports phone-friendly respondent intake before front-desk review.',
      'Detection plus editor cleanup helps handle scanned and native healthcare PDFs.',
      'Templates can be saved and reused for recurring appointment workflows.',
    ],
    articleSections: [
      {
        title: 'Why healthcare PDF automation remains a front-desk bottleneck',
        paragraphs: [
          'Healthcare teams still operate around recurring PDFs: intake packets, registration forms, health history documents, HIPAA releases, consent forms, insurance worksheets, and specialty-specific questionnaires. The same patient demographics and appointment context often need to appear across several documents, but many clinics still retype that information form by form because the PDFs are fixed and the workflow around them is manual.',
          'That is exactly the kind of problem DullyPDF is designed to reduce. The goal is not to replace clinical systems. The goal is to convert recurring healthcare PDFs into reusable templates that map cleanly to structured patient data so staff stop re-entering the same information on every visit or every packet revision.',
        ],
      },
      {
        title: 'A practical clinic workflow: map once, fill repeatedly',
        paragraphs: [
          'The practical rollout starts with one high-volume document, usually a registration or history form. Upload the PDF, detect the fields, clean the layout, rename unclear fields, and map them to patient-data headers. Once the template is stable, front-desk staff can search a patient record and fill the document instead of typing each field manually.',
          'From there, the same pattern can expand across a packet. Once teams trust one template, it becomes much easier to standardize the rest of the intake flow. That is usually a better rollout than attempting a full packet conversion in one pass without any QA checkpoints.',
        ],
        bullets: [
          'Start with one frequently used intake or registration form.',
          'Validate the template with several real patient records.',
          'Expand the same mapping conventions across the rest of the packet.',
        ],
      },
      {
        title: 'Why healthcare forms need strong checkbox and consent handling',
        paragraphs: [
          'Healthcare documents are rarely simple text-only forms. Symptom checklists, allergy disclosures, release acknowledgments, medication questions, tobacco or alcohol history, and consent selections all introduce checkbox logic that has to behave consistently. If checkbox metadata is weak, the filled packet becomes unreliable even when the basic demographics look correct.',
          'That is why checkbox rules matter so much in healthcare template setup. DullyPDF supports yes-no, presence, enum, and list-style checkbox behavior so the template can mirror the way real intake data is represented. The result is a more realistic automation workflow for actual clinic packets rather than a narrow demo built only around text boxes.',
        ],
      },
      {
        title: 'Where Fill By Link fits for patient-facing intake collection',
        paragraphs: [
          'Some clinics want staff-driven filling from internal records. Others want the patient to submit information first. DullyPDF supports both patterns. Teams can publish a mobile-friendly Fill By Link from a saved template, collect respondent data in a structured form, and then generate the final PDF from the response list later in the workspace after review.',
          'That separation is useful operationally. Patients do not need to edit a PDF directly on their phone, and staff still keep control over the final document generation step. The template remains the canonical document setup regardless of whether the source data came from an export or a respondent submission.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF automate patient and dental intake PDFs and registration forms?',
        answer:
          'Yes. You can detect fields, refine them in the editor, map to schema headers, and then fill medical or dental intake forms from structured data.',
      },
      {
        question: 'Does DullyPDF work for HIPAA release and consent forms?',
        answer:
          'Yes. Checkbox and text field mapping supports release and consent-style healthcare forms.',
      },
      {
        question: 'Can healthcare teams reuse the same mapped template daily?',
        answer:
          'Yes. Saved templates retain PDF bytes, field metadata, and mapping context for repeat usage.',
      },
      {
        question: 'Can clinics send patients a link instead of filling the PDF directly?',
        answer:
          'Yes. Teams can publish a DullyPDF Fill By Link, collect patient responses through a mobile-friendly form, and then generate the final PDF from the response list later.',
      },
    ],
    relatedIntentPages: ['fill-pdf-by-link', 'pdf-to-database-template', 'pdf-checkbox-automation'],
    relatedDocs: ['getting-started', 'fill-by-link', 'search-fill', 'fill-from-images'],
  },
  {
    key: 'acord-form-automation',
    category: 'industry',
    path: '/acord-form-automation',
    navLabel: 'ACORD Form Automation',
    heroTitle: 'Automate ACORD Insurance PDF Forms With Mapped Data',
    heroSummary:
      'Handle ACORD workflows such as ACORD 25, 24, 27, 28, 126, and 140 by mapping form fields to structured data and reducing repetitive manual entry.',
    seoTitle: 'ACORD 25 Auto-Fill — Automate Certificate of Insurance PDFs',
    seoDescription:
      'Map ACORD 25, 24, 27, 28, 126, and 140 forms to your insurance data. Fill certificates of insurance in bulk instead of retyping each one.',
    seoKeywords: [
      'acord form automation',
      'auto fill acord 25 pdf',
      'acord certificate automation',
      'acord 25 automation',
      'acord 24 automation',
      'acord 27 automation',
      'acord 28 automation',
      'acord 126 automation',
      'acord 140 automation',
      'acord form filler software',
      'certificate of insurance generator',
      'coi form automation tool',
      'insurance certificate auto fill',
    ],
    valuePoints: [
      'Standardize repetitive ACORD field naming across brokers and account teams.',
      'Map ACORD certificate and liability forms to shared schema headers from AMS exports.',
      'Reduce rekeying errors for policy, insured, and coverage blocks.',
    ],
    proofPoints: [
      'Template workflows support repeat filling from CSV, XLSX, and JSON records.',
      'Field confidence and inspector-based QA provide pre-fill verification.',
      'Docs include rename/mapping and Search & Fill validation guidance for ACORD packets.',
    ],
    articleSections: [
      {
        title: 'Why ACORD workflows stay stubbornly manual',
        paragraphs: [
          'Insurance operations teams usually do not struggle because they lack data. They struggle because the last mile is still a PDF. ACORD certificates, liability forms, and recurring carrier documents often arrive as fixed layouts that need the same insured, producer, policy, and coverage details inserted over and over again. That creates a high-volume rekeying problem even when the agency management system already contains the underlying information.',
          'ACORD work is also unforgiving. A wrong policy number, effective date, limit, or certificate holder field can cause downstream servicing friction or worse. That makes reliable template setup more valuable than flashy automation claims. Teams want repeatable fills they can validate, not a black-box guess at the finished form.',
        ],
      },
      {
        title: 'How to build a reusable ACORD template in DullyPDF',
        paragraphs: [
          'The safest pattern is to start with a single recurring form such as ACORD 25, then expand outward. Upload the PDF, run field detection, clean geometry in the editor, normalize field names, and map the final field set to your AMS or broker export headers. Once that template is stable, Search & Fill can pull the correct insured record and populate the document in one pass.',
          'That template-first approach scales better than trying to solve every ACORD variation at once. Each recurring form becomes a known workflow artifact with its own QA history, instead of a collection of one-off manual fixes performed under deadline pressure.',
        ],
      },
      {
        title: 'What to verify before using ACORD automation in production',
        paragraphs: [
          'For ACORD and certificate workflows, the highest-risk fields are usually the fields that appear simple: producer blocks, named insured details, effective and expiration dates, certificate holder information, and limit tables. Those are the places where a nearly-correct fill can still create real operational risk. Teams should validate those fields explicitly with representative records before treating a template as production-ready.',
          'A good rollout is to test five to ten real records, compare the filled PDF against the source data, and only then standardize the workflow for the broader account or certificate team. That process is slower than a demo, but much faster than cleaning up avoidable servicing errors later.',
        ],
        bullets: [
          'Validate the insured, producer, and certificate holder blocks.',
          'Check policy numbers, effective dates, expiration dates, and coverage limits.',
          'Confirm checkbox or option-style fields on carrier supplements behave as expected.',
        ],
      },
      {
        title: 'Where DullyPDF fits relative to generic PDF tools',
        paragraphs: [
          'DullyPDF is not trying to replace every PDF workflow in an agency. It is most useful when the same ACORD or certificate form type needs to be filled repeatedly from structured data. That is a narrower but more valuable problem than general PDF editing. Agencies that still need annotation, ad hoc editing, or signing workflows can keep those tools and use DullyPDF for the repeat template-filling layer.',
          'That division of labor usually makes the implementation easier. Teams do not need to change every document process at once. They only need to move the high-volume ACORD workflows into a mapped-template model where repeat fills become predictable and fast.',
        ],
      },
      {
        title: 'When to use the ACORD page versus the broader insurance automation page',
        paragraphs: [
          'This page is the best fit when the core job is ACORD-specific: ACORD 25 certificates, ACORD 24/27/28 liability forms, ACORD 126 commercial forms, and other standardized ACORD layouts that appear repeatedly across the agency. The broader insurance automation page is more useful when the team is balancing ACORD with carrier supplements, claims-intake forms, renewal packets, policy summaries, and other non-ACORD insurance PDFs.',
          'Keeping those routes separated helps both search and operations. ACORD-heavy searches should land on the ACORD page. Mixed insurance-document libraries should land on the broader insurance page. That way the internal links reinforce the actual template strategy instead of forcing one page to rank for every insurance PDF scenario.',
        ],
      },
      {
        title: 'How ACORD 24, 27, 28, 126, and 140 differ from ACORD 25 operationally',
        paragraphs: [
          'Agencies often group ACORD forms together, but they are not interchangeable in practice. ACORD 25 certificate workflows are usually about fast certificate turnaround and holder accuracy. ACORD 24, 27, and 28 introduce liability and evidence-style distinctions that can shift which coverage blocks and attestations matter most. ACORD 126 and 140 introduce commercial schedules and applicant details that often behave more like structured underwriting paperwork than a simple certificate.',
          'That variation is why one ACORD landing page still needs a template mindset. Each recurring form deserves its own canonical template and QA checklist even when the surrounding insured and policy data overlap. Trying to treat all ACORD forms as one identical document family usually creates weak mappings and missed field-level differences.',
        ],
      },
      {
        title: 'Certificate holder and limit-table QA deserve their own checklist',
        paragraphs: [
          'The fields that deserve the most attention are often the ones account teams fill by habit: certificate holder details, producer details, policy identifiers, effective and expiration dates, and the coverage limit tables. Those values drive servicing outcomes directly, so they deserve an explicit checklist rather than a casual glance after fill.',
          'A practical ACORD QA routine is to validate those blocks on several real records before the workflow is considered production-ready. Once those high-risk areas are stable, the rest of the form tends to follow much more predictably.',
        ],
      },
      {
        title: 'Why AMS export cleanup matters before mapping',
        paragraphs: [
          'A mapped ACORD workflow is only as stable as the export feeding it. If the AMS export uses inconsistent labels for insured names, dates, carrier fields, or limits, the PDF layer will inherit that inconsistency. The cleanest rollout normalizes the source schema first, then maps the ACORD template to those stable headers.',
          'That is especially important when the same export must support ACORD 25 plus other ACORD or carrier-specific forms. Naming discipline in the source data is what lets one record fill several templates without creating a separate mapping mess for each one.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF auto-fill ACORD 25 and similar insurance forms?',
        answer:
          'Yes. DullyPDF supports mapped template workflows for common ACORD-style PDF forms.',
      },
      {
        question: 'Can insurance teams map ACORD fields to internal database columns?',
        answer:
          'Yes. Schema mapping aligns PDF fields with your preferred naming and column structure.',
      },
      {
        question: 'Does this support ACORD renewals and recurring certificate requests?',
        answer:
          'Yes. Teams can map once and fill repeatedly instead of retyping policy and certificate data every cycle.',
      },
    ],
    relatedIntentPages: ['insurance-pdf-automation', 'fill-pdf-from-csv', 'pdf-to-database-template'],
    relatedDocs: ['getting-started', 'rename-mapping', 'search-fill', 'fill-from-images'],
  },
  {
    key: 'insurance-pdf-automation',
    category: 'industry',
    path: '/insurance-pdf-automation',
    navLabel: 'Insurance PDF Automation',
    heroTitle: 'Insurance PDF Automation for Carrier, Renewal, and Servicing Workflows',
    heroSummary:
      'Automate carrier supplements, renewal packets, policy summaries, endorsement forms, and claims-intake PDFs by mapping recurring insurance documents to structured agency data exports.',
    seoTitle: 'Insurance PDF Automation for Carrier and Renewal Forms | DullyPDF',
    seoDescription:
      'Automate carrier-specific insurance PDFs, renewal paperwork, policy summaries, endorsements, and claims-intake forms by mapping fields to structured agency or broker data.',
    seoKeywords: [
      'insurance pdf automation',
      'insurance form automation',
      'auto fill insurance forms',
      'carrier specific insurance pdf automation',
      'insurance renewal form automation',
      'policy summary pdf automation',
      'endorsement form automation',
      'claims intake pdf automation',
      'insurance document processing software',
      'insurance agency form filler',
      'commercial insurance pdf workflow',
      'policy renewal paperwork automation',
    ],
    valuePoints: [
      'Build reusable templates for ACORD packets and carrier-specific insurance forms.',
      'Map insured, producer, policy, and coverage fields to AMS or broker export columns.',
      'Standardize field naming across renewal cycles and form revisions.',
    ],
    proofPoints: [
      'Works with CSV, XLSX, and JSON exports from insurance operations systems.',
      'Supports checkbox, date, and text cleanup for carrier-specific PDF variants.',
      'Saved templates accelerate recurring certificate and renewal workflows.',
    ],
    articleSections: [
      {
        title: 'Insurance PDF automation goes beyond one ACORD form',
        paragraphs: [
          'Insurance teams rarely work with a single perfect template. They handle certificate requests, carrier supplements, renewal packets, policy summaries, loss-run support documents, and other recurring PDFs that still arrive as fixed forms. Even when ACORD is the core workflow, the surrounding paperwork often introduces multiple variants that all require structured filling.',
          'That is why insurance PDF automation needs more than a single-page ACORD pitch. Teams need a repeatable process for turning recurring insurance documents into mapped templates that can be filled from operational data without retyping the same insured and policy details every cycle.',
        ],
      },
      {
        title: 'Where mapped templates save time for certificates, renewals, and supplements',
        paragraphs: [
          'Mapped templates help most where the same insured, producer, policy, and coverage data has to be pushed into multiple documents. Certificate requests are the obvious example, but renewal prep and carrier-specific supplement workflows often benefit just as much because they repeat the same values under slightly different layouts.',
          'Once the field names and mappings are stable, teams can work from AMS exports or broker data, search the right record, and fill the document with much less manual translation work. The savings come from repeatability and error reduction, not just from raw speed.',
        ],
      },
      {
        title: 'How to roll out insurance template automation safely',
        paragraphs: [
          'Start with the documents that are both frequent and painful. Build one certificate or supplement template, validate it with real records, and document which fields must be checked every time before output leaves the team. Only after that first workflow is trusted should you expand to adjacent forms.',
          'That phased approach keeps the template library clean. Instead of dozens of half-reviewed insurance forms, you get a smaller set of well-understood templates that teams can actually rely on during high-volume servicing work.',
        ],
      },
      {
        title: 'How this page differs from the ACORD-specific route',
        paragraphs: [
          'Use this page when the agency problem is broader than ACORD itself. Carrier supplements, renewal packets, claims-intake forms, policy summaries, and endorsement paperwork often repeat just as much as ACORD certificates, but they are not always standardized under the same layout families. That is the gap this route is meant to cover.',
          'If the dominant workload is ACORD 25, ACORD 24/27/28, or other ACORD-first certificate workflows, the ACORD page is the better primary landing page. This route is the wider library page for insurance teams that need a template strategy across both ACORD and non-ACORD recurring PDFs.',
        ],
      },
      {
        title: 'A carrier supplement library needs stronger template governance than one-off form filling',
        paragraphs: [
          'Carrier-specific supplements tend to multiply quietly over time. A different endorsement packet, a renewal supplement, a claims-intake form, or a policy-summary layout can each become a separate PDF process unless the agency treats them as reusable templates with clear ownership and naming conventions.',
          'That is why insurance automation needs a template-library strategy, not just one successful demo. Define which carrier documents are truly recurring, keep one canonical template for each, and make small, versioned corrections instead of spawning near-duplicates whenever the layout shifts slightly.',
        ],
      },
      {
        title: 'Renewal packets and claims-intake workflows are not the same operational job',
        paragraphs: [
          'Renewal work is usually about reusing known insured, producer, and policy data across periodic documents. Claims-intake work often starts from partially complete data, new event details, or respondent-supplied information that still needs review. Those are different workflow shapes even when both end in PDFs.',
          'This page should therefore answer a broader insurance question than the ACORD route. It should help teams decide how to organize recurring carrier and servicing forms across several workflow types instead of assuming every insurance PDF behaves like a certificate request.',
        ],
      },
      {
        title: 'How to avoid naming drift across multiple carrier templates',
        paragraphs: [
          'Naming drift is one of the fastest ways to make an insurance template library hard to maintain. If each carrier supplement invents a different label for the same insured or policy concept, the mappings become harder to trust and much harder to update later.',
          'The strongest approach is to normalize shared field names across the whole library, keep carrier-specific differences explicit where they matter, and test a representative record before treating a new supplement as production-ready. That makes the broader insurance route distinct from the ACORD route while still keeping the same template discipline underneath.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF automate insurance PDFs beyond ACORD 25?',
        answer:
          'Yes. Teams use it for ACORD 24/27/28/126/140 and carrier-specific insurance PDFs that require repeat filling.',
      },
      {
        question: 'Can insurance teams map form fields to agency management exports?',
        answer:
          'Yes. Map once to your export schema, then run repeat fills from structured records in Search & Fill.',
      },
      {
        question: 'Is this useful for certificate of insurance turnaround speed?',
        answer:
          'Yes. Reusable mapped templates reduce manual retyping and help teams produce certificates faster with fewer entry errors.',
      },
    ],
    relatedIntentPages: ['acord-form-automation', 'pdf-to-database-template', 'fill-pdf-from-csv', 'invoice-pdf-processing'],
    relatedDocs: ['getting-started', 'rename-mapping', 'search-fill', 'fill-from-images'],
  },
  {
    key: 'real-estate-pdf-automation',
    category: 'industry',
    path: '/real-estate-pdf-automation',
    navLabel: 'Real Estate PDF Automation',
    heroTitle: 'Real Estate and Mortgage PDF Form Automation',
    heroSummary:
      'Automate rental applications, lease packets, mortgage forms, and inspection PDFs by converting them into mapped, reusable fillable templates.',
    seoTitle: 'Real Estate and Mortgage PDF Automation | DullyPDF',
    seoDescription:
      'Automate rental application PDFs, map mortgage forms to database templates, and streamline real estate form filling workflows.',
    seoKeywords: [
      'automate rental application pdf',
      'mortgage pdf to database',
      'real estate form automation',
      'lease agreement pdf automation',
      'property inspection form automation',
      'tenant screening form filler',
      'rental lease packet automation',
      'property management pdf workflow',
      'real estate closing document automation',
    ],
    valuePoints: [
      'Support rental intake packets, mortgage documents, and lease workflows.',
      'Map tenant and borrower fields to shared CRM or operational schemas.',
      'Reuse templates across properties, units, and recurring transaction packets.',
    ],
    proofPoints: [
      'Search & Fill supports row-based record selection for fast form completion.',
      'Editor tools help resolve geometry mismatch in legacy property forms.',
      'Template reuse reduces repetitive office data entry across teams.',
    ],
    articleSections: [
      {
        title: 'Real estate teams still run on recurring PDF packets',
        paragraphs: [
          'Real estate and mortgage operations often revolve around packets rather than single forms. Rental applications, lease addenda, borrower disclosures, inspection forms, and transaction-specific worksheets all move through the same office while many of the underlying names, addresses, and dates repeat across them.',
          'That makes real estate paperwork a strong template candidate. The challenge is not usually missing data. The challenge is that the final step still involves fixed PDFs that staff keep filling again and again.',
        ],
      },
      {
        title: 'How mapped templates help with tenant, buyer, and borrower workflows',
        paragraphs: [
          'A mapped template lets teams connect common property, tenant, borrower, and transaction fields to the document once instead of retyping them every time. Once the setup is done, staff can select the right record, fill the form, inspect the output, and move on without rebuilding the field relationships.',
          'That is useful for property management, leasing, and mortgage workflows because the same office often touches similar data under different document layouts. Template reuse turns those layouts into assets instead of recurring interruptions.',
        ],
      },
      {
        title: 'How to manage form variation across properties and transactions',
        paragraphs: [
          'The practical challenge in real estate is variation. Different owners, lenders, associations, or jurisdictions may use slightly different forms. The best answer is usually not to create dozens of barely-different templates without discipline. It is to define which form types are canonical, keep naming conventions stable, and update only the templates that truly need to diverge.',
          'That approach keeps the library maintainable and reduces the risk that staff pick the wrong version of a document when deadlines are tight.',
        ],
      },
      {
        title: 'Where applicant intake and signature fit into the packet lifecycle',
        paragraphs: [
          'Leasing workflows usually get cleaner when the team separates intake from final record creation. Applicants or residents can submit structured information first, the office can review that data, and the final rental application, lease, or addendum PDF can be generated only after the record is ready. That is a much healthier pattern than typing information by hand into every packet component or passing unfinished drafts around by email.',
          'The same principle applies to signatures. Sign the final lease record after it has been reviewed, not a version that is still drifting through edits. When the intake, packet assembly, and signing steps are kept in that order, the workflow becomes easier to reuse across units and properties instead of turning into a one-off exception every time.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF automate rental application PDF workflows?',
        answer:
          'Yes. Rental application and lease-style forms can be mapped and filled from structured tenant data.',
      },
      {
        question: 'Does it work for mortgage-related PDF forms?',
        answer:
          'Yes. Mortgage and lending packets can be converted into reusable mapped templates.',
      },
      {
        question: 'Can real estate teams reuse templates across properties?',
        answer:
          'Yes. Saved templates can be reloaded and reused for recurring packet types.',
      },
    ],
    relatedIntentPages: ['fill-pdf-by-link', 'pdf-signature-workflow', 'pdf-to-database-template'],
    relatedDocs: ['getting-started', 'fill-by-link', 'signature-workflow', 'create-group'],
  },
  {
    key: 'government-form-automation',
    category: 'industry',
    path: '/government-form-automation',
    navLabel: 'Government Form Automation',
    heroTitle: 'Government and Public Service PDF Form Automation',
    heroSummary:
      'Convert permit, tax, licensing, and social services forms into mapped templates to reduce manual entry and improve consistency in public-sector workflows.',
    seoTitle: 'Government PDF Permit and Tax Form Automation | DullyPDF',
    seoDescription:
      'Automate government PDF forms, map permit and tax paperwork to structured schemas, and improve public service document workflows.',
    seoKeywords: [
      'government form automation',
      'pdf permit automation',
      'tax form database mapping',
      'public sector pdf automation',
      'license renewal form automation',
      'municipal form digitization',
      'government document processing',
      'city permit application filler',
      'regulatory compliance form automation',
    ],
    valuePoints: [
      'Handle standardized permit, licensing, tax, and public service forms.',
      'Map required fields to internal tracking columns for consistent intake.',
      'Use repeatable templates for recurring citizen application workflows.',
    ],
    proofPoints: [
      'Structured data mapping helps avoid inconsistent field naming across departments.',
      'Search-based fill supports quick retrieval of known record values.',
      'Troubleshooting docs support QA for edge-case form behaviors.',
    ],
    articleSections: [
      {
        title: 'Why government workflows still depend on fixed PDFs',
        paragraphs: [
          'Government and public-service teams often operate on forms that cannot simply be replaced with a new web experience. Permits, tax forms, licensing documents, compliance packets, and citizen-service paperwork frequently remain fixed PDFs with strict layout expectations. The operational pain is not whether the form exists. It is the cost of repeatedly keying the same values into it.',
          'That makes government form automation a strong fit for reusable templates. The goal is to keep the official layout intact while reducing repeated manual entry and inconsistency across submissions.',
        ],
      },
      {
        title: 'How agencies can keep one template per recurring form type',
        paragraphs: [
          'The best pattern is to treat each recurring form type as a canonical template. Build it once, map the field set to the internal schema used by the team, test it with representative records, and then reuse that same setup across future submissions. When form revisions arrive, update the existing template instead of allowing duplicate versions to spread across departments.',
          'This matters operationally because government processes often outlive individual staff knowledge. A stable template library is easier to maintain than informal process memory.',
        ],
      },
      {
        title: 'Why QA and naming discipline matter more than adding more pages',
        paragraphs: [
          'For public-sector workflows, the core win is consistency. Stable field naming, controlled review, and repeatable record selection matter more than trying to maximize the number of documents in the library as quickly as possible. A smaller set of trusted templates usually beats a larger set of weakly reviewed ones.',
          'That same principle applies to the public SEO surface too. Stronger, clearer pages around real recurring workflows are more useful than a long tail of near-duplicate content that does not help users make a decision.',
        ],
      },
      {
        title: 'Official form revisions should trigger controlled template updates, not library sprawl',
        paragraphs: [
          'Government forms do change, but the operational answer should still be disciplined. When a new permit, tax, licensing, or benefits form revision arrives, the team should update the existing canonical template, validate the affected fields, and keep the naming conventions as stable as possible. That keeps the workflow maintainable even when the official paperwork evolves.',
          'Without that discipline, public-sector teams end up with several nearly identical templates that nobody fully trusts. A controlled update process is what lets one recurring government workflow stay reusable over time instead of collapsing into a folder of one-off versions.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF automate permit and license PDF forms?',
        answer:
          'Yes. Permit and license forms can be converted, mapped, and reused as structured templates.',
      },
      {
        question: 'Does this help with tax and compliance form workflows?',
        answer:
          'Yes. Standardized mapping and row-based fill reduce repetitive manual entry for recurring forms.',
      },
      {
        question: 'Can agencies keep one canonical template per form type?',
        answer:
          'Yes. Saved template workflows support a canonical setup per recurring government form.',
      },
    ],
    relatedIntentPages: ['pdf-to-fillable-form', 'pdf-to-database-template', 'fillable-form-field-name'],
    relatedDocs: ['getting-started', 'rename-mapping', 'search-fill'],
  },
  {
    key: 'finance-loan-pdf-automation',
    category: 'industry',
    path: '/finance-loan-pdf-automation',
    navLabel: 'Finance and Loan PDF Automation',
    heroTitle: 'Finance and Loan Origination PDF Automation Workflows',
    heroSummary:
      'Automate loan applications, financial disclosures, and compliance documents by mapping PDF fields to structured lending and underwriting data.',
    seoTitle: 'Auto-Fill Loan Applications — Map PDF Forms to Borrower Data',
    seoDescription:
      'Connect loan application PDFs to your borrower records and fill disclosure forms, 1003s, and closing docs automatically. No manual retyping.',
    seoKeywords: [
      'loan pdf automation',
      'loan application pdf automation',
      'fill pdf financial form from database',
      'financial disclosure pdf automation',
      'kyc aml pdf automation',
      'mortgage application auto fill',
      'loan origination document automation',
      'lending document processing software',
      'borrower application form filler',
    ],
    valuePoints: [
      'Map borrower and underwriting fields to lending schema columns.',
      'Reduce rekeying on loan applications and disclosure packets.',
      'Support repeat workflows across product lines and document versions.',
    ],
    proofPoints: [
      'Search & Fill supports fast row selection for borrower profile data.',
      'Rename and mapping assist with inconsistent legacy field labels.',
      'Saved templates preserve mapping context for repeat monthly workflows.',
    ],
    articleSections: [
      {
        title: 'Why loan and finance teams re-enter the same borrower data',
        paragraphs: [
          'Finance and lending teams often handle packets where the same borrower, applicant, or client details need to appear across applications, disclosures, supporting forms, and compliance documents. The data already exists in underwriting or operational systems, but the last mile is still a PDF that someone has to prepare accurately.',
          'That creates a repeat-typing problem with higher stakes than many other workflows. Even small errors can create rework, borrower friction, or compliance headaches. A reusable template workflow is valuable because it reduces both effort and avoidable inconsistency.',
        ],
      },
      {
        title: 'Where template mapping helps across disclosures and compliance documents',
        paragraphs: [
          'Once a loan or finance PDF is converted into a mapped template, borrower fields, dates, and repeated identifiers can be driven from structured records instead of manual re-entry. That is useful not just for the main application, but for disclosures and supporting documents that reuse the same data under different layouts.',
          'The biggest gains often come from establishing one dependable mapping pattern and then extending it to adjacent documents. That keeps the process coherent as packet complexity grows.',
        ],
      },
      {
        title: 'How to validate finance templates before rollout',
        paragraphs: [
          'Start with the fields that create the most downstream risk: borrower names, dates, identifiers, disclosure-specific values, and checkbox-like attestations. Validate those against representative records before the template is adopted broadly.',
          'For finance workflows, slower initial QA is usually cheaper than discovering a weak template only after it has been used repeatedly. The template needs to be trusted before it can actually save time.',
        ],
      },
      {
        title: 'Packet version control matters as much as the first application form',
        paragraphs: [
          'Loan and finance teams rarely stop at one PDF. The same borrower information usually has to move through disclosures, supporting forms, and later packet revisions that may vary by product line or lender. That is why a reusable template strategy matters here more than a one-time form demo. Each recurring document needs a clear owner, stable field naming, and a predictable place in the broader packet.',
          'When those templates are versioned deliberately, teams can expand from one dependable application or disclosure workflow into the rest of the packet without recreating the same mapping logic every month. That is what keeps finance automation useful under real operating pressure rather than just attractive in a demo.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF automate loan application PDFs?',
        answer:
          'Yes. Loan application templates can be mapped to structured data and reused for repetitive fill tasks.',
      },
      {
        question: 'Does DullyPDF support financial disclosure form filling?',
        answer:
          'Yes. Disclosure and related finance forms can be filled from mapped record fields.',
      },
      {
        question: 'Can lenders use this for KYC and AML paperwork workflows?',
        answer:
          'Yes. Mapped template workflows can support recurring compliance document preparation.',
      },
    ],
    relatedIntentPages: ['pdf-to-database-template', 'fillable-form-field-name', 'invoice-pdf-processing'],
    relatedDocs: ['getting-started', 'rename-mapping', 'search-fill'],
  },
  {
    key: 'hr-pdf-automation',
    category: 'industry',
    path: '/hr-pdf-automation',
    navLabel: 'HR PDF Automation',
    heroTitle: 'HR Onboarding and Employee PDF Form Automation',
    heroSummary:
      'Automate job application, onboarding, benefits, and tax-document PDFs by mapping recurring HR forms to structured employee records.',
    seoTitle: 'Auto-Fill HR Onboarding PDFs From Employee Records',
    seoDescription:
      'Pull new-hire data from your system and fill W-4s, I-9s, offer letters, and onboarding packets automatically. Stop retyping the same employee info into every form.',
    seoKeywords: [
      'automate hr onboarding forms',
      'pdf employee form automation',
      'onboarding packet pdf automation',
      'benefits enrollment form automation',
      'w4 1099 pdf automation',
      'new hire paperwork automation',
      'employee document automation software',
      'i9 form automation',
      'hr document workflow tool',
    ],
    valuePoints: [
      'Use one mapped template set for common onboarding packet forms.',
      'Fill employee details from structured HR records instead of retyping.',
      'Support checkbox and text-field heavy benefits documents.',
    ],
    proofPoints: [
      'Repeat-fill workflows reduce turnaround time for HR operations teams.',
      'Mapped templates improve consistency across locations and recruiters.',
      'Template save/reload supports recurring hiring cycles.',
    ],
    articleSections: [
      {
        title: 'Why onboarding packets create repetitive HR data entry',
        paragraphs: [
          'HR teams often repeat the same employee information across multiple forms during onboarding. Names, addresses, dates, job details, tax information, and benefit selections get pushed into several documents even though the underlying employee record already exists elsewhere.',
          'That is why onboarding packets are such a common PDF automation target. The problem is not collecting the data. The problem is repeatedly transferring it into fixed forms under time pressure.',
        ],
      },
      {
        title: 'How one employee record can drive multiple forms',
        paragraphs: [
          'A mapped template workflow lets the HR team use structured employee data as the source for recurring paperwork instead of retyping it. Once each form type is configured, the same employee record can drive multiple onboarding documents through repeat fills.',
          'This is especially useful when several forms share overlapping fields but still need to remain distinct documents. The template layer keeps that overlap manageable.',
        ],
      },
      {
        title: 'Where HR teams should focus their first rollout',
        paragraphs: [
          'The strongest starting point is usually the form that is both high-volume and repetitive, not necessarily the longest form. Build one dependable onboarding or benefits template, validate it with a handful of real employee records, and then extend the same field-naming and mapping conventions across the rest of the packet.',
          'That phased rollout makes it easier to keep templates clean and helps new recruiters or coordinators trust the workflow quickly.',
        ],
      },
      {
        title: 'How to handle role-based packets and department variation',
        paragraphs: [
          'Many HR teams do not just have one onboarding packet. Different departments, states, job classes, and benefits options create packet variation even when the employee record is mostly the same. The safe pattern is to keep one canonical template per recurring document type, then group those templates into packet variants that reflect role or department differences without breaking the underlying naming conventions.',
          'That approach matches the early Search Console demand this page is already seeing around dynamic document generation by employee attributes. The route should answer that question directly: use shared employee data, but keep the packet logic organized around reusable templates and grouped document sets rather than one giant shape-shifting PDF.',
        ],
      },
      {
        title: 'Where HRIS and recruiting-platform exports fit into the workflow',
        paragraphs: [
          'The operational win comes from starting with the system that already holds the employee data. HRIS exports, recruiting-platform exports, and onboarding spreadsheets all work as structured sources once the template names match the schema. That lets the HR team fill W-4s, acknowledgments, benefits forms, and department-specific paperwork from one record instead of retyping the same details across the packet.',
          'This page should therefore speak to more than generic onboarding. It should answer the actual HR question: how do we take employee attributes from our current system and use them to drive several PDFs cleanly? The answer is template discipline first, grouped packet logic second, and controlled Search & Fill validation before broader rollout.',
        ],
      },
      {
        title: 'State-specific tax and benefits forms should be template variants, not exceptions',
        paragraphs: [
          'HR packets often vary because state tax forms, local notices, and benefits paperwork differ by employee location or employment class. That is normal, but it should not force the team back into ad hoc manual entry. The stronger pattern is to keep one canonical template for each recurring state-specific form, then assemble packet variants around those known building blocks.',
          'That keeps the employee record stable even when the packet changes. The source data can stay consistent while the grouped document set changes by jurisdiction, department, or employment type.',
        ],
      },
      {
        title: 'A role and department packet matrix makes template reuse realistic',
        paragraphs: [
          'Most HR teams are not dealing with one universal packet. They are dealing with combinations of documents driven by role, location, benefit eligibility, or contractor-versus-employee status. Thinking in terms of a packet matrix makes the template library more realistic: one template per recurring form, then one group definition per packet variation that staff actually use.',
          'That approach also makes onboarding SEO more specific. The real query is often not just how to fill one onboarding PDF. It is how to use one employee record to drive several packet variants without rebuilding the mapping every time.',
        ],
      },
      {
        title: 'Why ATS and HRIS export cleanup matters before the first fill',
        paragraphs: [
          'The faster the team wants the packet to run, the more important it is to clean the source schema first. Export headers for department, location, start date, benefits choices, and tax attributes need to be stable enough that the mapped templates can trust them. Otherwise the packet logic becomes a second place where staff are forced to interpret messy source data.',
          'A dependable HR automation rollout therefore starts with source cleanup, then template mapping, then grouped packet QA with a few real employee records. That order makes it much easier to expand confidently across departments later.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF automate onboarding PDF packets?',
        answer:
          'Yes. HR teams can map onboarding templates once and fill forms from structured employee records.',
      },
      {
        question: 'Does it support employee tax and benefits forms?',
        answer:
          'Yes. HR-focused PDF templates can include tax and benefits form workflows.',
      },
      {
        question: 'Can HR teams reuse templates for every new hire?',
        answer:
          'Yes. Saved templates support repeat onboarding runs with minimal setup.',
      },
    ],
    relatedIntentPages: ['pdf-to-database-template', 'fill-pdf-from-csv', 'fill-pdf-by-link'],
    relatedDocs: ['getting-started', 'search-fill', 'create-group', 'fill-from-images'],
  },
  {
    key: 'legal-pdf-workflow-automation',
    category: 'industry',
    path: '/legal-pdf-workflow-automation',
    navLabel: 'Legal PDF Workflow Automation',
    heroTitle: 'Legal Document PDF Workflow Automation',
    heroSummary:
      'Automate contract packets, affidavits, motions, and other legal PDF templates by mapping common fields to case or client record data.',
    seoTitle: 'Stop Retyping Court Filings — Automate Legal PDF Forms',
    seoDescription:
      'Map contract templates, court documents, and legal intake forms to your case data. Fill hundreds of legal PDFs in seconds instead of retyping each one.',
    seoKeywords: [
      'legal pdf workflow automation',
      'court document automation',
      'contract pdf to database',
      'legal intake form automation',
      'affidavit template automation',
      'law firm document automation',
      'legal form filler software',
      'retainer agreement pdf automation',
      'case intake packet automation',
    ],
    valuePoints: [
      'Reuse mapped templates for legal intake, contracts, and filing workflows.',
      'Reduce repetitive copy/paste across recurring court or client packets.',
      'Keep field naming consistent for better downstream case-data mapping.',
    ],
    proofPoints: [
      'Search & Fill supports row-based client/case data population.',
      'Editor cleanup handles variable legacy form geometry before production.',
      'Troubleshooting docs provide fast validation steps for misfills.',
    ],
    articleSections: [
      {
        title: 'Why legal teams still rely on repeat PDF packets',
        paragraphs: [
          'Legal operations often depend on fixed forms, repeated packet assembly, and documents that need consistent client or matter data inserted under deadline pressure. Contracts, intake forms, declarations, affidavits, and filing-related documents all create opportunities for repetitive copy and paste when the last mile is still a PDF.',
          'That makes legal document workflows a natural fit for template reuse. The core need is not flashy automation. It is dependable, repeatable output from structured case or client data.',
        ],
      },
      {
        title: 'How mapped templates fit client and case-data workflows',
        paragraphs: [
          'A mapped legal template connects the document field set to the values the team already tracks in practice-management systems, intake sheets, or matter exports. That lets staff fill recurring documents from structured data instead of manually propagating the same names, dates, and identifiers across every packet.',
          'The biggest win comes when naming is normalized early. Legal forms often reuse similar concepts with different visual labels, so clean field names reduce confusion during later mapping and QA.',
        ],
      },
      {
        title: 'What legal teams should validate before standardizing templates',
        paragraphs: [
          'Before a legal template becomes a shared workflow, the team should validate the fields that matter most to the document’s purpose: names, dates, case identifiers, signature-related fields, and any attestations or option-driven sections. That review is what turns the template from a promising draft into something that can be trusted under time pressure.',
          'The same principle applies across a library of legal forms. Fewer, better-reviewed templates are usually more valuable than a larger set of thinly maintained ones.',
        ],
      },
      {
        title: 'The best fit is internal packet automation, not every filing or court program',
        paragraphs: [
          'This route is strongest when a legal team needs repeatable internal packet preparation for contracts, intake sets, declarations, acknowledgments, or other document families that still rely on fixed PDF output. It should not be treated as a blanket answer for every court filing system, every litigated workflow, or every specialized legal process that carries its own submission rules outside the document itself.',
          'That boundary matters because it keeps the page honest and more useful. The product helps when firms already have structured case or client data and need a cleaner way to move that data through recurring PDFs. It is less about replacing the whole legal workflow than about making the document-preparation layer more dependable.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF automate legal contract and filing PDFs?',
        answer:
          'Yes. Legal teams can map recurring templates and fill them from structured client and case records.',
      },
      {
        question: 'Does this work for affidavit and declaration form templates?',
        answer:
          'Yes. Affidavit and declaration-style PDFs can be standardized and reused as mapped templates.',
      },
      {
        question: 'Can law firms maintain consistent field naming across templates?',
        answer:
          'Yes. Rename plus mapping workflows are designed to normalize inconsistent field labels.',
      },
    ],
    relatedIntentPages: ['pdf-signature-workflow', 'pdf-to-database-template', 'fill-pdf-by-link'],
    relatedDocs: ['getting-started', 'search-fill', 'signature-workflow'],
  },
  {
    key: 'education-form-automation',
    category: 'industry',
    path: '/education-form-automation',
    navLabel: 'Education Form Automation',
    heroTitle: 'Education and Admissions PDF Form Automation',
    heroSummary:
      'Automate student application, enrollment, consent, and transcript-request PDFs with reusable templates mapped to admissions data fields.',
    seoTitle: 'Auto-Fill Student Applications and Enrollment PDFs',
    seoDescription:
      'Map admissions, enrollment, consent, and transcript-request forms to your student data. Fill application PDFs in bulk instead of one at a time.',
    seoKeywords: [
      'automate student application pdfs',
      'university form pdf automation',
      'education pdf automation',
      'enrollment form automation',
      'transcript request form automation',
    ],
    valuePoints: [
      'Handle recurring admissions packets and enrollment form workflows.',
      'Map common student data fields once and reuse across terms.',
      'Improve consistency in consent and transcript-request document filling.',
    ],
    proofPoints: [
      'Search-based record selection supports quick admissions form completion.',
      'Template reuse reduces repetitive office operations overhead.',
      'Structured mapping reduces mismatch across multi-form packets.',
    ],
    articleSections: [
      {
        title: 'Why admissions and registrar workflows stay repetitive',
        paragraphs: [
          'Education workflows often require the same student information to appear across multiple documents: admissions forms, enrollment materials, consent forms, transcript requests, and other administrative paperwork. Even when the student data is already structured, staff still end up transferring it into recurring PDF layouts.',
          'That makes education document workflows a strong template use case. The operational problem is not just one form. It is the repeated movement of the same student data across many fixed documents.',
        ],
      },
      {
        title: 'How student-data mapping improves recurring packet preparation',
        paragraphs: [
          'Once a form is mapped to the underlying student-data schema, teams can search or select the right record and fill the PDF with much less manual work. That helps admissions, registrars, and administrative staff standardize output even when the packet includes several documents with overlapping fields.',
          'The value compounds when teams reuse the same mapping patterns across terms and programs. Clean naming and stable schema relationships reduce avoidable mismatch later.',
        ],
      },
      {
        title: 'How to reuse templates across terms and form revisions',
        paragraphs: [
          'The safest maintenance pattern is to keep each recurring form type as a canonical template, then update that template when the school revises the document. That is easier to manage than letting small visual revisions create a sprawl of nearly-identical templates.',
          'When the naming conventions stay stable, teams can adjust the geometry or field set of a revised form without losing the broader workflow discipline that made the template useful in the first place.',
        ],
      },
      {
        title: 'Student-submitted intake and packet reuse can coexist in one workflow',
        paragraphs: [
          'Education teams do not always start with the same source data. Sometimes the registrar already has the record. Sometimes the student, applicant, or family still needs to submit information first. The practical answer is not to split into completely separate document systems. It is to keep one saved template library and let the data come from either internal records or a respondent-first intake flow when that makes more sense.',
          'That keeps admissions, consent, and transcript-request workflows much easier to maintain. The student-facing collection step can change by program or term, while the final PDF packet logic stays organized around reusable templates that staff already understand.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF automate admissions and enrollment PDFs?',
        answer:
          'Yes. Admissions teams can map and reuse student form templates for repeat cycles.',
      },
      {
        question: 'Does this support transcript request and consent forms?',
        answer:
          'Yes. Education teams can automate repetitive transcript and consent form workflows.',
      },
      {
        question: 'Can schools use one template across semesters?',
        answer:
          'Yes. Saved templates can be reused and adjusted as forms evolve.',
      },
    ],
    relatedIntentPages: ['fill-pdf-by-link', 'pdf-to-database-template', 'batch-fill-pdf-forms'],
    relatedDocs: ['getting-started', 'fill-by-link', 'create-group'],
  },
  {
    key: 'nonprofit-pdf-form-automation',
    category: 'industry',
    path: '/nonprofit-pdf-form-automation',
    navLabel: 'Nonprofit PDF Form Automation',
    heroTitle: 'Nonprofit and Human Services PDF Form Automation',
    heroSummary:
      'Automate grant, volunteer, intake, and funding-compliance PDFs with reusable templates mapped to your structured nonprofit program data.',
    seoTitle: 'Nonprofit PDF Form and Grant Workflow Automation | DullyPDF',
    seoDescription:
      'Automate nonprofit PDF forms, streamline grant and volunteer paperwork, and map recurring human services documents to structured data.',
    seoKeywords: [
      'nonprofit pdf form automation',
      'grant pdf automation',
      'volunteer registration pdf automation',
      'human services form automation',
      'nonprofit intake pdf automation',
      'charity form filler',
      'nonprofit document workflow',
      'grant application form automation',
      'donor management form automation',
    ],
    valuePoints: [
      'Support grant packets, volunteer onboarding, and program intake forms.',
      'Reduce repetitive manual entry in resource-constrained operations teams.',
      'Map recurring fields to shared data columns for repeat submissions.',
    ],
    proofPoints: [
      'Saved templates keep frequent submission workflows consistent.',
      'Search & Fill supports quick record lookup before form output.',
      'Docs provide practical troubleshooting for mapping and fill issues.',
    ],
    articleSections: [
      {
        title: 'Why nonprofit teams benefit from template reuse quickly',
        paragraphs: [
          'Nonprofit and human-services teams often work under tighter staffing and budget constraints than the number of recurring forms would suggest. Grant paperwork, volunteer onboarding, client intake packets, and compliance documents all compete for the same staff time, which makes repetitive PDF entry especially expensive.',
          'That is why template reuse can create visible gains quickly in nonprofit operations. Even modest reductions in retyping and form cleanup free up time for the actual program work.',
        ],
      },
      {
        title: 'How mapped templates fit grants, volunteer, and intake workflows',
        paragraphs: [
          'A mapped template gives the team a repeatable way to connect shared program, client, or volunteer data to the PDF layouts they keep using. That is helpful for internal program intake, volunteer processes, and recurring grant-related documents where many fields repeat across submissions.',
          'Once the template is established, staff can fill the document from structured records instead of rebuilding the same information by hand every time.',
        ],
      },
      {
        title: 'How smaller teams should phase rollout',
        paragraphs: [
          'The best rollout for a smaller team is to start with the form that recurs most often or causes the most avoidable rework. Build one dependable template, validate it with real records, and only then expand to adjacent forms. That keeps the effort proportional and avoids overwhelming the team with too many half-finished templates.',
          'Over time, a small but trusted library usually performs better than a larger library that nobody feels confident using.',
        ],
      },
      {
        title: 'Volunteer and client intake usually work best when the data is collected once and reused everywhere',
        paragraphs: [
          'Many nonprofit teams are juggling the same names, addresses, program details, and acknowledgments across several documents. That is why intake discipline matters as much as the template itself. If the organization can collect the data once, review it, and then reuse it across volunteer packets, grant forms, or human-services intake PDFs, the workflow becomes much easier to scale without adding staff burden.',
          'That reuse is especially important for teams operating under grant and staffing constraints. The real win is not only faster form completion. It is reducing how many times someone has to touch the same information before the program work can actually move forward.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF automate grant and volunteer PDF workflows?',
        answer:
          'Yes. Nonprofit teams can map recurring forms and populate them from structured records.',
      },
      {
        question: 'Is this useful for human services intake packets?',
        answer:
          'Yes. Intake-style packet templates can be standardized and reused across programs.',
      },
      {
        question: 'Can smaller teams benefit from template reuse?',
        answer:
          'Yes. Template reuse reduces repetitive manual entry and improves consistency.',
      },
    ],
    relatedIntentPages: ['fill-pdf-by-link', 'pdf-to-database-template', 'batch-fill-pdf-forms'],
    relatedDocs: ['getting-started', 'fill-by-link', 'search-fill'],
  },
  {
    key: 'logistics-pdf-automation',
    category: 'industry',
    path: '/logistics-pdf-automation',
    navLabel: 'Logistics PDF Automation',
    heroTitle: 'Logistics and Transportation PDF Form Automation',
    heroSummary:
      'Automate bill of lading, safety inspection, and delivery receipt PDFs by mapping logistics form fields to structured shipment and operations data.',
    seoTitle: 'Auto-Fill Logistics PDFs — BOLs, Inspections, and Delivery Receipts',
    seoDescription:
      'Map bill of lading, safety inspection, and delivery receipt forms to your shipment data. Fill logistics PDFs automatically instead of by hand.',
    seoKeywords: [
      'transport pdf automation',
      'logistics form to database',
      'bill of lading automation',
      'delivery receipt pdf automation',
      'safety inspection form automation',
      'freight document automation',
      'shipping paperwork digitization',
      'bol form filler',
      'trucking form automation',
      'supply chain pdf workflow',
    ],
    valuePoints: [
      'Standardize recurring shipping, inspection, and delivery document templates.',
      'Map shipment and carrier fields to structured operations data.',
      'Reduce repetitive manual entry for dispatch and back-office teams.',
    ],
    proofPoints: [
      'Search & Fill supports rapid row selection for route or shipment records.',
      'Field editor and inspector tools handle template quality checks.',
      'Template reuse supports repeated daily form output operations.',
    ],
    articleSections: [
      {
        title: 'Why logistics operations still revolve around recurring paperwork',
        paragraphs: [
          'Logistics and transportation teams often have structured operational data but still finish the job through recurring paperwork. Bills of lading, delivery receipts, inspection forms, and shipment-related PDFs continue to move between dispatch, operations, and back-office teams even when the route and shipment data already exists in another system.',
          'That makes logistics paperwork a strong fit for template automation. The data is often available. The friction comes from repeatedly placing it into fixed document layouts.',
        ],
      },
      {
        title: 'How shipment data maps into repeat document output',
        paragraphs: [
          'A mapped logistics template connects shipment, route, carrier, or delivery fields to the PDF once so the team can fill documents from structured records later. Instead of rebuilding the same paperwork by hand for each shipment, staff can select the right record and let the template drive the output.',
          'This becomes especially useful in high-frequency operations where the same document type is prepared many times each day under tight turnaround expectations.',
        ],
      },
      {
        title: 'How to keep high-volume document templates stable',
        paragraphs: [
          'For high-volume logistics work, stability matters as much as speed. Teams should define one canonical template per recurring document type, validate the important fields with real shipment records, and update the template only when the form itself changes materially.',
          'That discipline prevents a sprawl of lightly different versions that slows teams down when they need the process to be fast and predictable.',
        ],
      },
      {
        title: 'Recipient and driver signoff should happen after the document is populated, not before',
        paragraphs: [
          'Many logistics documents are not finished once the data is filled. Delivery receipts, inspection acknowledgments, and handoff records may still need a recipient or driver signoff. That step works best after the shipment data has already been applied and the final record is ready to review, not while the document is still drifting through manual edits.',
          'Keeping fill first and signoff second makes the retained record much easier to trust later. The operations team knows which final document was completed, and the workflow stays much cleaner than an ad hoc print-sign-scan loop that breaks the data trail immediately.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF automate bill of lading and delivery receipt PDFs?',
        answer:
          'Yes. Logistics teams can map those recurring forms and fill them from structured records.',
      },
      {
        question: 'Does this support transportation safety inspection forms?',
        answer:
          'Yes. Inspection forms can be standardized and reused as mapped templates.',
      },
      {
        question: 'Can operations teams maintain one template per document type?',
        answer:
          'Yes. Saved template workflows support canonical forms for recurring logistics tasks.',
      },
    ],
    relatedIntentPages: ['pdf-signature-workflow', 'batch-fill-pdf-forms', 'invoice-pdf-processing'],
    relatedDocs: ['getting-started', 'search-fill', 'signature-workflow'],
  },
  {
    key: 'batch-fill-pdf-forms',
    category: 'workflow',
    path: '/batch-fill-pdf-forms',
    navLabel: 'Batch Fill PDF Forms',
    heroTitle: 'Batch Fill PDF Forms From Multiple Records',
    heroSummary:
      'Fill the same PDF template with multiple records from your CSV, Excel, or JSON data. Map once, then fill form after form in seconds.',
    seoTitle: 'Free Automatic Batch Fill PDF Forms From CSV and Excel | DullyPDF',
    seoDescription:
      'Use free automatic batch-style PDF filling by mapping a template once, then repeatedly filling it from CSV, Excel, or JSON records through Search & Fill.',
    seoKeywords: [
      'batch fill pdf forms',
      'free batch fill pdf forms',
      'automatic batch pdf filling',
      'bulk pdf filling',
      'fill multiple pdfs from spreadsheet',
      'batch pdf form automation',
      'mass pdf generation from data',
      'high volume pdf filling tool',
      'pdf mail merge tool',
      'automated document batch processing',
    ],
    valuePoints: [
      'Map a PDF template once and fill it from any number of records.',
      'Search and select rows individually for controlled batch output.',
      'Clear and refill between records to verify mapping quality.',
    ],
    proofPoints: [
      'Search & Fill supports fast row switching for sequential form filling.',
      'Templates persist mapping context between fill sessions.',
      'Filled output can be downloaded immediately for each record.',
    ],
    articleSections: [
      {
        title: 'What batch fill means in DullyPDF',
        paragraphs: [
          'Some teams searching for batch fill PDF forms expect a fire-and-forget bulk generator. DullyPDF is more deliberate than that. It is designed around a mapped template plus repeat record selection, which means you can fill the same document again and again from structured data while keeping human review in the loop.',
          'That is still a batch-style workflow in the operational sense. You map once, then process many records. The difference is that the product prioritizes controlled output over blind mass generation.',
        ],
      },
      {
        title: 'How to process many records without losing QA',
        paragraphs: [
          'The practical pattern is to open the mapped template, search or select the first row, fill the PDF, inspect the result, clear it, and repeat for the next record. That sounds slower than a pure batch export, but it is often the right tradeoff for forms where the cost of a bad fill is higher than the cost of a quick review step.',
          'Because the mapping context persists, the operator is not rebuilding the workflow each time. They are running a repeatable fill loop against a stable template.',
        ],
        bullets: [
          'Map the template once before starting the run.',
          'Use row search to pull up the right record quickly.',
          'Clear and refill between records so each output starts from a known state.',
        ],
      },
      {
        title: 'When controlled sequential fill is better than blind bulk generation',
        paragraphs: [
          'If the document is simple, a pure bulk generator may be fine. But many real-world forms contain dates, checkboxes, repeated names, and edge-case fields that still benefit from a brief review before the output is sent or archived. That is where DullyPDF’s workflow is strongest.',
          'The template does the hard work once, and the operator keeps enough control to catch mistakes early rather than after an entire export run has completed.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I fill the same PDF form with different records?',
        answer:
          'Yes. After mapping, use Search & Fill to select any row and populate the template, then clear and fill with the next record.',
      },
      {
        question: 'Does DullyPDF support bulk PDF generation?',
        answer:
          'DullyPDF fills one record at a time through Search & Fill for controlled output. Map once, then fill repeatedly from your data rows.',
      },
      {
        question: 'What data sources work for batch filling?',
        answer:
          'CSV, XLSX, and JSON files with row data. Each row represents one form to fill.',
      },
    ],
  },
  {
    key: 'pdf-checkbox-automation',
    category: 'workflow',
    path: '/pdf-checkbox-automation',
    navLabel: 'PDF Checkbox Automation',
    heroTitle: 'Automate PDF Checkbox Fields With Rule-Based Logic',
    heroSummary:
      'DullyPDF handles complex checkbox scenarios including yes/no pairs, enum selections, multi-select lists, and presence-based toggles with configurable rule logic.',
    seoTitle: 'Free Automatic PDF Checkbox Automation | DullyPDF',
    seoDescription:
      'Use free automatic PDF checkbox automation with yes/no, enum, presence, and list rules. Map checkbox groups to data columns for reliable output.',
    seoKeywords: [
      'pdf checkbox automation',
      'free pdf checkbox automation',
      'automatic checkbox fill pdf',
      'auto fill checkboxes pdf',
      'pdf checkbox rules',
      'checkbox form automation',
    ],
    valuePoints: [
      'Support four checkbox rule types: yes_no, presence, enum, and list.',
      'Map checkbox groups and option keys to structured data columns.',
      'Handle multi-select checkbox fields with list-based splitting.',
    ],
    proofPoints: [
      'Checkbox rule precedence follows a defined six-step resolution order.',
      'Built-in alias fallback groups handle common medical and HR patterns.',
      'Boolean token normalization covers yes/no, true/false, 1/0, and variants.',
    ],
    articleSections: [
      {
        title: 'Why checkbox automation is harder than text fill',
        paragraphs: [
          'Checkboxes look simple on the page, but they are usually the part of a PDF workflow that breaks first. A text field can often accept a value directly. A checkbox field needs the system to understand what the source value means, which box it belongs to, and whether the form expects a boolean, an option selection, or a list-style interpretation.',
          'That is why checkbox-heavy forms often feel unreliable in generic fill workflows. The hard part is not ticking a box. It is modeling the decision logic behind that box correctly.',
        ],
      },
      {
        title: 'How DullyPDF models checkbox groups and rules',
        paragraphs: [
          'DullyPDF handles checkboxes through group keys, option keys, and explicit rule types such as yes_no, presence, enum, and list. That gives the template a way to interpret the incoming value rather than guessing from the visual layout alone.',
          'Once the checkbox metadata is configured, the same logic can be reused across recurring fills. That is especially important in medical, HR, and intake workflows where checkboxes often carry real operational meaning.',
        ],
      },
      {
        title: 'How to QA checkbox-heavy templates',
        paragraphs: [
          'The best QA process is to test the template with records that exercise different checkbox states, not just a single happy-path row. Use records that trigger yes and no cases, multiple options, and empty states so you can see how the template behaves before it is shared widely.',
          'If the checkbox logic is correct under those conditions, the rest of the document usually becomes much easier to trust.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF auto-fill checkboxes in PDF forms?',
        answer:
          'Yes. DullyPDF supports rule-based checkbox automation with yes/no, presence, enum, and list modes.',
      },
      {
        question: 'How does checkbox group mapping work?',
        answer:
          'Each checkbox has a groupKey and optionKey. Map the group to a data column, and DullyPDF selects the correct option based on the cell value and rule type.',
      },
      {
        question: 'Does this work for forms with dozens of checkboxes?',
        answer:
          'Yes. Checkbox-heavy forms like medical intake and benefits enrollment are common use cases for rule-based automation.',
      },
    ],
  },
  {
    key: 'pdf-radio-button-editor',
    category: 'workflow',
    path: '/pdf-radio-button-editor',
    navLabel: 'PDF Radio Button Editor',
    heroTitle: 'Edit PDF Radio Button Groups Without Losing Single-Select Logic',
    heroSummary:
      'Create, inspect, and map PDF radio fields with explicit group keys and option keys so single-select forms stay predictable during Search & Fill, API Fill, and web-form publishing.',
    seoTitle: 'PDF Radio Button Editor and Radio Group Mapping | DullyPDF',
    seoDescription:
      'Edit PDF radio buttons, create single-select radio groups, and map radio option keys to structured data for reliable fill behavior in DullyPDF.',
    seoKeywords: [
      'pdf radio button editor',
      'pdf radio buttons',
      'edit pdf radio groups',
      'pdf radio group mapping',
      'single select pdf form fields',
      'radio button pdf automation',
    ],
    valuePoints: [
      'Create and inspect radio fields directly in the editor instead of treating them like generic checkboxes.',
      'Keep single-select groups explicit through group keys, option keys, and quick-radio helpers.',
      'Reuse the same radio metadata across Search & Fill, API Fill, and Fill By Web Form Link publishing.',
    ],
    proofPoints: [
      'Runtime fill logic now depends on deterministic radio group metadata instead of legacy checkbox hints.',
      'PDF import preserves radio widgets as radio fields so saved templates keep the correct single-select behavior.',
      'Template snapshots and public schemas include radio group expectations for later fill and API workflows.',
    ],
    articleSections: [
      {
        title: 'Why radio buttons should not be modeled like checkboxes',
        paragraphs: [
          'A checkbox and a radio button may both look like small click targets on a PDF page, but they behave very differently. Checkboxes can represent booleans or multi-select choices. Radio buttons represent one selected option inside a mutually exclusive group. If a system treats both field types the same way, the single-select behavior starts to break down as soon as real data touches the form.',
          'That is why DullyPDF now treats radio fields as their own first-class template metadata instead of relying on checkbox hints. The template needs to know which options belong together, which option key each widget represents, and how one selected value should be resolved later.',
        ],
      },
      {
        title: 'How radio groups stay stable across fill workflows',
        paragraphs: [
          'Once the radio group is explicit, the same metadata can drive multiple workflows cleanly. Search & Fill can choose one option key from a row value. API Fill can expose the same expectation in the published schema. Fill By Web Form Link can translate the single-select choice into the right downstream PDF behavior without inventing a second model for respondent questions.',
          'That consistency matters because radio fields often represent business-critical selections: employment status, coverage class, marital status, application type, or other mutually exclusive answers. Those fields need a stronger contract than a visual checkbox guess.',
        ],
      },
      {
        title: 'How to QA radio-heavy templates',
        paragraphs: [
          'The best QA loop is to test one option from each radio group, then retest the same template with a different option from the same group. That confirms the group is actually single-select and that no old option stays active after refill. If a template passes that check across the important groups, the radio behavior is usually production-safe.',
          'Radio QA also becomes easier once the inspector shows the group key and option key directly. You are validating explicit metadata instead of trying to infer what the PDF author meant later.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF edit radio button groups in existing PDFs?',
        answer:
          'Yes. The editor supports radio fields with explicit group keys and option keys so single-select behavior is preserved in saved templates.',
      },
      {
        question: 'How are radio buttons different from checkboxes in DullyPDF?',
        answer:
          'Radio fields are single-select groups. DullyPDF keeps them separate from checkbox rules so only one option is chosen per group during fill workflows.',
      },
      {
        question: 'Do radio groups work in API Fill and Fill By Web Form Link too?',
        answer:
          'Yes. Radio group metadata is preserved in template snapshots and can drive Search & Fill, API Fill, and respondent-facing web-form publishing.',
      },
    ],
  },
  {
    key: 'pdf-field-detection-tool',
    category: 'workflow',
    path: '/pdf-field-detection-tool',
    navLabel: 'PDF Field Detection Tool',
    heroTitle: 'Detect Form Fields in Any PDF With AI',
    heroSummary:
      'Upload any PDF and let AI detect text fields, checkboxes, date fields, and signature areas automatically. Review confidence scores and refine in the visual editor.',
    seoTitle: 'Free Automatic AI PDF Field Detection Tool | DullyPDF',
    seoDescription:
      'Use DullyPDF as a free automatic AI PDF field detection tool to identify text, checkbox, date, and signature fields in existing PDFs.',
    seoKeywords: [
      'pdf field detection',
      'free pdf field detection tool',
      'automatic pdf field detection',
      'detect form fields in pdf',
      'pdf field detection tool',
      'ai form field detection',
      'find fields in pdf automatically',
      'pdf form field recognition',
      'ai pdf form scanner',
      'intelligent form field finder',
    ],
    valuePoints: [
      'Detect text, date, checkbox, and signature fields automatically.',
      'Review confidence scores to prioritize fields needing manual review.',
      'Refine detection results with visual editor tools.',
    ],
    proofPoints: [
      'Supports PDF uploads up to 50MB with multi-page detection.',
      'Confidence tiers: high (80%+), medium (65-80%), low (below 65%).',
      'Field geometry uses normalized top-left origin coordinates.',
    ],
    articleSections: [
      {
        title: 'How AI field detection works on flat PDFs',
        paragraphs: [
          'Most PDFs that teams want to automate are not born with clean embedded form metadata. They are flat documents with boxes, lines, labels, and visual cues that a person can interpret but a normal PDF workflow cannot fill directly. DullyPDF addresses that by rendering the page, analyzing the visual layout, and proposing likely fields such as text boxes, dates, checkboxes, and signature areas.',
          'The output is a draft field set that still needs review, but it is much faster than creating every field manually from scratch. That is the real operational value of field detection.',
        ],
      },
      {
        title: 'Where detection is strong and where review is required',
        paragraphs: [
          'Detection usually performs best on clean PDFs with clear contrast and form structure. It usually needs more review on noisy scans, dense tables, heavily decorated forms, or layouts where visual boxes are close together. Those cases are not failures so much as the normal edge cases of document automation.',
          'The confidence score is there to help prioritize review. High-confidence detections often need minimal changes, while low-confidence items deserve attention first.',
        ],
      },
      {
        title: 'What to do after the first detection pass',
        paragraphs: [
          'After detection, the most effective next step is cleanup rather than immediate filling. Review the suggested fields, fix geometry, remove false positives, add anything the detector missed, and only then move into rename and mapping if the document will be filled from structured data.',
          'That workflow keeps the template clean and makes every later step more reliable. Detection creates the draft. The editor is where that draft becomes a usable template.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF detect fields in scanned PDFs?',
        answer:
          'Yes. The AI model analyzes rendered page images and works with both native and scanned PDFs.',
      },
      {
        question: 'How accurate is field detection?',
        answer:
          'Detection quality depends on PDF clarity. High-confidence detections (80%+) are typically accurate. Low-confidence items should be reviewed.',
      },
      {
        question: 'Can I add fields the AI missed?',
        answer:
          'Yes. The editor lets you add text, date, checkbox, and signature fields manually for regions the detector did not identify.',
      },
    ],
  },
  {
    key: 'construction-pdf-automation',
    category: 'industry',
    path: '/construction-pdf-automation',
    navLabel: 'Construction PDF Automation',
    heroTitle: 'Construction Permit and Safety Form PDF Automation',
    heroSummary:
      'Automate construction permits, safety inspection forms, change orders, and daily logs by mapping PDF fields to project and subcontractor data.',
    seoTitle: 'Construction PDF Form Automation for Permits and Safety | DullyPDF',
    seoDescription:
      'Automate construction permit PDFs, safety inspection forms, and change orders with mapped templates and structured project data.',
    seoKeywords: [
      'construction pdf automation',
      'permit form automation',
      'safety inspection form pdf',
      'construction change order automation',
      'daily log pdf automation',
      'contractor document workflow',
      'building permit form filler',
      'osha inspection form automation',
      'construction project paperwork tool',
    ],
    valuePoints: [
      'Standardize permit, inspection, and change order form templates.',
      'Map project and subcontractor data fields to form inputs.',
      'Reuse templates across job sites and recurring submission cycles.',
    ],
    proofPoints: [
      'Search & Fill supports fast row selection from project records.',
      'Editor tools handle variable legacy form layouts from different agencies.',
      'Template reuse reduces repetitive data entry for field office teams.',
    ],
    articleSections: [
      {
        title: 'Why construction paperwork stays repetitive across job sites',
        paragraphs: [
          'Construction teams often deal with recurring permits, inspection forms, daily logs, change orders, and subcontractor paperwork that still move as PDFs between field offices, general contractors, and local agencies. The same project and subcontractor data may be typed repeatedly into different forms because the layouts stay fixed while the operational data keeps changing.',
          'That makes construction paperwork a strong candidate for reusable templates. The pain is not the existence of the forms. It is the repeated transfer of the same project information into them.',
        ],
      },
      {
        title: 'How project-data mapping helps permits, inspections, and change orders',
        paragraphs: [
          'A mapped template lets the team connect job, site, subcontractor, and scheduling data to the form once so later fills become much faster. That is useful across permit workflows, inspection forms, and change-order documents where many core fields repeat.',
          'When the template is stable, staff can select the right project record and generate the document without reconstructing the field relationships every time.',
        ],
      },
      {
        title: 'How to standardize templates across agencies and crews',
        paragraphs: [
          'Construction teams often face variation across municipalities, owners, and project types. The best way to manage that is to define which documents are true recurring standards, keep one canonical template for each, and only split into separate templates when the layout or field logic really changes.',
          'That keeps the template library useful to both office staff and field teams instead of becoming another source of confusion during active project work.',
        ],
      },
      {
        title: 'Office and field teams need one canonical packet, not local form drift',
        paragraphs: [
          'Construction workflows break down quickly when each crew or office starts keeping its own version of the same permit, inspection, or change-order form. A stronger pattern is to keep one canonical template per recurring document type, then organize those templates into packet workflows that office and field teams both recognize. That makes it much easier to hand off work between people without resetting the process every time.',
          'The payoff is not just faster fill. It is cleaner coordination. When the same project record can drive the same reviewed packet across job sites and teams, the paperwork layer stops becoming another source of delay.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF automate construction permit PDF forms?',
        answer:
          'Yes. Upload permit forms, detect fields, map to your project data, and fill them from structured records.',
      },
      {
        question: 'Does this work for safety inspection and daily log forms?',
        answer:
          'Yes. Safety inspection and daily log PDFs can be standardized as mapped templates.',
      },
      {
        question: 'Can GCs reuse templates across multiple job sites?',
        answer:
          'Yes. Saved templates can be reused for recurring form types across projects.',
      },
    ],
    relatedIntentPages: ['batch-fill-pdf-forms', 'pdf-signature-workflow', 'invoice-pdf-processing'],
    relatedDocs: ['getting-started', 'create-group', 'signature-workflow'],
  },
  {
    key: 'accounting-tax-pdf-automation',
    category: 'industry',
    path: '/accounting-tax-pdf-automation',
    navLabel: 'Accounting & Tax PDF Automation',
    heroTitle: 'Accounting and Tax Form PDF Automation Workflows',
    heroSummary:
      'Automate W-9s, 1099s, engagement letters, and other accounting-related PDFs by mapping form fields to client records and tax preparation data.',
    seoTitle: 'Accounting and Tax PDF Form Automation | DullyPDF',
    seoDescription:
      'Automate accounting and tax PDF forms, fill W-9 and 1099 templates from client data, and streamline CPA firm document workflows.',
    seoKeywords: [
      'accounting pdf automation',
      'tax form pdf automation',
      'w9 form automation',
      '1099 pdf automation',
      'cpa firm pdf automation',
      'bookkeeper form filler',
      'tax preparer document automation',
      'engagement letter pdf automation',
      'accounting firm document workflow',
    ],
    valuePoints: [
      'Map client and entity data to recurring tax and engagement forms.',
      'Reduce rekeying for W-9 collection, 1099 preparation, and engagement letters.',
      'Support repeat workflows across clients and tax seasons.',
    ],
    proofPoints: [
      'Template reuse supports high-volume tax season processing.',
      'Search & Fill handles quick client record lookup from data exports.',
      'Rename and mapping improve consistency for inconsistent legacy form labels.',
    ],
    articleSections: [
      {
        title: 'Why accounting and tax forms are good template candidates',
        paragraphs: [
          'Accounting and tax workflows often repeat the same client and entity data across standard forms. W-9s, 1099-related paperwork, engagement letters, and other recurring documents all reuse details that already exist in client records, bookkeeping exports, or prep workflows. The friction comes from repeatedly placing that data into fixed PDFs.',
          'That makes these documents strong candidates for template automation. Once the form layout is mapped, the same client data can drive repeat fills without the same level of manual re-entry.',
        ],
      },
      {
        title: 'How client-data mapping supports W-9, 1099, and engagement workflows',
        paragraphs: [
          'A mapped accounting template connects client or entity data to the PDF field set once, then supports later filling from structured records. That helps reduce repetitive rekeying during onboarding, vendor documentation, engagement setup, and seasonal tax preparation workflows.',
          'The biggest gains usually come from keeping names and identifiers consistent across the template library so staff can trust the workflow even when pressure increases during busy periods.',
        ],
      },
      {
        title: 'How firms should prepare for tax-season volume',
        paragraphs: [
          'The best rollout is to build and validate the recurring forms before the peak workload arrives. Start with the documents that consume the most repetitive time, test them with real client records, and make sure the template behaves correctly before it becomes part of the seasonal process.',
          'A small library of dependable templates usually creates more value than a larger set of unreviewed forms that fail when the team needs them most.',
        ],
      },
      {
        title: 'Tax season gets easier when W-9, engagement, and intake documents share one client data model',
        paragraphs: [
          'Firms usually feel the most friction when client details live in several slightly different exports or intake spreadsheets. That inconsistency shows up immediately once the same information needs to land in W-9 collection, engagement documents, vendor paperwork, and later tax-season forms. The cleaner answer is to normalize the client schema first and let the recurring PDFs map to that shared data model.',
          'That way the template library scales with the client record instead of fighting it. The more the documents agree on names and identifiers, the easier it becomes to reuse the same mapped forms under seasonal pressure without staff translating the same data by hand every time.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF automate W-9 and 1099 PDF forms?',
        answer:
          'Yes. Tax document templates can be mapped to client data and filled from structured records.',
      },
      {
        question: 'Does this work for CPA firm engagement letters?',
        answer:
          'Yes. Engagement letter templates can be standardized and reused across clients.',
      },
      {
        question: 'Can accounting teams handle tax season volume with templates?',
        answer:
          'Yes. Saved templates support repeat filling from client data exports for high-volume processing.',
      },
    ],
    relatedIntentPages: ['pdf-to-database-template', 'fill-information-in-pdf', 'invoice-pdf-processing'],
    relatedDocs: ['getting-started', 'search-fill', 'fill-from-images'],
  },
  {
    key: 'invoice-pdf-processing',
    category: 'industry',
    path: '/invoice-pdf-processing',
    navLabel: 'Invoice PDF Processing',
    heroTitle: 'Extract Invoice Data Into PDF Forms Automatically',
    heroSummary:
      'Upload invoice images or scanned PDFs and let DullyPDF extract vendor names, amounts, dates, and line items into your form fields using AI vision.',
    seoTitle: 'Invoice PDF Processing — Extract Data from Invoices to Fill Forms',
    seoDescription:
      'Automate invoice data entry into PDF forms. Upload photos or scans of invoices and extract vendor, amount, date, and line-item data into mapped template fields with AI vision.',
    seoKeywords: [
      'invoice pdf processing',
      'extract data from invoice',
      'invoice to pdf form',
      'automated invoice data entry',
      'invoice ocr pdf fill',
      'scan invoice fill form',
      'invoice data extraction tool',
      'invoice automation pdf',
      'photo to invoice data',
      'invoice capture and fill',
      'accounts payable pdf automation',
    ],
    valuePoints: [
      'Upload photos or scans of invoices and extract vendor, date, and amount data automatically.',
      'Map extracted values to your PDF form fields with confidence-scored review before applying.',
      'Eliminate manual data entry for recurring invoice-to-form workflows across AP, accounting, and procurement.',
    ],
    proofPoints: [
      'AI vision reads invoices semantically — it matches by meaning, not exact position.',
      'Each extraction shows per-field confidence scores so operators can verify before committing.',
      'Credits are transparent: 1 credit per image, 1 credit per 5 pages for PDF documents.',
    ],
    articleSections: [
      {
        title: 'Why invoice data entry into PDF forms is still painful',
        paragraphs: [
          'Most businesses receive invoices as images, email attachments, or scanned PDFs. When that data needs to land in a structured PDF form — whether for purchase orders, expense reports, payment authorization, or tax documentation — someone has to read the invoice and type the values manually.',
          'That manual step is where errors happen, time is lost, and scaling becomes impossible. DullyPDF Fill from Images and Documents removes that bottleneck by letting the AI read the invoice and suggest the matching values for each form field.',
        ],
      },
      {
        title: 'How Fill from Images and Documents works for invoices',
        paragraphs: [
          'Set up your PDF form template in DullyPDF with named fields (vendor name, invoice number, date, total amount, line items). Upload one or more invoice images or scanned PDFs. The AI vision model reads each invoice, matches extracted data to your form fields using both field names and nearby label context, and returns values with confidence scores.',
          'You review the results, edit any values that need correction, reject fields you want to fill manually, and apply the rest. The entire process takes seconds instead of minutes per invoice.',
        ],
      },
      {
        title: 'Common invoice processing scenarios',
        paragraphs: [
          'Accounts payable teams processing vendor invoices into payment authorization forms. Construction companies extracting subcontractor invoice data into project cost tracking PDFs. Healthcare organizations filling insurance claim forms from provider invoices. Accounting firms pulling client invoice data into tax preparation worksheets.',
          'In each case, the source is an unstructured invoice and the destination is a structured PDF form. Fill from Images and Documents bridges that gap without requiring custom OCR pipelines or enterprise software.',
        ],
      },
      {
        title: 'Credit cost for invoice processing',
        paragraphs: [
          'Each uploaded invoice image costs 1 credit. Scanned PDF invoices cost 1 credit per 5 pages (rounded up per document). The dialog shows the exact cost before extraction runs. Credits come from the same OpenAI pool used by Rename and Map operations.',
          'For high-volume invoice processing, Premium plan users get 500 monthly credits with optional 500-credit refill packs. Most single-page invoice extractions cost just 1 credit.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I extract data from a photo of an invoice?',
        answer:
          'Yes. Upload a photo (JPG, PNG) of the invoice and Fill from Images and Documents will extract matching values into your template fields.',
      },
      {
        question: 'Does this work with multi-page scanned invoices?',
        answer:
          'Yes. Upload the invoice as a PDF and each page is rendered and analyzed. Costs 1 credit per 5 pages.',
      },
      {
        question: 'How accurate is the extraction?',
        answer:
          'Each extracted value shows a confidence score. Clear, well-lit documents typically achieve 80-95% confidence. You can edit or reject any value before applying.',
      },
      {
        question: 'What invoice fields can be extracted?',
        answer:
          'Any field on your template: vendor name, invoice number, date, amounts, line items, tax ID, addresses, and more. The AI matches by semantic meaning, not fixed positions.',
      },
      {
        question: 'How many credits does invoice processing cost?',
        answer:
          'Each image costs 1 credit. Each PDF document costs 1 credit per 5 pages. The dialog shows the cost before you click Send.',
      },
    ],
    relatedIntentPages: ['accounting-tax-pdf-automation', 'fill-information-in-pdf', 'finance-loan-pdf-automation'],
    relatedDocs: ['fill-from-images', 'search-fill', 'rename-mapping'],
  },
  // ---------------------------------------------------------------------------
  // Developer-focused SEO landing pages.
  //
  // These three pages target the "developer evaluating a PDF fill API" search
  // intent that the rest of the workflow pages do not capture well. They link
  // back to /pdf-fill-api (the product page) and /usage-docs/api-fill (the
  // setup docs) so the search-to-product path is short.
  // ---------------------------------------------------------------------------
  {
    key: 'anvil-alternative',
    category: 'workflow',
    path: '/anvil-alternative',
    navLabel: 'Anvil Alternative',
    heroTitle: 'Anvil Alternative: Free PDF Fill API + Webform Builder',
    heroSummary:
      'A side-by-side look at when DullyPDF is the right Anvil replacement and when Anvil still wins. Free tier, JSON-to-PDF API, webforms, and field detection without the $79/mo entry price.',
    seoTitle: 'Anvil Alternative — Free PDF Fill API and Webform Builder | DullyPDF',
    seoDescription:
      'Looking for an Anvil (useanvil.com) alternative? Compare DullyPDF vs Anvil for PDF fill API, webforms, and e-signatures. Free tier available, no $79/mo starter.',
    seoKeywords: [
      'anvil alternative',
      'useanvil alternative',
      'alternative to anvil',
      'anvil pdf api alternative',
      'free anvil alternative',
      'anvil competitors',
      'pdf fill api comparison',
      'webform pdf api alternative',
      'cheap anvil alternative',
      'anvil pricing alternative',
      'open source anvil alternative',
      'json to pdf api alternative',
      'pdf form fill api comparison',
    ],
    valuePoints: [
      'Free tier: detect fields, save templates, publish a webform, and call the JSON-to-PDF API without a credit card.',
      'No $79/mo Starter floor — pay only when you need more than the free quotas.',
      'Same building blocks (PDF field detection, webforms, JSON fill, e-signature) shipped as a leaner self-serve product.',
    ],
    proofPoints: [
      'Anvil Starter is $79/mo, Professional $199/mo, Business $399/mo. DullyPDF Premium is a single self-serve tier with no sales call.',
      'Both products turn an uploaded PDF into a fillable template, a hosted webform, and an e-signed output PDF.',
      'DullyPDF runs the field-detection step in-product so you can validate a PDF against the workflow before paying.',
    ],
    articleSections: [
      {
        title: 'Why teams search for an Anvil alternative',
        paragraphs: [
          'Anvil is a strong product. The most common reason engineering teams look for an alternative is not feature gaps — it is the entry-level pricing. The Anvil Starter plan begins at $79/mo, the Professional plan at $199/mo, and the Business plan at $399/mo. For a small team that just needs to render JSON into a PDF or stand up a webform-fed signature flow, those tiers can be heavier than the actual workload requires.',
          'The other common reason is procurement friction. Anvil leans toward enterprise sales: SOC 2 audit, BAAs on Business+, dedicated support. That is the right shape for fintech and benefits-admin platforms but it can slow down a side project, prototype, or small SaaS that just needs the building blocks today.',
          'DullyPDF is the leaner option for those situations. Self-serve signup, free tier with real quotas, and the same primitives — PDF detection, JSON-to-PDF, webform-to-PDF, e-signature.',
        ],
      },
      {
        title: 'Feature-by-feature comparison',
        paragraphs: [
          'The two products overlap on the core building blocks. The differences are mostly in tier ceilings and surface area.',
        ],
        bullets: [
          'PDF field detection: Anvil ships PDF templates + manual field placement. DullyPDF runs CommonForms detection on upload and lets you cleanup in the editor.',
          'JSON-to-PDF API: Both. DullyPDF includes API access in the free tier with monthly request quotas; Anvil starts at the Starter plan.',
          'Webforms: Both turn a PDF into a hosted fillable web form whose responses populate the underlying PDF.',
          'E-signature: Both are E-SIGN/UETA compliant. Anvil Etch chains multi-document workflows out of the box; DullyPDF supports single-document flows today.',
          'Fill from photo / scan: DullyPDF supports vision-based extraction from a snapshot of a filled paper form. Not a documented Anvil feature.',
          'Compliance: Anvil is SOC 2 Type 2 audited and signs HIPAA BAAs on Business tier and above. DullyPDF is not SOC 2 today and does not sign BAAs — do not use it for PHI workflows that require one.',
          'Pricing: Anvil $0 dev tier (no API) → $79/$199/$399/mo. DullyPDF free → single Premium tier.',
        ],
      },
      {
        title: 'When DullyPDF is the right Anvil replacement',
        paragraphs: [
          'DullyPDF is the better fit when the workload looks like one of: a small SaaS that needs PDF generation as a feature without a Starter-tier commitment, a side project or internal tool that wants to evaluate API+webform behavior before any paid commitment, a non-regulated vertical where SOC 2 and BAAs are nice-to-have rather than gating, or an operator-driven workflow where the Search & Fill browser experience matters as much as the API.',
          'In those situations the $79/mo entry on Anvil is more friction than the workload justifies. DullyPDF gives you the same primitives behind a free tier so the product can be validated end to end before the budget conversation.',
        ],
        bullets: [
          'Side projects and prototypes that need PDF fill without a $79/mo floor.',
          'Small SaaS adding "generate a filled PDF" as a feature with low monthly volume.',
          'Non-regulated verticals where SOC 2/BAA are not gating requirements.',
          'Operator-led workflows where browser-based Search & Fill matters too.',
        ],
      },
      {
        title: 'When Anvil is still the right answer',
        paragraphs: [
          'There are workloads where Anvil is the better choice and you should not switch. Regulated verticals where you need a signed BAA and SOC 2 attestation are the clearest example — Anvil offers both at the right tier and DullyPDF does not yet. Multi-document signature workflows with Etch chaining, large enterprise procurement, dedicated CSM relationships, and high-volume server-to-server PDF generation under contractual SLAs all fit Anvil better today.',
          'The honest framing is that DullyPDF is the lower-friction option for smaller teams; Anvil is the more enterprise-shaped option for larger workloads. Pick the one whose shape matches the workload.',
        ],
      },
      {
        title: 'Migrating from Anvil to DullyPDF',
        paragraphs: [
          'If the workload fits the smaller-team profile above, the migration is short. Upload the same PDF templates you have in Anvil, let DullyPDF detect the fields, review the field set in the editor, and rename anything the detector got wrong. Save the template, then either: (a) publish it as a JSON-to-PDF API endpoint and swap the call URL in your existing integration, or (b) publish it as a webform if the Anvil flow you are replacing is respondent-facing.',
          'The biggest checklist item is field-name parity. Anvil templates often use camelCase or numeric field IDs. DullyPDF lets you rename fields after detection so the JSON contract on the new endpoint matches whatever your existing caller already sends. That makes the integration swap a one-line URL change rather than a payload rewrite.',
        ],
        bullets: [
          'Upload your existing PDF templates and run detection.',
          'Rename fields to match the JSON keys your existing integration already sends.',
          'Publish either an API endpoint (server-to-server) or a webform (respondent-facing).',
          'Swap the URL in your client code, run a representative payload, validate the output PDF.',
        ],
      },
      {
        title: 'A short word on pricing math at small scale',
        paragraphs: [
          'For a workload of, say, 200 filled PDFs per month, Anvil Starter ($79) costs $0.40 per fill. DullyPDF free covers it at $0. At 2,000 fills per month, Anvil Starter is $0.04 per fill but the DullyPDF Premium tier at a single self-serve price is usually still cheaper per fill at that volume. The break-even where Anvil becomes the more cost-efficient choice is much higher — roughly the volume where you also need a CSM, SOC 2 attestation, and dedicated SLAs anyway.',
          'For everything below that crossover, DullyPDF is the better economic answer. For everything above it, Anvil usually wins on the bundle of price + compliance + dedicated support.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Is DullyPDF actually free for the API?',
        answer:
          'Yes. The free tier includes a monthly API request quota, plus webform responses and saved templates. You only need Premium if you exceed those quotas or need higher limits. There is no paid floor on the API itself.',
      },
      {
        question: 'Can I migrate my existing Anvil PDF templates?',
        answer:
          'Yes. Upload the same PDFs into DullyPDF, let detection run, then rename fields so the JSON keys match the payload your existing Anvil integration already sends. Most migrations are a one-line URL swap after that.',
      },
      {
        question: 'Is DullyPDF SOC 2 or HIPAA compliant?',
        answer:
          'DullyPDF is not SOC 2 audited today and does not sign HIPAA BAAs. If your workflow requires either, Anvil at the Business tier is the right choice. DullyPDF is the better fit for non-regulated workloads.',
      },
      {
        question: 'Does DullyPDF support multi-document signature chains like Anvil Etch?',
        answer:
          'DullyPDF supports single-document E-SIGN/UETA signing today. Multi-document chained ceremonies are on the roadmap. If you need chained multi-document signing now, Anvil Etch is more mature.',
      },
      {
        question: 'How does field detection compare?',
        answer:
          'Both products turn an uploaded PDF into a fillable template. DullyPDF runs CommonForms detection automatically on upload and surfaces low-confidence fields for human review in the editor. Anvil supports manual field placement plus an AI-assisted webform builder.',
      },
    ],
    relatedIntentPages: ['pdf-fill-api', 'pdf-fill-api-nodejs', 'pdf-fill-api-python', 'pdf-fill-api-curl', 'pdf-field-detection-accuracy'],
    relatedDocs: ['api-fill', 'getting-started'],
  },

  {
    key: 'pdf-fill-api-nodejs',
    category: 'workflow',
    path: '/pdf-fill-api-nodejs',
    navLabel: 'PDF Fill API for Node.js',
    heroTitle: 'Fill PDFs With Node.js — JSON-to-PDF API for JavaScript Backends',
    heroSummary:
      'Send a JSON payload from Node.js, get back a filled PDF. No native PDF libraries to install, no field-coordinate math, no Puppeteer headless Chrome. Free tier available.',
    seoTitle: 'Fill PDFs with Node.js — Free JSON to PDF API for JavaScript | DullyPDF',
    seoDescription:
      'Fill PDF forms from Node.js with a single API call. JSON in, filled PDF out. Free tier, no credit card. Compare to pdf-lib, pdfkit, and Puppeteer.',
    seoKeywords: [
      'fill pdf nodejs',
      'fill pdf javascript',
      'pdf fill api node',
      'node js pdf form fill',
      'javascript pdf form filling',
      'json to pdf nodejs',
      'fill pdf form javascript api',
      'node pdf form generation',
      'pdf-lib alternative',
      'pdfkit alternative fill form',
      'fill fillable pdf javascript',
      'programmatic pdf fill node',
      'rest api fill pdf nodejs',
    ],
    valuePoints: [
      'POST a JSON body, get a filled PDF back. No native bindings, no font shipping, no headless Chrome.',
      'Works from any Node.js runtime: Express, Next.js API routes, Lambda, Cloud Functions, Cloudflare Workers (via fetch).',
      'Free tier covers low-volume workloads end to end before any paid commitment.',
    ],
    proofPoints: [
      'API call is a standard HTTPS POST with a JSON payload — no SDK install required.',
      'Field schema is downloadable from the saved template so the JSON contract is visible to the calling code.',
      'Each published endpoint is template-scoped so a template revision does not silently break callers.',
    ],
    articleSections: [
      {
        title: 'Why most Node teams stop rolling their own PDF fill code',
        paragraphs: [
          'Filling a PDF programmatically from Node.js looks easy until the first edge case. The pdf-lib approach works for trivial forms but breaks on radio groups, checkbox encoding variants, and AcroForm flattening. PDFKit is for generating PDFs from scratch, not filling existing fillable forms. The Puppeteer + headless Chrome approach renders an HTML overlay onto a PDF but ships a 200MB browser, breaks on scaled layouts, and is hard to deploy on serverless platforms.',
          'The DullyPDF API is a thin layer over the same field-detection and fill engine the web product uses. The Node.js call is one HTTPS POST. No SDK, no native bindings, no font shipping. The PDF is detected and the field map is frozen at template publish time, so the JSON contract is stable across deployments.',
        ],
      },
      {
        title: 'Minimal Node.js example',
        paragraphs: [
          'A typical call from a Node.js backend looks like the snippet below. The endpoint URL and API key come from the API Fill modal in the DullyPDF workspace after you publish a saved template. The JSON body uses three top-level keys: a `data` object whose keys are the cleaned field names from your saved template, an `exportMode` flag (`"flat"` returns a non-editable PDF, `"editable"` keeps the AcroForm intact), and a `strict` boolean (set true so unknown payload keys are rejected instead of silently ignored).',
          'Authentication is HTTP Basic with the API key as the username and a blank password — equivalent to sending `Authorization: Basic base64(API_KEY + ":")`. The response body is the raw PDF.',
        ],
        bullets: [
          'import { writeFile } from "node:fs/promises";',
          'const apiKey = process.env.DULLYPDF_API_KEY;',
          'const auth = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;',
          'const res = await fetch("https://api.dullypdf.com/api/v1/fill/<TEMPLATE_ID>.pdf", {',
          '  method: "POST",',
          '  headers: { "Content-Type": "application/json", Authorization: auth },',
          '  body: JSON.stringify({ data: { patient_name: "Jane Doe", patient_email: "jane@example.com" }, exportMode: "flat", strict: true }),',
          '});',
          'if (!res.ok) throw new Error(`fill failed: ${res.status} ${await res.text()}`);',
          'await writeFile("./filled.pdf", Buffer.from(await res.arrayBuffer()));',
        ],
      },
      {
        title: 'Where this fits in a typical Node app',
        paragraphs: [
          'The Node.js teams that get the most out of an external PDF fill API tend to share a shape. They have an existing CRUD or workflow app where the user has just submitted a form, finished an order, completed a benefits enrollment, or signed a contract. They need to render that record into a specific PDF — an ACORD certificate, an HR onboarding packet, a fillable government form, a generated invoice — and either email it, store it, or hand it back to the user.',
          'In that shape, every native PDF library forces you to think about field positions, font embedding, encryption, and AcroForm internals. An external API replaces that with one HTTPS call and a JSON payload that mirrors the database row you already have. That removes most of the surface area where in-house PDF code goes wrong.',
        ],
        bullets: [
          'Insurance back-office: render a filled ACORD 25 from the policy record after binding.',
          'HR / staffing: render a populated I-9 + W-4 packet on hire-confirmed.',
          'Healthcare-adjacent (non-PHI): render an intake summary PDF for the customer record.',
          'Internal ops: scheduled job renders 50 filled certificates from yesterday\'s submissions.',
        ],
      },
      {
        title: 'Comparison with native Node.js PDF approaches',
        paragraphs: [
          'There is a place for in-process PDF libraries. If you control the source PDF and the form is trivial — a single page with a handful of named text fields and no checkboxes or radios — pdf-lib is fine. If you are generating a PDF from scratch and never touching an existing fillable template, PDFKit is the right tool. The DullyPDF API is the right tool when the source PDF is non-trivial, the field set needs detection, or the same template is going to be filled by more than one caller from more than one runtime.',
        ],
        bullets: [
          'pdf-lib: good for trivial AcroForms, weak on radio groups + checkbox variants + flattening.',
          'PDFKit: PDF generation from scratch, not fillable-form filling. Different tool category.',
          'Puppeteer + Chrome: works but ships a browser, slow cold start, hard on serverless.',
          'DullyPDF API: one HTTPS POST, no native deps, template-scoped schema, field detection done once.',
        ],
      },
      {
        title: 'Deployment shapes that work well',
        paragraphs: [
          'Because the API is a single HTTPS endpoint, every Node deployment shape works without extra setup. From a long-running Express server, the call is fetch + write to disk. From a Next.js Route Handler the same fetch returns a Response that streams straight back to the browser. AWS Lambda, Google Cloud Functions, Cloudflare Workers, and Vercel Edge all work because there are no native dependencies to ship in the bundle. Cold starts stay fast because no PDF library has to be loaded into memory on the calling side.',
        ],
      },
      {
        title: 'When you outgrow the free tier',
        paragraphs: [
          'The free tier covers prototypes and low-volume production. Once you cross the request quota, the single Premium tier raises the limits without a separate plan negotiation. The published endpoint and field schema do not change when the plan changes — only the quotas do. That means scaling up does not force a code change.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Do I need an SDK or npm package?',
        answer:
          'No. The API is plain HTTPS + JSON, callable with the global fetch in modern Node.js or any HTTP client. An optional client library is on the roadmap but not required.',
      },
      {
        question: 'Can I call this from Next.js, Lambda, or Cloudflare Workers?',
        answer:
          'Yes. Because the call is plain fetch with no native dependencies, every Node-compatible runtime works including edge environments.',
      },
      {
        question: 'How do I know what JSON keys to send?',
        answer:
          'Each published endpoint exposes a downloadable schema with the exact field names you reviewed during template setup. The schema is template-scoped and only changes when you intentionally republish.',
      },
      {
        question: 'Can I rotate the API key without redeploying?',
        answer:
          'Yes. Endpoint keys can be rotated from the workspace. The endpoint URL stays stable; only the bearer token changes.',
      },
      {
        question: 'How does this compare to pdf-lib?',
        answer:
          'pdf-lib is a low-level Node library. It works well for trivial AcroForms but requires you to handle field detection, radio group encoding, and flattening yourself. The DullyPDF API does that work once at template setup time and exposes a stable JSON contract to the calling code.',
      },
    ],
    relatedIntentPages: ['pdf-fill-api', 'pdf-fill-api-python', 'pdf-fill-api-curl', 'anvil-alternative'],
    relatedDocs: ['api-fill', 'rename-mapping'],
  },

  {
    key: 'pdf-fill-api-python',
    category: 'workflow',
    path: '/pdf-fill-api-python',
    navLabel: 'PDF Fill API for Python',
    heroTitle: 'Fill PDFs With Python — JSON-to-PDF API for Python Backends',
    heroSummary:
      'Send a JSON payload from Python with requests or httpx, get back a filled PDF. No PyPDF2 / pypdf field-coordinate math, no reportlab redrawing, no LibreOffice headless. Free tier available.',
    seoTitle: 'Fill PDFs with Python — Free JSON to PDF API for Python | DullyPDF',
    seoDescription:
      'Fill PDF forms from Python with one requests.post call. JSON in, filled PDF out. Free tier, no credit card. Vs. pypdf, fillpdf, reportlab, LibreOffice.',
    seoKeywords: [
      'fill pdf python',
      'fill pdf form python',
      'pdf fill api python',
      'python pdf form fill',
      'json to pdf python',
      'pypdf alternative',
      'fillpdf alternative',
      'reportlab fill pdf form',
      'fill fillable pdf python api',
      'programmatic pdf fill python',
      'python pdf form filling library',
      'rest api fill pdf python',
      'pypdf2 fill form',
    ],
    valuePoints: [
      'requests.post a JSON body, get a filled PDF back. No PyPDF2 / pypdf field math, no reportlab redrawing.',
      'Works from any Python deployment: Flask, FastAPI, Django, Lambda, Cloud Run, batch jobs.',
      'Free tier covers low-volume workloads end to end before any paid commitment.',
    ],
    proofPoints: [
      'API call is a standard HTTPS POST — works with requests, httpx, urllib, aiohttp.',
      'Field schema is downloadable from the saved template so the JSON contract is visible to the calling code.',
      'Each published endpoint is template-scoped so a template revision does not silently break callers.',
    ],
    articleSections: [
      {
        title: 'Why most Python teams stop rolling their own PDF fill code',
        paragraphs: [
          'Filling a PDF programmatically from Python sounds straightforward until production hits an unusual form. pypdf and PyPDF2 can update text fields but the API around radio groups, checkbox export values, appearance streams, and AcroForm flattening is awkward and frequently produces filled forms that look correct in some PDF viewers but blank or partially blank in others. fillpdf wraps pdftk, which is unmaintained and a heavy system dependency. reportlab generates PDFs from scratch but is not a fillable-form filler — you would be redrawing the document. The LibreOffice headless approach works but ships a 400MB binary and is painful to package on serverless.',
          'The DullyPDF API replaces all of that with a single requests.post call. The PDF is detected and the field map is frozen at template publish time, so the JSON contract is stable across runs and across PDF readers.',
        ],
      },
      {
        title: 'Minimal Python example',
        paragraphs: [
          'A typical call from a Python backend looks like the snippet below. The endpoint URL and API key come from the API Fill modal in the DullyPDF workspace after you publish a saved template. The JSON body uses three top-level keys: a `data` object whose keys are the cleaned field names from your saved template, an `exportMode` flag (`"flat"` returns a non-editable PDF, `"editable"` keeps the AcroForm intact), and a `strict` boolean (set true so unknown payload keys are rejected instead of silently ignored).',
          'Authentication is HTTP Basic with the API key as the username and a blank password — pass `auth=(api_key, "")` to requests, or set the Authorization header manually as `Basic base64(api_key + ":")`. The response body is the raw PDF.',
        ],
        bullets: [
          'import os, requests',
          'api_key = os.environ["DULLYPDF_API_KEY"]',
          'res = requests.post(',
          '    "https://api.dullypdf.com/api/v1/fill/<TEMPLATE_ID>.pdf",',
          '    auth=(api_key, ""),',
          '    json={"data": {"patient_name": "Jane Doe", "patient_email": "jane@example.com"}, "exportMode": "flat", "strict": True},',
          ')',
          'res.raise_for_status()',
          'with open("filled.pdf", "wb") as fh: fh.write(res.content)',
          '# For async: httpx.AsyncClient.post with the same auth tuple and json body.',
        ],
      },
      {
        title: 'Where this fits in a typical Python app',
        paragraphs: [
          'Most Python teams reaching for an external PDF fill API have a Flask, FastAPI, or Django backend with a record (a customer, an enrollment, a claim, a quote) that needs to be turned into a specific PDF — an ACORD certificate, a 1099 form, an HR onboarding packet, a state-specific government form, a generated invoice. They have already tried pypdf or fillpdf and ran into one of: forms that flatten incorrectly, radio groups that come back blank, output that looks fine in Preview but blank in Adobe Reader, or pdftk dependencies that broke on the first deploy.',
          'In that shape, the API call is a one-line replacement. The JSON keys mirror the dictionary you would have built anyway. The output PDF is consistent across viewers because the fill engine and field detection are versioned with the saved template.',
        ],
        bullets: [
          'Insurance ops: render a filled ACORD 25 from the policy row after binding.',
          'Tax / accounting: render filled 1099/W-2/W-9 PDFs from accounting database records.',
          'Government / immigration: render filled USCIS or state forms from intake records.',
          'Internal batch: nightly job renders N filled certificates for the day\'s submissions.',
        ],
      },
      {
        title: 'Comparison with native Python PDF approaches',
        paragraphs: [
          'There is a place for in-process PDF libraries. pypdf is good for low-level inspection and trivial text-only field updates. reportlab is the right tool when you are generating a PDF from scratch and not filling an existing template. LibreOffice headless works for one-off conversions but is heavy. The DullyPDF API is the right tool when the source PDF is non-trivial, the field set needs detection, or the same template is going to be filled by more than one caller across more than one Python service.',
        ],
        bullets: [
          'pypdf / PyPDF2: good for inspection, weak on radio groups + appearance streams + flattening.',
          'fillpdf: wraps pdftk, which is unmaintained and a heavy system dependency.',
          'reportlab: PDF generation from scratch, not fillable-form filling. Different tool category.',
          'LibreOffice headless: works but ships ~400MB, painful on serverless / Lambda.',
          'DullyPDF API: one requests.post, template-scoped schema, field detection done once.',
        ],
      },
      {
        title: 'Deployment shapes that work well',
        paragraphs: [
          'Because the API is a single HTTPS endpoint, every Python deployment shape works without extra setup. Long-running Flask, FastAPI, Django Channels, Celery batch workers, AWS Lambda with the slim runtime, Google Cloud Run, Heroku, Fly.io, and serverless Python runtimes all work because there is no system-level dependency to install. Cold starts stay fast because no PDF library has to load into memory on the calling side.',
        ],
      },
      {
        title: 'When you outgrow the free tier',
        paragraphs: [
          'The free tier covers prototypes and low-volume production. Once you cross the request quota, the single Premium tier raises the limits without a separate plan negotiation. The published endpoint and field schema do not change when the plan changes — only the quotas do. That means scaling up does not force a code change in your Python service.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Do I need a Python SDK?',
        answer:
          'No. The API is plain HTTPS + JSON. requests, httpx, urllib, and aiohttp all work without any DullyPDF-specific package install.',
      },
      {
        question: 'Does this replace pypdf or PyPDF2?',
        answer:
          'For inspecting an existing PDF, pypdf is still the right tool. For filling a fillable PDF programmatically, the DullyPDF API is usually faster to integrate and produces output that renders consistently across PDF readers, including Adobe Reader.',
      },
      {
        question: 'Can I call this from AWS Lambda or Cloud Run?',
        answer:
          'Yes. Because the call is plain HTTPS with no native dependencies, every serverless Python runtime works. No need to bundle pdftk or LibreOffice.',
      },
      {
        question: 'How do I know what JSON keys to send?',
        answer:
          'Each published endpoint exposes a downloadable schema with the exact field names you reviewed during template setup. The schema is template-scoped and only changes when you intentionally republish.',
      },
      {
        question: 'Async support?',
        answer:
          'Yes — call the same endpoint from httpx.AsyncClient or aiohttp. The endpoint is just an HTTPS POST and is async-runtime agnostic.',
      },
    ],
    relatedIntentPages: ['pdf-fill-api', 'pdf-fill-api-nodejs', 'pdf-fill-api-curl', 'anvil-alternative'],
    relatedDocs: ['api-fill', 'rename-mapping'],
  },

  {
    key: 'pdf-fill-api-curl',
    category: 'workflow',
    path: '/pdf-fill-api-curl',
    navLabel: 'PDF Fill API with curl',
    heroTitle: 'Fill PDFs With curl — JSON-to-PDF API From the Terminal',
    heroSummary:
      'One curl command, one JSON body, one filled PDF written to disk. Test the JSON-to-PDF API in 30 seconds before writing any application code. Free tier available.',
    seoTitle: 'Fill PDFs with curl — Free JSON to PDF API From the Terminal | DullyPDF',
    seoDescription:
      'Fill PDF forms from the command line with one curl call. JSON in, filled PDF out. Free tier, no credit card. Great for shell scripts and CI jobs.',
    seoKeywords: [
      'fill pdf curl',
      'pdf api curl example',
      'curl pdf form fill',
      'json to pdf curl',
      'curl post pdf api',
      'pdf fill api command line',
      'shell script fill pdf',
      'curl pdf form filling',
      'test pdf api with curl',
      'fill fillable pdf bash',
      'pdf api quickstart curl',
      'http api fill pdf form',
      'curl example pdf form',
    ],
    valuePoints: [
      'One terminal command to verify the API works against your real PDF before writing any application code.',
      'No SDK install, no language runtime — useful for evaluation, debugging, shell scripts, and CI smoke tests.',
      'Same endpoint and JSON contract used by the Node.js, Python, and webform paths — the curl call is the canonical reference.',
    ],
    proofPoints: [
      'API call is a standard HTTPS POST with a JSON payload and HTTP Basic authentication (API key as username, blank password).',
      'Response body is the raw filled PDF — pipe it straight to a file with `--output`.',
      'curl response headers include the request ID for support traceability.',
    ],
    articleSections: [
      {
        title: 'Why most engineers test new APIs with curl first',
        paragraphs: [
          'Before any application integration, the right first step with a new PDF fill API is a curl call. It removes every layer that could fail for a reason unrelated to the API itself: the SDK install, the language runtime, the network library, the framework. If the curl call returns a valid PDF, the API works. If it does not, the failure mode is unambiguous.',
          'That same call also doubles as the canonical reference for whatever language wrapper comes next. The Node.js fetch, the Python requests.post, the Go http.Post — all of them are encoding the same HTTPS POST that the curl call already proved out. Starting with curl shortens debugging in every later language binding.',
        ],
      },
      {
        title: 'Minimal curl example',
        paragraphs: [
          'A typical call from the terminal looks like the snippet below. Replace `<TEMPLATE_ID>` with the saved-template ID shown in the API Fill modal and `$DULLYPDF_API_KEY` with the API key from the same modal. Authentication is HTTP Basic with the API key as the username and a blank password — the printf+base64 trick below builds the right header without needing a curl version that supports `--user`.',
          'The body is a single `data` object whose keys are the cleaned field names from your saved template, plus `exportMode: "flat"` (non-editable PDF) or `"editable"` (preserves AcroForm), plus `strict: true` (recommended for production — rejects unknown payload keys).',
        ],
        bullets: [
          'curl -X POST "https://api.dullypdf.com/api/v1/fill/<TEMPLATE_ID>.pdf" \\',
          '  -H "Authorization: Basic $(printf \'%s:\' \"$DULLYPDF_API_KEY\" | base64)" \\',
          '  -H "Content-Type: application/json" \\',
          '  --data \'{"data": {"patient_name": "Jane Doe", "patient_email": "jane@example.com"}, "exportMode": "flat", "strict": true}\' \\',
          '  --fail \\',
          '  --output filled.pdf',
          '',
          'After the call: `open filled.pdf` (macOS) or `xdg-open filled.pdf` (Linux) to inspect the result. For larger payloads, save the JSON body to `payload.json` and reference it with `--data-binary @payload.json` instead of inlining.',
        ],
      },
      {
        title: 'Where curl fits in a typical evaluation cycle',
        paragraphs: [
          'The first 30 seconds of evaluating a PDF fill API should be a curl call against a real template, not reading marketing copy. Upload one PDF, let detection run, copy the endpoint URL and API key from the workspace, paste them into a curl command with one or two field values you actually care about, and look at the resulting PDF in a viewer. That single round trip tells you more than any feature comparison page can.',
          'After the curl call works, the same JSON shape ports directly to the language you actually use in production. The Node.js fetch, the Python requests, the Go net/http call — each is the same HTTPS POST with the same body. The curl call is the contract; the language binding is just a convenience wrapper around it.',
        ],
        bullets: [
          'Step 1: upload one real PDF, run detection, save as a template.',
          'Step 2: copy endpoint URL + API key from the workspace.',
          'Step 3: run the curl command with --output filled.pdf.',
          'Step 4: open filled.pdf and verify the field values rendered correctly.',
        ],
      },
      {
        title: 'Useful curl flags for this API',
        paragraphs: [
          'A few curl flags make this API easier to work with during evaluation and in shell scripts.',
        ],
        bullets: [
          '--output filled.pdf  → write the filled PDF directly to disk instead of dumping bytes to the terminal.',
          '--fail               → exit with a non-zero status on HTTP 4xx/5xx, useful in shell scripts and CI jobs.',
          '--silent --show-error → suppress the progress bar but still print real errors.',
          '-D headers.txt       → dump response headers to a file (the request ID lives in `x-dullypdf-request-id`).',
          '--data-binary @body.json → for larger payloads, store the JSON body in a file and reference it.',
          '-w "%{http_code}\\n"  → print the final HTTP status code after the body is written.',
        ],
      },
      {
        title: 'Using curl in shell scripts and CI',
        paragraphs: [
          'Once the curl call works at the terminal, the same command drops cleanly into a shell script or a CI job. A nightly cron task that renders 50 filled PDFs from yesterday\'s submissions is a few lines of bash plus a loop over a CSV. A CI smoke test that verifies the production endpoint is still serving correct PDFs is a single curl + a file-size or PDF-magic-bytes check.',
          'For shell scripts, prefer storing the API key in an environment variable rather than inline so you can rotate keys without rewriting scripts. Pair `--fail` with `set -euo pipefail` so an API error stops the script instead of silently writing an empty PDF.',
        ],
      },
      {
        title: 'Common curl errors and what they usually mean',
        paragraphs: [
          'A few error patterns show up consistently when evaluating any HTTP API with curl. Knowing them in advance saves debugging time.',
        ],
        bullets: [
          'HTTP 401 / 403: the bearer token is missing, wrong, rotated, or scoped to a different template. Check the Authorization header and the template ID.',
          'HTTP 404: usually a wrong template ID or wrong endpoint URL. Confirm both in the workspace endpoint settings.',
          'HTTP 422: the JSON body is structurally fine but a required field is missing or a field value violates a template-defined rule. The response body lists which field caused the failure.',
          'HTTP 429: rate-limited. Check the X-RateLimit-Remaining and Retry-After response headers.',
          'Empty file written to disk: usually `--fail` was missing and curl wrote a JSON error body to filled.pdf. Open the file in a text editor and the JSON error message will be visible.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Do I need an SDK to test the API?',
        answer:
          'No. The API is plain HTTPS + JSON, callable with curl, wget, httpie, Postman, or any HTTP client. Curl is the fastest first call.',
      },
      {
        question: 'Can I use the same curl call from a CI job?',
        answer:
          'Yes. Pair `--fail` with `set -euo pipefail` so a non-2xx response stops the job. Store the API key in a CI secret variable rather than inline.',
      },
      {
        question: 'How do I see the response headers for a specific call?',
        answer:
          'Add `-D headers.txt` to the curl command (or `-i` to include them inline). DullyPDF returns the snapshot version, rate-limit counters, and a request identifier in the response headers — useful for support requests and rate-limit debugging.',
      },
      {
        question: 'How do I send a large JSON payload?',
        answer:
          'Save the JSON body to a file and reference it with `--data-binary @body.json` instead of inlining the JSON in the command line. This avoids shell quoting issues.',
      },
      {
        question: 'Why is my downloaded PDF empty?',
        answer:
          'Usually the API returned an error and curl wrote the JSON error body to your output file. Add `--fail` so curl exits on HTTP errors instead of writing them to disk, or open the file in a text editor to read the error message.',
      },
    ],
    relatedIntentPages: ['pdf-fill-api', 'pdf-fill-api-nodejs', 'pdf-fill-api-python', 'anvil-alternative'],
    relatedDocs: ['api-fill', 'getting-started'],
  },

  {
    key: 'pdf-field-detection-accuracy',
    category: 'workflow',
    path: '/pdf-field-detection-accuracy',
    navLabel: 'PDF Field Detection Accuracy',
    heroTitle: 'PDF Field Detection Accuracy: How DullyPDF Compares to Adobe and Apryse',
    heroSummary:
      'DullyPDF runs the open-research FFDNet model from the CommonForms paper (arXiv 2509.16506). Outperforms the leading commercial PDF reader on form field detection and uniquely supports checkbox detection — both verifiable against the public CommonForms benchmark.',
    seoTitle: 'PDF Field Detection Accuracy — CommonForms FFDNet vs Adobe and Apryse | DullyPDF',
    seoDescription:
      'How accurate is PDF field detection? DullyPDF runs FFDNet (CommonForms, Barrow 2025) — beats the leading commercial PDF reader on a public benchmark.',
    seoKeywords: [
      'pdf field detection accuracy',
      'best pdf field detection',
      'commonforms benchmark',
      'ffdnet pdf detection',
      'adobe pdf field detection accuracy',
      'apryse pdf form field detection',
      'pdftron field detection comparison',
      'open source pdf field detection',
      'pdf form detection benchmark',
      'pdf checkbox detection',
      'aws textract pdf form alternative',
      'document ai field detection comparison',
      'pdf field detection model',
    ],
    valuePoints: [
      'DullyPDF runs the FFDNet-Large model from the open CommonForms paper (arXiv 2509.16506) — not a black-box detector.',
      'CommonForms reports FFDNet outperforming a popular commercial PDF reader on the same benchmark.',
      'Detects checkboxes — a class most commercial PDF detectors do not support according to the same paper.',
    ],
    proofPoints: [
      'Source: Joe Barrow, "CommonForms: A Large, Diverse Dataset for Form Field Detection," arXiv:2509.16506 (2025).',
      'Benchmark dataset: ~55,000 documents and 450,000+ pages drawn from Common Crawl, with ~1/3 non-English content and 14 classified domains (no single domain exceeds 25%).',
      'Training cost reported in the paper: under $500 per model — fully reproducible by anyone who wants to verify.',
    ],
    articleSections: [
      {
        title: 'Why field-detection accuracy is the part nobody benchmarks publicly',
        paragraphs: [
          'Adobe Acrobat ships AI Form Detection. Apryse (formerly PDFTron) sells a Form Field Detection capability inside their SDK. AWS Textract has a forms feature. None of these vendors publish a head-to-head accuracy benchmark on a public dataset. That is unusual for a category that markets on accuracy claims, and it is the reason most evaluation today happens by uploading one or two test PDFs and eyeballing the results.',
          'CommonForms changes that. The CommonForms paper — Joe Barrow, arXiv:2509.16506, published in 2025 — releases both a large public benchmark dataset and the trained models that run on it. Anyone can download the benchmark, run any commercial detector on it, and compare. The same paper reports FFDNet outperforming a popular commercial PDF reader on this benchmark.',
          'DullyPDF runs the actual FFDNet-Large model from that paper as its detection backbone. We did not retrain it, did not fork it, and did not modify the inference pipeline. The detector you use in DullyPDF is the same detector the published benchmark numbers describe.',
        ],
      },
      {
        title: 'What the CommonForms paper actually claims',
        paragraphs: [
          'The CommonForms paper makes three concrete claims that matter for product evaluation. None of them require trust in the vendor — they are reproducible from the public dataset.',
        ],
        bullets: [
          'FFDNet "outperforms a popular, commercially available PDF reader" on the CommonForms test set. The paper does not name the reader explicitly in the abstract; based on category leadership the reference is widely understood to mean Adobe Acrobat\'s AI Form Detection.',
          'FFDNet "can predict checkboxes" — a capability the paper notes is missing from "the most popular commercially available solutions." For any form with checkbox groups (insurance ACORDs, medical intake, government forms), this matters concretely: missed checkboxes mean an operator has to draw them by hand later.',
          'FFDNet attains "very high average precision" on the test set. The benchmark dataset is ~55,000 documents and 450,000+ pages drawn from Common Crawl, with explicit diversity controls (~1/3 non-English, 14 classified domains, no domain over 25%) — meaning the model was not overfit to a single document type.',
        ],
      },
      {
        title: 'How this maps to what DullyPDF detects in practice',
        paragraphs: [
          'When you upload a PDF, DullyPDF runs FFDNet-Large detection and surfaces every candidate field with a confidence score visible in the editor (you can see "98% field" / "95% remap" labels in the field rail of any saved template). The product separates two confidences explicitly: detection confidence (how sure the model is the region is a field) and rename confidence (how sure the rename layer is about the human-readable name).',
          'For a typical multi-page intake — like the New Patient Dental Intake Form linked from this site\'s API walkthrough — that means 167 fields are detected on a 2-page form, 90 of which become the operator\'s working set after editor review. Checkbox groups (5 of them on that example) and radio groups (8 of them) are detected and grouped automatically — the part the CommonForms paper specifically calls out as missing from competitor detectors.',
        ],
        bullets: [
          'Text fields: detected with bounding boxes plus AI-rename to human labels.',
          'Checkbox groups: detected and grouped — a class the paper notes is missing from leading commercial solutions.',
          'Radio groups: deterministically resolved as a single selected option key in the JSON contract.',
          'Signature, date, and other typed fields: classified at detection time so the editor can apply the right input control.',
        ],
      },
      {
        title: 'What we can and cannot say about Adobe Acrobat vs FFDNet',
        paragraphs: [
          'Honest framing matters here. The CommonForms paper claims FFDNet outperforms a popular commercial PDF reader on the public benchmark — that is a citable, third-party, reproducible claim. We are not going to invent specific percentage-point comparisons that the paper does not publish. If you want to verify, the dataset is public and you can run Adobe\'s detection on it yourself.',
          'What is concretely verifiable in everyday use: Adobe\'s AI Form Detection treats checkboxes inconsistently and frequently does not group them with their parent question. The CommonForms paper attributes that to a class limitation in the underlying detector. DullyPDF, running FFDNet, surfaces the checkbox groups as a first-class output of detection.',
        ],
      },
      {
        title: 'What we can and cannot say about Apryse / PDFTron',
        paragraphs: [
          'Apryse sells form-field detection as one capability inside an enterprise SDK. They do not publish a head-to-head benchmark against any open dataset. We are also not going to claim a number we cannot prove. What we can say is: the CommonForms benchmark is a fair, public yardstick that Apryse — and any other vendor — could publish numbers against if they chose to. The fact that it has not been done in either direction is a reason to be skeptical of any unsourced claim that "we are 23% better than Apryse." Including any such claim from us.',
          'In practice, the realistic comparison shape is: Apryse is the right buy if you need a 25-year-old codebase with viewing, editing, OCR, redaction, signing, and detection inside a single enterprise SDK at $50k–500k+ per year. DullyPDF is the right buy if your detection use case fits a self-serve product and you want to see open-research methodology behind the model.',
        ],
      },
      {
        title: 'How to verify the claim yourself',
        paragraphs: [
          'The single best move if accuracy is your decision criterion is to evaluate against your actual document corpus, not against a third-party claim — including ours. The reproducible recipe is:',
        ],
        bullets: [
          'Pick 5 representative PDFs from your real workflow — the messy ones, not the clean ones.',
          'Upload each into DullyPDF and record: total fields detected, checkbox groups detected, fields you would have had to add by hand.',
          'Run the same PDFs through Adobe Acrobat\'s AI Form Detection (free trial works) and record the same.',
          'If you have an Apryse trial, run them through Apryse\'s form-field detection and record the same.',
          'Compare detection-completeness, not just detection-presence — a detector that finds 80% of fields without checkboxes is worse than one that finds 70% with checkboxes for any workflow that has checkbox groups.',
        ],
      },
      {
        title: 'Why we think open-research detection is a structural advantage',
        paragraphs: [
          'A closed-source detector at a commercial vendor improves at whatever pace the vendor\'s team improves it. An open-research detector improves at the pace the entire ML community improves it — and the vendor (us, in this case) gets to integrate that improvement immediately. CommonForms is a paper, a dataset, and a model release. The next version of FFDNet will be public the same way. When that drops, DullyPDF rolls it into the same detection pipeline.',
          'That is the structural advantage of building on open-research detection rather than rolling our own black box: every published improvement in form-field detection is automatically a DullyPDF roadmap item, and the public benchmark exists so customers do not have to take our word for it.',
        ],
      },
    ],
    faqs: [
      {
        question: 'What model does DullyPDF actually use for field detection?',
        answer:
          'FFDNet-Large from the CommonForms paper (Barrow 2025, arXiv:2509.16506). We use the same model weights the paper releases, with no proprietary modifications to the detection step.',
      },
      {
        question: 'Is the accuracy claim against Adobe verifiable?',
        answer:
          'Yes. The CommonForms paper releases the dataset, the test split, and the trained models. Anyone can run Adobe Acrobat\'s detection on the same test set and reproduce the comparison. The paper itself states FFDNet outperforms "a popular, commercially available PDF reader" on the benchmark.',
      },
      {
        question: 'Why does checkbox detection matter so much?',
        answer:
          'Most production forms with structured data — insurance ACORDs, medical intake, government applications — encode their multiple-choice answers as checkbox groups. A detector that misses checkboxes forces a human operator to manually add every checkbox region, which often takes longer than reviewing the entire detected text-field set. CommonForms specifically calls out checkbox prediction as a capability missing from leading commercial detectors.',
      },
      {
        question: 'Do you publish your own per-document accuracy numbers?',
        answer:
          'We rely on the published CommonForms benchmark rather than producing our own marketing numbers. Vendor-produced accuracy claims tend to be cherry-picked; the public benchmark is the honest yardstick. If you want a per-document evaluation, the upload-and-compare recipe in this article is the right approach.',
      },
      {
        question: 'How does this compare to AWS Textract or Google Document AI?',
        answer:
          'AWS Textract and Google Document AI are general document-understanding services optimized for OCR and key-value extraction from filled documents — slightly different problem from detecting empty form fields on a blank template. Both have published benchmarks on their own datasets but neither publishes results on the CommonForms benchmark. The honest comparison to either is, again, run your own representative documents through both and look at completeness on your real workflow.',
      },
      {
        question: 'What about hand-drawn or scanned PDFs?',
        answer:
          'CommonForms is trained primarily on native PDFs with visible form lines and structure. Scanned forms with poor contrast or skewed pages will degrade detection quality for any model — including FFDNet, Adobe, Apryse, and Textract. The DullyPDF editor exposes confidence scoring so low-confidence detections can be reviewed first; that is the practical answer for scan quality rather than expecting any detector to solve it perfectly.',
      },
    ],
    relatedIntentPages: ['pdf-field-detection-tool', 'pdf-fill-api', 'anvil-alternative', 'pdf-fill-api-nodejs'],
    relatedDocs: ['detection', 'getting-started'],
  },
];

// ---------------------------------------------------------------------------
// Usage docs
// ---------------------------------------------------------------------------

const USAGE_DOCS_PAGES = [
  {
    key: 'index',
    slug: '',
    path: '/usage-docs',
    navLabel: 'Overview',
    title: 'DullyPDF Usage Docs',
    summary: 'Implementation-level guide for the full DullyPDF workflow, including concrete limits, matching rules, radio groups, API Fill, and signing behavior.',
    relatedWorkflowKeys: ['pdf-to-fillable-form', 'pdf-to-database-template', 'fill-pdf-from-csv'],
    sectionTitles: ['Pipeline overview', 'Before you start', 'Choose the right docs page', 'Public routes versus docs', 'Three fastest starting paths', 'First validation loop', 'Hard numbers used by the app'],
  },
  {
    key: 'getting-started',
    slug: 'getting-started',
    path: '/usage-docs/getting-started',
    navLabel: 'Getting Started',
    title: 'Getting Started',
    summary: 'A practical quick-start from upload to filled output, including when to pause, publish a Fill By Link, and review results.',
    relatedWorkflowKeys: ['pdf-to-fillable-form', 'fill-pdf-from-csv'],
    sectionTitles: ['Quick-start path', 'Best-practice order', 'First-run checklist', 'First 30 minutes', 'Most common first-run mistakes', 'What good output looks like'],
  },
  {
    key: 'detection',
    slug: 'detection',
    path: '/usage-docs/detection',
    navLabel: 'Detection',
    title: 'Detection',
    summary: 'How CommonForms detection works, how confidence levels are used, and what to adjust when candidates look wrong.',
    relatedWorkflowKeys: ['pdf-to-fillable-form', 'pdf-field-detection-tool'],
    sectionTitles: ['What detection returns', 'Confidence review', 'Common limitations and fixes', 'PDF quality rubric', 'When to redraw instead of resize', 'Geometry values and editor constraints'],
  },
  {
    key: 'rename-mapping',
    slug: 'rename-mapping',
    path: '/usage-docs/rename-mapping',
    navLabel: 'Rename + Mapping',
    title: 'Rename + Mapping',
    summary: 'How to choose Rename, Map, or Rename + Map and how OpenAI outputs appear in the editor.',
    relatedWorkflowKeys: ['pdf-to-database-template', 'fillable-form-field-name'],
    sectionTitles: ['When to run each action', 'OpenAI data boundaries', 'Interpreting results', 'Concrete mapping examples', 'Checkbox rules and precedence', 'Boolean token values used by Search & Fill', 'Schema hygiene anti-patterns', 'Rename-only warning'],
  },
  {
    key: 'editor-workflow',
    slug: 'editor-workflow',
    path: '/usage-docs/editor-workflow',
    navLabel: 'Editor Workflow',
    title: 'Editor Workflow',
    summary: 'How to use overlay, field list, and inspector together for fast, high-confidence template cleanup.',
    relatedWorkflowKeys: ['pdf-to-fillable-form', 'pdf-checkbox-automation'],
    sectionTitles: ['Three-panel model', 'Editing actions', 'Ten-minute cleanup order', 'Recommended quality loop', 'History and clear behavior'],
  },
  {
    key: 'search-fill',
    slug: 'search-fill',
    path: '/usage-docs/search-fill',
    navLabel: 'Search & Fill',
    title: 'Search & Fill',
    summary: 'Connect local data sources or Fill By Link respondent records, search a record, and populate mapped fields with predictable behavior.',
    relatedWorkflowKeys: ['fill-pdf-from-csv', 'batch-fill-pdf-forms'],
    sectionTitles: ['Toolbar buttons overview', 'Data source support', 'CSV file format', 'JSON file format', 'SQL file format', 'TXT schema file format', 'Excel file format', 'Fill flow', 'Guardrails', 'Search & Fill versus Fill By Link versus API Fill', 'Field resolution heuristics (non-checkbox)', 'Checkbox groups and aliases', 'Why partial fills happen'],
  },
  {
    key: 'fill-from-images',
    slug: 'fill-from-images',
    path: '/usage-docs/fill-from-images',
    navLabel: 'Fill from Images and Documents',
    title: 'Fill from Images and Documents and Documents',
    summary: 'Upload photos of IDs, invoices, pay stubs, or scanned documents and let OpenAI vision extract matching values into your template fields automatically.',
    relatedWorkflowKeys: ['fill-information-in-pdf', 'pdf-to-fillable-form'],
    sectionTitles: ['What Fill from Images and Documents does', 'Pipeline details', 'What gets sent to OpenAI', 'Credit cost', 'Best practices', 'Supported file types'],
  },
  {
    key: 'fill-by-link',
    slug: 'fill-by-link',
    path: '/usage-docs/fill-by-link',
    navLabel: 'Fill By Link',
    title: 'Fill By Link',
    summary: 'Publish a DullyPDF-hosted form from a saved template or open group, share the generated link, and turn stored respondent answers into PDFs when needed, with optional post-submit downloads for template respondents.',
    relatedWorkflowKeys: ['fill-pdf-by-link', 'pdf-signature-workflow'],
    sectionTitles: ['What gets published', 'Owner publishing flow', 'What respondents see', 'Reviewing responses and generating PDFs', 'Limits and sharing guidance'],
  },
  {
    key: 'signature-workflow',
    slug: 'signature-workflow',
    path: '/usage-docs/signature-workflow',
    navLabel: 'Signature Workflow',
    title: 'Signature Workflow',
    summary: 'How DullyPDF freezes immutable PDFs for signature, supports both email-based and web-form-to-sign flows, and keeps signed artifacts available to owners later.',
    relatedWorkflowKeys: ['pdf-signature-workflow', 'esign-ueta-pdf-workflow'],
    sectionTitles: ['Two entry paths, one signing engine', 'Public signer ceremony', 'Artifacts and owner visibility', 'U.S. e-sign scope and guardrails'],
  },
  {
    key: 'api-fill',
    slug: 'api-fill',
    path: '/usage-docs/api-fill',
    navLabel: 'API Fill',
    title: 'API Fill',
    summary: 'How DullyPDF publishes frozen JSON-to-PDF endpoints from saved templates, enforces hosted limits, and keeps API Fill distinct from browser-local Search & Fill.',
    relatedWorkflowKeys: ['pdf-fill-api', 'pdf-to-database-template'],
    sectionTitles: ['What API Fill is', 'Owner manager flow', 'Payload and fill behavior', 'When to use API Fill instead of Search and Fill'],
  },
  {
    key: 'create-group',
    slug: 'create-group',
    path: '/usage-docs/create-group',
    navLabel: 'Create Group',
    title: 'Create Group and Group Workflows',
    summary: 'Use groups to organize multi-document packets, switch between saved templates quickly, and run full document workflows across the group.',
    relatedWorkflowKeys: ['pdf-to-fillable-form', 'pdf-to-database-template'],
    sectionTitles: ['What a group is', 'Create and open groups', 'Search and fill full groups', 'Rename and remap entire groups', 'Packet design rules', 'Group Fill By Link and packet publishing'],
  },
  {
    key: 'save-download-profile',
    slug: 'save-download-profile',
    path: '/usage-docs/save-download-profile',
    navLabel: 'Save / Download',
    title: 'Save, Download, and Profile',
    summary: 'Understand when to download immediately versus saving templates to your profile for reuse, Fill By Link publishing, and respondent management.',
    relatedWorkflowKeys: ['pdf-to-fillable-form', 'fill-pdf-by-link'],
    sectionTitles: ['Download vs save', 'Saved form workflow', 'What must be saved before publishing or API use', 'Limits and credits', 'Stripe billing plans', 'Replace vs new save'],
  },
  {
    key: 'troubleshooting',
    slug: 'troubleshooting',
    path: '/usage-docs/troubleshooting',
    navLabel: 'Troubleshooting',
    title: 'Troubleshooting',
    summary: 'Systematic checks for detection quality, OpenAI steps, mapping mismatches, and fill output issues.',
    relatedWorkflowKeys: ['pdf-to-fillable-form', 'fill-pdf-from-csv'],
    sectionTitles: ['Troubleshoot by stage', 'Detection issues', 'Rename and mapping issues', 'Fill output issues', 'Common validation and runtime messages', 'What to capture before support', 'Support'],
  },
];

const FEATURE_PLAN_PAGES = [
  {
    key: 'free-features',
    path: '/free-features',
    navLabel: 'Free Features',
    heroTitle: 'Free DullyPDF Features for PDF-to-Form Setup',
    heroSummary:
      `Start with unlimited PDF-to-form setup and validate one repeat workflow under the free account limits: ${formatPlanLimitCount(FREE_PLAN_LIMITS.savedFormsMax)} saved forms, ${formatPlanLimitCount(FREE_PLAN_LIMITS.fillLinkResponsesMonthlyMax)} Fill By Link responses per month, ${formatPlanLimitCount(FREE_PLAN_LIMITS.templateApiActiveMax)} API endpoint, ${formatPlanLimitCount(FREE_PLAN_LIMITS.signingRequestsMonthlyMax)} sent signing requests per month, and a base OpenAI pool that tops back up to ${formatPlanLimitCount(FREE_PLAN_CREDITS.availableCredits)} each month when needed.`,
    seoTitle: 'Free PDF Form Builder Features | DullyPDF',
    seoDescription:
      `Review the free DullyPDF feature set, including unlimited PDF-to-form setup plus ${formatPlanLimitCount(FREE_PLAN_LIMITS.savedFormsMax)} saved forms, ${formatPlanLimitCount(FREE_PLAN_LIMITS.fillLinkResponsesMonthlyMax)} Fill By Link responses per month, ${formatPlanLimitCount(FREE_PLAN_LIMITS.templateApiActiveMax)} API endpoint, ${formatPlanLimitCount(FREE_PLAN_LIMITS.signingRequestsMonthlyMax)} sent signing requests per month, and a base OpenAI pool that tops back up to ${formatPlanLimitCount(FREE_PLAN_CREDITS.availableCredits)} each month when needed.`,
    seoKeywords: ['free pdf form builder', 'free pdf to form tool', 'free fillable pdf builder', 'free pdf workflow software'],
    valuePoints: [
      'Unlimited PDF-to-form setup and access to the form builder.',
      `Up to ${formatPlanLimitCount(FREE_PLAN_LIMITS.savedFormsMax)} saved forms, ${formatPlanLimitCount(FREE_PLAN_LIMITS.detectMaxPages)} detect pages per PDF, and ${formatPlanLimitCount(FREE_PLAN_LIMITS.fillableMaxPages)} pages when reopening an already-fillable PDF.`,
      `Native Fill By Link plus API Fill on free: no active-link cap, ${formatPlanLimitCount(FREE_PLAN_LIMITS.fillLinkResponsesMonthlyMax)} accepted Fill By Link responses per month, ${formatPlanLimitCount(FREE_PLAN_LIMITS.templateApiActiveMax)} active endpoint, ${formatPlanLimitCount(FREE_PLAN_LIMITS.templateApiRequestsMonthlyMax)} fills per month, and ${formatPlanLimitCount(FREE_PLAN_LIMITS.templateApiMaxPages)} API pages per request.`,
      `Signing stays available on free with ${formatPlanLimitCount(FREE_PLAN_LIMITS.signingRequestsMonthlyMax)} sent signing requests per month and a base OpenAI pool that tops back up to ${formatPlanLimitCount(FREE_PLAN_CREDITS.availableCredits)} each month when needed.`,
    ],
    detailSections: [
      { title: 'Best fit for', items: ['Teams validating one workflow before rolling out larger intake or packet automation.', 'Owners who want to test field detection, editor cleanup, and mapping quality on real documents.', 'Users who need modest monthly respondent volume rather than high-throughput collection.'] },
      { title: 'Included workflow access', items: ['Upload PDFs up to 50MB and convert them into editable templates.', 'Use the form builder, field inspector, list panel, and saved-template workflow.', 'Run Search & Fill with local CSV, Excel, JSON, or stored respondent records once your template is mapped.'] },
      {
        title: 'Free-tier enforced limits',
        items: [
          `Saved forms: up to ${formatPlanLimitCount(FREE_PLAN_LIMITS.savedFormsMax)} saved templates.`,
          `PDF processing: up to ${formatPlanLimitCount(FREE_PLAN_LIMITS.detectMaxPages)} detection pages per PDF and ${formatPlanLimitCount(FREE_PLAN_LIMITS.fillableMaxPages)} pages for already-fillable template uploads.`,
          `Fill By Link: no active-link cap and ${formatPlanLimitCount(FREE_PLAN_LIMITS.fillLinkResponsesMonthlyMax)} accepted responses per month across the account.`,
          `API Fill: ${formatPlanLimitCount(FREE_PLAN_LIMITS.templateApiActiveMax)} active endpoint, ${formatPlanLimitCount(FREE_PLAN_LIMITS.templateApiRequestsMonthlyMax)} successful fills per month, and ${formatPlanLimitCount(FREE_PLAN_LIMITS.templateApiMaxPages)} pages per request.`,
          `Signing: up to ${formatPlanLimitCount(FREE_PLAN_LIMITS.signingRequestsMonthlyMax)} sent signing requests per month.`,
          `Credits: base OpenAI credits top back up to ${formatPlanLimitCount(FREE_PLAN_CREDITS.availableCredits)} each month when the balance is below that floor.`,
        ],
      },
      { title: 'How to validate the free tier properly', items: ['Build one recurring template and test it with a real document before judging the product.', 'Use the free tier to verify detection quality, editor cleanup, schema mapping readiness, and one complete fill loop.', 'Treat free as a workflow-validation tier, not as the final benchmark for high-volume operations.'] },
      { title: 'When free is enough and when it is not', items: ['Free is enough when you are proving one workflow, training on a representative document, or running light respondent/API traffic.', 'Free becomes limiting when several templates need to stay saved, monthly response/API volume rises, or teams need a recurring credit budget.', 'The right upgrade moment is when the workflow is already validated and usage, not uncertainty, becomes the bottleneck.'] },
      { title: 'Free tier rollout path', items: ['Start with one canonical document instead of uploading every packet variation on day one.', 'Run detection, cleanup, rename or map if needed, then verify one representative fill before you judge the result.', 'Only after the template passes that QA loop should you publish a link, group related forms, or invite teammates into the workflow.'] },
      { title: 'What stays free versus what consumes credits', items: ['Detection, editor cleanup, saving, Fill By Link publishing, API Fill publishing, and the general template-building workflow stay available on free within the account caps above.', 'Rename, Map, and Rename + Map consume OpenAI credits according to the page-bucket formula shown in Profile.', 'Fill from Images and Documents consumes credits per uploaded file: 1 credit per image, 1 credit per 5 pages for PDF documents.', 'Saved-form count, live Fill By Link/API Fill capacity, signer volume, and credit pool size are the main reasons the free tier eventually stops being enough for production traffic.'] },
      { title: 'Upgrade triggers worth watching', items: ['You need more than one live respondent workflow or more than one live API Fill endpoint at a time.', 'Response or API volume is high enough that the free caps block normal operations.', 'Several templates are already validated and the team now needs more saved-template capacity, recurring credits, or higher signing/publishing throughput rather than more experimentation.'] },
    ],
    faqs: [
      { question: 'Does free still let me convert PDFs into fillable templates?', answer: 'Yes. Free includes unlimited PDF-to-form setup plus the form builder so you can detect, clean up, and save reusable templates.' },
      { question: 'What is the main free-tier Fill By Link limit?', answer: `Free supports account-level Fill By Link collection with up to ${formatPlanLimitCount(FREE_PLAN_LIMITS.fillLinkResponsesMonthlyMax)} accepted responses per month.` },
      { question: 'What are the main free API Fill and signing limits?', answer: `Free keeps API Fill at ${formatPlanLimitCount(FREE_PLAN_LIMITS.templateApiActiveMax)} active endpoint, ${formatPlanLimitCount(FREE_PLAN_LIMITS.templateApiRequestsMonthlyMax)} successful fills per month, and ${formatPlanLimitCount(FREE_PLAN_LIMITS.templateApiMaxPages)} pages per request, while signing stays at ${formatPlanLimitCount(FREE_PLAN_LIMITS.signingRequestsMonthlyMax)} sent signing requests per month.` },
      { question: 'Where do I confirm my current limits?', answer: 'The signed-in Profile view shows your effective account limits, billing status, and remaining credits.' },
      { question: 'Should I stay on free while I build my first workflow?', answer: 'Usually yes. The free tier is best used to validate one recurring template and one end-to-end process before deciding whether higher usage is justified.' },
    ],
    relatedLinks: [
      { label: 'Premium Features', href: '/premium-features' },
      { label: 'Usage Docs', href: '/usage-docs' },
      { label: 'Fill By Link Docs', href: '/usage-docs/fill-by-link' },
    ],
  },
  {
    key: 'premium-features',
    path: '/premium-features',
    navLabel: 'Premium Features',
    heroTitle: 'Premium DullyPDF Features for Higher-Usage Workflows',
    heroSummary:
      `Premium is the higher-usage tier for teams running repeat PDF automation across more saved templates, more live links, higher API traffic, larger signing volume, and a recurring ${formatPlanLimitCount(PREMIUM_PLAN_CREDITS.monthlyCredits)}-credit monthly pool.`,
    seoTitle: 'Premium PDF Automation Features and Billing | DullyPDF',
    seoDescription:
      `Review premium DullyPDF features, including ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.savedFormsMax)} saved forms, ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.fillLinkResponsesMonthlyMax)} Fill By Link responses per month, ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.templateApiActiveMax)} API endpoints, ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.signingRequestsMonthlyMax)} sent signing requests per month, and ${formatPlanLimitCount(PREMIUM_PLAN_CREDITS.monthlyCredits)} monthly credits.`,
    seoKeywords: ['premium pdf automation software', 'pdf form builder subscription', 'fill by link premium plan', 'stripe pdf software billing'],
    valuePoints: [
      `Up to ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.savedFormsMax)} saved forms, ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.detectMaxPages)} detect pages per PDF, and ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.fillableMaxPages)} pages for already-fillable template uploads.`,
      `No active Fill By Link cap and up to ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.fillLinkResponsesMonthlyMax)} accepted responses per month across the account.`,
      `Up to ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.templateApiActiveMax)} active API Fill endpoints, ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.templateApiRequestsMonthlyMax)} successful fills per month, and ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.templateApiMaxPages)} pages per request.`,
      `Signing scales to ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.signingRequestsMonthlyMax)} sent signing requests per month, plus a recurring ${formatPlanLimitCount(PREMIUM_PLAN_CREDITS.monthlyCredits)}-credit monthly pool.`,
      'Stripe-backed monthly or yearly purchase options when you are signed in.',
    ],
    detailSections: [
      {
        title: 'Premium plan limits',
        items: [
          `Saved forms: up to ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.savedFormsMax)} saved templates.`,
          `PDF processing: up to ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.detectMaxPages)} detection pages per PDF and ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.fillableMaxPages)} pages for already-fillable template uploads.`,
          `Fill By Link: no active-link cap and up to ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.fillLinkResponsesMonthlyMax)} accepted responses per month across the account.`,
          `API Fill: up to ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.templateApiActiveMax)} active endpoints, ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.templateApiRequestsMonthlyMax)} successful fills per month, and ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.templateApiMaxPages)} pages per request.`,
          `Signing: up to ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.signingRequestsMonthlyMax)} sent signing requests per month.`,
          `Credits: ${formatPlanLimitCount(PREMIUM_PLAN_CREDITS.monthlyCredits)} recurring monthly credits, with ${formatPlanLimitCount(PREMIUM_PLAN_CREDITS.refillPackCredits)}-credit refill packs available from Profile.`,
        ],
      },
      { title: 'OpenAI and billing', items: ['Pro billing actions run through Stripe Checkout with monthly and yearly subscriptions.', `Premium profiles receive a recurring ${formatPlanLimitCount(PREMIUM_PLAN_CREDITS.monthlyCredits)}-credit monthly pool, and ${formatPlanLimitCount(PREMIUM_PLAN_CREDITS.refillPackCredits)}-credit refill packs remain available from Profile.`, 'Credits are shared across Rename, Map, Rename + Map, and Fill from Images and Documents operations.', 'Fill from Images and Documents costs 1 credit per uploaded image and 1 credit per 5 pages for uploaded PDF documents.', 'Cancellation is managed from the signed-in profile billing section and is scheduled for period end.'] },
      { title: 'Best fit for', items: ['Teams operating repeat intake or packet workflows across many saved templates.', 'Owners publishing multiple public respondent links at once.', 'Accounts that need higher sustained usage instead of one-off free-tier validation.'] },
      { title: 'Operational gains premium is meant to unlock', items: ['Premium is about removing usage friction after the workflow already works, not about replacing setup discipline.', 'The biggest gains usually come from running more saved templates, more live links and endpoints, larger respondent/API volume, recurring credits, and fewer publish-capacity constraints.', 'It is best for teams that already know which templates matter and need higher throughput rather than more experimentation.'] },
      { title: 'How to decide between monthly and yearly billing', items: ['Choose monthly when the workflow is recent, seasonal, or still being proven across the team.', 'Choose yearly when the template library is already part of ongoing operations and usage is expected to remain steady.', 'Billing decisions should follow proven recurring usage, not just interest in the feature list.'] },
      { title: 'When premium is justified', items: ['Premium makes sense when the team already trusts several templates and the real bottleneck is usage capacity rather than setup uncertainty.', 'It is a better fit for multi-template operations, repeat respondent collection, higher API throughput, and teams that need predictable monthly credit access instead of occasional AI runs.', 'If the workflow is still unproven, free remains the better evaluation tier. Premium should follow validated demand, not replace validation.'] },
      { title: 'What changes operationally after upgrade', items: ['Owners can keep more saved templates, more respondent workflows, and more API endpoints live at the same time.', 'Teams can absorb higher response, API, and signer volume without hitting free-tier guardrails in the middle of active work.', 'Recurring credits and Stripe-backed billing make the template library easier to support as an ongoing operational system instead of a one-off experiment.'] },
      { title: 'Monthly versus yearly by workflow maturity', items: ['Monthly is safer when the rollout is recent, seasonal, or still concentrated in one department.', 'Yearly becomes more rational once the template library is part of ordinary operations and several teams or recurring workflows depend on it.', 'The right subscription horizon should follow workflow maturity, not just a pricing preference.'] },
    ],
    faqs: [
      { question: 'What is the biggest premium Fill By Link difference?', answer: `Premium keeps the same no-active-link model as free but raises account-level Fill By Link capacity to ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.fillLinkResponsesMonthlyMax)} accepted responses per month.` },
      { question: 'How much API Fill capacity comes with premium?', answer: `Premium supports up to ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.templateApiActiveMax)} active endpoints, ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.templateApiRequestsMonthlyMax)} successful fills per month, and ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.templateApiMaxPages)} pages per request.` },
      { question: 'Can I buy premium from this page?', answer: 'Yes. When you are signed in and billing is available, this page can launch the Stripe Checkout flow for monthly or yearly premium.' },
      { question: 'What if I already have premium?', answer: 'The page will show that the current account already has premium access instead of offering another upgrade button.' },
      { question: 'When is premium worth the upgrade?', answer: 'Premium is usually worth it once the workflow is already validated and the limiting factor becomes saved-template capacity, live link or endpoint count, response volume, signing volume, recurring credits, or the need to operate many workflows in parallel.' },
    ],
    relatedLinks: [
      { label: 'Free Features', href: '/free-features' },
      { label: 'Save, Download, and Profile Docs', href: '/usage-docs/save-download-profile' },
      { label: 'Fill By Link Docs', href: '/usage-docs/fill-by-link' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Consolidated SEO metadata for all routes
// ---------------------------------------------------------------------------

const toFaqSchema = (faqs) => [{
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: { '@type': 'Answer', text: faq.answer },
  })),
}];

const buildBreadcrumbSchema = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.label,
    ...(item.href ? { item: `${SITE_ORIGIN}${item.href}` } : {}),
  })),
});

const appendStructuredData = (existingEntries, nextEntry) => [...(existingEntries || []), nextEntry];

const buildIntentSeoTitle = (heroTitle) => `${heroTitle} | DullyPDF`;

const buildIntentSeoDescription = (heroSummary) => heroSummary;

const buildCollectionPageSchema = (name, description, path) => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name,
  description,
  url: `${SITE_ORIGIN}${path}`,
});

const buildTechArticleSchema = (headline, description, path) => ({
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

const buildVideoObjectSchema = (video) => ({
  '@context': 'https://schema.org',
  '@type': 'VideoObject',
  name: video.name,
  description: video.description,
  thumbnailUrl: video.thumbnailUrl,
  uploadDate: video.uploadDate,
  contentUrl: video.contentUrl,
  embedUrl: video.embedUrl,
  publisher: {
    '@type': 'Organization',
    name: 'DullyPDF',
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_ORIGIN}/DullyPDFLogoImproved.png`,
    },
  },
});

// Canonical video metadata for the DullyPDF e-sign pipeline walkthrough.
// Kept here (rather than imported from publicVideoContent.ts) so the .mjs
// SEO pipeline has no cross-language dependency. Keep the videoId and
// youtubeUrl in sync with frontend/src/config/publicVideoContent.ts.
const ESIGN_PIPELINE_VIDEO = {
  videoId: 'CJ0TCXGHFdQ',
  name: 'DullyPDF E-Sign Pipeline — every signing workflow, every industry',
  description:
    'Single-signer, sequential multi-signer, parallel multi-signer, Fill By Link → sign, group fill → multi-sign, and API Fill → sign — walked end to end across HR onboarding, healthcare intake, real estate, legal, insurance ACORD, and immigration USCIS workflows.',
  contentUrl: 'https://youtu.be/CJ0TCXGHFdQ',
  embedUrl: 'https://www.youtube.com/embed/CJ0TCXGHFdQ',
  thumbnailUrl: 'https://i.ytimg.com/vi/CJ0TCXGHFdQ/maxresdefault.jpg',
  uploadDate: '2026-04-14',
};

// Intent pages that should emit the e-sign video in JSON-LD and OG tags.
const VIDEO_BY_INTENT_KEY = {
  'pdf-signature-workflow': ESIGN_PIPELINE_VIDEO,
  'esign-ueta-pdf-workflow': ESIGN_PIPELINE_VIDEO,
  'fill-pdf-by-link': ESIGN_PIPELINE_VIDEO,
  'pdf-fill-api': ESIGN_PIPELINE_VIDEO,
};

// Blog posts that should emit the e-sign video alongside BlogPosting.
const VIDEO_BY_BLOG_SLUG = {
  'send-pdf-for-signature-by-email-or-web-form': ESIGN_PIPELINE_VIDEO,
};

const buildIntentCatalogItemListSchema = (page, showcase) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: `${page.navLabel} PDFs in the DullyPDF catalog`,
  itemListOrder: 'https://schema.org/ItemListUnordered',
  numberOfItems: showcase.documents.length,
  itemListElement: showcase.documents.map((document, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    url: `${SITE_ORIGIN}${document.catalogHref}`,
    name: `${document.formNumber ? `${document.formNumber} — ` : ''}${document.title}`,
    item: {
      '@type': 'CreativeWork',
      name: `${document.formNumber ? `${document.formNumber} — ` : ''}${document.title}`,
      image: `${SITE_ORIGIN}${document.thumbnailUrl}`,
      url: `${SITE_ORIGIN}${document.catalogHref}`,
      isBasedOnUrl: document.sourceUrl,
    },
  })),
});

const buildIntentCatalogHowToSchema = (page, showcase) => ({
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: `How to automate ${page.navLabel.toLowerCase()} PDFs in DullyPDF`,
  description:
    `Open blank ${page.navLabel.toLowerCase()} PDFs, map fields once, fill them from CSV, XLSX, JSON, or SQL-backed schemas, publish API and web-form flows, and route the completed record into signature.`,
  url: `${SITE_ORIGIN}${page.path}`,
  step: buildIntentCatalogWorkflowSteps(showcase).map((step, index) => ({
    '@type': 'HowToStep',
    position: index + 1,
    name: step.title,
    text: step.description,
    url: `${SITE_ORIGIN}${step.href}`,
  })),
});

const HOME_ROUTE_SEO = {
  title: 'DullyPDF — Automatic PDF to Fillable Form With Search & Fill',
  description:
    'Turn any PDF into a fillable template, then Search & Fill from CSV, Excel, JSON, or SQL. Collect answers by web form or API and add US e-signatures — all in one platform.',
  canonicalPath: '/',
  keywords: ['pdf automation platform', 'ai pdf workflow software', 'fillable pdf automation', 'pdf workflow software', 'structured data to pdf', 'pdf intake automation'],
  structuredData: [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'DullyPDF',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: 'https://dullypdf.com/',
      description: 'DullyPDF turns existing PDFs into fillable forms with AI field detection. It maps fields to database headers, fills row data automatically, publishes template-scoped JSON-to-PDF endpoints, and lets teams send web forms to collect answers or route immutable PDFs into email-based signature workflows.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: ['Free PDF form builder for existing PDFs', 'Automatic AI field detection', 'Fillable form template editing', 'Radio group editing and deterministic radio fill behavior', 'Template-scoped JSON-to-PDF API Fill endpoints', 'Email-based PDF signature requests with immutable record freeze', 'Web-form-to-sign handoff for collected respondent data', 'Schema mapping for CSV/SQL/XLSX/JSON', 'Search and fill workflows'],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'DullyPDF',
      url: 'https://dullypdf.com/',
      logo: 'https://dullypdf.com/DullyPDFLogoImproved.png',
      sameAs: OFFICIAL_PUBLIC_PROFILE_URLS,
      contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'justin@dullypdf.com' },
    },
  ],
  bodyContent: {
    heading: 'DullyPDF | AI PDF Automation Platform for Templates, Filling, and Signing',
    paragraphs: [
      'DullyPDF helps teams turn recurring PDFs into reusable templates, map them to structured data, collect answers by link, publish JSON-to-PDF endpoints, and route supported records into signature workflows.',
      'Use the homepage as the platform overview, then move into the workflow and industry pages for the exact transactional query you want Google to match.',
      'The strongest DullyPDF use cases start from existing documents that already matter operationally: intake packets, onboarding forms, certificates, permits, acknowledgments, and other recurring PDFs that staff keep filling by hand even though the underlying data already exists elsewhere.',
      'That is why the public route library is split by workflow, industry, docs, and blog content. The homepage explains the platform shape. The deeper routes explain one concrete implementation problem at a time.',
      'DullyPDF is strongest when the document layout is stable but the underlying record data keeps changing. It is less useful for one-off PDF editing, layout redesign, or general annotation work where a broader PDF editor is the better fit.',
      'The best evaluation path is to choose one recurring document, turn it into a reusable template, validate one representative record, and only then expand into respondent collection, grouped packets, API publication, or signature routing.',
    ],
    sections: [
      { title: 'Upload the Existing PDF', description: 'Start from the real document your team already uses instead of rebuilding the form from scratch.' },
      { title: 'Review AI Field Detection', description: 'The detection pipeline identifies likely inputs with confidence cues so cleanup starts from a draft rather than a blank canvas.' },
      { title: 'Clean Geometry and Field Types', description: 'Resize, rename, reposition, and normalize text, checkbox, radio, date, and signature fields before anyone relies on the template.' },
      { title: 'Map to Structured Data', description: 'Align the field set to CSV, SQL, Excel, JSON, or application-style schema headers so the document can be filled predictably later.' },
      { title: 'Fill From Rows or Respondents', description: 'Use Search & Fill for local records or Fill By Link when the record needs to be collected from a respondent first.' },
      { title: 'Publish or Route the Final Output', description: 'Once the template is stable, turn it into a repeat fill workflow, a hosted API endpoint, or a supported signature-ready record path.' },
      { title: 'Who DullyPDF Is For', description: 'Best fit: operations teams handling recurring packets, intake forms, certificates, permits, acknowledgments, and other PDFs that repeat under the same layout.' },
      { title: 'Who Should Use a Different Tool', description: 'Choose a broader PDF editor when the job is one-time annotation, ad hoc page manipulation, or layout redesign rather than repeat automation.' },
      { title: 'Representative Document Types', description: 'Common starting points include healthcare intake forms, HR onboarding packets, insurance certificates, contractor paperwork, and other data-heavy PDFs already used in production.' },
      { title: 'Start Here by Workflow', description: 'Use workflow pages for commercial tasks, industry pages for vertical examples, docs for operator detail, and blog guides for narrower implementation or comparison questions.' },
    ],
    valuePoints: [
      'Best fit: recurring document types with stable layouts and changing record data.',
      'Supports template creation, row-based filling, respondent collection, API publication, and signature routing in one product surface.',
      'The public route structure is designed so each workflow can rank on its own instead of forcing one page to answer every query.',
      'The evaluation path is intentionally narrow: prove one recurring template first, then scale usage after the QA loop is stable.',
    ],
    proofPoints: [
      'Templates preserve field metadata and can be reopened for repeat use.',
      'Search & Fill supports CSV, XLSX, JSON, and stored Fill By Link respondents.',
      'Public docs, workflow pages, industry pages, and blog guides all point back into the same template-centered product model.',
      'The same saved-template model supports row-based fill, respondent collection, API publication, and signature routing instead of scattering those steps across disconnected systems.',
    ],
  },
};

const LEGAL_ROUTE_SEO = {
  privacy: {
    title: 'Privacy Policy | DullyPDF',
    description: 'Read how DullyPDF handles account data, uploaded PDFs, schema metadata, optional AI processing, and billing information.',
    canonicalPath: '/privacy',
    keywords: ['dullypdf privacy policy', 'pdf form automation privacy'],
    bodyContent: {
      heading: 'Privacy Policy',
      paragraphs: ['Read the DullyPDF privacy policy to understand how your data is collected, used, and protected.'],
    },
  },
  terms: {
    title: 'Terms of Service | DullyPDF',
    description: 'Review DullyPDF service terms covering accounts, AI-assisted workflows, billing, acceptable use, and platform limitations.',
    canonicalPath: '/terms',
    keywords: ['dullypdf terms', 'pdf automation terms of service'],
    bodyContent: {
      heading: 'Terms of Service',
      paragraphs: ['Review the DullyPDF terms of service governing accounts, features, billing, and acceptable use.'],
    },
  },
};

const USAGE_DOCS_FAQ_SCHEMAS = {
  'getting-started': [{
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'How do I convert a PDF into a fillable template in DullyPDF?', acceptedAnswer: { '@type': 'Answer', text: 'Upload a PDF, run field detection, review/edit field geometry and names, then save the template for reuse.' } },
      { '@type': 'Question', name: 'Do I need mapping before Search and Fill?', acceptedAnswer: { '@type': 'Answer', text: 'Mapping is strongly recommended for reliable output, especially for checkbox groups and non-trivial schemas.' } },
    ],
  }],
  'rename-mapping': [{
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What is PDF field to database mapping?', acceptedAnswer: { '@type': 'Answer', text: 'It links PDF field identifiers to schema headers so row data can populate the correct fields during fill operations.' } },
      { '@type': 'Question', name: 'Should I run rename before map?', acceptedAnswer: { '@type': 'Answer', text: 'When labels are inconsistent, rename first improves field naming consistency and typically improves mapping quality.' } },
    ],
  }],
  'search-fill': [{
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Can DullyPDF fill PDF fields from CSV rows?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. After mapping, Search and Fill lets you select a row and populate mapped PDF fields from CSV, XLSX, or JSON data.' } },
      { '@type': 'Question', name: 'What data sources are supported for row-based fill?', acceptedAnswer: { '@type': 'Answer', text: 'CSV, XLSX, and JSON support row-based fill. SQL and TXT are schema-only and do not provide row data for filling.' } },
    ],
  }],
  'fill-by-link': [{
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Does Fill By Link publish the PDF itself?', acceptedAnswer: { '@type': 'Answer', text: 'No. DullyPDF publishes a hosted HTML form and generates the final PDF later from the saved respondent submission.' } },
      { '@type': 'Question', name: 'Can one group publish a single shared respondent form?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. An open group can publish one merged Fill By Link that includes every distinct respondent-facing field across the group.' } },
    ],
  }],
  'signature-workflow': [{
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Can DullyPDF send a PDF for signature by email?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The owner can freeze the current PDF into an immutable snapshot, email the signer, and keep the signed artifacts in the workspace afterward.' } },
      { '@type': 'Question', name: 'Can Fill By Web Form Link route respondents into signing after submit?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Template links can require signature after submit, which stores the response, materializes the filled PDF, and continues into the public signing ceremony.' } },
    ],
  }],
  'esign-ueta-pdf-workflow': [{
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What legal framework does the DullyPDF signing workflow target?', acceptedAnswer: { '@type': 'Answer', text: 'It is designed around core U.S. E-SIGN and UETA concepts, including legal recognition of electronic records, consumer consent where applicable, attribution, and retention-ready records.' } },
      { '@type': 'Question', name: 'Which records are the best fit for this workflow?', acceptedAnswer: { '@type': 'Answer', text: 'The best fit is supported ordinary business records such as vendor or service agreements, client intake forms, authorization or consent forms, acknowledgments, receipts, and similar routine business workflows.' } },
      { '@type': 'Question', name: 'Which records should stay out of the ordinary self-serve signing flow?', acceptedAnswer: { '@type': 'Answer', text: 'Wills, family-law matters, court documents, certain utility and foreclosure notices, certain insurance cancellation notices, hazardous-material transport documents, notarization-required workflows, and real-property recording workflows should stay blocked or go through separate legal review.' } },
    ],
  }],
  'api-fill': [{
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What is DullyPDF API Fill?', acceptedAnswer: { '@type': 'Answer', text: 'API Fill publishes one saved-template snapshot as a hosted JSON-to-PDF endpoint with its own schema, auth key, limits, and audit activity.' } },
      { '@type': 'Question', name: 'How is API Fill different from Search and Fill?', acceptedAnswer: { '@type': 'Answer', text: 'Search and Fill keeps chosen row data local in the browser, while API Fill is a hosted backend runtime for other systems that need a template-scoped JSON-to-PDF endpoint.' } },
    ],
  }],
  'create-group': [{
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What does a DullyPDF group do?', acceptedAnswer: { '@type': 'Answer', text: 'A group bundles saved templates into one packet so teams can switch documents quickly, fill the packet from one record, and run batch rename and mapping actions.' } },
      { '@type': 'Question', name: 'Can Rename + Map run across the whole group?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Rename + Map Group runs across every saved template in the open group and overwrites each template on success.' } },
    ],
  }],
};

const USAGE_DOCS_ROUTE_SEO = {};
for (const page of USAGE_DOCS_PAGES) {
  const seoLookup = {
    index: {
      title: 'PDF Form Automation Docs and Workflow Guide | DullyPDF',
      description: 'Learn the full DullyPDF workflow: PDF field detection, OpenAI rename and mapping, editor cleanup, and Search & Fill output steps.',
      keywords: ['pdf form automation docs', 'fillable form workflow', 'pdf template workflow'],
      bodyParagraphs: [
        page.summary,
        'Use the docs overview when you already understand the product category and need the operating sequence, limits, and route structure in one place.',
        'This page is strongest as the bridge between commercial workflow pages and the exact implementation docs that govern real template setup and QA.',
        'Operators should use the overview to choose the correct next page quickly: setup, cleanup, row-based fill, respondent collection, packet grouping, API publication, or signing. That routing function is part of the page value, not just a navigation convenience.',
      ],
    },
    'getting-started': {
      title: 'DullyPDF Quick Start for Template Setup and First Fill | Docs',
      description: 'Follow the shortest end-to-end setup path: detect fields, map one representative template, and validate one controlled fill before rollout.',
      keywords: ['dullypdf quick start', 'pdf template setup guide', 'first fill validation docs'],
      bodyParagraphs: [
        page.summary,
        'The goal of this page is not to teach every feature. It is to get one representative PDF through the safest setup order so the workflow can be trusted before you scale it.',
        'The fastest first success usually comes from one document, one representative record, and one complete QA loop. Teams that skip that narrow starting path usually create more cleanup work than they save.',
      ],
    },
    detection: {
      title: 'Field Detection Confidence and Cleanup Guide | DullyPDF Docs',
      description: 'Review confidence tiers, false positives, geometry constraints, and cleanup steps before turning detections into a saved template.',
      keywords: ['field detection confidence docs', 'pdf detection cleanup guide', 'commonforms review docs'],
      bodyParagraphs: [
        page.summary,
        'Detection quality is where most template workflows either become reliable or turn into cleanup debt. This page focuses on how to review the model output before mapping or publishing anything downstream.',
        'The important question is not whether the model found something. It is whether the field set is clean enough that later rename, mapping, and fill workflows can trust it without hidden geometry or classification problems.',
      ],
    },
    'rename-mapping': {
      title: 'Rename PDF Fields and Map Them to Schema Headers | DullyPDF Docs',
      description: 'Use OpenAI rename and schema mapping to review field names, align them to headers, and validate checkbox and radio behavior before production fill.',
      keywords: ['pdf rename mapping guide', 'schema header mapping docs', 'align pdf fields to columns'],
      bodyParagraphs: [
        page.summary,
        'Use this page after detection when the template still needs clean names, stable schema alignment, and a review pass across checkbox and radio behavior.',
        'Rename and mapping are where many templates either become reusable or remain fragile. Clean names, stable headers, and explicit checkbox or radio rules are what turn a visual field set into something production-safe.',
      ],
    },
    'editor-workflow': {
      title: 'Edit Fillable PDF Fields and Template Geometry | DullyPDF Docs',
      description: 'Use overlay, field list, and inspector tools to refine field names, types, and coordinates before production use.',
      keywords: ['editable fillable pdf template', 'pdf field editor workflow'],
      bodyParagraphs: [
        page.summary,
        'This page focuses on operator sequence rather than feature labels alone. The editor is most useful when teams know which panel to use first, which edits carry the most risk, and what has to be validated before save.',
      ],
    },
    'search-fill': {
      title: 'Search & Fill Records and Saved Respondents Into PDFs | DullyPDF Docs',
      description: 'Use Search & Fill to choose a local row or stored respondent, validate field resolution, and review mapped PDF output before export.',
      keywords: ['search and fill pdf docs', 'csv row pdf fill workflow', 'stored respondent pdf fill'],
      bodyParagraphs: [
        page.summary,
        'This page is about operator-controlled output. It explains how to choose one record, inspect the filled PDF, and avoid turning row-based filling into a blind batch process.',
        'Search & Fill should stay distinct from respondent collection and API publication. The page is strongest when it explains the browser-based record-selection workflow clearly instead of trying to be a generic data-ingestion guide.',
      ],
    },
    'fill-from-images': {
      title: 'Fill PDF Forms from Photos, Invoices, and Scanned Documents | DullyPDF Docs',
      description: 'Upload images of IDs, invoices, pay stubs, or scanned documents and extract matching information into PDF form fields using AI vision.',
      keywords: ['fill pdf from image', 'extract data from photo to pdf', 'invoice to pdf form', 'ocr pdf form fill', 'auto fill pdf from document', 'extract invoice data pdf'],
      bodyParagraphs: [
        page.summary,
        'Fill from Images and Documents bridges the gap between unstructured source documents and structured PDF templates. Instead of manually reading an ID or invoice and typing values into form fields, the AI vision model reads the document and suggests field values with confidence scores.',
        'This feature is most valuable for industries that process high volumes of intake documents: healthcare patient registration from insurance cards, accounting from invoices, HR onboarding from government IDs, insurance from ACORD submissions, and logistics from shipping documents.',
      ],
    },
    'fill-by-link': {
      title: 'Publish Fill By Link Forms and Review Respondents | DullyPDF Docs',
      description: 'Configure respondent-facing forms, share links, review submissions, and generate PDFs later from stored Fill By Link records.',
      keywords: ['fill by link docs', 'respondent form publishing', 'template link workflow'],
      bodyParagraphs: [
        page.summary,
        'Fill By Link is the collection layer, not the final PDF output itself. This page explains how respondents, owners, and later PDF generation fit together inside the same template workflow.',
      ],
    },
    'signature-workflow': {
      title: 'Signature Workflow Setup and Signing Guardrails | DullyPDF Docs',
      description: 'Learn the operator steps for freezing immutable PDFs, routing signers, and reviewing retained artifacts in DullyPDF.',
      keywords: ['signature workflow docs', 'immutable pdf signing guide', 'signer artifact workflow'],
    },
    'api-fill': {
      title: 'API Fill Endpoint Management and Schema Guide | DullyPDF Docs',
      description: 'Learn how DullyPDF publishes template-scoped JSON-to-PDF endpoints with schema downloads, key rotation, audit activity, and hosted limits.',
      keywords: ['api fill docs', 'json pdf endpoint guide', 'template endpoint schema'],
      bodyParagraphs: [
        page.summary,
        'Use this page when the template already exists and the next decision is how to expose it safely as a hosted endpoint instead of a browser-only workflow.',
      ],
    },
    'create-group': {
      title: 'Create Group Workflows for Full PDF Packets | DullyPDF Docs',
      description: 'Create groups of saved templates, switch packet members quickly, Search and Fill full document sets, and batch Rename + Map every template in the group.',
      keywords: ['create group pdf templates', 'group pdf workflow', 'batch rename map pdf packet', 'pdf packet automation'],
      bodyParagraphs: [
        page.summary,
        'Groups are most useful when the team is managing recurring packet logic rather than isolated documents. This page explains when several templates should share one packet context and how to keep that packet stable over time.',
      ],
    },
    'save-download-profile': {
      title: 'Save Reusable PDF Templates and Download Outputs | DullyPDF Docs',
      description: 'Learn when to download generated files or save templates to your DullyPDF profile for reuse, Fill By Link publishing, billing, and collaboration.',
      keywords: ['save pdf template', 'download filled pdf', 'reusable pdf templates'],
      bodyParagraphs: [
        page.summary,
        'Saving is not just storage. It is the boundary that makes templates reusable, publishable, and safe to connect to later workflows such as Fill By Link, API Fill, packet grouping, and signing.',
      ],
    },
    troubleshooting: {
      title: 'PDF Form Automation Troubleshooting Guide | DullyPDF Docs',
      description: 'Diagnose detection, mapping, and fill issues with targeted checks and known validation errors in DullyPDF workflows.',
      keywords: ['pdf automation troubleshooting', 'fillable pdf mapping issues'],
      bodyParagraphs: [
        page.summary,
        'Troubleshooting works best when it follows the actual pipeline: upload, detect, rename or map, fill, publish, and deliver. This page is meant to shorten diagnosis time by matching checks to the stage where the workflow is failing.',
      ],
    },
  };

  const seo = seoLookup[page.key];
  const breadcrumbItems = page.key === 'index'
    ? [
        { label: 'Home', href: '/' },
        { label: 'Usage Docs' },
      ]
    : [
        { label: 'Home', href: '/' },
        { label: 'Usage Docs', href: '/usage-docs' },
        { label: page.title },
      ];
  USAGE_DOCS_ROUTE_SEO[page.key] = {
    title: seo.title,
    description: seo.description,
    canonicalPath: page.path,
    keywords: seo.keywords,
    structuredData: appendStructuredData(
      appendStructuredData(USAGE_DOCS_FAQ_SCHEMAS[page.key], buildBreadcrumbSchema(breadcrumbItems)),
      page.key === 'index'
        ? buildCollectionPageSchema('DullyPDF Usage Docs', seo.description, page.path)
        : buildTechArticleSchema(page.title, seo.description, page.path),
    ),
    bodyContent: {
      heading: page.title,
      paragraphs: seo.bodyParagraphs ?? [page.summary],
      sectionTitles: page.sectionTitles,
    },
  };
}

const INTENT_ROUTE_SEO = {};
for (const page of INTENT_PAGES) {
  const catalogShowcase = getIntentCatalogShowcase(page.key);
  let structuredData = appendStructuredData(
    toFaqSchema(page.faqs),
    buildBreadcrumbSchema([
      { label: 'Home', href: '/' },
      { label: page.category === 'industry' ? 'Industries' : 'Workflows' },
      { label: page.navLabel },
    ]),
  );

  if (catalogShowcase) {
    structuredData = appendStructuredData(
      appendStructuredData(structuredData, buildIntentCatalogItemListSchema(page, catalogShowcase)),
      buildIntentCatalogHowToSchema(page, catalogShowcase),
    );
  }

  const intentVideo = VIDEO_BY_INTENT_KEY[page.key];
  if (intentVideo) {
    structuredData = appendStructuredData(structuredData, buildVideoObjectSchema(intentVideo));
  }

  INTENT_ROUTE_SEO[page.key] = {
    title: buildIntentSeoTitle(page.heroTitle),
    description: buildIntentSeoDescription(page.heroSummary),
    canonicalPath: page.path,
    keywords: page.seoKeywords,
    structuredData,
    ...(intentVideo ? { video: intentVideo } : {}),
    bodyContent: {
      heading: page.heroTitle,
      paragraphs: [page.heroSummary],
      articleSections: page.articleSections,
      valuePoints: page.valuePoints,
      proofPoints: page.proofPoints,
      faqs: page.faqs,
    },
  };
}

const INTENT_HUB_ROUTE_SEO = {
  workflows: {
    title: 'PDF Automation Workflows — Templates, Filling, Signing, and API',
    description:
      'Every way to automate PDFs: browse a form catalog, convert to fillable forms, fill from spreadsheets or databases, collect signatures, and publish fill-by-API endpoints.',
    canonicalPath: '/workflows',
    keywords: [
      'pdf workflow library',
      'pdf to fillable form workflow',
      'pdf mapping and autofill workflows',
    ],
    structuredData: [
      buildCollectionPageSchema(
        'Workflow Library for PDF Automation',
        'Browse DullyPDF workflow pages for converting PDFs to fillable templates, mapping fields to schemas, and auto-filling from structured data.',
        '/workflows',
      ),
      buildBreadcrumbSchema([
        { label: 'Home', href: '/' },
        { label: 'Workflows' },
      ]),
    ],
    bodyContent: {
      heroKicker: 'Workflow hub',
      heading: 'Workflow Library for PDF Automation',
      paragraphs: [
        'Browse workflow-first landing pages for converting PDFs to fillable templates, starting from curated blank forms, mapping fields to structured schemas, and filling forms from repeat records.',
      ],
      panelTitle: 'All workflow pages',
      panelDescription:
        'These pages are organized for users searching by action (browse a catalog, convert, map, fill, rename, sign). Start with the workflow closest to your immediate task.',
      sections: INTENT_PAGES
        .filter((page) => page.category === 'workflow')
        .map((page) => ({ title: page.navLabel, description: page.heroSummary, href: page.path })),
      supportSections: [
        {
          title: 'How to use this library',
          paragraphs: [
            'Use the hub as a routing layer, not as the final stop. Start with the page that best matches the exact problem you are trying to solve today, then move from that route into the docs or blog only after you know the workflow is the right fit.',
            'That keeps the crawl path and the user path aligned. Searchers looking for a specific PDF task should be able to move from a broad library page into a focused route that explains setup order, tradeoffs, and validation steps without unnecessary detours.',
          ],
        },
        {
          title: 'Supporting resources',
          paragraphs: [
            'After choosing a workflow page, use these public resources to get operational details and implementation examples.',
          ],
          links: [
            { label: 'PDF Form Catalog', href: '/pdf-form-catalog' },
            { label: 'Browse Form Catalog', href: '/forms' },
            { label: 'Usage Docs Overview', href: '/usage-docs' },
            { label: 'Getting Started', href: '/usage-docs/getting-started' },
            { label: 'Blog', href: '/blog' },
          ],
        },
      ],
    },
  },
  industries: {
    title: 'PDF Automation by Industry — Healthcare, Insurance, Legal, HR, and More',
    description:
      'See how teams in healthcare, insurance, legal, HR, finance, logistics, and education use PDF auto-fill to eliminate repetitive form entry.',
    canonicalPath: '/industries',
    keywords: [
      'industry pdf automation',
      'healthcare insurance legal pdf workflows',
      'pdf form automation by industry',
    ],
    structuredData: [
      buildCollectionPageSchema(
        'Industry PDF Automation Solutions',
        'Browse DullyPDF industry pages for healthcare, insurance, legal, HR, finance, and other repeat PDF automation workflows.',
        '/industries',
      ),
      buildBreadcrumbSchema([
        { label: 'Home', href: '/' },
        { label: 'Industries' },
      ]),
    ],
    bodyContent: {
      heroKicker: 'Industry hub',
      heading: 'Industry Solutions for Repeat PDF Workflows',
      paragraphs: [
        'Browse industry-specific landing pages for healthcare, insurance, legal, HR, finance, logistics, and other document-heavy operations that still rely on recurring PDF packets.',
      ],
      panelTitle: 'All industry pages',
      panelDescription:
        'These pages are organized for teams searching by vertical. Choose your industry route to see targeted implementation guidance and examples.',
      sections: INTENT_PAGES
        .filter((page) => page.category === 'industry')
        .map((page) => ({ title: page.navLabel, description: page.heroSummary, href: page.path })),
      supportSections: [
        {
          title: 'How to use this library',
          paragraphs: [
            'Use the hub as a routing layer, not as the final stop. Start with the page that best matches the exact problem you are trying to solve today, then move from that route into the docs or blog only after you know the workflow is the right fit.',
            'That keeps the crawl path and the user path aligned. Searchers looking for a specific PDF task should be able to move from a broad library page into a focused route that explains setup order, tradeoffs, and validation steps without unnecessary detours.',
          ],
        },
        {
          title: 'Supporting resources',
          paragraphs: [
            'After choosing an industry page, use these public resources to get operational details and implementation examples.',
          ],
          links: [
            { label: 'Usage Docs Overview', href: '/usage-docs' },
            { label: 'Getting Started', href: '/usage-docs/getting-started' },
            { label: 'Blog', href: '/blog' },
          ],
        },
      ],
    },
  },
};

const FEATURE_PLAN_ROUTE_SEO = {};
for (const page of FEATURE_PLAN_PAGES) {
  const planBodyParagraphs = page.key === 'free-features'
    ? [
        page.heroSummary,
        `Free keeps the workflow surface broad but the account caps deliberate: ${formatPlanLimitCount(FREE_PLAN_LIMITS.savedFormsMax)} saved forms, ${formatPlanLimitCount(FREE_PLAN_LIMITS.fillLinkResponsesMonthlyMax)} Fill By Link responses per month, ${formatPlanLimitCount(FREE_PLAN_LIMITS.templateApiActiveMax)} live API endpoint, ${formatPlanLimitCount(FREE_PLAN_LIMITS.signingRequestsMonthlyMax)} sent signing requests per month, ${formatPlanLimitCount(FREE_PLAN_LIMITS.detectMaxPages)} detect pages per PDF, ${formatPlanLimitCount(FREE_PLAN_LIMITS.fillableMaxPages)} fillable pages per reusable upload, and a base OpenAI pool that tops back up to ${formatPlanLimitCount(FREE_PLAN_CREDITS.availableCredits)} each month when needed.`,
        'That makes the page more than a pricing summary. It explains when free is strategically enough and when saved-template capacity, publish limits, signer volume, or credit pool size, not setup uncertainty, should trigger an upgrade.',
      ]
    : [
        page.heroSummary,
        `Premium raises the working ceiling across the product: ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.savedFormsMax)} saved forms, ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.fillLinkResponsesMonthlyMax)} Fill By Link responses per month, ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.templateApiActiveMax)} API endpoints, ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.templateApiRequestsMonthlyMax)} successful API fills per month, ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.signingRequestsMonthlyMax)} sent signing requests per month, ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.detectMaxPages)} detect pages per PDF, ${formatPlanLimitCount(PREMIUM_PLAN_LIMITS.fillableMaxPages)} fillable pages per reusable upload, and ${formatPlanLimitCount(PREMIUM_PLAN_CREDITS.monthlyCredits)} monthly credits before refill packs.`,
        'That means the page should help buyers self-qualify operationally, not just compare labels. The key question is whether the workflow is already proven and ready for higher-usage execution across saved templates, live links, API traffic, and signing volume.',
      ];
  FEATURE_PLAN_ROUTE_SEO[page.key] = {
    title: page.seoTitle,
    description: page.seoDescription,
    canonicalPath: page.path,
    keywords: page.seoKeywords,
    structuredData: appendStructuredData(
      toFaqSchema(page.faqs),
      buildBreadcrumbSchema([
        { label: 'Home', href: '/' },
        { label: 'Plans' },
        { label: page.navLabel },
      ]),
    ),
    bodyContent: {
      heading: page.heroTitle,
      paragraphs: planBodyParagraphs,
      valuePoints: page.valuePoints,
      sections: page.detailSections.map((section) => ({
        title: section.title,
        description: section.items.join(' '),
      })),
      faqs: page.faqs,
    },
  };
}

// ---------------------------------------------------------------------------
// Form Catalog routes
// ---------------------------------------------------------------------------

const ACTIVE_FORM_CATALOG_CATEGORIES = FORM_CATALOG_CATEGORIES.filter((category) => !category.empty);

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

const FORM_CATALOG_INDEX_FAQS = [
  {
    question: 'How many forms are in the DullyPDF form catalog?',
    answer: `The catalog currently hosts ${FORM_CATALOG_TOTAL_COUNT.toLocaleString()} free fillable PDF forms across ${ACTIVE_FORM_CATALOG_CATEGORIES.length} categories, including tax, immigration, healthcare, real estate, HR, bankruptcy, veterans, and small-business documents.`,
  },
  {
    question: 'Are the form catalog PDFs free to download?',
    answer: 'Yes. Every hosted form comes from a public-domain government source. You can download the blank PDF, or open it inside DullyPDF to auto-detect fields, fill from a spreadsheet, collect answers from a web form, or route the filled record into a signature workflow.',
  },
  {
    question: 'Can I fill these forms automatically?',
    answer: 'Yes. Open any catalog form in DullyPDF and the field detection pipeline finds every text box, checkbox, radio group, and signature region. You can then search and fill from CSV, Excel, or JSON rows, call the JSON-to-PDF API, or publish a hosted web form to collect structured answers before generating the final PDF.',
  },
  {
    question: 'Which categories are supported?',
    answer: `The catalog covers ${ACTIVE_FORM_CATALOG_CATEGORIES.map((category) => category.label).join(', ')}.`,
  },
];

const FORM_CATALOG_INDEX_STRUCTURED_DATA = [
  {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'DullyPDF Form Catalog',
    description: `Browse ${FORM_CATALOG_TOTAL_COUNT.toLocaleString()} free fillable PDF forms organised by category. Open any form inside DullyPDF to automate detection, filling, and e-signature.`,
    url: `${SITE_ORIGIN}/forms`,
    isPartOf: {
      '@type': 'WebSite',
      name: 'DullyPDF',
      url: `${SITE_ORIGIN}/`,
    },
  },
  buildBreadcrumbSchema([
    { label: 'Home', href: '/' },
    { label: 'Form Catalog' },
  ]),
  {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'DullyPDF Form Catalog Categories',
    itemListOrder: 'https://schema.org/ItemListUnordered',
    numberOfItems: ACTIVE_FORM_CATALOG_CATEGORIES.length,
    itemListElement: ACTIVE_FORM_CATALOG_CATEGORIES.map((category, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: category.label,
      url: `${SITE_ORIGIN}/forms?category=${encodeURIComponent(category.key)}`,
    })),
  },
  ...toFaqSchema(FORM_CATALOG_INDEX_FAQS),
];

const FORM_CATALOG_INDEX_ROUTE = {
  path: '/forms',
  seo: {
    title: `Free Fillable PDF Form Catalog — ${FORM_CATALOG_TOTAL_COUNT.toLocaleString()}+ Official Forms | DullyPDF`,
    description: `Browse ${FORM_CATALOG_TOTAL_COUNT.toLocaleString()} free fillable PDF forms across ${ACTIVE_FORM_CATALOG_CATEGORIES.length} categories — tax, immigration, healthcare, real estate, HR, and more. Open any form in DullyPDF to auto-detect fields, fill from your data, and e-sign.`,
    canonicalPath: '/forms',
    keywords: FORM_CATALOG_INDEX_KEYWORDS,
    structuredData: FORM_CATALOG_INDEX_STRUCTURED_DATA,
  },
  kind: 'form-catalog-index',
};

const FORM_CATALOG_CATEGORY_BY_KEY = new Map(
  FORM_CATALOG_CATEGORIES.map((category) => [category.key, category]),
);

const FORM_CATALOG_SECTION_TO_CATEGORY = new Map();
for (const category of FORM_CATALOG_CATEGORIES) {
  for (const section of category.sections || [category.key]) {
    if (!FORM_CATALOG_SECTION_TO_CATEGORY.has(section)) {
      FORM_CATALOG_SECTION_TO_CATEGORY.set(section, category);
    }
  }
}

const formatFormCatalogTitle = (entry) => {
  const prefix = entry.formNumber ? `${entry.formNumber} — ` : '';
  return `${prefix}${entry.title}`.trim();
};

// Google truncates <title> tags around 60 characters / 600 pixels in SERP
// rendering. Form-catalog titles are auto-generated from official form titles
// (often 100+ chars), so we apply a tiered budget:
//   1. Try the full marketing title with " — Free Fillable PDF | DullyPDF"
//   2. If too long, drop the marketing suffix and use just " | DullyPDF"
//   3. If still too long, truncate the displayTitle at a word boundary and
//      add an ellipsis, keeping the brand suffix.
//
// The 60-char ceiling is enforced by frontend/test/unit/config/test_route_seo.test.ts.
const SERP_TITLE_BUDGET = 60;
const BRAND_SUFFIX = ' | DullyPDF';
const FULL_SUFFIX = ' — Free Fillable PDF | DullyPDF';

const truncateAtWord = (text, maxLength) => {
  if (text.length <= maxLength) return text;
  // Reserve 1 char for the ellipsis.
  const cutoff = text.lastIndexOf(' ', maxLength - 1);
  const sliceEnd = cutoff > 20 ? cutoff : maxLength - 1;
  return text.slice(0, sliceEnd).trimEnd() + '…';
};

const buildFormCatalogPageTitle = (displayTitle) => {
  const fullTitle = `${displayTitle}${FULL_SUFFIX}`;
  if (fullTitle.length <= SERP_TITLE_BUDGET) return fullTitle;

  const compactTitle = `${displayTitle}${BRAND_SUFFIX}`;
  if (compactTitle.length <= SERP_TITLE_BUDGET) return compactTitle;

  const room = SERP_TITLE_BUDGET - BRAND_SUFFIX.length;
  return `${truncateAtWord(displayTitle, room)}${BRAND_SUFFIX}`;
};

const buildFormCatalogEntrySeo = (entry, { canonicalSlug = null } = {}) => {
  const category =
    FORM_CATALOG_SECTION_TO_CATEGORY.get(entry.section)
    || FORM_CATALOG_CATEGORY_BY_KEY.get(entry.section)
    || null;
  const categoryLabel = category?.label || entry.section;
  const displayTitle = formatFormCatalogTitle(entry);
  // For variant pages we point rel=canonical at the cluster parent so Google
  // consolidates link equity onto one page. The on-page URL itself stays
  // accessible via the variant slug.
  const canonicalPath = canonicalSlug
    ? `/forms/${canonicalSlug}`
    : `/forms/${entry.slug}`;
  const description = entry.description
    ? `${entry.description} Download the blank PDF or open it in DullyPDF to auto-detect fields, fill from CSV, collect answers by web form, call a JSON-to-PDF API, and e-sign.`
    : `Free fillable ${displayTitle} PDF. Download the blank PDF or open it in DullyPDF to auto-detect fields, fill from CSV, collect answers by web form, call a JSON-to-PDF API, and e-sign.`;
  const keywords = [
    entry.formNumber ? `${entry.formNumber} fillable pdf` : null,
    entry.formNumber ? `${entry.formNumber} pdf download` : null,
    `${entry.title} fillable pdf`,
    `${entry.title} pdf download`,
    `${categoryLabel.toLowerCase()} pdf forms`,
    'free fillable pdf',
    'official fillable pdf form',
  ].filter(Boolean);

  const thumbnailUrl = entry.thumbnailUrl
    ? (entry.thumbnailUrl.startsWith('http')
        ? entry.thumbnailUrl
        : `${SITE_ORIGIN}${entry.thumbnailUrl}`)
    : `${SITE_ORIGIN}${DEFAULT_SOCIAL_IMAGE_PATH}`;

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `${displayTitle} — Free Fillable PDF`,
      description,
      url: `${SITE_ORIGIN}${canonicalPath}`,
      inLanguage: 'en-US',
      isPartOf: {
        '@type': 'WebSite',
        name: 'DullyPDF',
        url: `${SITE_ORIGIN}/`,
      },
      primaryImageOfPage: {
        '@type': 'ImageObject',
        url: thumbnailUrl,
      },
      about: {
        '@type': 'CreativeWork',
        name: displayTitle,
        ...(entry.sourceUrl ? { isBasedOnUrl: entry.sourceUrl } : {}),
      },
    },
    buildBreadcrumbSchema([
      { label: 'Home', href: '/' },
      { label: 'Form Catalog', href: '/forms' },
      ...(category ? [{ label: category.label, href: `/forms?category=${encodeURIComponent(category.key)}` }] : []),
      { label: displayTitle },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: `How to fill out ${displayTitle} with DullyPDF`,
      description: `Open the free blank ${displayTitle} PDF inside DullyPDF, let the AI detect every field, then fill from a spreadsheet, a hosted web form, or a JSON-to-PDF API call before downloading or signing.`,
      url: `${SITE_ORIGIN}${canonicalPath}`,
      step: [
        {
          '@type': 'HowToStep',
          position: 1,
          name: `Open ${entry.formNumber || 'the form'} in DullyPDF`,
          text: `Open ${displayTitle} in the DullyPDF editor or download the blank PDF directly from this page.`,
          url: `${SITE_ORIGIN}${canonicalPath}`,
        },
        {
          '@type': 'HowToStep',
          position: 2,
          name: 'Detect and rename fields',
          text: 'Let DullyPDF run CommonForms field detection, review the candidates, and optionally apply AI rename so every field has a clear, reusable name.',
          url: `${SITE_ORIGIN}/pdf-field-detection-tool`,
        },
        {
          '@type': 'HowToStep',
          position: 3,
          name: 'Fill, sign, and reuse',
          text: 'Fill from CSV or JSON, publish a hosted web form, call the JSON-to-PDF API, or route the completed record into an E-SIGN/UETA signature ceremony.',
          url: `${SITE_ORIGIN}/fill-pdf-from-csv`,
        },
      ],
    },
  ];

  return {
    title: buildFormCatalogPageTitle(displayTitle),
    description,
    canonicalPath,
    keywords,
    ogImagePath: entry.thumbnailUrl || null,
    structuredData,
  };
};

// ---------------------------------------------------------------------------
// Low-value form classification (SEO pruning)
//
// We keep every form-catalog page LIVE (deep links + Reddit shares still work)
// but we mark thin/duplicate ones as `lowValue` so:
//   - generate-static-html.mjs emits <meta name="robots" content="noindex,follow">
//     for them
//   - generate-sitemap.mjs drops them from sitemap.xml
//   - rel=canonical points at the cluster parent (set above) so link equity
//     consolidates onto one page
//
// A form is lowValue when ANY of the following holds:
//   1. is a prior-year edition of a form whose current edition is also in the
//      catalog (handled via `entry.isPriorYear`)
//   2. ships as <10kB on disk (almost always a stub or a near-empty PDF)
//   3. is a near-duplicate variant of a parent form, e.g. CMS-855a/b/i/o/s all
//      variants of CMS-855 Medicare Provider Enrollment
// ---------------------------------------------------------------------------

const VARIANT_CLUSTERS = [
  // CMS-855 Medicare Provider Enrollment (a/b/i/o/s) → consolidate on cms-855a
  { pattern: /^cms-855[abios]$/i, canonical: 'cms-855a' },
  // VA Form 10-10 Health Benefits Application (10-10d, 10-10ez, 10-10ezr)
  { pattern: /^10-10(?:d|ez|ezr)$/i, canonical: '10-10ez' },
  // VA CHAMPVA Claim Form variants (10-7959a, 10-7959c)
  { pattern: /^10-7959[ac]$/i, canonical: '10-7959a' },
  // VA Request for and Authorization to Release Medical Records (10-5345, 10-5345a)
  { pattern: /^10-5345a?$/i, canonical: '10-5345' },
  // CMS-36 Medicare benefits family (cms-36, cms-36p)
  { pattern: /^cms-36p?$/i, canonical: 'cms-36' },
];

const LOW_VALUE_BYTE_THRESHOLD = 10_000;

function classifyLowValue(entry) {
  if (entry.isPriorYear === true) {
    return { lowValue: true, reason: 'prior-year', canonicalSlug: null };
  }
  if (typeof entry.bytes === 'number' && entry.bytes < LOW_VALUE_BYTE_THRESHOLD) {
    return { lowValue: true, reason: 'tiny-bytes', canonicalSlug: null };
  }
  for (const cluster of VARIANT_CLUSTERS) {
    if (cluster.pattern.test(entry.slug) && entry.slug !== cluster.canonical) {
      return { lowValue: true, reason: 'variant-of-cluster', canonicalSlug: cluster.canonical };
    }
  }
  return { lowValue: false, reason: null, canonicalSlug: null };
}

const FORM_CATALOG_FORM_ROUTES = FORM_CATALOG_ENTRIES.map((entry) => {
  const { lowValue, reason, canonicalSlug } = classifyLowValue(entry);
  return {
    path: `/forms/${entry.slug}`,
    seo: buildFormCatalogEntrySeo(entry, { canonicalSlug }),
    kind: 'form-catalog-form',
    slug: entry.slug,
    lowValue,
    lowValueReason: reason,
    ...(canonicalSlug ? { canonicalSlug } : {}),
  };
});

// ---------------------------------------------------------------------------
// All routes consolidated
// ---------------------------------------------------------------------------

/** @type {Array<{path: string, seo: object, kind: string, pageKey?: string}>} */
export const ALL_ROUTES = [
  { path: '/', seo: HOME_ROUTE_SEO, kind: 'home' },
  { path: '/privacy', seo: LEGAL_ROUTE_SEO.privacy, kind: 'legal', pageKey: 'privacy' },
  { path: '/terms', seo: LEGAL_ROUTE_SEO.terms, kind: 'legal', pageKey: 'terms' },
  { path: '/workflows', seo: INTENT_HUB_ROUTE_SEO.workflows, kind: 'intent-hub', pageKey: 'workflows' },
  { path: '/industries', seo: INTENT_HUB_ROUTE_SEO.industries, kind: 'intent-hub', pageKey: 'industries' },
  ...FEATURE_PLAN_PAGES.map((page) => ({
    path: page.path,
    seo: FEATURE_PLAN_ROUTE_SEO[page.key],
    kind: 'feature-plan',
    pageKey: page.key,
  })),
  ...USAGE_DOCS_PAGES.map((page) => ({
    path: page.path,
    seo: USAGE_DOCS_ROUTE_SEO[page.key],
    kind: 'usage-docs',
    pageKey: page.key,
  })),
  ...INTENT_PAGES.map((page) => ({
    path: page.path,
    seo: INTENT_ROUTE_SEO[page.key],
    kind: 'intent',
    pageKey: page.key,
    category: page.category,
  })),
];

// Convenience export: just the paths
export const INDEXABLE_PUBLIC_ROUTE_PATHS = ALL_ROUTES.map((r) => r.path);

// ---------------------------------------------------------------------------
// Footer link structure (used by static HTML generator for every page)
// ---------------------------------------------------------------------------

export const FOOTER_LINKS = {
  product: [
    { label: 'Try DullyPDF', href: '/' },
    { label: 'Form Catalog', href: '/forms' },
    { label: 'Getting Started', href: '/usage-docs/getting-started' },
    { label: 'Usage Docs', href: '/usage-docs' },
  ],
  workflows: INTENT_PAGES.filter((p) => p.category === 'workflow').map((p) => ({ label: p.navLabel, href: p.path })),
  industries: INTENT_PAGES.filter((p) => p.category === 'industry').map((p) => ({ label: p.navLabel, href: p.path })),
  resources: [
    { label: 'Blog', href: '/blog' },
    { label: 'Form Catalog', href: '/forms' },
    { label: 'Troubleshooting', href: '/usage-docs/troubleshooting' },
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
};

// Add blog routes to ALL_ROUTES
const BLOG_INDEX_ROUTE = {
  path: '/blog',
  seo: {
    title: 'PDF Automation Guides and Tutorials — DullyPDF Blog',
    description: 'Step-by-step guides for converting PDFs to fillable forms, auto-filling from spreadsheets, setting up e-signatures, and eliminating manual data entry.',
    canonicalPath: '/blog',
    keywords: ['pdf automation blog', 'fillable form guides', 'pdf form tutorials'],
    structuredData: [{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'DullyPDF Blog',
      url: 'https://dullypdf.com/blog',
      description: 'Guides and tutorials for PDF form automation, field detection, schema mapping, and auto-fill workflows.',
    }, buildBreadcrumbSchema([
      { label: 'Home', href: '/' },
      { label: 'Blog' },
    ])],
    bodyContent: {
      heroKicker: 'Blog',
      heading: 'PDF Automation Guides & Tutorials',
      paragraphs: [
        'Practical guides for converting PDFs to fillable forms, mapping fields to databases, and automating repetitive form-filling workflows.',
        'Use the blog for implementation detail, comparisons, and recurring workflow examples that support the main commercial routes without replacing them.',
        'The strongest posts answer a narrower search question than the workflow pages do: how to roll out one template, how to evaluate a comparison, or how a specific vertical uses the template model in practice.',
        'That is why the blog index is organized around job-to-be-done thinking rather than chronology alone. Some posts help evaluators choose a route, some help operators implement a template, and others help vertical teams see how the template model applies to their own document library.',
      ],
      supportSections: [
        {
          title: 'How to use these guides',
          paragraphs: [
            'The blog is most useful when paired with the workflow pages and usage docs. Use a post to understand the operational problem, then move into the corresponding route or docs page to validate the exact DullyPDF setup order before production use.',
            'This keeps the search path and the implementation path aligned. Comparison and case-study posts bring in broader query coverage, while the linked product routes answer the narrower question of how the workflow behaves inside the app.',
          ],
        },
        {
          title: 'Browse by job to be done',
          paragraphs: [
            'Start with comparison posts when the team is evaluating alternatives. Start with implementation guides when the route is already chosen and the main question is setup order. Start with industry posts when the challenge is organizing a recurring document library for a vertical team rather than choosing one isolated feature.',
          ],
          links: [
            { label: 'Workflow Library', href: '/workflows' },
            { label: 'Industry Library', href: '/industries' },
            { label: 'Getting Started Docs', href: '/usage-docs/getting-started' },
          ],
        },
        {
          title: 'Start with these core routes',
          links: [
            { label: 'PDF to Fillable Form', href: '/pdf-to-fillable-form' },
            { label: 'Fill PDF From CSV', href: '/fill-pdf-from-csv' },
            { label: 'Getting Started Docs', href: '/usage-docs/getting-started' },
            { label: 'Rename + Mapping Docs', href: '/usage-docs/rename-mapping' },
          ],
        },
        {
          title: 'Best first reads for evaluators',
          paragraphs: [
            'New visitors usually get the fastest signal from one comparison post, one implementation guide, and one route-level page. That mix tells you whether DullyPDF fits the problem, how the workflow behaves, and where the deeper docs live if the fit looks right.',
          ],
          links: [
            { label: 'DullyPDF vs Adobe Acrobat', href: '/blog/dullypdf-vs-adobe-acrobat-pdf-form-automation' },
            { label: 'How to Convert a PDF to a Fillable Form', href: '/blog/how-to-convert-pdf-to-fillable-form' },
            { label: 'PDF to Fillable Form Workflow', href: '/pdf-to-fillable-form' },
          ],
        },
        {
          title: 'Browse by workflow stage',
          paragraphs: [
            'Some posts are best read before template setup begins, while others make more sense after the template already exists. Use the links below to move into the right stage instead of reading the blog in isolation.',
          ],
          links: [
            { label: 'Detection Docs', href: '/usage-docs/detection' },
            { label: 'Search & Fill Docs', href: '/usage-docs/search-fill' },
            { label: 'Workflow Library', href: '/workflows' },
            { label: 'Industry Library', href: '/industries' },
          ],
        },
      ],
    },
  },
  kind: 'blog-index',
};

const getPrimaryBlogFigure = (post) => post.sections.flatMap((section) => section.figures ?? [])[0] ?? null;

const BLOG_POST_ROUTES = BLOG_POSTS.map((post) => {
  const primaryFigure = getPrimaryBlogFigure(post);
  const blogVideo = VIDEO_BY_BLOG_SLUG[post.slug];

  let blogStructuredData = appendStructuredData([{
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.seoDescription,
    author: { '@type': 'Organization', name: post.author, sameAs: OFFICIAL_PUBLIC_PROFILE_URLS },
    datePublished: post.publishedDate,
    dateModified: post.updatedDate,
    url: `https://dullypdf.com/blog/${post.slug}`,
    ...(primaryFigure ? { image: `${SITE_ORIGIN}${primaryFigure.src}` } : {}),
    publisher: {
      '@type': 'Organization',
      name: 'DullyPDF',
      sameAs: OFFICIAL_PUBLIC_PROFILE_URLS,
      logo: { '@type': 'ImageObject', url: 'https://dullypdf.com/DullyPDFLogoImproved.png' },
    },
  }], buildBreadcrumbSchema([
    { label: 'Home', href: '/' },
    { label: 'Blog', href: '/blog' },
    { label: post.title },
  ]));

  if (blogVideo) {
    blogStructuredData = appendStructuredData(blogStructuredData, buildVideoObjectSchema(blogVideo));
  }

  return {
    path: `/blog/${post.slug}`,
    seo: {
      title: post.seoTitle,
      description: post.seoDescription,
      canonicalPath: `/blog/${post.slug}`,
      keywords: post.seoKeywords,
      structuredData: blogStructuredData,
      ...(blogVideo ? { video: blogVideo } : {}),
      bodyContent: {
        heading: post.title,
        paragraphs: [
          post.updatedDate && post.updatedDate !== post.publishedDate
            ? `Published ${post.publishedDate}. Last updated ${post.updatedDate}.`
            : `Published ${post.publishedDate}.`,
          post.summary,
        ],
        articleSections: post.sections.map((section) => ({
          title: section.title,
          paragraphs: section.paragraphs,
          ...(section.bullets?.length ? { bullets: section.bullets } : {}),
          ...(section.figures?.length ? { figures: section.figures } : {}),
        })),
      },
    },
    kind: 'blog-post',
    slug: post.slug,
  };
});

// Append blog routes
ALL_ROUTES.push(BLOG_INDEX_ROUTE);
ALL_ROUTES.push(...BLOG_POST_ROUTES);

// Append form catalog routes
ALL_ROUTES.push(FORM_CATALOG_INDEX_ROUTE);
ALL_ROUTES.push(...FORM_CATALOG_FORM_ROUTES);

// Export raw data for blog/sitemap integration
export { INTENT_PAGES, USAGE_DOCS_PAGES, FEATURE_PLAN_PAGES, BLOG_POSTS };
