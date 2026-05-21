const commonIndiaRelatedDocs = ['getting-started', 'detection', 'rename-mapping', 'search-fill', 'fill-by-link', 'api-fill'];

const indiaIndustryPageKeys = [
  'india-kyc-pdf-automation',
  'india-vendor-onboarding-pdf-automation',
  'india-hr-joining-pdf-automation',
  'india-gst-invoice-pdf-automation',
  'india-school-admissions-pdf-automation',
  'india-clinic-intake-pdf-automation',
  'india-loan-application-pdf-automation',
  'india-delivery-challan-pdf-automation',
  'india-tenant-onboarding-pdf-automation',
  'india-purchase-order-pdf-automation',
];

const toSentenceList = (items) => {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
};

const buildIndiaIndustryPage = (page) => {
  const documentExamples = toSentenceList(page.documentExamples);
  const sourceRecords = toSentenceList(page.sourceRecords);

  return {
    key: page.key,
    category: 'industry',
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
        title: `${page.navLabel} starts with India-specific records`,
        paragraphs: [
          page.localContext,
          `The recurring PDF set is usually not one generic form. It often includes ${documentExamples}. DullyPDF is useful when those layouts are already approved and the changing record data needs to land in the same places every time.`,
        ],
        bullets: page.documentExamples,
      },
      {
        title: `Map ${page.shortWorkflowLabel} data before adding volume`,
        paragraphs: [
          `Start with the source data the team already trusts: ${sourceRecords}. Upload a representative CSV, XLSX, JSON, or TXT schema, then map those headers to reviewed PDF fields before anyone treats the template as production-ready.`,
          page.mappingContext,
        ],
        bullets: page.fieldExamples,
      },
      {
        title: `Choose the right runtime for ${page.shortWorkflowLabel}`,
        paragraphs: [
          page.runtimeContext,
          'Search & Fill is the safer first pass when an operator still needs to inspect one row and compare the output. Fill By Link is better when the applicant, employee, vendor, patient, student, tenant, or branch user should submit answers without opening a PDF editor. API Fill is the production path after an internal system can send clean JSON to the saved template.',
        ],
      },
      {
        title: `Roll out the India template without creating duplicate work`,
        paragraphs: [
          page.rolloutContext,
          'A practical rollout is one document family, one real record, one output review, then expansion into nearby PDFs. That prevents the India page cluster from becoming thin country-token content and keeps each template tied to a workflow that a team would actually reuse.',
        ],
        bullets: page.qaChecks,
      },
      {
        title: `Keep compliance and policy decisions outside the PDF tool`,
        paragraphs: [
          page.boundaryContext,
          'DullyPDF can help detect fields, rename them, map values, fill outputs, and preserve reusable templates. It does not decide whether a team is allowed to collect a particular identifier, store a document, approve a file, or accept a record without review.',
        ],
      },
    ],
    supportSections: [
      {
        title: 'Core DullyPDF workflows for India pages',
        paragraphs: [
          'These India solution pages should connect back to reusable product mechanics that apply across regions: field detection, Search & Fill, Fill By Link, API Fill, and stable template mapping.',
        ],
        links: [
          { label: 'Fill PDFs from CSV or Excel', href: '/fill-pdf-from-csv' },
          { label: 'Publish a Fill By Link intake form', href: '/fill-pdf-by-link' },
          { label: 'Use the PDF Fill API', href: '/pdf-fill-api' },
          { label: 'Map PDF fields to a database schema', href: '/pdf-to-database-template' },
        ],
      },
    ],
    faqs: [
      {
        question: `Can DullyPDF automate ${page.faqSubject} PDFs for India teams?`,
        answer: `Yes. Upload the existing PDF, review detected fields, rename and map the template to ${page.faqSourceLabel}, then fill it from Search & Fill, Fill By Link responses, or API JSON.`,
      },
      {
        question: `Which source data should ${page.shortWorkflowLabel} use first?`,
        answer: page.sourceDataAnswer,
      },
      {
        question: `Should ${page.shortWorkflowLabel} output be flat or editable?`,
        answer: page.outputAnswer,
      },
    ],
    relatedIntentPages: indiaIndustryPageKeys.filter((key) => key !== page.key),
    relatedDocs: commonIndiaRelatedDocs,
  };
};

export const INDIA_INDUSTRY_INTENT_PAGES = [
  buildIndiaIndustryPage({
    key: 'india-kyc-pdf-automation',
    path: '/in/kyc-pdf-automation',
    navLabel: 'India KYC PDF Automation',
    heroTitle: 'India KYC PDF Automation for PAN, GSTIN, Branch, and Customer Files',
    heroSummary:
      'Create reusable KYC PDF templates for Indian customer, vendor, branch, and account workflows, then fill them from spreadsheets, intake links, or API payloads.',
    seoKeywords: [
      'india kyc pdf automation',
      'kyc pdf automation india',
      'pan kyc pdf form automation',
      'gstin kyc pdf workflow',
      'branch kyc form pdf',
      'customer kyc pdf template india',
      'kyc form fill from excel india',
      'api fill kyc pdf india',
    ],
    valuePoints: [
      'Map PAN, GSTIN, customer name, branch, account, address, and reviewer fields into one reusable KYC template.',
      'Use Fill By Link when customers or vendors should submit details without opening the editor.',
      'Use flat final PDFs when the KYC copy needs to be shared, archived, or reviewed outside DullyPDF.',
    ],
    proofPoints: [
      'Search & Fill supports CSV, XLSX, JSON, and TXT schema inputs for KYC row review.',
      'API Fill can generate a KYC PDF from a stable internal customer or vendor JSON payload.',
      'Image fields can reserve reviewed regions for identity or supporting-document images when the workflow requires them.',
    ],
    documentExamples: [
      'customer KYC forms',
      'vendor KYC packets',
      'branch account setup PDFs',
      'PAN and GSTIN review sheets',
      'supporting-document checklists',
    ],
    sourceRecords: [
      'CRM exports',
      'branch spreadsheets',
      'vendor master data',
      'account-opening systems',
      'review queues',
    ],
    fieldExamples: [
      'customer_name, legal_name, pan_number, gstin, branch_code, account_type',
      'registered_address, correspondence_address, contact_phone, contact_email',
      'aadhaar_reference only when the team has a valid collection basis',
      'risk_category, reviewer_id, review_date, document_status',
    ],
    shortWorkflowLabel: 'KYC',
    localContext:
      'KYC work in India often spans customers, vendors, branches, and account teams that all need the same identifiers placed into fixed PDF layouts. The problem is rarely a lack of forms. The problem is repeated typing from a trusted record into a PDF that must still match the organization template.',
    mappingContext:
      'Keep sensitive identifiers explicit and narrow. If the template needs PAN, GSTIN, or an Aadhaar reference, name those fields clearly so they can be reviewed and mapped deliberately instead of being hidden inside generic "id number" fields.',
    runtimeContext:
      'KYC teams often start with staff-driven Search & Fill because a reviewer needs to compare the source record and the generated PDF. Intake links are useful for fresh customer or vendor data, while API Fill fits teams that already run KYC data through an internal workflow.',
    rolloutContext:
      'Start with one high-volume KYC packet and validate long names, address wrapping, identifier formatting, checkbox values, and missing-document states before adding additional branch or vendor templates.',
    qaChecks: [
      'Validate PAN, GSTIN, branch code, and account-type placement.',
      'Test long Indian addresses and names for overflow.',
      'Confirm optional identity-reference fields stay blank when no value is supplied.',
      'Review one flat output before expanding to adjacent KYC PDFs.',
    ],
    boundaryContext:
      'KYC workflows can involve sensitive identifiers and internal policy. DullyPDF should be treated as the template and fill layer after the organization decides what it is allowed to collect and how records should be reviewed.',
    faqSubject: 'KYC',
    faqSourceLabel: 'PAN, GSTIN, branch, account, and review data',
    sourceDataAnswer:
      'Start with the branch or customer record the reviewer already trusts, usually a spreadsheet export or JSON record with explicit PAN, GSTIN, address, branch, and review-status fields.',
    outputAnswer:
      'Use editable output for internal cleanup. Use flat output for reviewed copies that should display consistently in email, archive, or downstream review systems.',
  }),
  buildIndiaIndustryPage({
    key: 'india-vendor-onboarding-pdf-automation',
    path: '/in/vendor-onboarding-pdf-automation',
    navLabel: 'India Vendor Onboarding PDF Automation',
    heroTitle: 'India Vendor Onboarding PDF Automation for GSTIN, PAN, Bank, and MSME Details',
    heroSummary:
      'Turn Indian vendor onboarding packets into reusable PDF templates that map GSTIN, PAN, bank, IFSC, Udyam, address, and approval data.',
    seoKeywords: [
      'india vendor onboarding pdf automation',
      'vendor onboarding pdf india',
      'gstin vendor pdf form',
      'pan vendor form automation',
      'ifsc vendor setup pdf',
      'udyam vendor onboarding pdf',
      'vendor master pdf automation india',
      'supplier onboarding pdf india',
    ],
    valuePoints: [
      'Standardize vendor legal name, trade name, GSTIN, PAN, bank, IFSC, Udyam, and payment fields in one PDF template.',
      'Collect vendor details through Fill By Link when procurement wants a controlled intake form before PDF output.',
      'Generate reviewed flat vendor packets for AP, procurement, and master-data teams.',
    ],
    proofPoints: [
      'Search & Fill can fill vendor packets from Excel exports maintained by procurement or AP.',
      'API Fill works when ERP or vendor-master systems already hold approved supplier data.',
      'Checkbox and radio mapping keeps entity type, MSME status, payment terms, and tax options explicit.',
    ],
    documentExamples: [
      'new vendor setup forms',
      'supplier master packets',
      'bank-detail verification PDFs',
      'MSME or Udyam declaration checklists',
      'vendor change-request forms',
    ],
    sourceRecords: [
      'vendor master exports',
      'procurement intake sheets',
      'AP onboarding trackers',
      'ERP supplier records',
      'Fill By Link submissions',
    ],
    fieldExamples: [
      'vendor_legal_name, trade_name, gstin, pan_number, cin_or_udyam',
      'bank_account_number, ifsc_code, account_holder_name, payment_terms',
      'registered_address, billing_address, contact_person, vendor_code',
      'entity_type, msme_status, approval_owner, onboarding_status',
    ],
    shortWorkflowLabel: 'vendor onboarding',
    localContext:
      'Indian vendor onboarding often moves between procurement, AP, tax, and branch teams. Each team asks for overlapping identifiers, but the final PDF packet still needs a predictable layout for review and recordkeeping.',
    mappingContext:
      'Use separate fields for GSTIN, PAN, IFSC, Udyam, and vendor code. Combining them into a single notes field makes later Search & Fill and API Fill harder to validate.',
    runtimeContext:
      'Vendor onboarding can start as a Fill By Link workflow when a supplier provides details, then move to Search & Fill once AP or procurement reviews the row. API Fill fits when approved vendor records already exist in a system of record.',
    rolloutContext:
      'Start with the new-vendor packet before expanding into bank-detail updates, tax-detail changes, or vendor reactivation forms. Those adjacent forms usually reuse most of the same mapped fields.',
    qaChecks: [
      'Confirm GSTIN, PAN, IFSC, and bank-account fields are named separately.',
      'Test entity-type and MSME checkbox values against the source data.',
      'Review address wrapping and vendor-name overflow.',
      'Generate one flat AP-facing packet before adding more vendor forms.',
    ],
    boundaryContext:
      'Vendor approval, bank verification, tax validation, and supplier due diligence remain organization processes. DullyPDF helps prepare the PDF record after those decisions and checks are owned by the team.',
    faqSubject: 'vendor onboarding',
    faqSourceLabel: 'vendor master, tax, bank, and approval fields',
    sourceDataAnswer:
      'Use the vendor master row or procurement intake row first. It should carry explicit GSTIN, PAN, bank, IFSC, Udyam or MSME status, address, and approval-owner fields.',
    outputAnswer:
      'Editable output is useful during internal review. Flat output is better for final vendor master packets that AP, procurement, or finance teams should not accidentally alter.',
  }),
  buildIndiaIndustryPage({
    key: 'india-hr-joining-pdf-automation',
    path: '/in/hr-joining-pdf-automation',
    navLabel: 'India HR Joining PDF Automation',
    heroTitle: 'India HR Joining PDF Automation for Employee Onboarding Packets',
    heroSummary:
      'Build reusable HR joining PDF templates for Indian employee records, bank details, nominee details, PF, ESI, policy acknowledgments, and branch onboarding.',
    seoKeywords: [
      'india hr joining pdf automation',
      'hr joining form pdf india',
      'employee onboarding pdf india',
      'pf esi joining form automation',
      'employee bank details pdf automation',
      'hr onboarding packet pdf india',
      'employee joining form fill from excel',
      'india employee pdf template',
    ],
    valuePoints: [
      'Map employee ID, joining date, PAN, UAN, PF, ESI, bank, IFSC, nominee, department, and work-location fields.',
      'Use Fill By Link for new hires when HR wants structured answers before generating the final packet.',
      'Group templates when one employee row fills several joining documents at once.',
    ],
    proofPoints: [
      'Group workflows can reuse the same employee record across multiple HR PDFs.',
      'Search & Fill lets HR inspect one employee row before generating the final joining packet.',
      'Date and checkbox mapping keeps joining date, policy acknowledgments, and optional benefits fields consistent.',
    ],
    documentExamples: [
      'employee joining forms',
      'bank-detail and nominee PDFs',
      'PF and ESI information sheets',
      'asset issue forms',
      'policy acknowledgment checklists',
    ],
    sourceRecords: [
      'HRIS exports',
      'recruitment trackers',
      'joining spreadsheets',
      'branch HR records',
      'Fill By Link submissions',
    ],
    fieldExamples: [
      'employee_name, employee_id, joining_date, department, work_location',
      'pan_number, uan_number, pf_number, esi_number, bank_account_number',
      'ifsc_code, nominee_name, emergency_contact, reporting_manager',
      'policy_acknowledged, asset_issued, document_pending_status',
    ],
    shortWorkflowLabel: 'HR joining',
    localContext:
      'HR joining work in India is packet-heavy because one employee record feeds several internal forms. The same name, employee ID, bank details, location, and statutory identifiers get typed repeatedly unless the packet is mapped once.',
    mappingContext:
      'Treat the employee row as the source of truth and keep repeated fields named consistently across all joining PDFs. That makes grouped packet filling practical instead of mapping each form as a separate island.',
    runtimeContext:
      'Fill By Link is useful when a new hire supplies details directly. Search & Fill is useful when HR already has a joining tracker. API Fill becomes practical after the HRIS or internal onboarding system can send the employee payload.',
    rolloutContext:
      'Start with the most repeated joining form, then group it with nominee, bank-detail, policy, and asset forms after the core employee fields are stable.',
    qaChecks: [
      'Run one employee record through every grouped HR template.',
      'Check long names, addresses, nominee details, and date formatting.',
      'Confirm optional PF, ESI, and document-pending fields behave when blank.',
      'Use consistent employee_id and joining_date field names across the packet.',
    ],
    boundaryContext:
      'HR policy, statutory eligibility, employee document collection, and retention rules stay with the employer. DullyPDF should only automate the reviewed PDF output and repeat field mapping.',
    faqSubject: 'HR joining',
    faqSourceLabel: 'employee, branch, bank, nominee, PF, and ESI fields',
    sourceDataAnswer:
      'Use the HR joining tracker or HRIS export that already drives onboarding. It should include employee ID, joining date, department, location, bank, IFSC, nominee, and optional PF or ESI fields.',
    outputAnswer:
      'Use editable output while HR is still correcting a joining packet. Use flat output for the final retained employee copy or packet handoff.',
  }),
  buildIndiaIndustryPage({
    key: 'india-gst-invoice-pdf-automation',
    path: '/in/gst-invoice-pdf-automation',
    navLabel: 'India GST Invoice PDF Automation',
    heroTitle: 'India GST Invoice PDF Automation for HSN, Tax, Place of Supply, and Totals',
    heroSummary:
      'Create reusable GST invoice and finance PDF templates that map GSTIN, invoice number, HSN or SAC, place of supply, taxable value, CGST, SGST, IGST, and totals.',
    seoKeywords: [
      'india gst invoice pdf automation',
      'gst invoice pdf automation',
      'gst invoice fill from excel',
      'hsn sac pdf invoice template',
      'cgst sgst igst pdf automation',
      'place of supply invoice pdf',
      'gst invoice api pdf india',
      'invoice pdf template india',
    ],
    valuePoints: [
      'Map GSTIN, invoice number, invoice date, place of supply, HSN or SAC, taxable value, CGST, SGST, IGST, and totals.',
      'Use calculation fields when the PDF should compute line totals, tax splits, round off, or grand total from source values.',
      'Generate flat customer-facing or finance-facing invoice PDFs after values are reviewed.',
    ],
    proofPoints: [
      'Calculation fields support invoice totals when the formula fits the safe arithmetic model.',
      'Search & Fill can validate one invoice row before batch download.',
      'API Fill can generate invoice PDFs from ERP, billing, or internal finance JSON.',
    ],
    documentExamples: [
      'GST invoice PDFs',
      'tax summary coversheets',
      'payment authorization forms',
      'credit or debit note templates',
      'finance review sheets',
    ],
    sourceRecords: [
      'billing exports',
      'ERP invoice rows',
      'finance spreadsheets',
      'order records',
      'API payloads from internal systems',
    ],
    fieldExamples: [
      'seller_gstin, buyer_gstin, invoice_number, invoice_date, place_of_supply',
      'hsn_sac, item_description, quantity, unit_rate, taxable_value',
      'cgst_amount, sgst_amount, igst_amount, round_off, grand_total',
      'payment_terms, po_number, branch_code, finance_reviewer',
    ],
    shortWorkflowLabel: 'GST invoice',
    localContext:
      'Indian finance teams often need invoice data to land in fixed PDFs that match customer, branch, or internal review formats. The invoice values may already exist in a billing export, but the PDF still needs clean field placement and output review.',
    mappingContext:
      'Keep GST fields explicit. GSTIN, HSN or SAC, place of supply, CGST, SGST, IGST, taxable value, and total fields should not be hidden inside one generic invoice-details block.',
    runtimeContext:
      'Finance teams usually start with Search & Fill because the first few invoice outputs need visual review. API Fill is a better fit once the ERP or billing system already produces clean JSON for each invoice.',
    rolloutContext:
      'Start with one invoice layout and one tax pattern before adding credit notes, debit notes, customer-specific coversheets, or multi-PDF finance packets.',
    qaChecks: [
      'Test CGST, SGST, IGST, taxable value, round off, and grand-total fields.',
      'Check HSN or SAC text and long item descriptions for overflow.',
      'Run invoices with blank optional PO or branch fields.',
      'Confirm flat output preserves totals across browser and desktop viewers.',
    ],
    boundaryContext:
      'Tax interpretation, invoice validity, e-invoice policy, and accounting treatment remain finance and tax decisions. DullyPDF can place and compute reviewed values inside a PDF template, but it is not a tax engine.',
    faqSubject: 'GST invoice',
    faqSourceLabel: 'invoice, GSTIN, HSN or SAC, tax, and total fields',
    sourceDataAnswer:
      'Start with the billing or ERP export that already contains invoice number, GSTIN, place of supply, HSN or SAC, taxable value, tax amounts, and total fields.',
    outputAnswer:
      'Use editable output while finance is validating a template. Use flat output for customer-facing, AP-facing, or archived invoice copies.',
  }),
  buildIndiaIndustryPage({
    key: 'india-school-admissions-pdf-automation',
    path: '/in/school-admissions-pdf-automation',
    navLabel: 'India School Admissions PDF Automation',
    heroTitle: 'India School Admissions PDF Automation for Student, Parent, and Fee Records',
    heroSummary:
      'Convert Indian school admission, transfer, hostel, transport, scholarship, and fee PDFs into reusable templates filled from student records or intake links.',
    seoKeywords: [
      'india school admissions pdf automation',
      'school admission form pdf india',
      'student admission pdf automation',
      'school form fill from excel india',
      'student records to pdf india',
      'hostel transport school pdf form',
      'school admission fill by link',
      'education pdf automation india',
    ],
    valuePoints: [
      'Map student, parent, guardian, class, academic year, transport, hostel, fee, and document checklist fields.',
      'Use Fill By Link for parent-submitted admission details before staff review.',
      'Reuse the same student row across admission, transport, hostel, and fee-related PDFs.',
    ],
    proofPoints: [
      'Search & Fill supports admission-office spreadsheets and student-record exports.',
      'Fill By Link can collect parent or guardian answers through a web form tied to the PDF template.',
      'Group workflows can fill multiple admission packet PDFs from one student record.',
    ],
    documentExamples: [
      'school admission forms',
      'student information sheets',
      'transport or hostel request forms',
      'fee concession or scholarship PDFs',
      'document checklist pages',
    ],
    sourceRecords: [
      'admission spreadsheets',
      'student information systems',
      'parent intake responses',
      'branch or campus records',
      'fee-office trackers',
    ],
    fieldExamples: [
      'student_name, class_applied, academic_year, date_of_birth, previous_school',
      'parent_name, guardian_name, mobile_number, email, residential_address',
      'transport_required, hostel_required, sibling_id, fee_category',
      'document_checklist_status, admission_number, campus_code',
    ],
    shortWorkflowLabel: 'school admissions',
    localContext:
      'School admissions in India often combine parent-submitted data, office spreadsheets, fee records, transport choices, and campus-specific PDFs. The same student details appear across several documents, so a reusable template saves the most time when it is tied to one clean student record.',
    mappingContext:
      'Use clear field names for student, parent, guardian, class, campus, transport, hostel, and fee fields. Ambiguous labels like "name" or "number" become hard to reuse once the packet grows.',
    runtimeContext:
      'Fill By Link is a strong first step when parents or guardians should enter the initial information. Search & Fill works well after the admission office has a reviewed spreadsheet row for each applicant.',
    rolloutContext:
      'Start with the admission form for one campus or academic year, then add transport, hostel, scholarship, or document-checklist PDFs only after the core student fields are stable.',
    qaChecks: [
      'Test long student and parent names against the fixed PDF layout.',
      'Check class, section, academic year, transport, and hostel checkbox values.',
      'Verify address wrapping and phone-number placement.',
      'Reuse one student record across at least two packet PDFs before scaling.',
    ],
    boundaryContext:
      'Admissions decisions, student data retention, document verification, and fee policy remain school processes. DullyPDF helps produce reviewed PDF records from those approved workflows.',
    faqSubject: 'school admissions',
    faqSourceLabel: 'student, parent, class, campus, fee, and document-checklist fields',
    sourceDataAnswer:
      'Start with the admission office spreadsheet or Fill By Link response that already contains student, parent, class, campus, transport, hostel, and document-status fields.',
    outputAnswer:
      'Use editable output while the office is correcting applications. Use flat output for final admission packet copies, fee office handoffs, or parent-facing records.',
  }),
  buildIndiaIndustryPage({
    key: 'india-clinic-intake-pdf-automation',
    path: '/in/clinic-intake-pdf-automation',
    navLabel: 'India Clinic Intake PDF Automation',
    heroTitle: 'India Clinic Intake PDF Automation for Patient Registration and Visit Forms',
    heroSummary:
      'Build reusable clinic intake PDF templates for Indian patient registration, appointment, history, consent, branch, and visit workflows.',
    seoKeywords: [
      'india clinic intake pdf automation',
      'clinic intake form pdf india',
      'patient registration pdf automation india',
      'hospital opd form pdf automation',
      'clinic form fill by link india',
      'patient records to pdf india',
      'medical intake pdf india',
      'opd registration pdf template',
    ],
    valuePoints: [
      'Map patient, appointment, clinic branch, doctor, visit, symptoms, allergy, payer, and emergency-contact fields.',
      'Use Fill By Link when patients should submit details before the visit.',
      'Use Search & Fill when front-desk staff fills the PDF from a clinic roster or appointment export.',
    ],
    proofPoints: [
      'Fill By Link can collect respondent answers before staff generates the clinic PDF.',
      'Search & Fill supports appointment exports and patient registration spreadsheets.',
      'Flat final PDFs help preserve completed clinic records across viewers and handoffs.',
    ],
    documentExamples: [
      'patient registration forms',
      'OPD intake PDFs',
      'appointment or visit sheets',
      'consent and declaration forms',
      'clinic branch checklists',
    ],
    sourceRecords: [
      'appointment exports',
      'clinic front-desk spreadsheets',
      'patient intake responses',
      'branch rosters',
      'internal patient systems',
    ],
    fieldExamples: [
      'patient_name, age, date_of_birth, phone_number, emergency_contact',
      'clinic_branch, appointment_date, doctor_name, visit_type, token_number',
      'symptoms, allergies, current_medications, payer_type',
      'consent_status, declaration_checked, front_desk_reviewer',
    ],
    shortWorkflowLabel: 'clinic intake',
    localContext:
      'Indian clinics and OPD desks often need fast registration while still producing a fixed PDF for the visit file. A reusable template helps when appointment, patient, branch, and visit details are already available as rows or intake responses.',
    mappingContext:
      'Keep patient identity, visit details, symptoms, allergy, consent-status, and branch fields separate. That lets staff review sensitive or incomplete fields before the final PDF is generated.',
    runtimeContext:
      'Fill By Link can reduce front-desk typing when patients submit answers before arrival. Search & Fill is better when staff already works from an appointment list or clinic spreadsheet.',
    rolloutContext:
      'Start with one registration or OPD intake PDF and test a busy-day record with long names, mixed languages, blank allergy fields, and branch-specific values.',
    qaChecks: [
      'Check long patient names and addresses for overflow.',
      'Test blank allergy, medication, and emergency-contact values.',
      'Confirm appointment date, token number, branch, and doctor fields align.',
      'Review flat output before sharing a clinic record outside the workspace.',
    ],
    boundaryContext:
      'Clinical judgment, patient consent policy, diagnosis, treatment, and record retention stay with the clinic. DullyPDF should only prepare the reviewed PDF output from the data the clinic chooses to process.',
    faqSubject: 'clinic intake',
    faqSourceLabel: 'patient, appointment, branch, doctor, visit, and intake fields',
    sourceDataAnswer:
      'Start with appointment exports, front-desk spreadsheets, or Fill By Link responses that include patient, visit, branch, doctor, contact, and intake-status fields.',
    outputAnswer:
      'Editable output is useful during staff correction. Flat output is safer for final visit-file copies because the completed values render as page content.',
  }),
  buildIndiaIndustryPage({
    key: 'india-loan-application-pdf-automation',
    path: '/in/loan-application-pdf-automation',
    navLabel: 'India Loan Application PDF Automation',
    heroTitle: 'India Loan Application PDF Automation for Branch, Applicant, and NBFC Workflows',
    heroSummary:
      'Create reusable Indian loan application PDF templates for applicant, co-applicant, branch, KYC, repayment, employment, and review fields.',
    seoKeywords: [
      'india loan application pdf automation',
      'loan application pdf india',
      'nbfc loan pdf automation',
      'loan form fill from excel india',
      'branch loan application pdf',
      'applicant kyc loan pdf india',
      'loan packet pdf automation india',
      'api fill loan pdf india',
    ],
    valuePoints: [
      'Map applicant, co-applicant, loan amount, tenure, EMI, branch, PAN, repayment bank, IFSC, employment, and reviewer fields.',
      'Use Search & Fill when branch staff reviews one applicant record before output.',
      'Use API Fill when a LOS, CRM, or internal loan system can send a clean applicant JSON payload.',
    ],
    proofPoints: [
      'Group workflows can fill several loan packet PDFs from one applicant record.',
      'Calculation fields can display simple derived amounts when the formula is owned by the template setup.',
      'Flat outputs are useful for reviewed branch copies and downstream document checks.',
    ],
    documentExamples: [
      'loan application forms',
      'applicant and co-applicant sheets',
      'branch review checklists',
      'repayment bank-detail PDFs',
      'document collection forms',
    ],
    sourceRecords: [
      'loan origination exports',
      'branch spreadsheets',
      'CRM applicant records',
      'document checklist systems',
      'API payloads from internal tools',
    ],
    fieldExamples: [
      'applicant_name, co_applicant_name, pan_number, branch_code, loan_type',
      'loan_amount, tenure_months, emi_amount, interest_rate_display',
      'repayment_bank_account, ifsc_code, employment_type, monthly_income',
      'bureau_reference, document_status, branch_reviewer, application_status',
    ],
    shortWorkflowLabel: 'loan applications',
    localContext:
      'Indian loan teams and NBFC operators often reuse fixed application packets while applicant data moves through branch, KYC, credit, and document-check workflows. The PDF should reflect that reviewed record without forcing staff to retype each field.',
    mappingContext:
      'Keep applicant, co-applicant, branch, loan, repayment, employment, and document-status fields separate. That makes the output easier to review and avoids burying credit or repayment details inside unstructured notes.',
    runtimeContext:
      'Search & Fill is the right first step when branch staff needs to compare the applicant record and PDF visually. API Fill makes sense after a loan origination system or CRM can send the final reviewed payload.',
    rolloutContext:
      'Start with a common loan product and one branch workflow. Add co-applicant forms, repayment forms, and document checklists after the application template is stable.',
    qaChecks: [
      'Validate applicant, co-applicant, branch, loan amount, tenure, and repayment fields.',
      'Test blank co-applicant fields and optional document statuses.',
      'Check numeric amount formatting and long employment text.',
      'Use one real branch record before creating grouped loan packets.',
    ],
    boundaryContext:
      'Credit decisions, eligibility, KYC policy, lending disclosures, and regulatory review remain with the lender or NBFC. DullyPDF only supports field mapping and reviewed PDF generation.',
    faqSubject: 'loan application',
    faqSourceLabel: 'applicant, branch, KYC, loan, repayment, and review fields',
    sourceDataAnswer:
      'Use the loan origination, CRM, or branch tracker row that already contains applicant, co-applicant, product, branch, repayment, and document-status fields.',
    outputAnswer:
      'Editable output works while branch staff is correcting a packet. Flat output is better for final review copies and document-check handoffs.',
  }),
  buildIndiaIndustryPage({
    key: 'india-delivery-challan-pdf-automation',
    path: '/in/delivery-challan-pdf-automation',
    navLabel: 'India Delivery Challan PDF Automation',
    heroTitle: 'India Delivery Challan PDF Automation for Logistics, Dispatch, and Warehouse Teams',
    heroSummary:
      'Build reusable Indian delivery challan, dispatch, warehouse, e-way bill reference, vehicle, LR, SKU, and proof-of-delivery PDF templates.',
    seoKeywords: [
      'india delivery challan pdf automation',
      'delivery challan pdf india',
      'dispatch challan pdf automation',
      'e way bill reference pdf',
      'lr number pdf form india',
      'warehouse dispatch pdf automation',
      'logistics pdf automation india',
      'delivery challan fill from excel',
    ],
    valuePoints: [
      'Map challan number, dispatch date, consignor, consignee, vehicle, LR number, e-way bill reference, SKU, quantity, and delivery status.',
      'Use QR or barcode helper fields for challan, shipment, vehicle, or warehouse lookup IDs.',
      'Generate flat dispatch PDFs after warehouse or logistics review.',
    ],
    proofPoints: [
      'Barcode and QR helper fields can make shipment or challan IDs scannable.',
      'Search & Fill can use dispatch spreadsheets or warehouse exports.',
      'API Fill can generate challan PDFs from WMS, TMS, ERP, or internal logistics JSON.',
    ],
    documentExamples: [
      'delivery challans',
      'dispatch note PDFs',
      'warehouse pickup forms',
      'LR and vehicle detail sheets',
      'proof-of-delivery checklists',
    ],
    sourceRecords: [
      'dispatch spreadsheets',
      'warehouse management exports',
      'transport management records',
      'ERP order data',
      'driver or branch status logs',
    ],
    fieldExamples: [
      'challan_number, dispatch_date, consignor_name, consignee_name, destination_city',
      'vehicle_number, lr_number, e_way_bill_reference, driver_phone',
      'sku_code, item_description, batch_number, quantity, unit',
      'warehouse_code, shipment_status, delivery_status, receiver_name',
    ],
    shortWorkflowLabel: 'delivery challans',
    localContext:
      'Indian logistics, warehouse, and dispatch teams often need a fixed challan or dispatch PDF even when the shipment record already exists in a WMS, TMS, ERP, or branch spreadsheet. The repeated work is moving shipment data into the PDF without losing scannable references.',
    mappingContext:
      'Name logistics identifiers clearly. Challan number, LR number, e-way bill reference, vehicle number, warehouse code, SKU, and shipment status should be separate fields so scanner and review workflows stay predictable.',
    runtimeContext:
      'Search & Fill is useful for warehouse teams reviewing rows before dispatch. API Fill is a better fit when a logistics system already owns the shipment record and should generate the PDF automatically.',
    rolloutContext:
      'Start with one challan or dispatch note layout. Add pickup, return, proof-of-delivery, and warehouse checklists after the team trusts the shipment identifiers and output format.',
    qaChecks: [
      'Test challan number, LR number, e-way bill reference, and vehicle-number formatting.',
      'Check SKU tables, quantity fields, and long item descriptions.',
      'Scan any QR or barcode helper in a printed and downloaded PDF.',
      'Generate a flat dispatch copy before handing it to operations.',
    ],
    boundaryContext:
      'Transport compliance, e-way bill handling, route decisions, and delivery acceptance remain logistics processes. DullyPDF only prepares the PDF and helper-code output from reviewed shipment data.',
    faqSubject: 'delivery challan',
    faqSourceLabel: 'dispatch, vehicle, LR, warehouse, SKU, and delivery-status fields',
    sourceDataAnswer:
      'Start with the dispatch row from the warehouse, ERP, TMS, or branch spreadsheet. It should include challan number, vehicle, LR, e-way bill reference, SKU, quantity, and delivery-status fields.',
    outputAnswer:
      'Editable output can help a dispatcher correct a record. Flat output is better for final challans, printed copies, and dispatch handoffs.',
  }),
  buildIndiaIndustryPage({
    key: 'india-tenant-onboarding-pdf-automation',
    path: '/in/tenant-onboarding-pdf-automation',
    navLabel: 'India Tenant Onboarding PDF Automation',
    heroTitle: 'India Tenant Onboarding PDF Automation for Property, Rent, Deposit, and Move-In Forms',
    heroSummary:
      'Create reusable tenant onboarding PDF templates for Indian property teams handling applicant, rent, deposit, police-verification reference, move-in, and maintenance details.',
    seoKeywords: [
      'india tenant onboarding pdf automation',
      'tenant onboarding pdf india',
      'rental application pdf india',
      'property move in form pdf india',
      'tenant details form fill from excel',
      'rent deposit pdf automation india',
      'property management pdf india',
      'tenant verification form pdf india',
    ],
    valuePoints: [
      'Map tenant, property, unit, rent, deposit, move-in, maintenance, emergency-contact, and verification-reference fields.',
      'Use Fill By Link when tenants should submit details before the office prepares the final packet.',
      'Reuse one tenant record across move-in, maintenance, deposit, and internal property PDFs.',
    ],
    proofPoints: [
      'Search & Fill can fill tenant packets from property-management spreadsheets.',
      'Fill By Link can collect applicant or tenant details before office review.',
      'Group workflows can generate several move-in PDFs from one tenant record.',
    ],
    documentExamples: [
      'tenant information forms',
      'move-in checklists',
      'rent and deposit summary PDFs',
      'maintenance contact forms',
      'verification-reference checklists',
    ],
    sourceRecords: [
      'property management spreadsheets',
      'tenant intake responses',
      'broker or branch records',
      'unit inventory trackers',
      'maintenance handoff sheets',
    ],
    fieldExamples: [
      'tenant_name, co_tenant_name, property_id, unit_number, move_in_date',
      'monthly_rent, deposit_amount, payment_due_day, maintenance_contact',
      'emergency_contact, employer_name, vehicle_number, occupant_count',
      'verification_reference, office_reviewer, onboarding_status',
    ],
    shortWorkflowLabel: 'tenant onboarding',
    localContext:
      'Property teams in India often collect tenant and unit details through brokers, branch offices, spreadsheets, and property managers, then repeat the same data across move-in and internal PDFs. A saved template keeps that office workflow consistent without importing country-specific real estate assumptions from another market.',
    mappingContext:
      'Use field names that match the property workflow: tenant, co-tenant, unit, rent, deposit, move-in, maintenance, and verification-reference fields. Avoid generic lease fields that do not match the team document.',
    runtimeContext:
      'Fill By Link is useful when the tenant or broker supplies the initial details. Search & Fill is better after the office has reviewed a property-management row. API Fill can support internal property tools once the payload is stable.',
    rolloutContext:
      'Start with a tenant information or move-in form. Add deposit summaries, maintenance sheets, and internal review forms after one tenant row can fill the first PDF reliably.',
    qaChecks: [
      'Test tenant and co-tenant names, unit numbers, rent, deposit, and move-in dates.',
      'Check long addresses and emergency-contact values.',
      'Confirm optional vehicle or verification-reference fields stay blank when not supplied.',
      'Use flat output for final office handoff copies.',
    ],
    boundaryContext:
      'Lease terms, verification procedures, rent policy, and local property requirements remain with the property team and their advisors. DullyPDF only maps and fills the PDF records they choose to use.',
    faqSubject: 'tenant onboarding',
    faqSourceLabel: 'tenant, property, rent, deposit, move-in, and review fields',
    sourceDataAnswer:
      'Use the property-management row or tenant intake response with explicit tenant, unit, rent, deposit, move-in, contact, and verification-reference fields.',
    outputAnswer:
      'Use editable output while the office is correcting packet details. Use flat output for final move-in and office handoff copies.',
  }),
  buildIndiaIndustryPage({
    key: 'india-purchase-order-pdf-automation',
    path: '/in/purchase-order-pdf-automation',
    navLabel: 'India Purchase Order PDF Automation',
    heroTitle: 'India Purchase Order PDF Automation for GSTIN, HSN, Cost Centre, and Approval Workflows',
    heroSummary:
      'Build reusable Indian purchase order PDF templates with supplier GSTIN, PO number, HSN or SAC, cost centre, line totals, tax fields, and approval metadata.',
    seoKeywords: [
      'india purchase order pdf automation',
      'purchase order pdf india',
      'po pdf automation india',
      'supplier gstin purchase order pdf',
      'hsn sac purchase order pdf',
      'cost centre po pdf india',
      'purchase order fill from excel india',
      'procurement pdf automation india',
    ],
    valuePoints: [
      'Map supplier GSTIN, PO number, department, cost centre, item code, HSN or SAC, quantity, rate, tax, total, and approver fields.',
      'Use calculation fields for line totals, subtotal, tax split, freight, discount, round off, and grand total when the template logic is simple.',
      'Use API Fill when procurement, ERP, or internal approval systems should generate the PO PDF from JSON.',
    ],
    proofPoints: [
      'Search & Fill can validate procurement spreadsheet rows before generating a PO copy.',
      'Calculation fields can produce reviewed PO totals inside the fixed PDF layout.',
      'QR or barcode helpers can encode PO, supplier, or approval lookup references.',
    ],
    documentExamples: [
      'purchase order PDFs',
      'purchase requisition forms',
      'supplier quote comparison sheets',
      'approval note PDFs',
      'goods receipt handoff forms',
    ],
    sourceRecords: [
      'ERP purchase orders',
      'procurement spreadsheets',
      'approval workflow records',
      'supplier master exports',
      'department budget trackers',
    ],
    fieldExamples: [
      'po_number, po_date, supplier_name, supplier_gstin, supplier_code',
      'department_code, cost_centre, item_code, hsn_sac, quantity, unit_rate',
      'subtotal, discount, freight, cgst_amount, sgst_amount, igst_amount, grand_total',
      'approver_name, approval_status, grn_reference, delivery_location',
    ],
    shortWorkflowLabel: 'purchase orders',
    localContext:
      'Indian procurement teams often already have PO data in ERP exports, approval trackers, or department spreadsheets, but the organization still needs a fixed purchase order PDF for supplier, finance, or internal review. The template value is in repeatable field mapping and total review.',
    mappingContext:
      'Keep supplier, GSTIN, HSN or SAC, cost centre, department, quantity, rate, tax, total, and approval fields separate. That structure makes Search & Fill review and API payloads easier to validate.',
    runtimeContext:
      'Search & Fill is useful while procurement validates field placement and calculations. API Fill is better after the PO record and approval status already live in an internal system.',
    rolloutContext:
      'Start with one PO layout and one line-item pattern. Add requisitions, quote comparisons, and goods-receipt handoffs after totals and supplier fields render correctly.',
    qaChecks: [
      'Validate supplier GSTIN, PO number, cost centre, HSN or SAC, and approval fields.',
      'Test subtotal, discount, freight, tax, round off, and grand-total calculations.',
      'Check line-item overflow and blank optional freight fields.',
      'Generate one flat supplier-facing PO before creating more procurement templates.',
    ],
    boundaryContext:
      'Procurement approval policy, supplier selection, tax treatment, and budget authorization remain organization processes. DullyPDF only fills the reviewed purchase order PDF from the approved source record.',
    faqSubject: 'purchase order',
    faqSourceLabel: 'supplier, GSTIN, PO, HSN or SAC, cost centre, tax, total, and approval fields',
    sourceDataAnswer:
      'Use the ERP PO row, procurement spreadsheet, or approval record that already contains supplier, GSTIN, item, cost centre, tax, total, and approval-status fields.',
    outputAnswer:
      'Use editable output while procurement is testing the template. Use flat output for final supplier-facing, finance-facing, or archived PO copies.',
  }),
];
