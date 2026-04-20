export const INTENT_VISUALS = {
  'pdf-to-fillable-form': {
    hubImage: {
      src: '/blog/patient-intake-source-1.png',
      alt: 'A source PDF document before it has been turned into a reusable fillable template.',
      objectPosition: 'center 18%',
      eyebrow: 'Source document',
    },
    articleFigures: [
      {
        src: '/blog/patient-intake-source-1.png',
        alt: 'A raw patient intake PDF before field detection or template cleanup.',
        caption: 'Start from the fixed PDF layout you already have, not from a blank form builder.',
      },
      {
        src: '/demo/mobile-commonforms.webp',
        alt: 'Detected fields overlaid across a patient intake PDF inside DullyPDF.',
        caption: 'The conversion becomes reusable after field detection is reviewed and cleaned up into a dependable template.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-to-database-template': {
    hubImage: {
      src: '/demo/mobile-rename-remap.webp',
      alt: 'Rename and schema mapping view for a saved PDF template.',
      objectPosition: 'center top',
      eyebrow: 'Schema mapping',
    },
    articleFigures: [
      {
        src: '/demo/mobile-rename-remap.webp',
        alt: 'PDF template field names aligned to a structured schema.',
        caption: 'A database template only helps once the saved PDF fields are named and mapped to stable schema keys.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-form-catalog': {
    hubImage: {
      src: '/blog/irs-w4-official-1.png',
      alt: 'Official IRS W-4 form page representing a blank source document from the catalog.',
      objectPosition: 'center top',
      eyebrow: 'Blank official forms',
    },
    articleFigures: [
      {
        src: '/blog/irs-w4-official-1.png',
        alt: 'Official IRS W-4 form page downloaded from irs.gov and mirrored in the DullyPDF catalog.',
        caption: 'The catalog starts from the blank source PDF teams already recognize, then hands that document into the normal template workflow.',
        objectPosition: 'center top',
      },
    ],
  },
  'fill-pdf-from-csv': {
    hubImage: {
      src: '/demo/workflow-library/filled-card.png',
      alt: 'A patient intake PDF already filled from structured row data.',
      eyebrow: 'Record fill',
    },
    articleFigures: [
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Patient intake PDF preview with fields already filled from structured data.',
        caption: 'CSV-driven filling is strongest after the template is mapped and one representative row has been validated end to end.',
        objectPosition: 'center top',
      },
    ],
  },
  'fill-pdf-by-link': {
    hubImage: {
      src: '/demo/mock-form.webp',
      alt: 'A respondent-facing DullyPDF web form generated from a saved PDF template.',
      objectPosition: 'center top',
      eyebrow: 'Response intake',
    },
    articleFigures: [
      {
        src: '/demo/mock-form.webp',
        alt: 'Respondent-facing web form generated from a PDF template.',
        caption: 'The public form is where respondents provide the missing row data before the owner turns it into the final PDF.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/link-generated.webp',
        alt: 'Published Fill By Link manager showing response intake and later Search and Fill handoff.',
        caption: 'After publish, the owner reviews responses and applies them to the saved template inside the workspace.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-signature-workflow': {
    hubImage: {
      src: '/demo/workflow-library/signature-card.png',
      alt: 'Signature workflow controls for freezing a PDF and sending it into an e-sign ceremony.',
      eyebrow: 'Immutable signing',
    },
    articleFigures: [
      {
        src: '/demo/Signature.webp',
        alt: 'DullyPDF signature workflow with signer mode and document policy controls.',
        caption: 'The clean signing path starts when the reviewed final PDF is frozen and routed into a controlled signer ceremony.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview before the record is frozen for signing.',
        caption: 'That signing step only works well after the document has already been reviewed as the exact record the team intends to keep.',
        objectPosition: 'center top',
      },
    ],
  },
  'esign-ueta-pdf-workflow': {
    articleFigures: [
      {
        src: '/demo/Signature.webp',
        alt: 'DullyPDF signature workflow used as the operational basis for supported U.S. e-sign record handling.',
        caption: 'The compliance discussion still points back to a real product behavior: one frozen PDF, one signer ceremony, and retained signing artifacts.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-fill-api': {
    hubImage: {
      src: '/seo/database-schema.png',
      alt: 'Database schema diagram representing a stable JSON-to-PDF API contract.',
      eyebrow: 'Published endpoint',
    },
    // Intentionally omit `articleFigures` so the page surfaces targeted
    // supporting docs (API Fill + Rename + Mapping) instead of the generic
    // "Workflow examples for …" figure grid used by other landing pages.
  },
  'fill-information-in-pdf': {
    articleFigures: [
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF with structured values applied into the template.',
        caption: 'This workflow is about reusing one mapped template so information lands in the PDF consistently instead of being retyped every time.',
        objectPosition: 'center top',
      },
    ],
  },
  'fillable-form-field-name': {
    hubImage: {
      src: '/blog/patient-intake-rename-1.png',
      alt: 'Patient intake PDF after field labels have been renamed into clearer, reusable names.',
      eyebrow: 'Field naming',
    },
    articleFigures: [
      {
        src: '/blog/patient-intake-rename-1.png',
        alt: 'Renamed patient intake form showing clearer field names before mapping and fill.',
        caption: 'Name cleanup matters because reliable auto-fill starts with fields that mean something beyond their original PDF widget labels.',
      },
    ],
  },
  'batch-fill-pdf-forms': {
    hubImage: {
      src: '/demo/workflow-library/create-group-card.png',
      alt: 'Create Group dialog used to organize multiple saved forms into a repeat packet workflow.',
      eyebrow: 'Packet workflows',
    },
    articleFigures: [
      {
        src: '/seo/csv-calc-screenshot.png',
        alt: 'Spreadsheet row prepared as the source record for a repeat packet workflow.',
        caption: 'Packet workflows start from one structured record that should be reused across several documents, not retyped into each PDF separately.',
      },
      {
        src: '/demo/create-group.webp',
        alt: 'Create Group dialog for grouping multiple saved forms into one workflow.',
        caption: 'Groups are the bridge between isolated templates and a real packet workflow because they keep the related PDFs under one reusable definition.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing one document inside a larger repeat packet workflow.',
        caption: 'The payoff is consistent record application across every document in the packet, not just one isolated form.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-checkbox-automation': {
    hubImage: {
      src: '/blog/dental-intake-form-1.png',
      alt: 'Checkbox-heavy dental intake form with repeated yes-no and multi-select sections.',
      eyebrow: 'Checkbox rules',
    },
    articleFigures: [
      {
        src: '/blog/dental-intake-form-1.png',
        alt: 'Source dental intake form with multiple checkbox questions before automation.',
        caption: 'Checkbox-heavy forms are where a template needs real structure instead of naive text placement.',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled dental intake PDF showing checkbox selections applied to the output.',
        caption: 'After the checkbox logic is modeled correctly, the same template can apply repeat selections much more reliably.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-radio-button-editor': {
    hubImage: {
      src: '/demo/mobile-inspector.webp',
      alt: 'DullyPDF field inspector used to review grouped field metadata inside a template editor.',
      objectPosition: 'center top',
      eyebrow: 'Single-select groups',
    },
    articleFigures: [
      {
        src: '/demo/mobile-field-list.png',
        alt: 'DullyPDF field list used to review named fields and groups inside a PDF template.',
        caption: 'Radio button cleanup starts by seeing each choice as part of one named group instead of a pile of unrelated widgets.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-inspector.png',
        alt: 'DullyPDF field inspector used to review one field at a time and adjust its metadata.',
        caption: 'The review pass matters because single-select behavior has to be explicit before the template is safe to reuse or publish.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-field-detection-tool': {
    hubImage: {
      src: '/blog/patient-intake-source-1.png',
      alt: 'Source patient intake PDF before any field detection or template cleanup.',
      eyebrow: 'Field detection',
    },
    articleFigures: [
      {
        src: '/blog/patient-intake-source-1.png',
        alt: 'Source PDF before field detection runs.',
        caption: 'Detection starts from the raw document layout, not from prebuilt form metadata or a custom hand-authored schema.',
      },
      {
        src: '/demo/mobile-commonforms.webp',
        alt: 'AI-detected field overlays previewed in DullyPDF.',
        caption: 'The field detector is useful when it turns that source document into a reviewable overlay that operators can refine before later mapping and fill steps.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-field-detection-accuracy': {
    hubImage: {
      src: '/demo/mobile-commonforms.webp',
      alt: 'DullyPDF preview showing AI-detected field overlays on top of a source PDF.',
      objectPosition: 'center top',
      eyebrow: 'Detection review',
    },
    articleFigures: [
      {
        src: '/demo/mobile-commonforms.webp',
        alt: 'AI-detected field overlays previewed in DullyPDF on top of a real PDF page.',
        caption: 'Accuracy starts with whether the detector finds the right field regions on the real source document, not with a generic benchmark number.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-field-list.png',
        alt: 'DullyPDF field list used to review detected fields after the first pass.',
        caption: 'The practical accuracy check is the operator review loop: low-confidence cleanup, duplicate removal, and one real validation fill.',
        objectPosition: 'center top',
      },
    ],
  },
  'healthcare-pdf-automation': {
    hubImage: {
      src: '/blog/dental-intake-form-1.png',
      alt: 'Dental intake form page with patient, insurance, and medical-history fields.',
      objectPosition: 'center top',
      eyebrow: 'Healthcare intake',
    },
    articleFigures: [
      {
        src: '/blog/dental-intake-form-1.png',
        alt: 'Dental intake form with multiple patient, insurance, and checkbox-heavy history sections.',
        caption: 'Healthcare packet work usually starts from dense intake PDFs that still need structured data applied accurately.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/link-generated.webp',
        alt: 'Published DullyPDF intake link used to collect respondent information before generating the final PDF.',
        caption: 'When clinics want patient-submitted intake first, the response flow can still feed the same saved PDF template after staff review.',
        objectPosition: 'center top',
      },
    ],
  },
  'acord-form-automation': {
    hubImage: {
      src: '/blog/insurance-form-sample-1.png',
      alt: 'Insurance form page rendered from a repo sample image.',
      objectPosition: 'center top',
      eyebrow: 'Insurance forms',
    },
    articleFigures: [
      {
        src: '/blog/insurance-form-sample-1.png',
        alt: 'Insurance PDF form page with fixed-layout policy and applicant fields.',
        caption: 'ACORD-style work is repetitive because the record data already exists while the final document still has to be prepared inside a fixed PDF layout.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a reviewed insurance form output.',
        caption: 'The value appears after the template is mapped and the team can review a repeatable filled output instead of rebuilding the form under deadline pressure.',
        objectPosition: 'center 38%',
      },
    ],
  },
  'insurance-pdf-automation': {
    hubImage: {
      src: '/blog/motor-insurance-claim-form-1.png',
      alt: 'Motor insurance claim form page rendered from a repo sample image.',
      objectPosition: 'center top',
      eyebrow: 'Carrier workflows',
    },
    articleFigures: [
      {
        src: '/blog/motor-insurance-claim-form-1.png',
        alt: 'Insurance claim form with several fixed-layout sections that need recurring data entry.',
        caption: 'Carrier and servicing workflows usually span more than one document family, which is why insurance teams need a template library rather than one isolated form setup.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/create-group.webp',
        alt: 'Saved-template group manager for organizing several recurring PDFs together.',
        caption: 'A wider insurance workflow becomes easier to operate when recurring supplements, renewals, and servicing forms are treated as named reusable templates.',
        objectPosition: 'center top',
      },
    ],
  },
  'real-estate-pdf-automation': {
    hubImage: {
      src: '/demo/mock-form.webp',
      alt: 'Respondent-facing form for collecting structured information before a fixed PDF packet is generated.',
      objectPosition: 'center top',
      eyebrow: 'Leasing intake',
    },
    articleFigures: [
      {
        src: '/demo/mock-form.webp',
        alt: 'Hosted DullyPDF form for collecting applicant or resident information before PDF creation.',
        caption: 'Leasing teams often save the most time when applicants submit structured information first and the office turns that into the final rental packet afterward.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/Signature.webp',
        alt: 'Signature workflow used after the final lease or addendum PDF has been reviewed.',
        caption: 'Lease signing becomes cleaner once the office freezes one final record instead of emailing around editable drafts.',
        objectPosition: 'center top',
      },
    ],
  },
  'government-form-automation': {
    hubImage: {
      src: '/blog/irs-w4-official-1.png',
      alt: 'Official IRS W-4 form page downloaded from irs.gov.',
      objectPosition: 'center top',
      eyebrow: 'Official forms',
    },
    articleFigures: [
      {
        src: '/blog/irs-w4-official-1.png',
        alt: 'Official IRS W-4 form page showing a fixed government layout.',
        caption: 'Government-form automation works best when the official document layout stays intact and the reusable template absorbs the repeat data-entry work around it.',
        objectPosition: 'center top',
      },
      {
        src: '/blog/irs-w9-official-1.png',
        alt: 'Official IRS W-9 form page downloaded from irs.gov.',
        caption: 'Canonical templates make it easier to keep recurring permit, tax, and administrative forms consistent even as official revisions arrive over time.',
        objectPosition: 'center top',
      },
    ],
  },
  'finance-loan-pdf-automation': {
    hubImage: {
      src: '/seo/online-loan-application.jpg',
      alt: 'Loan application and borrower paperwork representing finance PDFs that need repeat data entry.',
      eyebrow: 'Borrower mapping',
    },
    articleFigures: [
      {
        src: '/seo/online-loan-application.jpg',
        alt: 'Borrower application workflow that mirrors the data finance teams later need in fixed PDFs.',
        caption: 'Loan and finance workflows get more dependable after borrower and disclosure fields are normalized into one stable schema instead of being reinterpreted on each packet.',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview showing a reviewed output after structured data has been applied.',
        caption: 'A reviewed final PDF matters here because finance documents are expensive when nearly-correct data slips through the workflow.',
        objectPosition: 'center 38%',
      },
    ],
  },
  'hr-pdf-automation': {
    hubImage: {
      src: '/blog/irs-w4-official-1.png',
      alt: 'Official IRS W-4 form page as an example of recurring onboarding paperwork.',
      objectPosition: 'center top',
      eyebrow: 'Onboarding packets',
    },
    articleFigures: [
      {
        src: '/blog/irs-w4-official-1.png',
        alt: 'IRS W-4 form page commonly included in onboarding packets.',
        caption: 'HR packet work often starts from fixed tax and acknowledgment forms that still need structured employee data applied accurately.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/create-group.webp',
        alt: 'Saved-template group manager used to organize several forms into one repeat packet workflow.',
        caption: 'Grouped packet workflows help HR teams keep one canonical template per form while still assembling role- or location-specific onboarding sets.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing one document after a shared employee record has been applied.',
        caption: 'Once the packet is grouped correctly, one employee row can drive the reviewed output across the onboarding set instead of forcing HR to re-enter the same details form by form.',
        objectPosition: 'center top',
      },
    ],
  },
  'legal-pdf-workflow-automation': {
    hubImage: {
      src: '/seo/legal-contract-signature.jpg',
      alt: 'Signed legal contract with a pen representing a reviewed final record.',
      eyebrow: 'Record control',
    },
    articleFigures: [
      {
        src: '/seo/legal-contract-signature.jpg',
        alt: 'Legal contract and signature block representing the final document that must stay controlled.',
        caption: 'Legal template work becomes safer when the document is normalized before it is routed into review, signature, or archive under deadline pressure.',
      },
      {
        src: '/demo/Signature.webp',
        alt: 'DullyPDF signature workflow after a final document has been prepared.',
        caption: 'Where signature belongs in the workflow, it should attach to one reviewed final record rather than to a draft that is still changing.',
        objectPosition: 'center top',
      },
    ],
  },
  'education-form-automation': {
    hubImage: {
      src: '/seo/fafsa-screenshot.png',
      alt: 'Student aid application interface representing recurring education form intake.',
      eyebrow: 'Student intake',
    },
    articleFigures: [
      {
        src: '/seo/fafsa-screenshot.png',
        alt: 'Education application screen representing structured student data collected before packet generation.',
        caption: 'Admissions and registrar teams often benefit from collecting student information first and only then applying it to the recurring PDF packet.',
      },
      {
        src: '/demo/create-group.webp',
        alt: 'Saved-template group manager for organizing several recurring forms together.',
        caption: 'Education workflows are easier to maintain when recurring forms are treated as packet components that can be reused across terms instead of rebuilt every cycle.',
        objectPosition: 'center top',
      },
    ],
  },
  'nonprofit-pdf-form-automation': {
    hubImage: {
      src: '/seo/volunteer-application-form.jpg',
      alt: 'Volunteer or program application form used as a recurring nonprofit intake document.',
      eyebrow: 'Program intake',
    },
    articleFigures: [
      {
        src: '/seo/volunteer-application-form.jpg',
        alt: 'Volunteer application form representing nonprofit intake information collected once and reused later.',
        caption: 'Nonprofit teams often save time when volunteer or client information is collected once and then reused across recurring packet documents.',
      },
      {
        src: '/demo/create-group.webp',
        alt: 'Saved-form group manager showing how several recurring templates can be organized together.',
        caption: 'A smaller reusable packet library is usually more valuable to lean nonprofit teams than a larger set of templates nobody feels confident maintaining.',
        objectPosition: 'center top',
      },
    ],
  },
  'logistics-pdf-automation': {
    hubImage: {
      src: '/seo/bill-of-lading.jpg',
      alt: 'Bill of lading document representing shipment paperwork that needs repeat filling.',
      eyebrow: 'Shipment output',
    },
    articleFigures: [
      {
        src: '/seo/bill-of-lading.jpg',
        alt: 'Shipment document and bill of lading used as a logistics workflow example.',
        caption: 'Dispatch and back-office teams gain leverage when recurring shipment and receipt documents can be filled from route data instead of rebuilt by hand.',
      },
      {
        src: '/demo/Signature.webp',
        alt: 'Signature workflow for reviewed final PDF records.',
        caption: 'Where delivery receipts or signoffs matter, the signature step should happen after the final document is fixed and ready to keep as the operational record.',
        objectPosition: 'center top',
      },
    ],
  },
  'construction-pdf-automation': {
    hubImage: {
      src: '/seo/paperwork-desk.jpg',
      alt: 'Construction staff reviewing and signing recurring site paperwork at a job location.',
      eyebrow: 'Project packets',
    },
    articleFigures: [
      {
        src: '/seo/paperwork-desk.jpg',
        alt: 'Construction workers filling out and reviewing recurring project paperwork.',
        caption: 'Construction workflows become easier to maintain when recurring permit, inspection, and change-order documents are treated as reusable templates instead of ad hoc project files.',
      },
      {
        src: '/demo/create-group.webp',
        alt: 'Group manager for keeping several recurring project forms together.',
        caption: 'A packet mindset helps office and field teams work from the same canonical form set even when a project needs several related PDFs at once.',
        objectPosition: 'center top',
      },
    ],
  },
  'accounting-tax-pdf-automation': {
    hubImage: {
      src: '/blog/irs-w9-official-1.png',
      alt: 'Official IRS W-9 form page downloaded from irs.gov.',
      objectPosition: 'center top',
      eyebrow: 'Tax forms',
    },
    articleFigures: [
      {
        src: '/blog/irs-w9-official-1.png',
        alt: 'IRS W-9 form page used as an example of recurring accounting paperwork.',
        caption: 'Accounting work often revolves around standard tax and vendor forms whose layouts should stay fixed while the client data behind them changes constantly.',
        objectPosition: 'center top',
      },
      {
        src: '/blog/irs-w4-official-1.png',
        alt: 'IRS W-4 form page used as another example of fixed-layout tax documentation.',
        caption: 'The more predictable the source client data becomes, the easier it is to reuse tax-season templates without rekeying the same names and identifiers every cycle.',
        objectPosition: 'center top',
      },
    ],
  },
  'invoice-pdf-processing': {
    hubImage: {
      src: '/blog/invoice-sample-1.png',
      alt: 'Sample invoice page rendered from the repo sample image set.',
      objectPosition: 'center top',
      eyebrow: 'Invoice extraction',
    },
    articleFigures: [
      {
        src: '/blog/invoice-sample-1.png',
        alt: 'Sample invoice image used as a source document for extraction into PDF fields.',
        caption: 'Invoice workflows usually start with an unstructured source document, which is why extraction quality matters before anything is written into the destination PDF.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/Extract_Images.webp',
        alt: 'Fill from Images workflow preview in DullyPDF.',
        caption: 'DullyPDF bridges that gap by reading the invoice semantically and suggesting values for the mapped destination fields before the operator commits them.',
        objectPosition: 'center top',
      },
    ],
  },
  'anvil-alternative': {
    hubImage: {
      src: '/demo/mobile-commonforms.webp',
      alt: 'DullyPDF field detection overlay on top of an existing PDF form.',
      objectPosition: 'center top',
      eyebrow: 'Existing PDF workflows',
    },
    articleFigures: [
      {
        src: '/blog/patient-intake-source-1.png',
        alt: 'Existing source PDF before it is turned into a reusable automation template.',
        caption: 'A practical Anvil alternative starts from the fixed PDF you already have instead of asking the team to re-author every document path.',
      },
      {
        src: '/seo/database-schema.png',
        alt: 'Database schema diagram representing the stable contract behind a mapped PDF workflow.',
        caption: 'The real comparison usually shows up after that template is mapped and published into a stable fill workflow other systems can reuse.',
      },
    ],
  },
  'pdf-fill-api-nodejs': {
    hubImage: {
      src: '/seo/database-schema.png',
      alt: 'Database schema diagram representing a stable JSON-to-PDF API contract.',
      eyebrow: 'Node.js client',
    },
    articleFigures: [
      {
        src: '/seo/database-schema.png',
        alt: 'Database schema diagram representing the JSON contract behind a PDF fill API.',
        caption: 'The Node.js path still depends on the same prerequisite as every other client: one stable mapped template behind the request.',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview produced from structured data after a mapped template has been applied.',
        caption: 'The runtime success condition is a correct PDF output, not just a successful HTTP response.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-fill-api-python': {
    hubImage: {
      src: '/seo/database-schema.png',
      alt: 'Database schema diagram representing a stable JSON-to-PDF API contract.',
      eyebrow: 'Python client',
    },
    articleFigures: [
      {
        src: '/seo/database-schema.png',
        alt: 'Database schema diagram representing the JSON contract behind a PDF fill API.',
        caption: 'The Python path still depends on the same prerequisite as every other client: one stable mapped template behind the request.',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview produced from structured data after a mapped template has been applied.',
        caption: 'The runtime success condition is a correct PDF output, not just a successful HTTP response.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-fill-api-curl': {
    hubImage: {
      src: '/seo/database-schema.png',
      alt: 'Database schema diagram representing a stable JSON-to-PDF API contract.',
      eyebrow: 'cURL client',
    },
    articleFigures: [
      {
        src: '/seo/database-schema.png',
        alt: 'Database schema diagram representing the JSON contract behind a PDF fill API.',
        caption: 'The cURL path still depends on the same prerequisite as every other client: one stable mapped template behind the request.',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview produced from structured data after a mapped template has been applied.',
        caption: 'The runtime success condition is a correct PDF output, not just a successful HTTP response.',
        objectPosition: 'center top',
      },
    ],
  },
};
