const commonIndiaWorkflowRelatedDocs = ['getting-started', 'detection', 'rename-mapping', 'search-fill', 'fill-by-link', 'api-fill'];

const indiaWorkflowPageKeys = [
  'india-pdf-to-fillable-form',
  'india-fill-pdf-from-excel',
  'india-fill-pdf-from-csv',
  'india-fill-by-link',
  'india-pdf-fill-api',
  'india-pdf-field-detection',
  'india-rename-map-pdf-fields',
  'india-fill-pdf-from-documents',
  'india-pdf-packet-workflow',
  'india-pdf-calculations',
];

const toSentenceList = (items) => {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
};

const buildIndiaWorkflowPage = (page) => {
  const examples = toSentenceList(page.workflowExamples);
  const sourceRecords = toSentenceList(page.sourceRecords);

  return {
    key: page.key,
    category: 'workflow',
    path: page.path,
    navLabel: page.navLabel,
    heroTitle: page.heroTitle,
    heroSummary: page.heroSummary,
    seoTitle: page.seoTitle ?? `${page.heroTitle} | DullyPDF India`,
    seoDescription: page.seoDescription ?? page.heroSummary,
    seoKeywords: page.seoKeywords,
    valuePoints: page.valuePoints,
    proofPoints: page.proofPoints,
    articleSections: [
      {
        title: `${page.navLabel} for Indian operations`,
        paragraphs: [
          page.localContext,
          `Use this workflow when the recurring PDF work includes ${examples}. The page should stay tied to real Indian operating examples rather than cloning a global workflow and swapping in country terms.`,
        ],
        bullets: page.workflowExamples,
      },
      {
        title: `Prepare the ${page.shortWorkflowLabel} template`,
        paragraphs: [
          page.setupContext,
          'A practical setup pass is to upload one real PDF, review detected fields, correct names and types, map the field set to source data, and save the template before inviting respondents, running a batch, or publishing an API endpoint.',
        ],
        bullets: page.setupChecks,
      },
      {
        title: `Map India source data into stable fields`,
        paragraphs: [
          `Start from the source records the team already trusts: ${sourceRecords}. Keep the mapping explicit enough that a reviewer can tell where each value came from.`,
          page.mappingContext,
        ],
        bullets: page.fieldExamples,
      },
      {
        title: `Choose the runtime for ${page.shortWorkflowLabel}`,
        paragraphs: [
          page.runtimeContext,
          'Search & Fill is the safest first runtime when a staff member still needs to inspect one record. Fill By Link is better when the source data should come from a respondent. API Fill is better after an internal system can send clean JSON to a saved template.',
        ],
      },
      {
        title: `Roll out ${page.shortWorkflowLabel} without thin duplicate pages`,
        paragraphs: [
          page.rolloutContext,
          'Start with one high-volume Indian workflow, validate a real record, then expand into adjacent PDFs only after the first template is dependable. That gives the India workflow cluster a real reason to exist.',
        ],
        bullets: page.qaChecks,
      },
      {
        title: 'Keep workflow boundaries clear',
        paragraphs: [
          page.boundaryContext,
          'DullyPDF handles field detection, cleanup, mapping, reusable templates, fill output, and reviewed PDF generation. It does not replace local policy, tax review, lending decisions, medical judgment, admissions decisions, procurement approval, or document-retention rules.',
        ],
      },
    ],
    supportSections: [
      {
        title: 'India industry examples for this workflow',
        paragraphs: [
          'These workflow pages are meant to connect product mechanics to the India industry pages where the same mechanics show up in day-to-day paperwork.',
        ],
        links: [
          { label: 'India KYC PDF Automation', href: '/in/kyc-pdf-automation' },
          { label: 'India Vendor Onboarding PDF Automation', href: '/in/vendor-onboarding-pdf-automation' },
          { label: 'India HR Joining PDF Automation', href: '/in/hr-joining-pdf-automation' },
          { label: 'India GST Invoice PDF Automation', href: '/in/gst-invoice-pdf-automation' },
          { label: 'India Delivery Challan PDF Automation', href: '/in/delivery-challan-pdf-automation' },
        ],
      },
    ],
    faqs: [
      {
        question: `Can Indian teams use DullyPDF for ${page.faqSubject}?`,
        answer: `Yes. Use one reviewed PDF template, map it to ${page.faqSourceLabel}, and run the workflow through Search & Fill, Fill By Link, or API Fill depending on how the source data is collected.`,
      },
      {
        question: `What should ${page.shortWorkflowLabel} test first?`,
        answer: page.firstTestAnswer,
      },
      {
        question: `When should ${page.shortWorkflowLabel} use flat PDF output?`,
        answer: page.flatOutputAnswer,
      },
    ],
    relatedIntentPages: indiaWorkflowPageKeys.filter((key) => key !== page.key),
    relatedDocs: commonIndiaWorkflowRelatedDocs,
  };
};

export const INDIA_WORKFLOW_INTENT_PAGES = [
  buildIndiaWorkflowPage({
    key: 'india-pdf-to-fillable-form',
    path: '/in/pdf-to-fillable-form',
    navLabel: 'India PDF to Fillable Form',
    heroTitle: 'India PDF to Fillable Form Workflow for Reusable Operations PDFs',
    heroSummary:
      'Convert recurring Indian KYC, vendor, HR, invoice, school, clinic, branch, and logistics PDFs into reviewed fillable templates.',
    seoKeywords: [
      'india pdf to fillable form',
      'pdf to fillable form india',
      'fillable pdf forms india',
      'convert pdf to form india',
      'make pdf fillable india',
      'india operations pdf template',
      'branch pdf form automation',
      'dullypdf india pdf template',
    ],
    valuePoints: [
      'Start from the exact PDF your Indian team already uses instead of rebuilding the layout from scratch.',
      'Review detected fields, rename them, and save the PDF as a reusable template.',
      'Use the same template later for Search & Fill, Fill By Link, grouped packets, or API Fill.',
    ],
    proofPoints: [
      'DullyPDF detects candidate text, checkbox, radio, date, image, barcode, QR/PDF417, and calculation field regions for review.',
      'Saved templates preserve cleanup and mapping work for the next Indian record.',
      'Flat output can preserve the final values for branch, customer, vendor, or internal handoff copies.',
    ],
    workflowExamples: [
      'KYC forms',
      'vendor setup PDFs',
      'HR joining forms',
      'GST invoice coversheets',
      'school and clinic intake PDFs',
    ],
    sourceRecords: [
      'branch spreadsheets',
      'vendor master exports',
      'employee joining trackers',
      'student intake rows',
      'clinic appointment sheets',
    ],
    setupChecks: [
      'Upload one high-volume Indian PDF with a stable layout.',
      'Review low-confidence detected fields before mapping.',
      'Name repeated identifiers consistently across the template.',
      'Save the template only after one representative output is inspected.',
    ],
    fieldExamples: [
      'name, pan_number, gstin, branch_code, employee_id, student_id',
      'address, mobile_number, email, invoice_number, appointment_date',
      'reviewer_id, document_status, approval_status, output_date',
    ],
    shortWorkflowLabel: 'PDF-to-fillable-form',
    localContext:
      'Indian operations teams often already have the PDF layout approved by a branch, school, clinic, finance, or back-office process. The useful workflow is turning that fixed layout into a reusable template without changing the underlying document.',
    setupContext:
      'Do not start by creating ten templates. Start with one PDF that recurs often, because the first template teaches the naming and review pattern that the rest of the India cluster should follow.',
    mappingContext:
      'Generic labels such as "name" and "id" become weak once the form grows. Use names that match the Indian record, such as pan_number, gstin, branch_code, employee_id, or student_id.',
    runtimeContext:
      'PDF-to-fillable-form is the setup workflow behind the rest of the India pages. Once the template is dependable, the same field set can support spreadsheet filling, respondent intake, or internal API generation.',
    rolloutContext:
      'Validate one output for long names, addresses, identifier formatting, blank optional fields, and checkbox choices before treating the template as reusable.',
    qaChecks: [
      'Check every field is aligned with the printed PDF label.',
      'Test one row with long names and long addresses.',
      'Confirm blank optional fields do not leave incorrect values behind.',
      'Download both editable and flat outputs when deciding the final handoff format.',
    ],
    boundaryContext:
      'A fillable template is not a policy decision. The team still decides what information it is allowed to collect, who reviews the record, and what final PDF should be retained.',
    faqSubject: 'turning India PDFs into fillable templates',
    faqSourceLabel: 'local spreadsheet, respondent, or API fields',
    firstTestAnswer:
      'Use one real PDF and one real Indian record. Check field alignment, long text, identifier formatting, checkbox values, and final output before building more templates.',
    flatOutputAnswer:
      'Use flat output when the filled copy is leaving the editor workflow for branch review, customer handoff, vendor setup, school office use, clinic files, or archive.',
  }),
  buildIndiaWorkflowPage({
    key: 'india-fill-pdf-from-excel',
    path: '/in/fill-pdf-from-excel',
    navLabel: 'India Excel to PDF Forms',
    heroTitle: 'Fill Indian PDF Forms From Excel Rows',
    heroSummary:
      'Use Excel rows from branch, HR, vendor, finance, school, clinic, logistics, or property teams to fill reviewed Indian PDF templates.',
    seoKeywords: [
      'fill pdf from excel india',
      'excel to pdf forms india',
      'indian pdf form from excel',
      'bulk fill pdf from excel india',
      'excel row to pdf india',
      'branch excel to pdf form',
      'vendor excel to pdf india',
      'hr excel to pdf india',
    ],
    valuePoints: [
      'Map Excel headers to reviewed PDF fields once, then select the right row in Search & Fill.',
      'Keep branch, vendor, HR, student, patient, invoice, and delivery rows local during browser-based review.',
      'Use the same Excel mapping as a QA step before moving to API Fill.',
    ],
    proofPoints: [
      'Search & Fill supports XLSX inputs for reviewed one-row-at-a-time PDF filling.',
      'Saved templates keep mapping and field cleanup separate from the spreadsheet file.',
      'Flat PDF output helps preserve the completed record after Excel row values are applied.',
    ],
    workflowExamples: [
      'branch customer rows',
      'vendor onboarding trackers',
      'employee joining sheets',
      'student admission sheets',
      'dispatch and invoice workbooks',
    ],
    sourceRecords: [
      'Excel workbooks',
      'department trackers',
      'branch rosters',
      'AP spreadsheets',
      'admission office files',
    ],
    setupChecks: [
      'Use one header row with stable column names.',
      'Remove merged cells before using the sheet as a source.',
      'Keep identifiers such as PAN, GSTIN, employee ID, and branch code in separate columns.',
      'Test one row with blanks and long text before filling more records.',
    ],
    fieldExamples: [
      'customer_name, vendor_name, employee_name, student_name, patient_name',
      'pan_number, gstin, employee_id, branch_code, invoice_number',
      'joining_date, admission_year, appointment_date, dispatch_date',
    ],
    shortWorkflowLabel: 'Excel-to-PDF',
    localContext:
      'Excel is still the operating table for many Indian back-office teams. The document work becomes repetitive when each row has to be typed into a PDF that already has a stable layout.',
    setupContext:
      'Prepare the PDF template first, then prepare the workbook. A clean workbook cannot fill a PDF reliably if the PDF fields are poorly named or duplicated.',
    mappingContext:
      'Keep Excel headers short, stable, and specific. A column called gstin is easier to map and audit than a column called details or remarks.',
    runtimeContext:
      'Search & Fill is the main Excel runtime because a staff member can choose one row and inspect the generated PDF before download. If the workbook is only an export from another system, API Fill may become the better long-term runtime.',
    rolloutContext:
      'Start with one workbook and one PDF. After that mapping is stable, reuse the same header naming style for adjacent KYC, vendor, HR, school, clinic, delivery, or purchase-order templates.',
    qaChecks: [
      'Test one row with long Indian names and addresses.',
      'Confirm dates display as intended after Excel import.',
      'Check blank optional columns do not populate old values.',
      'Review checkbox and radio choices against the exact source tokens.',
    ],
    boundaryContext:
      'Excel may contain sensitive operational records. DullyPDF can map and fill a PDF from rows, but the organization remains responsible for access control, retention, and reviewer approval.',
    faqSubject: 'Excel-to-PDF workflows in India',
    faqSourceLabel: 'Excel headers for Indian operational records',
    firstTestAnswer:
      'Use one real workbook row with PAN, GSTIN, branch, date, address, and blank optional fields so the team can catch formatting problems early.',
    flatOutputAnswer:
      'Use flat output when the filled PDF will be emailed, archived, handed to a branch, or opened in a viewer where live field behavior is not reliable.',
  }),
  buildIndiaWorkflowPage({
    key: 'india-fill-pdf-from-csv',
    path: '/in/fill-pdf-from-csv',
    navLabel: 'India CSV to PDF Forms',
    heroTitle: 'Fill Indian PDF Forms From CSV Exports',
    heroSummary:
      'Fill Indian operations PDFs from CSV exports produced by ERPs, CRMs, branch systems, admission trackers, clinic rosters, and logistics tools.',
    seoKeywords: [
      'fill pdf from csv india',
      'csv to pdf forms india',
      'bulk fill pdf csv india',
      'erp csv to pdf india',
      'crm csv to pdf form india',
      'branch csv to pdf forms',
      'vendor csv to pdf india',
      'gst invoice csv to pdf india',
    ],
    valuePoints: [
      'Use CSV exports when another system owns the record but staff still needs a reviewed PDF output.',
      'Map headers such as gstin, pan_number, branch_code, invoice_number, and challan_number into stable fields.',
      'Validate one row visually before producing a batch of flat PDFs.',
    ],
    proofPoints: [
      'Search & Fill supports CSV rows for browser-based source review.',
      'CSV header names can align with the same schema used later for API Fill.',
      'Flat outputs preserve completed PDFs after CSV values are applied.',
    ],
    workflowExamples: [
      'ERP purchase-order exports',
      'CRM customer rows',
      'branch KYC files',
      'clinic appointment lists',
      'warehouse dispatch CSVs',
    ],
    sourceRecords: [
      'ERP CSV exports',
      'CRM reports',
      'branch system downloads',
      'logistics exports',
      'finance CSV files',
    ],
    setupChecks: [
      'Use UTF-8 CSV files with one header row.',
      'Keep comma-containing addresses quoted correctly before upload.',
      'Normalize date, phone, and identifier columns before mapping.',
      'Test one row with Indian address and tax fields before batch output.',
    ],
    fieldExamples: [
      'pan_number, gstin, branch_code, vendor_code, employee_id',
      'invoice_number, po_number, challan_number, lr_number, vehicle_number',
      'taxable_value, cgst_amount, sgst_amount, igst_amount, grand_total',
    ],
    shortWorkflowLabel: 'CSV-to-PDF',
    localContext:
      'CSV is often the handoff format between Indian operations systems and office teams. It is simple, portable, and easy to inspect, but it still needs a reviewed PDF template before it can produce reliable records.',
    setupContext:
      'A CSV workflow should begin with the actual export the team uses, not a manually cleaned sample that hides real delimiter, date, or blank-field issues.',
    mappingContext:
      'Use the CSV headers as the schema contract. If the source system exports cryptic names, map them carefully once and keep a note in the template review process.',
    runtimeContext:
      'Search & Fill works well for CSV because the operator can choose a row, generate the PDF, and compare output against the export before adding volume.',
    rolloutContext:
      'Start with the export that already causes the most retyping, such as vendor setup, GST invoice, delivery challan, KYC, or HR joining data.',
    qaChecks: [
      'Inspect CSV parsing for addresses, commas, and blank fields.',
      'Check date and currency formatting in the final PDF.',
      'Confirm identifier fields keep leading zeros where relevant.',
      'Run one row twice to confirm the fill is repeatable.',
    ],
    boundaryContext:
      'CSV import does not validate the business meaning of the data. The team still owns source-system accuracy, approval status, and final review.',
    faqSubject: 'CSV-to-PDF workflows in India',
    faqSourceLabel: 'CSV headers exported from Indian operating systems',
    firstTestAnswer:
      'Use a real exported CSV row with address commas, dates, identifiers, blanks, and numeric totals. That catches most production mapping issues.',
    flatOutputAnswer:
      'Use flat output when CSV-filled PDFs become final records for branch, finance, vendor, logistics, or office handoff.',
  }),
  buildIndiaWorkflowPage({
    key: 'india-fill-by-link',
    path: '/in/fill-by-link',
    navLabel: 'India Fill By Link Intake',
    heroTitle: 'India Fill By Link Workflows for Vendor, Employee, Student, Patient, and Customer Intake',
    heroSummary:
      'Publish a web intake form from a saved PDF template so Indian respondents can submit answers before staff generates the final PDF.',
    seoKeywords: [
      'fill by link india',
      'pdf intake form india',
      'online pdf form link india',
      'vendor intake link india',
      'employee joining link pdf india',
      'school admission link pdf india',
      'clinic intake link india',
      'customer kyc link pdf india',
    ],
    valuePoints: [
      'Let respondents submit structured answers without opening a PDF editor.',
      'Review stored responses before generating the final Indian PDF record.',
      'Use one saved template for both respondent intake and staff-reviewed output.',
    ],
    proofPoints: [
      'Fill By Link renders a respondent-facing web form from the saved template fields.',
      'Stored responses can be reviewed before generating the PDF.',
      'The same template can still be filled from Search & Fill or API Fill later.',
    ],
    workflowExamples: [
      'vendor self-submission',
      'employee joining details',
      'student admission intake',
      'clinic registration',
      'tenant or customer information collection',
    ],
    sourceRecords: [
      'respondent submissions',
      'review queues',
      'branch intake forms',
      'vendor onboarding responses',
      'school or clinic intake responses',
    ],
    setupChecks: [
      'Clean field names before publishing the link.',
      'Use respondent-friendly labels instead of internal column names where needed.',
      'Keep sensitive identifiers required only when the workflow has a valid reason.',
      'Submit one test response and generate a PDF before sharing the link.',
    ],
    fieldExamples: [
      'full_name, mobile_number, email, address, branch_code',
      'pan_number, gstin, employee_id, student_id, appointment_date',
      'vendor_type, admission_class, visit_type, document_status',
    ],
    shortWorkflowLabel: 'Fill By Link',
    localContext:
      'Indian teams often collect details from vendors, employees, parents, patients, tenants, or customers before the office prepares the final PDF. Fill By Link moves that first intake step into a web form tied to the saved template.',
    setupContext:
      'The PDF template must be cleaned before publishing. Respondents should not inherit confusing internal field names, duplicated questions, or fields that staff still needs to fix.',
    mappingContext:
      'Separate public respondent fields from internal review fields. For example, the respondent may provide name, contact, and identifier details, while branch_code, reviewer_id, and approval_status stay internal.',
    runtimeContext:
      'Fill By Link is the intake runtime. Staff still decides when to generate the final PDF, whether a response is complete, and whether additional review is required.',
    rolloutContext:
      'Start with a low-risk intake flow such as vendor details, school admission information, or appointment registration before using links for more sensitive workflows.',
    qaChecks: [
      'Submit one test response from mobile and desktop.',
      'Check labels and required fields from a respondent point of view.',
      'Generate a PDF from the response and inspect all mapped values.',
      'Confirm internal-only review fields are not presented as respondent questions.',
    ],
    boundaryContext:
      'Fill By Link collects answers, but the organization still owns consent, review, identity checks, and whether a submitted response is acceptable.',
    faqSubject: 'Fill By Link intake in India',
    faqSourceLabel: 'respondent answers and internal review fields',
    firstTestAnswer:
      'Publish a test link, submit one realistic Indian response, then generate the PDF and check labels, required fields, long text, and blank optional answers.',
    flatOutputAnswer:
      'Use flat output when the response has been reviewed and the completed PDF is going to a branch, office, vendor master, school file, clinic file, or archive.',
  }),
  buildIndiaWorkflowPage({
    key: 'india-pdf-fill-api',
    path: '/in/pdf-fill-api',
    navLabel: 'India PDF Fill API',
    heroTitle: 'India PDF Fill API for Internal Systems and Reviewed Templates',
    heroSummary:
      'Publish reviewed Indian PDF templates as JSON-to-PDF endpoints for ERPs, CRMs, HR tools, finance systems, branch portals, and internal apps.',
    seoKeywords: [
      'india pdf fill api',
      'pdf fill api india',
      'json to pdf api india',
      'erp pdf api india',
      'crm pdf fill api india',
      'hr pdf api india',
      'gst invoice pdf api',
      'vendor pdf api india',
    ],
    valuePoints: [
      'Turn a reviewed Indian PDF template into an endpoint that accepts structured JSON.',
      'Keep the API contract aligned with field names tested in Search & Fill.',
      'Generate flat PDFs from internal systems after the template is stable.',
    ],
    proofPoints: [
      'API Fill uses saved template snapshots rather than raw coordinate guesses at request time.',
      'The same field schema can be tested manually before system-to-system automation.',
      'Strict payload review helps catch unexpected keys before output is trusted.',
    ],
    workflowExamples: [
      'ERP purchase order PDFs',
      'CRM KYC packets',
      'HR joining packets',
      'GST invoice PDFs',
      'branch document generation',
    ],
    sourceRecords: [
      'ERP JSON payloads',
      'CRM records',
      'HRIS records',
      'loan origination records',
      'internal app submissions',
    ],
    setupChecks: [
      'Finalize the template field names before publishing the endpoint.',
      'Test the same payload through Search & Fill or a local JSON file first.',
      'Keep required fields documented for the internal caller.',
      'Generate a flat PDF from one representative API payload before release.',
    ],
    fieldExamples: [
      'data.customer_name, data.vendor_gstin, data.employee_id',
      'data.invoice_number, data.po_number, data.branch_code',
      'data.approval_status, data.review_date, data.output_mode',
    ],
    shortWorkflowLabel: 'PDF Fill API',
    localContext:
      'Indian teams move to an API when the record already exists in an internal system and staff should not manually choose rows. The API should come after template review, not before it.',
    setupContext:
      'Treat the PDF template as the contract. If field names change casually after the endpoint is published, internal callers will break or produce incomplete PDFs.',
    mappingContext:
      'Keep the JSON shape close to the business record. A payload with explicit gstin, pan_number, branch_code, po_number, and invoice_number fields is easier to debug than a generic array of values.',
    runtimeContext:
      'API Fill is the production runtime for system-owned records. Use Search & Fill first for QA, then publish the endpoint when the template and payload are stable.',
    rolloutContext:
      'Start with one internal system and one PDF. Add group packet APIs only after the single-template response is repeatable.',
    qaChecks: [
      'Run one representative JSON payload through the endpoint.',
      'Check required-field behavior and unknown-key handling.',
      'Confirm final PDF size, field values, calculations, and output mode.',
      'Store the template version used by the caller so later changes are traceable.',
    ],
    boundaryContext:
      'An API endpoint does not approve the underlying record. The caller must own authentication, authorization, source-data validation, and workflow approval.',
    faqSubject: 'PDF Fill API workflows in India',
    faqSourceLabel: 'JSON payloads from Indian internal systems',
    firstTestAnswer:
      'Use a payload from the real caller with identifiers, dates, totals, optional blanks, and one long address. Inspect the generated PDF before wiring volume to it.',
    flatOutputAnswer:
      'Use flat output when the API-generated PDF is a final record, email attachment, branch copy, vendor handoff, invoice copy, or archived document.',
  }),
  buildIndiaWorkflowPage({
    key: 'india-pdf-field-detection',
    path: '/in/pdf-field-detection',
    navLabel: 'India PDF Field Detection',
    heroTitle: 'India PDF Field Detection for KYC, Vendor, HR, Invoice, and Branch Forms',
    heroSummary:
      'Detect candidate fields on recurring Indian PDFs, review confidence, clean geometry, and prepare the template for mapping or repeated fills.',
    seoKeywords: [
      'india pdf field detection',
      'pdf form field detection india',
      'detect fields in pdf india',
      'ai pdf field detection india',
      'kyc pdf field detection',
      'vendor pdf field detection',
      'hr form field detection india',
      'invoice pdf field detection india',
    ],
    valuePoints: [
      'Find candidate writable regions before manually drawing fields from scratch.',
      'Review confidence, geometry, labels, and field types against the actual Indian PDF.',
      'Use detection output as the start of a saved template, not as an unreviewed final result.',
    ],
    proofPoints: [
      'DullyPDF surfaces detected fields in the editor for human cleanup.',
      'Field types and names can be corrected before mapping.',
      'The same reviewed template supports Search & Fill, Fill By Link, and API Fill later.',
    ],
    workflowExamples: [
      'blank KYC PDFs',
      'vendor setup packets',
      'joining forms',
      'invoice coversheets',
      'clinic and school forms',
    ],
    sourceRecords: [
      'the source PDF layout',
      'nearby field labels',
      'operator review notes',
      'sample spreadsheet headers',
      'template QA output',
    ],
    setupChecks: [
      'Use the clearest version of the PDF available.',
      'Review low-confidence fields first.',
      'Check checkbox and radio groups separately from text fields.',
      'Delete duplicate or misaligned detections before mapping.',
    ],
    fieldExamples: [
      'text fields for names, addresses, identifiers, and dates',
      'checkbox fields for entity type, document status, and optional selections',
      'radio fields for single-choice questions',
      'date fields for joining, invoice, appointment, admission, or dispatch dates',
    ],
    shortWorkflowLabel: 'field detection',
    localContext:
      'Many Indian operations PDFs have fixed lines, boxes, checklists, and repeated identifiers. Detection helps create the first draft of the field layer so the operator can focus on cleanup.',
    setupContext:
      'Detection quality depends on the source PDF. Native PDFs with clear labels usually need less cleanup than scans, photocopies, skewed pages, or dense tables.',
    mappingContext:
      'Detection and mapping are separate. First make sure the field exists in the right place, then rename it to match source data such as gstin, pan_number, branch_code, or invoice_number.',
    runtimeContext:
      'Field detection is not a runtime by itself. It prepares the template for spreadsheet filling, respondent intake, API generation, or grouped packet workflows.',
    rolloutContext:
      'Use detection on one representative Indian form, fix the field layer, then use the cleanup pattern as a baseline for adjacent forms in the same department.',
    qaChecks: [
      'Review low-confidence fields and missed checkboxes.',
      'Check that detected fields line up with the printed form.',
      'Rename fields before mapping to source data.',
      'Run one filled output after detection cleanup.',
    ],
    boundaryContext:
      'Detection is a drafting aid. The operator still owns whether a field should exist, what it should be called, and whether the final template is accurate enough for real records.',
    faqSubject: 'PDF field detection for Indian forms',
    faqSourceLabel: 'reviewed field names and local record fields',
    firstTestAnswer:
      'Use a PDF with real form density: identifiers, addresses, checkboxes, dates, and at least one multi-page section. Review misses and duplicates before saving.',
    flatOutputAnswer:
      'Flat output becomes relevant after detection cleanup and filling, when the completed PDF needs to display consistently outside the editor.',
  }),
  buildIndiaWorkflowPage({
    key: 'india-rename-map-pdf-fields',
    path: '/in/rename-map-pdf-fields',
    navLabel: 'India Rename and Map PDF Fields',
    heroTitle: 'Rename and Map Indian PDF Fields to PAN, GSTIN, Branch, and Record Data',
    heroSummary:
      'Standardize Indian PDF field names and map them to spreadsheet or JSON headers for repeat KYC, vendor, HR, invoice, and branch workflows.',
    seoKeywords: [
      'rename pdf fields india',
      'map pdf fields india',
      'pdf field names pan gstin',
      'pdf form mapping india',
      'map excel columns to pdf india',
      'pdf template schema india',
      'rename kyc pdf fields',
      'gstin pdf field mapping',
    ],
    valuePoints: [
      'Turn generic detected names into stable business fields such as pan_number, gstin, branch_code, and vendor_code.',
      'Map field names to Excel, CSV, JSON, or TXT schema headers before filling.',
      'Use consistent names across grouped templates so one Indian record can fill a packet.',
    ],
    proofPoints: [
      'DullyPDF separates field cleanup from source-data mapping.',
      'Rename and mapping review reduces duplicate field names and ambiguous headers.',
      'Mapped templates can support Search & Fill and API Fill with the same schema.',
    ],
    workflowExamples: [
      'PAN and GSTIN field cleanup',
      'branch and vendor-code mapping',
      'employee and student ID mapping',
      'invoice and PO schema mapping',
      'packet-wide field naming',
    ],
    sourceRecords: [
      'Excel headers',
      'CSV headers',
      'JSON keys',
      'TXT schema files',
      'internal database field names',
    ],
    setupChecks: [
      'Rename fields after geometry cleanup, not before.',
      'Use one naming convention for identifiers across the cluster.',
      'Resolve duplicate field names before saving the template.',
      'Keep internal-only review fields distinct from respondent fields.',
    ],
    fieldExamples: [
      'pan_number, gstin, branch_code, vendor_code, employee_id',
      'invoice_number, po_number, challan_number, student_id, patient_id',
      'reviewer_id, approval_status, document_status, output_date',
    ],
    shortWorkflowLabel: 'rename-and-map',
    localContext:
      'The biggest source of PDF automation errors is often naming, not drawing. Indian workflows use repeated identifiers and department-specific columns, so field names need to be specific before the template is trusted.',
    setupContext:
      'First clean geometry and field types, then rename. Renaming too early wastes time if a detected field later gets deleted or merged.',
    mappingContext:
      'Use source-system names where possible. If the branch spreadsheet already uses gstin and vendor_code, the PDF should map directly to those headers unless there is a strong reason to rename them.',
    runtimeContext:
      'Rename-and-map work supports every runtime. Search & Fill, Fill By Link, API Fill, calculations, and grouped packets all depend on stable field names.',
    rolloutContext:
      'Create a naming convention for the India cluster before adding many pages: identifier fields, date fields, approval fields, and status fields should be easy to recognize across templates.',
    qaChecks: [
      'Find duplicate or vague names such as name, id, date, and address.',
      'Map one spreadsheet or JSON record into the renamed fields.',
      'Check checkbox option values against source tokens.',
      'Document naming choices that will be reused across templates.',
    ],
    boundaryContext:
      'Good field names make automation easier, but they do not decide whether a value is valid, approved, or complete. That review remains with the operating team.',
    faqSubject: 'renaming and mapping Indian PDF fields',
    faqSourceLabel: 'spreadsheet headers, JSON keys, and reviewed PDF field names',
    firstTestAnswer:
      'Test a source file with real headers such as pan_number, gstin, vendor_code, branch_code, invoice_number, and approval_status.',
    flatOutputAnswer:
      'Use flat output after mapping is validated and the completed PDF is ready for handoff or archive.',
  }),
  buildIndiaWorkflowPage({
    key: 'india-fill-pdf-from-documents',
    path: '/in/fill-pdf-from-documents',
    navLabel: 'India Fill PDF From Documents',
    heroTitle: 'Fill Indian PDF Templates From Uploaded Documents and Images',
    heroSummary:
      'Extract candidate values from Indian source documents such as PAN cards, GST invoices, bank statements, delivery challans, HR records, and clinic files before filling a reviewed PDF template.',
    seoKeywords: [
      'fill pdf from documents india',
      'extract data to pdf india',
      'pan card to pdf form',
      'gst invoice data to pdf',
      'bank statement to pdf form india',
      'delivery challan data extraction',
      'document extraction pdf india',
      'fill pdf from image india',
    ],
    valuePoints: [
      'Use uploaded files when source data is trapped in documents instead of rows.',
      'Review extracted candidates before they populate the PDF template.',
      'Keep the template schema separate from the uploaded source-document images.',
    ],
    proofPoints: [
      'DullyPDF can use named fields and nearby label context to request candidate values from uploaded documents.',
      'Staff can review candidates and confidence before final fill.',
      'The reviewed PDF template still controls where values land.',
    ],
    workflowExamples: [
      'PAN card reference extraction',
      'GST invoice value extraction',
      'bank statement detail review',
      'delivery challan value capture',
      'employee or clinic record cleanup',
    ],
    sourceRecords: [
      'uploaded document images',
      'scanned PDFs',
      'invoice attachments',
      'bank document PDFs',
      'supporting-document packets',
    ],
    setupChecks: [
      'Name target PDF fields clearly before extracting values.',
      'Upload only documents relevant to the current workflow.',
      'Review candidate values before filling the PDF.',
      'Use flat output after staff verifies the extracted values.',
    ],
    fieldExamples: [
      'pan_number, gstin, invoice_number, invoice_date, bank_name',
      'ifsc_code, challan_number, vehicle_number, employee_name',
      'patient_name, branch_code, document_reference, extracted_review_status',
    ],
    shortWorkflowLabel: 'document-to-PDF',
    localContext:
      'Indian offices often receive source information as attachments, scans, and photos rather than clean rows. This workflow is useful when staff wants extracted candidates placed into a reviewed template after human inspection.',
    setupContext:
      'A document-extraction workflow should not start with vague target fields. The PDF template needs clear names so extraction can look for the right values.',
    mappingContext:
      'Treat extracted values as candidates, not final truth. PAN, GSTIN, invoice, bank, delivery, HR, and clinic details should be checked against the source document before output.',
    runtimeContext:
      'Document extraction is a review workflow. It can reduce retyping, but it should still route through staff review before the final PDF is generated.',
    rolloutContext:
      'Start with one document type, such as GST invoices or delivery challans, before mixing several source-document families into one workflow.',
    qaChecks: [
      'Check confidence and source-document context for every important value.',
      'Verify identifiers and amounts manually before final output.',
      'Test noisy scans and mobile photos separately from clean PDFs.',
      'Keep unsupported or ambiguous values blank rather than forcing a guess.',
    ],
    boundaryContext:
      'Extraction can suggest values from uploaded documents, but the team must verify those values and decide whether the source document is acceptable for the workflow.',
    faqSubject: 'document-to-PDF workflows in India',
    faqSourceLabel: 'reviewed extraction candidates and target PDF fields',
    firstTestAnswer:
      'Use one real source document and one target PDF. Confirm the extracted candidates, source context, blank handling, and final placement before using more documents.',
    flatOutputAnswer:
      'Use flat output after extracted values have been reviewed and the final PDF should become a stable office, finance, branch, or clinic record.',
  }),
  buildIndiaWorkflowPage({
    key: 'india-pdf-packet-workflow',
    path: '/in/pdf-packet-workflow',
    navLabel: 'India PDF Packet Workflow',
    heroTitle: 'India PDF Packet Workflows for KYC, HR, Vendor, Loan, School, and Clinic Records',
    heroSummary:
      'Group multiple Indian PDF templates so one reviewed record can fill a full packet for onboarding, finance, admissions, clinic, branch, or logistics workflows.',
    seoKeywords: [
      'india pdf packet workflow',
      'fill multiple pdfs india',
      'pdf packet automation india',
      'kyc packet pdf india',
      'hr joining packet pdf india',
      'vendor packet pdf india',
      'loan packet pdf india',
      'school admission packet pdf india',
    ],
    valuePoints: [
      'Reuse one record across several PDFs in a packet.',
      'Keep shared field names consistent across templates.',
      'Generate grouped outputs after each template is reviewed.',
    ],
    proofPoints: [
      'DullyPDF groups can support packet-wide Search & Fill and template coordination.',
      'Consistent names let one row populate repeated fields across PDFs.',
      'Grouped templates reduce repeated setup for HR, vendor, KYC, school, clinic, and finance packets.',
    ],
    workflowExamples: [
      'HR joining packets',
      'vendor onboarding packets',
      'KYC document sets',
      'loan application packets',
      'school admission and clinic intake packets',
    ],
    sourceRecords: [
      'one employee row',
      'one vendor row',
      'one customer KYC row',
      'one applicant record',
      'one student or patient intake response',
    ],
    setupChecks: [
      'Finish one template before adding it to a packet.',
      'Use identical names for shared fields across PDFs.',
      'Test one record across the full group.',
      'Keep packet outputs flat when they are final handoff records.',
    ],
    fieldExamples: [
      'full_name, branch_code, mobile_number, email, address',
      'pan_number, gstin, employee_id, vendor_code, application_id',
      'reviewer_id, packet_status, document_status, output_date',
    ],
    shortWorkflowLabel: 'PDF packet',
    localContext:
      'Indian paperwork often arrives as a packet, not a single form. HR joining, vendor onboarding, KYC, loan files, admissions, and clinic intake can repeat the same record across several PDFs.',
    setupContext:
      'Packet work fails when each PDF is named differently. Clean and map each template, then align shared fields before expecting one row to fill the full packet.',
    mappingContext:
      'Create a shared packet schema for common fields such as full_name, branch_code, pan_number, gstin, address, and reviewer_id. Each PDF can still have its own extra fields.',
    runtimeContext:
      'Search & Fill is the safest packet runtime at first because the operator can inspect output across all templates. API packet output should come after the group is stable.',
    rolloutContext:
      'Start with two or three PDFs that share many fields. Expanding to ten PDFs before the first shared mapping is stable creates avoidable cleanup.',
    qaChecks: [
      'Fill the full packet from one real record.',
      'Compare shared fields across every PDF.',
      'Check packet-specific blanks and optional documents.',
      'Download and inspect the final grouped output before rollout.',
    ],
    boundaryContext:
      'A packet workflow organizes output, but the team still decides which documents belong in the packet and which reviewer approves the completed set.',
    faqSubject: 'PDF packet workflows in India',
    faqSourceLabel: 'one reviewed record shared across multiple templates',
    firstTestAnswer:
      'Use one real employee, vendor, customer, applicant, student, or patient record and fill two or three PDFs before expanding the group.',
    flatOutputAnswer:
      'Use flat output when the packet is a final onboarding, KYC, loan, admission, clinic, or branch record that should not depend on editable fields.',
  }),
  buildIndiaWorkflowPage({
    key: 'india-pdf-calculations',
    path: '/in/pdf-calculations',
    navLabel: 'India PDF Calculations',
    heroTitle: 'India PDF Calculations for GST, Purchase Orders, Fees, Scores, and Totals',
    heroSummary:
      'Add reviewed calculation fields to Indian PDF templates for GST invoices, purchase orders, fee summaries, delivery totals, inspection scores, and internal worksheets.',
    seoKeywords: [
      'india pdf calculations',
      'gst pdf calculations',
      'purchase order pdf calculations india',
      'invoice total pdf india',
      'fee calculation pdf india',
      'calculated pdf form india',
      'pdf total fields india',
      'cgst sgst igst pdf totals',
    ],
    valuePoints: [
      'Compute simple totals inside reviewed PDF templates when the formula is stable.',
      'Use calculations for GST invoice totals, PO totals, fee summaries, delivery totals, and scores.',
      'Export flat PDFs when calculated values should display reliably outside the editor.',
    ],
    proofPoints: [
      'DullyPDF calculation fields support safe arithmetic for fixed-layout templates.',
      'Calculated outputs can be tested from Search & Fill before batch or API use.',
      'Flat output bakes calculated values into the page content for final records.',
    ],
    workflowExamples: [
      'CGST, SGST, and IGST totals',
      'purchase order line totals',
      'school fee summaries',
      'delivery quantity totals',
      'inspection or review scores',
    ],
    sourceRecords: [
      'invoice rows',
      'purchase order records',
      'fee spreadsheets',
      'delivery sheets',
      'inspection checklists',
    ],
    setupChecks: [
      'Keep source inputs numeric and separate from display-only fields.',
      'Test blank, zero, and rounded values.',
      'Use simple arithmetic in the template and complex logic upstream.',
      'Download flat output to confirm calculated values render as expected.',
    ],
    fieldExamples: [
      'taxable_value, cgst_amount, sgst_amount, igst_amount, grand_total',
      'quantity, unit_rate, line_total, subtotal, discount, freight',
      'fee_amount, concession_amount, balance_due, score_total',
    ],
    shortWorkflowLabel: 'PDF calculations',
    localContext:
      'Indian finance, procurement, education, logistics, and inspection workflows often need totals displayed on a fixed PDF. The safest calculation workflow starts from clean numeric inputs and one reviewed template.',
    setupContext:
      'Do not hide complicated business policy inside PDF formulas. Use DullyPDF calculations for predictable arithmetic outputs and compute complex rules in the source system first.',
    mappingContext:
      'Map numeric source fields separately from calculated outputs. For GST and PO workflows, taxable_value, tax amount, discount, freight, and grand_total should be easy to inspect.',
    runtimeContext:
      'Calculations should be tested in Search & Fill before API Fill or batch workflows. That lets staff catch formula order, blank values, and output-mode issues early.',
    rolloutContext:
      'Start with one invoice, PO, fee, or score template. Add adjacent calculated templates after the first formula set is reviewed with real Indian record data.',
    qaChecks: [
      'Test blank, zero, decimal, and rounded numeric inputs.',
      'Check GST, subtotal, discount, freight, and grand-total display.',
      'Compare calculated output against the source system.',
      'Use flat output for final calculated records.',
    ],
    boundaryContext:
      'DullyPDF can display reviewed arithmetic results, but tax interpretation, fee policy, approval logic, and lending or billing decisions remain outside the PDF tool.',
    faqSubject: 'PDF calculations in India',
    faqSourceLabel: 'numeric source fields and reviewed calculation outputs',
    firstTestAnswer:
      'Test one real invoice, PO, fee, delivery, or score record with decimal values, blanks, zeroes, and expected totals before publishing the template.',
    flatOutputAnswer:
      'Use flat output when calculated totals should be preserved in the final PDF for finance, procurement, school, logistics, or audit review.',
  }),
];
