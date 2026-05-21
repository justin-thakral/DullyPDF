const HIGH_INTENT_OPPORTUNITY_VISUALS = [
  ['fill-pdf-from-google-sheets', 'Google Sheets workflow'],
  ['airtable-to-pdf-template', 'Airtable workflow'],
  ['google-forms-to-filled-pdf', 'Google Forms workflow'],
  ['microsoft-forms-to-filled-pdf', 'Microsoft Forms workflow'],
  ['typeform-to-pdf-template', 'Typeform workflow'],
  ['hubspot-to-pdf-template', 'HubSpot workflow'],
  ['notion-database-to-pdf-form', 'Notion workflow'],
  ['salesforce-to-pdf-template', 'Salesforce workflow'],
  ['power-automate-fill-pdf-template', 'Power Automate workflow'],
  ['zapier-webhook-to-pdf', 'Zapier workflow'],
  ['make-webhook-to-pdf', 'Make workflow'],
  ['webhook-json-to-pdf-form', 'Webhook workflow'],
  ['php-fill-pdf-api', 'PHP API client'],
  ['java-fill-pdf-api', 'Java API client'],
  ['csharp-fill-pdf-api', 'C# API client'],
  ['go-fill-pdf-api', 'Go API client'],
  ['ruby-fill-pdf-api', 'Ruby API client'],
  ['turn-pdf-into-online-form', 'Online form workflow'],
  ['one-web-form-fill-multiple-pdfs', 'Multi-PDF web form'],
  ['one-json-fill-multiple-pdfs', 'Multi-PDF API'],
  ['respondent-download-filled-pdf', 'Respondent download'],
  ['online-form-to-signed-pdf', 'Form to signature'],
  ['excel-to-fillable-pdf-template', 'Excel workflow'],
  ['sql-database-to-pdf-form-api', 'SQL-backed workflow'],
  ['flatten-filled-pdf-form', 'Flat PDF output'],
  ['filled-pdf-fields-not-showing', 'Viewer troubleshooting'],
  ['make-pdf-read-only-after-filling', 'Read-only output'],
  ['pdf-checkbox-values-csv', 'Checkbox mapping'],
  ['pdf-radio-button-values-json', 'Radio mapping'],
  ['pdf-date-format-csv-fill', 'Date mapping'],
  ['duplicate-pdf-field-names', 'Field naming cleanup'],
  ['pdf-template-versioning', 'Template QA'],
];

const HIGH_INTENT_OPPORTUNITY_VISUAL_ENTRIES = Object.fromEntries(
  HIGH_INTENT_OPPORTUNITY_VISUALS.map(([key, eyebrow]) => {
    const src = `/seo/${key}-overview.webp`;
    return [
      key,
      {
        hubImage: {
          src,
          alt: `DullyPDF public workflow page screenshot for ${eyebrow}.`,
          objectPosition: 'center top',
          eyebrow,
        },
        articleFigures: [
          {
            src,
            alt: `DullyPDF public workflow page screenshot for ${eyebrow}.`,
            caption: 'Each new workflow page uses a route-specific DullyPDF UI screenshot captured from the local app, rather than stock art or duplicated generic imagery.',
            objectPosition: 'center top',
          },
        ],
      },
    ];
  }),
);

const INDIA_WORKFLOW_VISUALS = [
  [
    'india-pdf-to-fillable-form',
    'India template setup',
    '/demo/mobile-raw-pdf.webp',
    'DullyPDF mobile preview of a raw PDF before field detection and template cleanup.',
    'India PDF-to-fillable-form work starts from the fixed operations PDF the team already uses.',
  ],
  [
    'india-fill-pdf-from-excel',
    'India Excel rows',
    '/seo/excel-to-fillable-pdf-template-overview.webp',
    'DullyPDF Excel-to-PDF workflow preview with spreadsheet rows mapped into a reusable PDF template.',
    'Excel-to-PDF workflows need stable headers for PAN, GSTIN, branch, employee, student, invoice, or vendor fields.',
  ],
  [
    'india-fill-pdf-from-csv',
    'India CSV rows',
    '/seo/search-fill-pdf-review-overview.webp',
    'DullyPDF Search and Fill review preview for choosing a source row before PDF output.',
    'CSV-to-PDF workflows are strongest when operators inspect one exported row before adding volume.',
  ],
  [
    'india-fill-by-link',
    'India intake link',
    '/demo/mock-form.webp',
    'DullyPDF respondent form preview for collecting structured answers before PDF generation.',
    'Fill By Link lets Indian respondents submit structured details while staff still reviews the final PDF output.',
  ],
  [
    'india-pdf-fill-api',
    'India API fill',
    '/seo/database-schema.webp',
    'Database schema diagram representing JSON source data mapped to a PDF Fill API template.',
    'API Fill should use the same reviewed schema already tested through the saved India PDF template.',
  ],
  [
    'india-pdf-field-detection',
    'India field detection',
    '/demo/mobile-commonforms.webp',
    'DullyPDF preview showing detected field overlays on top of a source PDF.',
    'Field detection is the first draft of the field layer; Indian forms still need human review before mapping.',
  ],
  [
    'india-rename-map-pdf-fields',
    'India field mapping',
    '/seo/ai-pdf-field-renaming-overview.webp',
    'DullyPDF field renaming and mapping preview for standardizing template field names.',
    'Rename and mapping work turns generic detected labels into stable fields such as PAN, GSTIN, branch, vendor, and invoice keys.',
  ],
  [
    'india-fill-pdf-from-documents',
    'India document extraction',
    '/seo/fill-pdf-from-image-overview.webp',
    'DullyPDF fill-from-documents preview for extracting candidate values before filling a PDF template.',
    'Document-to-PDF workflows help when Indian source values arrive as scans, attachments, invoices, statements, or photos instead of clean rows.',
  ],
  [
    'india-pdf-packet-workflow',
    'India PDF packets',
    '/seo/pdf-packet-workflow-overview.webp',
    'DullyPDF packet workflow preview for filling multiple PDFs from one record.',
    'Packet workflows let one Indian record fill several KYC, HR, vendor, loan, school, clinic, or branch PDFs.',
  ],
  [
    'india-pdf-calculations',
    'India calculations',
    '/seo/calculation-fields-overview.webp',
    'DullyPDF calculation-field preview for producing reviewed totals inside a fixed PDF layout.',
    'Calculation workflows are useful for GST, PO, fee, delivery, score, and total fields after the source inputs are reviewed.',
  ],
];

const INDIA_WORKFLOW_VISUAL_ENTRIES = Object.fromEntries(
  INDIA_WORKFLOW_VISUALS.map(([key, eyebrow, src, alt, caption]) => [
    key,
    {
      hubImage: {
        src,
        alt,
        objectPosition: 'center top',
        eyebrow,
      },
      articleFigures: [
        {
          src,
          alt,
          caption,
          objectPosition: 'center top',
        },
      ],
    },
  ]),
);

const INDIA_INDUSTRY_VISUALS = [
  [
    'india-kyc-pdf-automation',
    'India KYC',
    '/seo/id-photo-field-pdf-form-overview.webp',
    'DullyPDF template preview with identity-photo and structured field regions for a KYC-style PDF.',
    'KYC templates need explicit identifier, address, branch, reviewer, and supporting-document fields before they can be reused safely.',
  ],
  [
    'india-vendor-onboarding-pdf-automation',
    'India vendors',
    '/seo/procurement-pdf-automation-overview.webp',
    'DullyPDF procurement template preview with vendor, purchase, barcode, and total fields.',
    'Vendor onboarding pages reuse procurement mechanics, but focus the field set on GSTIN, PAN, bank, IFSC, Udyam, and vendor-master review.',
  ],
  [
    'india-hr-joining-pdf-automation',
    'India HR',
    '/seo/pdf-packet-workflow-overview.webp',
    'DullyPDF grouped packet workflow preview for filling several PDFs from one record.',
    'HR joining work is packet-heavy, so one reviewed employee row should fill joining, bank, nominee, policy, and asset forms consistently.',
  ],
  [
    'india-gst-invoice-pdf-automation',
    'GST invoice',
    '/blog/invoice-sample-1.webp',
    'Invoice PDF sample with fixed fields for invoice details, amounts, and totals.',
    'GST invoice PDFs need explicit GSTIN, HSN or SAC, place of supply, taxable value, tax amount, round off, and total fields.',
  ],
  [
    'india-school-admissions-pdf-automation',
    'India admissions',
    '/blog/homework-worksheet-detected-fields.webp',
    'Education PDF example with detected fields over a fixed school document layout.',
    'School admission packets work best when student, parent, class, campus, transport, hostel, and fee fields use stable names across the packet.',
  ],
  [
    'india-clinic-intake-pdf-automation',
    'India clinics',
    '/demo/mock-form.webp',
    'DullyPDF respondent form preview for collecting intake answers before generating a PDF.',
    'Clinic intake can start from a patient-submitted web form, then staff can review and generate the final OPD or registration PDF.',
  ],
  [
    'india-loan-application-pdf-automation',
    'India loans',
    '/seo/online-loan-application.jpg',
    'Loan application form preview with applicant and financial fields.',
    'Loan packet templates need applicant, co-applicant, branch, repayment, KYC, document-status, and review fields kept separate.',
  ],
  [
    'india-delivery-challan-pdf-automation',
    'India dispatch',
    '/seo/warehouse-inventory-pdf-automation-overview.webp',
    'Warehouse PDF automation preview with item, inventory, barcode, and status fields.',
    'Delivery challan workflows benefit from separate challan, LR, e-way bill reference, vehicle, SKU, warehouse, and delivery-status fields.',
  ],
  [
    'india-tenant-onboarding-pdf-automation',
    'India tenants',
    '/seo/paperwork-desk.jpg',
    'Desk with paperwork representing a fixed tenant onboarding PDF workflow.',
    'Tenant onboarding pages should map property, unit, rent, deposit, move-in, maintenance, and verification-reference details without importing another market workflow.',
  ],
  [
    'india-purchase-order-pdf-automation',
    'India PO',
    '/seo/pdf-purchase-order-calculations-overview.webp',
    'Purchase order calculation template preview with line totals and grand total fields.',
    'Purchase order templates need supplier GSTIN, PO number, HSN or SAC, cost centre, line totals, tax fields, and approval metadata.',
  ],
];

const INDIA_INDUSTRY_VISUAL_ENTRIES = Object.fromEntries(
  INDIA_INDUSTRY_VISUALS.map(([key, eyebrow, src, alt, caption]) => [
    key,
    {
      hubImage: {
        src,
        alt,
        objectPosition: 'center top',
        eyebrow,
      },
      articleFigures: [
        {
          src,
          alt,
          caption,
          objectPosition: 'center top',
        },
      ],
    },
  ]),
);

const SPANISH_VISUALS = [
  ['es-create-fillable-pdf-form', 'PDF rellenable', '/blog/patient-intake-source-1.webp', 'PDF existente antes de convertirse en plantilla rellenable.', 'La plantilla empieza con el PDF existente y agrega una capa de campos revisados para reutilizar el documento.'],
  ['es-fill-pdf-from-excel', 'Excel a PDF', '/blog/patient-intake-remap-1.webp', 'Formulario PDF mapeado a una fuente de datos estructurada.', 'Excel funciona mejor cuando cada columna tiene un campo PDF claro y probado.'],
  ['es-fill-pdf-from-csv', 'CSV a PDF', '/seo/database-schema.webp', 'Esquema de datos usado para mapear registros CSV a campos PDF.', 'CSV es una buena fuente para exportaciones recurrentes y pruebas antes de API.'],
  ['es-fill-pdf-by-link', 'PDF por enlace', '/demo/mock-form.webp', 'Formulario web para capturar respuestas antes de generar un PDF.', 'Fill By Link separa la captura de respuestas del PDF final.'],
  ['es-pdf-fill-api', 'API PDF', '/seo/database-schema.webp', 'Diagrama de esquema JSON para rellenar PDFs por API.', 'La API necesita un contrato estable entre claves JSON y campos PDF.'],
  ['es-ai-pdf-field-detection', 'Detección IA', '/demo/mobile-commonforms.webp', 'Detección de campos en un PDF dentro de DullyPDF.', 'La detección crea un borrador de campos que debe revisarse antes de guardar la plantilla.'],
  ['es-ai-pdf-field-renaming', 'Renombrar campos', '/blog/patient-intake-rename-1.webp', 'Campos PDF renombrados con etiquetas más claras.', 'Nombres claros facilitan mapear Excel, CSV, respuestas por enlace y API.'],
  ['es-map-data-to-pdf', 'Mapeo de datos', '/blog/patient-intake-remap-1.webp', 'Formulario PDF con campos alineados a datos estructurados.', 'El mapeo guarda qué dato llena cada campo para que el flujo se pueda repetir.'],
  ['es-reusable-pdf-template', 'Plantilla PDF', '/seo/save-reusable-pdf-template-overview.webp', 'Vista de plantilla PDF reutilizable en DullyPDF.', 'Guardar la plantilla conserva campos, nombres y mapeos para futuros registros.'],
  ['es-pdf-packet-workflow', 'Paquetes PDF', '/seo/pdf-packet-workflow-overview.webp', 'Vista de flujo para rellenar varios PDFs desde un registro.', 'Los paquetes usan nombres consistentes para que un registro pueda generar varios documentos.'],
  ['es-healthcare-pdf-automation', 'Clínicas', '/blog/dental-intake-form-1.webp', 'Formulario clínico PDF fijo con secciones de admisión y datos de paciente.', 'Las clínicas necesitan plantillas estables para admisión, historial, seguros y registros.'],
  ['es-hr-pdf-automation', 'RR. HH.', '/seo/pdf-packet-workflow-overview.webp', 'Vista de paquete PDF para documentos de ingreso de empleados.', 'RR. HH. suele reutilizar datos de empleado en varios documentos del paquete de ingreso.'],
  ['es-real-estate-pdf-automation', 'Inmobiliaria', '/seo/paperwork-desk.jpg', 'Escritorio con documentos que representa expedientes inmobiliarios repetidos.', 'Los flujos inmobiliarios necesitan mapear propiedad, unidad, cliente, importes y fechas.'],
  ['es-education-pdf-automation', 'Educación', '/blog/homework-worksheet-detected-fields.webp', 'Documento escolar con campos detectados sobre un PDF.', 'Escuelas y administración educativa pueden reutilizar plantillas de admisión, inscripción y autorización.'],
  ['es-finance-loan-pdf-automation', 'Préstamos', '/seo/online-loan-application.jpg', 'Solicitud de préstamo con campos de solicitante y operación financiera.', 'Los préstamos necesitan separar solicitante, producto, monto, plazo, sucursal y revisión.'],
  ['es-logistics-pdf-automation', 'Logística', '/seo/warehouse-inventory-pdf-automation-overview.webp', 'Plantilla PDF de almacén con campos de inventario y operación.', 'Logística usa PDFs repetidos para órdenes, inventarios, guías y comprobantes.'],
  ['es-accounting-invoice-pdf-automation', 'Facturas', '/blog/invoice-sample-1.webp', 'Factura PDF con campos de cliente, conceptos, impuestos y total.', 'Contabilidad necesita mapear importes y datos de factura sin recaptura manual.'],
  ['es-construction-pdf-automation', 'Construcción', '/seo/pdf-construction-bid-calculations-overview.webp', 'Plantilla de presupuesto de construcción con campos de costos y totales.', 'Construcción usa formularios repetidos para presupuestos, cambios, inspecciones y reportes.'],
  ['es-field-service-pdf-automation', 'Campo', '/seo/field-service-pdf-automation-overview.webp', 'Vista de orden de trabajo PDF para servicio de campo.', 'Servicios de campo necesitan mapear cliente, activo, técnico, ubicación y resultado.'],
  ['es-procurement-pdf-automation', 'Compras', '/seo/procurement-pdf-automation-overview.webp', 'Plantilla de compras con campos de proveedor, orden y aprobación.', 'Compras reutiliza datos de proveedor, orden, centro de costo, totales y aprobadores.'],
];

const SPANISH_VISUAL_ENTRIES = Object.fromEntries(
  SPANISH_VISUALS.map(([key, eyebrow, src, alt, caption]) => [
    key,
    {
      hubImage: {
        src,
        alt,
        objectPosition: 'center top',
        eyebrow,
      },
      articleFigures: [
        {
          src,
          alt,
          caption,
          objectPosition: 'center top',
        },
      ],
    },
  ]),
);

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
  'pdf-image-qr-barcode-fields': {
    hubImage: {
      src: '/seo/advanced-pdf-fields-overview.webp',
      alt: 'DullyPDF template editor preview with image, QR Code, PDF417, and 1D barcode helper fields on one PDF.',
      objectPosition: 'center center',
      eyebrow: 'Advanced fields',
    },
    articleFigures: [
      {
        src: '/seo/advanced-pdf-fields-overview.webp',
        alt: 'A DullyPDF PDF template preview showing image, QR Code, PDF417, and 1D barcode field regions.',
        caption: 'Advanced helper fields are useful when a recurring PDF needs scannable or visual output, not only typed AcroForm values.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-commonforms.webp',
        alt: 'Detected fields overlaid on a source PDF inside DullyPDF before helper fields are added.',
        caption: 'Start by cleaning the ordinary field set, then add image and barcode helpers where the final rendered output belongs.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final document generated from a saved template.',
        caption: 'The value of these helpers appears after the template can render a repeatable final PDF from data, responses, or API input.',
        objectPosition: 'center top',
      },
    ],
  },
  'add-image-field-to-pdf': {
    hubImage: {
      src: '/seo/add-image-field-to-pdf-overview.webp',
      alt: 'DullyPDF template editor preview showing image fields for photos, logos, and attachment images on a PDF.',
      objectPosition: 'center center',
      eyebrow: 'Image fields',
    },
    articleFigures: [
      {
        src: '/seo/add-image-field-to-pdf-overview.webp',
        alt: 'A DullyPDF PDF template preview showing uploaded photo, reusable image placeholder, and logo image field regions.',
        caption: 'Image fields are for visual values that belong inside the completed PDF, such as photos, logos, ID images, receipts, or supporting attachments.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-commonforms.webp',
        alt: 'Detected fields overlaid on a source PDF inside DullyPDF before image helper fields are added.',
        caption: 'Image fields use the same helper-field model as other DullyPDF-only visual outputs: the template keeps placement metadata, then DullyPDF renders the result into the final PDF.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final output after template values have been applied.',
        caption: 'The quality check is the final PDF output, not just whether an image looked acceptable while editing the template.',
        objectPosition: 'center top',
      },
    ],
  },
  'add-qr-code-field-to-pdf': {
    hubImage: {
      src: '/seo/add-qr-code-field-to-pdf-overview.webp',
      alt: 'DullyPDF template editor preview showing a QR Code helper field connected to a source field on a PDF.',
      objectPosition: 'center center',
      eyebrow: 'QR fields',
    },
    articleFigures: [
      {
        src: '/seo/add-qr-code-field-to-pdf-overview.webp',
        alt: 'A DullyPDF PDF template preview showing a record URL source field generating a QR Code field.',
        caption: 'QR Code fields are strongest when a completed PDF needs to connect a printed record to a verification URL, portal, payment page, or status lookup.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-commonforms.webp',
        alt: 'Detected fields overlaid on a source PDF inside DullyPDF before QR helper fields are added.',
        caption: 'QR Code is one helper-field option. Use PDF417 for denser structured payloads and 1D barcode for short internal identifiers.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final output after template values have been applied.',
        caption: 'The QR setup is only reliable after the generated PDF scans correctly at the final size users will print, email, or archive.',
        objectPosition: 'center top',
      },
    ],
  },
  'add-pdf417-barcode-field-to-pdf': {
    hubImage: {
      src: '/seo/add-pdf417-barcode-field-to-pdf-overview.webp',
      alt: 'DullyPDF template editor preview showing a PDF417 barcode helper field built from multiple labeled source values.',
      objectPosition: 'center center',
      eyebrow: 'PDF417 fields',
    },
    articleFigures: [
      {
        src: '/seo/add-pdf417-barcode-field-to-pdf-overview.webp',
        alt: 'A DullyPDF PDF template preview showing multiple source values combined into one PDF417 barcode field.',
        caption: 'PDF417 helper fields are useful when one scannable block should carry several structured record facts from the template.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-commonforms.webp',
        alt: 'Detected fields overlaid on a source PDF inside DullyPDF before PDF417 helper fields are added.',
        caption: 'Use PDF417 when the encoded payload is denser than a QR link or a short 1D identifier.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final output after template values have been applied.',
        caption: 'The real test is the completed PDF: the PDF417 code needs to scan at the final printed or shared size.',
        objectPosition: 'center top',
      },
    ],
  },
  'add-1d-barcode-field-to-pdf': {
    hubImage: {
      src: '/seo/add-1d-barcode-field-to-pdf-overview.webp',
      alt: 'DullyPDF template editor preview showing a 1D barcode helper field for a short internal record identifier.',
      objectPosition: 'center center',
      eyebrow: '1D barcode fields',
    },
    articleFigures: [
      {
        src: '/seo/add-1d-barcode-field-to-pdf-overview.webp',
        alt: 'A DullyPDF PDF template preview showing a 1D barcode field generated from a short numeric source value.',
        caption: '1D barcode helper fields fit short internal identifiers such as asset tags, work orders, member IDs, and tracking references.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-commonforms.webp',
        alt: 'Detected fields overlaid on a source PDF inside DullyPDF before 1D barcode helpers are added.',
        caption: 'Choose 1D barcode for a compact ID, PDF417 for denser structured data, and QR Code for URLs or mobile-friendly scanning.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final output after template values have been applied.',
        caption: 'Scan testing should happen on the final generated PDF, not only inside the editor preview.',
        objectPosition: 'center top',
      },
    ],
  },
  'add-barcode-to-pdf-form': {
    hubImage: {
      src: '/seo/add-barcode-to-pdf-form-overview.webp',
      alt: 'DullyPDF template editor preview showing QR Code, PDF417, and 1D barcode helper fields inside one PDF form.',
      objectPosition: 'center center',
      eyebrow: 'Barcode fields',
    },
    articleFigures: [
      {
        src: '/seo/add-barcode-to-pdf-form-overview.webp',
        alt: 'A DullyPDF PDF template preview showing barcode helper fields placed into a reusable PDF form.',
        caption: 'Barcode fields should be placed as part of the reusable template, then generated from the same record data that fills the PDF.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-commonforms.webp',
        alt: 'Detected fields overlaid on a source PDF before scannable helper regions are added.',
        caption: 'QR Code handles link and lookup intent; PDF417 and 1D barcode cover denser payloads and shorter identifiers.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final barcode-enabled output after template values have been applied.',
        caption: 'A broad barcode page should still explain which barcode type matches the user workflow.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf417-vs-qr-code-pdf-forms': {
    hubImage: {
      src: '/seo/pdf417-vs-qr-code-pdf-forms-overview.webp',
      alt: 'DullyPDF comparison preview showing PDF417 and QR Code helper fields side by side on a PDF form.',
      objectPosition: 'center center',
      eyebrow: 'Barcode comparison',
    },
    articleFigures: [
      {
        src: '/seo/pdf417-vs-qr-code-pdf-forms-overview.webp',
        alt: 'A DullyPDF PDF template comparison showing PDF417 for structured data and QR Code for a verification URL.',
        caption: 'PDF417 and QR Code can both live in PDFs, but they answer different scanning jobs.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-rename-remap.webp',
        alt: 'Rename and schema mapping view for a saved PDF template before barcode helper output is generated.',
        caption: 'PDF417 is better when the scan text should include several labeled values from the document record.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final output after barcode or QR values have been applied.',
        caption: 'QR Code is usually stronger for URLs, mobile scanning, and printed-to-digital handoff.',
        objectPosition: 'center top',
      },
    ],
  },
  'generate-pdf-barcodes-from-csv': {
    hubImage: {
      src: '/seo/generate-pdf-barcodes-from-csv-overview.webp',
      alt: 'DullyPDF template preview showing mapped row data generating QR Code, PDF417, and 1D barcode output in a PDF.',
      objectPosition: 'center center',
      eyebrow: 'Data-driven barcodes',
    },
    articleFigures: [
      {
        src: '/seo/generate-pdf-barcodes-from-csv-overview.webp',
        alt: 'A DullyPDF PDF template preview showing CSV or database values feeding barcode helper fields.',
        caption: 'Barcode output is most useful when it comes from the same mapped row data that fills the rest of the template.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-rename-remap.webp',
        alt: 'Rename and schema mapping view for a saved PDF template.',
        caption: 'Data-driven barcode workflows depend on stable field names and schema mapping before batch generation starts.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final output after template values have been applied.',
        caption: 'Validate one representative row end to end before using a barcode-enabled template across a batch.',
        objectPosition: 'center top',
      },
    ],
  },
  'image-upload-fields-pdf-forms': {
    hubImage: {
      src: '/seo/image-upload-fields-pdf-forms-overview.webp',
      alt: 'DullyPDF template editor preview showing image upload fields for a photo, ID image, and receipt on a PDF form.',
      objectPosition: 'center center',
      eyebrow: 'Image upload fields',
    },
    articleFigures: [
      {
        src: '/seo/image-upload-fields-pdf-forms-overview.webp',
        alt: 'A DullyPDF PDF template preview showing image upload fields for variable document images.',
        caption: 'Image upload fields reserve reviewed PDF regions for visual values that change from one completed record to the next.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-commonforms.webp',
        alt: 'Detected fields overlaid on a source PDF before reusable image upload regions are added.',
        caption: 'The field is reusable template metadata, not just one image pasted onto one PDF.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final output after template values have been applied.',
        caption: 'The final output should be checked for cropping, aspect ratio, readability, and sensitive visual content.',
        objectPosition: 'center top',
      },
    ],
  },
  'add-code-128-barcode-to-pdf': {
    hubImage: {
      src: '/seo/add-code-128-barcode-to-pdf-overview.webp',
      alt: 'DullyPDF template editor preview showing a Code 128 barcode helper field generated from an internal ID.',
      objectPosition: 'center center',
      eyebrow: 'Code 128 fields',
    },
    articleFigures: [
      {
        src: '/seo/add-code-128-barcode-to-pdf-overview.webp',
        alt: 'A DullyPDF PDF template preview showing a Code 128 barcode field generated from a short internal source value.',
        caption: 'Code 128 helper fields fit controlled internal identifiers that should scan from the final PDF.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-rename-remap.webp',
        alt: 'Rename and schema mapping view for a saved PDF template before Code 128 output is connected to a source value.',
        caption: 'Code 128 is the focused 1D path; use the broader 1D page when comparing linear barcode options.',
        objectPosition: 'center top',
      },
    ],
  },
  'work-order-barcode-pdf': {
    hubImage: {
      src: '/seo/work-order-barcode-pdf-overview.webp',
      alt: 'DullyPDF template editor preview showing a work order PDF with a barcode field tied to the work order ID.',
      objectPosition: 'center center',
      eyebrow: 'Work order barcode',
    },
    articleFigures: [
      {
        src: '/seo/work-order-barcode-pdf-overview.webp',
        alt: 'A DullyPDF PDF template preview showing a work order barcode field generated from a work order source value.',
        caption: 'Work order barcodes are strongest when the scannable ID matches the human-readable work order details on the PDF.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final work order output after mapped values have been applied.',
        caption: 'Use a linear barcode for scanner-driven IDs and a QR code when the document should open a web record.',
        objectPosition: 'center top',
      },
    ],
  },
  'asset-tag-barcode-pdf-form': {
    hubImage: {
      src: '/seo/asset-tag-barcode-pdf-form-overview.webp',
      alt: 'DullyPDF template editor preview showing an asset tag barcode field inside a PDF form.',
      objectPosition: 'center center',
      eyebrow: 'Asset tag barcode',
    },
    articleFigures: [
      {
        src: '/seo/asset-tag-barcode-pdf-form-overview.webp',
        alt: 'A DullyPDF PDF template preview showing an asset tag barcode field with mapped location and inspection fields.',
        caption: 'Asset tag barcode PDFs work best when the barcode, visible ID, and mapped asset data all come from the same source record.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-rename-remap.webp',
        alt: 'Rename and schema mapping view for a saved PDF template before asset tag barcode output is connected to source data.',
        caption: 'Short controlled asset IDs are a natural fit for Code 128 style helper output.',
        objectPosition: 'center top',
      },
    ],
  },
  'qr-code-verification-pdf': {
    hubImage: {
      src: '/seo/qr-code-verification-pdf-overview.webp',
      alt: 'DullyPDF template editor preview showing a PDF verification QR code linked to a validation URL.',
      objectPosition: 'center center',
      eyebrow: 'Verification QR',
    },
    articleFigures: [
      {
        src: '/seo/qr-code-verification-pdf-overview.webp',
        alt: 'A DullyPDF PDF template preview showing a verification QR code field generated from a validation URL.',
        caption: 'A verification QR code should point to a stable validation page, not try to prove document authenticity by itself.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final verified document output after mapped values have been applied.',
        caption: 'Verification is one high-value QR use case alongside payment links, record lookup, and portal handoff.',
        objectPosition: 'center top',
      },
    ],
  },
  'qr-code-payment-link-pdf': {
    hubImage: {
      src: '/seo/qr-code-payment-link-pdf-overview.webp',
      alt: 'DullyPDF template editor preview showing a payment QR code field on a PDF invoice.',
      objectPosition: 'center center',
      eyebrow: 'Payment QR',
    },
    articleFigures: [
      {
        src: '/seo/qr-code-payment-link-pdf-overview.webp',
        alt: 'A DullyPDF PDF invoice template preview showing a payment QR code generated from a payment link field.',
        caption: 'Payment QR codes make sense when the invoice template already contains a stable payment URL or portal link.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-rename-remap.webp',
        alt: 'Rename and schema mapping view for a saved PDF invoice template before payment-link QR output is generated.',
        caption: 'Invoice QR output is easiest to trust when it is generated from the same mapped row data as the invoice number and balance.',
        objectPosition: 'center top',
      },
    ],
  },
  'qr-code-record-lookup-pdf': {
    hubImage: {
      src: '/seo/qr-code-record-lookup-pdf-overview.webp',
      alt: 'DullyPDF template editor preview showing a record lookup QR code connected to a source record URL.',
      objectPosition: 'center center',
      eyebrow: 'Record lookup QR',
    },
    articleFigures: [
      {
        src: '/seo/qr-code-record-lookup-pdf-overview.webp',
        alt: 'A DullyPDF PDF template preview showing a QR code field generated from a record lookup URL.',
        caption: 'Record lookup QR codes help printed PDFs connect back to a portal, case, shipment, invoice, or work order record.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final PDF with a lookup URL value applied.',
        caption: 'Use a source-field QR value when every completed PDF needs its own lookup URL or token.',
        objectPosition: 'center top',
      },
    ],
  },
  'scannable-pdf-form': {
    hubImage: {
      src: '/seo/scannable-pdf-form-overview.webp',
      alt: 'DullyPDF template editor preview showing QR Code, PDF417, and 1D barcode helper fields on a scannable PDF form.',
      objectPosition: 'center center',
      eyebrow: 'Scannable forms',
    },
    articleFigures: [
      {
        src: '/seo/scannable-pdf-form-overview.webp',
        alt: 'A DullyPDF PDF template preview showing QR Code, PDF417, and 1D barcode helper output in one scannable PDF form.',
        caption: 'A scannable PDF form should pair machine-readable output with human-readable fallback fields.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final scannable output after template values have been applied.',
        caption: 'The right scannable field depends on the payload: URL, structured data, or short identifier.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-photo-upload-field': {
    hubImage: {
      src: '/seo/pdf-photo-upload-field-overview.webp',
      alt: 'DullyPDF template editor preview showing a photo upload field in a PDF form.',
      objectPosition: 'center center',
      eyebrow: 'Photo field',
    },
    articleFigures: [
      {
        src: '/seo/pdf-photo-upload-field-overview.webp',
        alt: 'A DullyPDF PDF template preview showing a photo upload field beside applicant details.',
        caption: 'Photo upload fields are for variable visual content that belongs in the completed PDF, not permanent decoration.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final document after image field values have been applied.',
        caption: 'A photo field is one focused image-upload use case in the broader visual-field workflow.',
        objectPosition: 'center top',
      },
    ],
  },
  'id-photo-field-pdf-form': {
    hubImage: {
      src: '/seo/id-photo-field-pdf-form-overview.webp',
      alt: 'DullyPDF template editor preview showing an ID photo field inside a PDF form.',
      objectPosition: 'center center',
      eyebrow: 'ID photo field',
    },
    articleFigures: [
      {
        src: '/seo/id-photo-field-pdf-form-overview.webp',
        alt: 'A DullyPDF PDF template preview showing an ID photo field beside ID number and expiration fields.',
        caption: 'ID photo fields need final-output review because ID images can expose sensitive details and crop differently by source image.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final document after ID image field values have been applied.',
        caption: 'DullyPDF image helpers render selected PNG/JPEG content into the final PDF page.',
        objectPosition: 'center top',
      },
    ],
  },
  'receipt-upload-field-pdf-form': {
    hubImage: {
      src: '/seo/receipt-upload-field-pdf-form-overview.webp',
      alt: 'DullyPDF template editor preview showing a receipt upload field inside an expense PDF form.',
      objectPosition: 'center center',
      eyebrow: 'Receipt image field',
    },
    articleFigures: [
      {
        src: '/seo/receipt-upload-field-pdf-form-overview.webp',
        alt: 'A DullyPDF PDF template preview showing a receipt upload field beside vendor, amount, and expense-date fields.',
        caption: 'Receipt image fields are useful when the completed PDF needs the expense proof beside structured reimbursement details.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final reimbursement document after receipt image values have been applied.',
        caption: 'Receipt uploads should be checked for readability, cropping, and sensitive details before the template is published.',
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
  'fillable-pdf-fonts-colors': {
    hubImage: {
      src: '/demo/field-colors-editable-export.png',
      alt: 'Editable dental intake PDF export with colored field values and an active field using the selected global font color and size.',
      objectPosition: 'center top',
      eyebrow: 'Field appearance',
    },
    articleFigures: [
      {
        src: '/demo/field-colors-flat-export.png',
        alt: 'Flat PDF export of a dental intake form with filled values baked into the page in multiple field colors.',
        caption: 'Flat downloads bake the final field values directly into the PDF page content, so the chosen colors render even after the fields are no longer editable.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-colors-editable-export.png',
        alt: 'Editable PDF export showing live AcroForm fields with colored values and an active typed value using the global orange field appearance.',
        caption: 'Editable downloads keep text inside the AcroForm fields. When the user types into a selected field, the selected font color and size are applied to the active editing state as well as the committed value.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-appearance-global-editor.png',
        alt: 'DullyPDF left field panel global font controls set to Times Bold, Auto dynamic size, and an orange global field color.',
        caption: 'The left field panel sets the global default: Times Bold, Auto dynamic font size, and a shared orange field color for fields that inherit appearance.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-appearance-individual-editor.png',
        alt: 'DullyPDF field inspector showing one field overriding the global style with Helvetica Bold, custom size 10, and black text.',
        caption: 'The field inspector handles exceptions. A specific field can override the global font, font size, and color while the rest of the template continues to inherit the shared settings.',
        objectPosition: 'center top',
      },
    ],
  },
  'acroform-field-appearance': {
    hubImage: {
      src: '/demo/field-appearance-individual-editor.png',
      alt: 'DullyPDF field inspector showing field-specific font, font size, and font color overrides for an AcroForm field.',
      objectPosition: 'center top',
      eyebrow: 'AcroForm output',
    },
    articleFigures: [
      {
        src: '/demo/field-colors-editable-export.png',
        alt: 'Editable PDF export with the selected AcroForm field active and typed text rendered in the global orange field appearance.',
        caption: 'Editable output is trustworthy when values live inside AcroForm fields. This viewer state shows typed field text using the selected font color and size while the field is active.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-colors-flat-export.png',
        alt: 'Flat PDF export with colored field values drawn into the dental intake form page content.',
        caption: 'Flat output is a separate export mode: it intentionally draws the final values into page content and removes the need for live widget appearances.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-appearance-global-editor.png',
        alt: 'Global field appearance panel showing Times Bold, Auto dynamic font size, and orange field color controls.',
        caption: 'Global appearance settings become the inherited template intent that DullyPDF maps into AcroForm appearance data during editable export.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-appearance-individual-editor.png',
        alt: 'Individual field inspector showing Helvetica Bold, custom size 10, and black color overriding the global appearance.',
        caption: 'Per-field overrides are stored with the field metadata so one widget can write a different /DA font, size, or color from the global default.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-calculation-fields': {
    hubImage: {
      src: '/seo/calculation-fields-overview.webp',
      alt: 'DullyPDF field editor with Number Input and Calculated Output controls visible beside a PDF form.',
      objectPosition: 'center top',
      eyebrow: 'Calculation fields',
    },
    articleFigures: [
      {
        src: '/seo/calculation-fields-overview.webp',
        alt: 'DullyPDF field editor showing calculation field creation controls for number inputs and calculated outputs.',
        caption: 'Calculation setup starts in the same editor used for the rest of the template, so numeric inputs and computed outputs stay tied to the PDF field model.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'A filled PDF preview after template values have been applied.',
        caption: 'DullyPDF precomputes visible values before materializing output, so final records do not depend on the recipient viewer running live JavaScript.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-colors-flat-export.png',
        alt: 'Flat PDF export with values baked into the page content.',
        caption: 'Flat output is the safer final-record mode when recipients only need the completed values, not live editable widgets.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-form-calculations-not-working': {
    articleFigures: [
      {
        src: '/seo/pdf-form-calculations-not-working-overview.webp',
        alt: 'DullyPDF calculation troubleshooting preview showing viewer-sensitive totals replaced by a reviewed computed PDF value.',
        caption: 'When a calculated PDF behaves differently across viewers, first verify the template fields and formula logic, then choose the right output mode.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-colors-flat-export.png',
        alt: 'Flat PDF output with completed values baked into the page content.',
        caption: 'Flat PDF output is the safer final-record path because completed values no longer depend on live viewer recalculation.',
        objectPosition: 'center top',
      },
    ],
  },
  'add-calculated-field-to-pdf': {
    articleFigures: [
      {
        src: '/seo/add-calculated-field-to-pdf-overview.webp',
        alt: 'DullyPDF template editor preview showing a calculated output added to an existing PDF form.',
        caption: 'Add the source number inputs first, then place the calculated output where the derived value belongs on the existing PDF.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview after source values and computed outputs have been applied.',
        caption: 'The practical quality check is the generated PDF, not only whether the formula looked correct while editing.',
        objectPosition: 'center top',
      },
    ],
  },
  'fillable-pdf-total-field': {
    articleFigures: [
      {
        src: '/seo/fillable-pdf-total-field-overview.webp',
        alt: 'DullyPDF total-field preview showing source payment fields connected to a read-only balance due output.',
        caption: 'A total field should usually be read-only so the final number is derived from the source inputs instead of typed manually.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-colors-flat-export.png',
        alt: 'Flat PDF output showing completed field values rendered into the final document.',
        caption: 'For customer-facing totals and final records, flat output avoids depending on the recipient viewer to rerun calculations.',
        objectPosition: 'center top',
      },
    ],
  },
  'api-fill-calculated-pdf': {
    hubImage: {
      src: '/seo/api-fill-calculated-pdf-overview.webp',
      alt: 'DullyPDF API Fill preview showing JSON source values sent into a calculated PDF endpoint.',
      eyebrow: 'Server computed PDF',
      objectPosition: 'center top',
    },
    articleFigures: [
      {
        src: '/seo/api-fill-calculated-pdf-overview.webp',
        alt: 'DullyPDF API Fill preview showing JSON source values sent into a calculated PDF endpoint.',
        caption: 'API callers should send source values while the saved template computes totals and other derived fields server-side.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-rename-remap.webp',
        alt: 'DullyPDF template editor showing calculation-field controls before publishing an API Fill endpoint.',
        caption: 'Publish the API only after the template fields, formulas, and output behavior have been reviewed.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-form-javascript-calculation-alternative': {
    articleFigures: [
      {
        src: '/seo/pdf-form-javascript-calculation-alternative-overview.webp',
        alt: 'DullyPDF safe-formula preview showing structured calculation rules instead of arbitrary Acrobat JavaScript.',
        caption: 'DullyPDF keeps the editable business rule in a safe formula model instead of asking users to maintain arbitrary PDF JavaScript.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview generated from a reusable template.',
        caption: 'Generated Acrobat-compatible actions can support editable output, but DullyPDF still computes final values before delivery.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-calculation-order': {
    articleFigures: [
      {
        src: '/seo/pdf-calculation-order-overview.webp',
        alt: 'DullyPDF calculation order preview showing dependent calculated outputs resolved from source fields.',
        caption: 'Calculation order is easiest to reason about when formula dependencies are stored as structured template data.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview after dependent values have been applied to a template.',
        caption: 'For final output, DullyPDF computes the dependency chain before writing the PDF.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-invoice-calculation-template': {
    articleFigures: [
      {
        src: '/seo/pdf-invoice-calculation-template-overview.webp',
        alt: 'DullyPDF invoice calculation template preview showing line items, tax, amount paid, and amount due.',
        caption: 'Invoice templates are strongest when the PDF layout is fixed and the repeated job is filling known fields plus calculated totals.',
        objectPosition: 'center top',
      },
      {
        src: '/seo/database-schema.png',
        alt: 'Database schema diagram representing invoice source values sent into a PDF template.',
        caption: 'Spreadsheet rows or API JSON should provide source invoice values while the template computes subtotal, tax, and balance due.',
      },
    ],
  },
  'pdf-order-form-calculations': {
    articleFigures: [
      {
        src: '/seo/pdf-order-form-calculations-overview.webp',
        alt: 'DullyPDF order form calculation preview showing quantity, price, shipping, and grand total fields.',
        caption: 'Order forms should ask for source values and let the template compute read-only totals.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mock-form.webp',
        alt: 'Respondent-facing web form generated from a saved PDF template.',
        caption: 'Fill By Link can collect source order details before DullyPDF generates the completed order PDF.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-estimate-quote-calculations': {
    articleFigures: [
      {
        src: '/seo/pdf-estimate-quote-calculations-overview.webp',
        alt: 'DullyPDF estimate and quote calculation preview showing labor, materials, markup, and deposit outputs.',
        caption: 'Quote templates can keep labor, materials, markup, discounts, deposits, and balances as reusable calculation rules.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-colors-flat-export.png',
        alt: 'Flat PDF output with completed values rendered into the page.',
        caption: 'A customer-facing quote is usually safest as a flat PDF once the computed totals have been reviewed.',
        objectPosition: 'center top',
      },
    ],
  },
  'calculated-pdf-from-csv': {
    articleFigures: [
      {
        src: '/seo/calculated-pdf-from-csv-overview.webp',
        alt: 'DullyPDF calculated PDF from CSV preview showing row values mapped into source fields and a computed reimbursement output.',
        caption: 'The spreadsheet should provide source facts; the PDF template should own the calculated outputs.',
        objectPosition: 'center top',
      },
      {
        src: '/seo/csv-calc-screenshot.png',
        alt: 'Spreadsheet source data used to fill source number inputs before DullyPDF computes calculated PDF outputs.',
        caption: 'After mapping, DullyPDF computes read-only outputs during materialization instead of trusting spreadsheet totals blindly.',
      },
    ],
  },
  'fill-by-link-calculated-pdf': {
    articleFigures: [
      {
        src: '/seo/fill-by-link-calculated-pdf-overview.webp',
        alt: 'DullyPDF Fill By Link calculated PDF preview showing respondent number inputs feeding a computed total.',
        caption: 'Fill By Link should collect source values from respondents while calculated outputs stay out of the public question list.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mock-form.webp',
        alt: 'DullyPDF field editor showing calculation fields that are computed after respondent submission.',
        caption: 'The completed PDF is generated after DullyPDF computes the calculated outputs from submitted source answers.',
        objectPosition: 'center top',
      },
    ],
  },
  'flat-vs-editable-calculated-pdf': {
    articleFigures: [
      {
        src: '/seo/flat-vs-editable-calculated-pdf-overview.webp',
        alt: 'DullyPDF flat versus editable calculated PDF preview comparing live fields with stable rendered values.',
        caption: 'Editable output is useful when another person must keep working inside live fields, especially in Adobe Acrobat or Reader.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-colors-flat-export.png',
        alt: 'Flat PDF output with final values baked into the page content.',
        caption: 'Flat output is the safer final-record mode when calculated values should look the same across viewers.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-expense-report-calculations': {
    articleFigures: [
      {
        src: '/seo/pdf-expense-report-calculations-overview.webp',
        alt: 'DullyPDF expense report calculation preview showing receipt amounts, mileage, advances, and reimbursement due.',
        caption: 'Expense workflows often start from rows of source amounts, mileage, advances, and adjustments.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-colors-flat-export.png',
        alt: 'Flat PDF output used as a stable final reimbursement record.',
        caption: 'Final reimbursement records should usually be flat so the approved amount does not depend on live PDF viewer behavior.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-timesheet-calculations': {
    articleFigures: [
      {
        src: '/seo/pdf-timesheet-calculations-overview.webp',
        alt: 'DullyPDF timesheet calculation preview showing regular hours, overtime hours, rate, and gross pay.',
        caption: 'Timesheet calculations should use numeric hours and rates, not unsupported clock-in or clock-out time parsing.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview after numeric source values have been applied to a reusable template.',
        caption: 'The PDF is the output layer after numeric source values and payroll-policy decisions are already known.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-purchase-order-calculations': {
    articleFigures: [
      {
        src: '/seo/pdf-purchase-order-calculations-overview.webp',
        alt: 'DullyPDF purchase order calculation preview showing subtotal, freight, tax, and grand total outputs.',
        caption: 'Purchase order PDFs work well when source values come from a spreadsheet, procurement export, or API payload.',
        objectPosition: 'center top',
      },
      {
        src: '/seo/database-schema.png',
        alt: 'Database schema diagram representing procurement source values used to generate purchase order PDFs.',
        caption: 'Fixed purchase order layouts can compute line totals and grand totals from explicit source fields.',
      },
    ],
  },
  'pdf-construction-bid-calculations': {
    articleFigures: [
      {
        src: '/seo/pdf-construction-bid-calculations-overview.webp',
        alt: 'DullyPDF construction bid calculation preview showing labor, materials, markup, and bid total fields.',
        caption: 'Construction bid PDFs are strongest when the layout is stable and source pricing values have already been reviewed.',
        objectPosition: 'center top',
      },
      {
        src: '/seo/pdf-construction-bid-calculations-overview.webp',
        alt: 'DullyPDF construction bid calculation preview showing labor, materials, markup, and bid total fields.',
        caption: 'Use read-only calculated outputs for bid totals while keeping pricing assumptions as explicit source fields.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-change-order-calculations': {
    articleFigures: [
      {
        src: '/seo/pdf-change-order-calculations-overview.webp',
        alt: 'DullyPDF change order calculation preview showing original contract, added cost, credit, and revised total.',
        caption: 'Change orders often become approval or signature records, so the final calculated PDF should be frozen after review.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-colors-flat-export.png',
        alt: 'Flat PDF output with final values rendered into the page.',
        caption: 'Flat output keeps revised totals stable before customer review or signature.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-mileage-reimbursement-calculation': {
    articleFigures: [
      {
        src: '/seo/pdf-mileage-reimbursement-calculation-overview.webp',
        alt: 'DullyPDF mileage reimbursement calculation preview showing miles, rate, tolls, and reimbursement total.',
        caption: 'Mileage reimbursement forms should keep miles, rate, tolls, parking, and adjustments as explicit source fields.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mock-form.webp',
        alt: 'Respondent-facing web form that can collect source reimbursement values.',
        caption: 'Employees can submit source values by link, then DullyPDF can generate the calculated reimbursement PDF after review.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-inspection-score-calculations': {
    articleFigures: [
      {
        src: '/seo/pdf-inspection-score-calculations-overview.webp',
        alt: 'DullyPDF inspection score calculation preview showing checklist scores, critical defects, and final score output.',
        caption: 'Inspection score PDFs should use explicit numeric score inputs and read-only calculated outputs.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-colors-flat-export.png',
        alt: 'Flat PDF output suitable for stable audit and inspection records.',
        caption: 'Flat output preserves the reviewed score as page content for audit or recordkeeping use.',
        objectPosition: 'center top',
      },
    ],
  },
  'ai-pdf-field-renaming': {
    hubImage: {
      src: '/seo/ai-pdf-field-renaming-overview.webp',
      alt: 'DullyPDF AI field renaming preview showing unclear PDF widget labels converted into stable field names.',
      objectPosition: 'center top',
      eyebrow: 'Rename + map',
    },
    articleFigures: [
      {
        src: '/seo/ai-pdf-field-renaming-overview.webp',
        alt: 'DullyPDF AI field renaming preview showing unclear PDF widget labels converted into stable field names.',
        caption: 'AI rename is most useful after field geometry is reviewed and before the template depends on stable names.',
        objectPosition: 'center top',
      },
      {
        src: '/blog/patient-intake-remap-1.png',
        alt: 'DullyPDF mapping workflow aligning renamed PDF fields to schema headers.',
        caption: 'Mapping connects the reviewed template to the data headers that will drive Search & Fill, API Fill, and respondent records.',
        objectPosition: 'center top',
      },
    ],
  },
  'fill-pdf-from-image': {
    hubImage: {
      src: '/seo/fill-pdf-from-image-overview.webp',
      alt: 'DullyPDF Fill from Images preview showing uploaded source evidence converted into reviewed PDF field suggestions.',
      objectPosition: 'center top',
      eyebrow: 'Vision extraction',
    },
    articleFigures: [
      {
        src: '/seo/fill-pdf-from-image-overview.webp',
        alt: 'DullyPDF Fill from Images preview showing uploaded source evidence converted into reviewed PDF field suggestions.',
        caption: 'Image-based fill is strongest when the source evidence is a photo, scan, invoice, ID, or supporting document rather than clean row data.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview after extracted values have been applied to a reviewed template.',
        caption: 'The extracted values still need operator review inside the final PDF output before download, save, signature, or archive.',
        objectPosition: 'center top',
      },
    ],
  },
  'save-reusable-pdf-template': {
    hubImage: {
      src: '/seo/save-reusable-pdf-template-overview.webp',
      alt: 'DullyPDF saved template preview showing stored fields, mappings, fill rules, and reusable workflow state.',
      objectPosition: 'center top',
      eyebrow: 'Saved templates',
    },
    articleFigures: [
      {
        src: '/seo/save-reusable-pdf-template-overview.webp',
        alt: 'DullyPDF saved template preview showing stored fields, mappings, fill rules, and reusable workflow state.',
        caption: 'A saved template preserves the reviewed field model so the next fill starts from a trusted setup.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-inspector.webp',
        alt: 'DullyPDF field inspector showing editable metadata for one saved PDF field.',
        caption: 'Template quality comes from the saved metadata: field type, name, geometry, mapping, appearance, and fill behavior.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-packet-workflow': {
    hubImage: {
      src: '/seo/pdf-packet-workflow-overview.webp',
      alt: 'DullyPDF packet workflow preview showing one selected record driving several saved PDF templates.',
      objectPosition: 'center top',
      eyebrow: 'Template groups',
    },
    articleFigures: [
      {
        src: '/seo/pdf-packet-workflow-overview.webp',
        alt: 'DullyPDF packet workflow preview showing one selected record driving several saved PDF templates.',
        caption: 'Groups turn isolated saved templates into repeat packet workflows that can share one record context.',
        objectPosition: 'center top',
      },
      {
        src: '/seo/csv-calc-screenshot.png',
        alt: 'Spreadsheet row representing one record that can populate several PDFs in a packet.',
        caption: 'Packet automation is strongest when one reviewed record can drive several related templates consistently.',
      },
    ],
  },
  'merge-fillable-pdf-forms': {
    hubImage: {
      src: '/seo/merge-fillable-pdf-forms-overview.webp',
      alt: 'DullyPDF merge fillable PDF forms preview showing inserted source pages, review pass status, and output validation.',
      objectPosition: 'center top',
      eyebrow: 'Page tools',
    },
    articleFigures: [
      {
        src: '/seo/merge-fillable-pdf-forms-overview.webp',
        alt: 'DullyPDF merge fillable PDF forms preview showing inserted source pages, review pass status, and output validation.',
        caption: 'Before merging fillable forms, decide whether the documents should become one source PDF or remain separate saved templates in a group.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-field-list.webp',
        alt: 'DullyPDF field list showing reviewed field metadata after a PDF template is prepared.',
        caption: 'After page insertion, the field model still needs review because inserted pages do not automatically inherit DullyPDF field definitions.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview after a reviewed DullyPDF template has generated output.',
        caption: 'The final proof is a generated PDF after page changes, field cleanup, and any Fill By Link, API Fill, or signature handoff.',
        objectPosition: 'center top',
      },
    ],
  },
  'reorder-fillable-pdf-pages': {
    hubImage: {
      src: '/seo/reorder-fillable-pdf-pages-overview.webp',
      alt: 'DullyPDF Manage Pages dialog showing page 2 moved ahead of page 1 in the 1915 fillable PDF.',
      objectPosition: 'center top',
      eyebrow: 'Page order',
    },
    articleFigures: [
      {
        src: '/seo/reorder-fillable-pdf-pages-overview.webp',
        alt: 'DullyPDF Manage Pages dialog showing page 2 moved ahead of page 1 in the 1915 fillable PDF.',
        caption: 'Manage Pages stages the final page order before rewriting the active source PDF, so operators can inspect the sequence before applying changes.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-field-list.webp',
        alt: 'DullyPDF field list used to review field metadata after reordering PDF pages.',
        caption: 'After reordering, review the field model because fields can move with their pages while workflow context still needs validation.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview after reordered pages have been reviewed and generated.',
        caption: 'The final proof is a generated PDF after page order, fields, and output behavior are stable.',
        objectPosition: 'center top',
      },
    ],
  },
  'rotate-fillable-pdf-pages': {
    hubImage: {
      src: '/demo/mobile-raw-pdf.webp',
      alt: 'DullyPDF mobile preview of a raw PDF page used to evaluate orientation before staging rotation in Manage Pages.',
      objectPosition: 'center top',
      eyebrow: 'Page orientation',
    },
    articleFigures: [
      {
        src: '/demo/mobile-raw-pdf.webp',
        alt: 'DullyPDF mobile preview of a raw PDF page used to evaluate orientation before staging rotation in Manage Pages.',
        caption: 'Orientation is checked against the actual rendered page before staging a 90-degree rotation in Manage Pages.',
        objectPosition: 'center top',
      },
      {
        src: '/seo/reorder-fillable-pdf-pages-overview.webp',
        alt: 'DullyPDF Manage Pages dialog used to stage page edits, including 90-degree rotation for the active source PDF.',
        caption: 'Manage Pages stages rotation alongside reorder, delete, and insert-from-PDF operations before the active source PDF is rewritten.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-field-list.webp',
        alt: 'DullyPDF field list used to review field metadata after rotating PDF pages.',
        caption: 'After rotation, review the field model because overlays move with the page while signature anchors and image helpers still need verification.',
        objectPosition: 'center top',
      },
    ],
  },
  'split-fillable-pdf-forms': {
    hubImage: {
      src: '/seo/split-fillable-pdf-forms-overview.webp',
      alt: 'DullyPDF Download Specific Pages dialog selecting page 1 from the 1915 fillable PDF for flat output.',
      objectPosition: 'center top',
      eyebrow: 'Selected pages',
    },
    articleFigures: [
      {
        src: '/seo/split-fillable-pdf-forms-overview.webp',
        alt: 'DullyPDF Download Specific Pages dialog selecting page 1 from the 1915 fillable PDF for flat output.',
        caption: 'Download specific pages is the one-off split path: choose the page subset, choose flat or editable output, and keep the active template unchanged.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-field-list.webp',
        alt: 'DullyPDF field list showing reviewed field metadata before selected-page export.',
        caption: 'A split output is safer after the underlying template has reviewed field names, types, mappings, and output behavior.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview after selected-page output has been reviewed.',
        caption: 'Use Manage Pages when the source PDF itself should be trimmed; use selected-page download when only the output should be split.',
        objectPosition: 'center top',
      },
    ],
  },
  'delete-pages-from-fillable-pdf': {
    hubImage: {
      src: '/seo/delete-pages-from-fillable-pdf-overview.webp',
      alt: 'DullyPDF Manage Pages dialog showing page 2 removed from the 1915 fillable PDF.',
      objectPosition: 'center top',
      eyebrow: 'Page deletion',
    },
    articleFigures: [
      {
        src: '/seo/delete-pages-from-fillable-pdf-overview.webp',
        alt: 'DullyPDF Manage Pages dialog showing page 2 removed from the 1915 fillable PDF.',
        caption: 'Manage Pages stages deletion before rewriting the source PDF, so the operator can review the final page count before applying changes.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-field-list.webp',
        alt: 'DullyPDF field list used to review remaining fields after deleting source PDF pages.',
        caption: 'After deleting pages, review the remaining field model so stale fields, broken groups, or missing dependencies do not reach saved workflows.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview after page cleanup and field review.',
        caption: 'Use selected-page download when only the output should omit pages; use Manage Pages when the source template should actually lose pages.',
        objectPosition: 'center top',
      },
    ],
  },
  'compress-fillable-pdf-forms': {
    hubImage: {
      src: '/seo/compress-fillable-pdf-forms-overview.webp',
      alt: 'DullyPDF Compress / Optimize PDF dialog showing lossless cleanup for a fillable PDF.',
      objectPosition: 'center top',
      eyebrow: 'Lossless cleanup',
    },
    articleFigures: [
      {
        src: '/seo/compress-fillable-pdf-forms-overview.webp',
        alt: 'DullyPDF Compress / Optimize PDF dialog showing lossless cleanup for a fillable PDF.',
        caption: 'Compression in DullyPDF is a conservative cleanup pass: rewrite object streams, deflate streams, keep pages and field geometry stable, and avoid larger replacements.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview after page cleanup and final optimization.',
        caption: 'If file size comes from unnecessary pages, remove or split the structure first, then optimize the reviewed template.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-field-list.webp',
        alt: 'DullyPDF field list used to review field metadata after PDF optimization.',
        caption: 'After optimization, field QA still matters because the useful result is a smaller stable template, not compression alone.',
        objectPosition: 'center top',
      },
    ],
  },
  'fill-pdf-link-signature': {
    hubImage: {
      src: '/seo/fill-pdf-link-signature-overview.webp',
      alt: 'DullyPDF Fill By Link to signature preview showing respondent answers materialized into a PDF before signing.',
      objectPosition: 'center top',
      eyebrow: 'Link + sign',
    },
    articleFigures: [
      {
        src: '/seo/fill-pdf-link-signature-overview.webp',
        alt: 'DullyPDF Fill By Link to signature preview showing respondent answers materialized into a PDF before signing.',
        caption: 'The web form collects structured answers first so the final PDF can be materialized before signature.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/Signature.webp',
        alt: 'DullyPDF signing workflow after a filled PDF record is prepared.',
        caption: 'Signature capture belongs in the signing ceremony after the filled record is fixed, not in a generic respondent question.',
        objectPosition: 'center top',
      },
    ],
  },
  'pdf-signature-audit-trail': {
    hubImage: {
      src: '/seo/pdf-signature-audit-trail-overview.webp',
      alt: 'DullyPDF signature audit trail preview showing source hash, signer identity, ceremony time, and verification URL evidence.',
      objectPosition: 'center top',
      eyebrow: 'Audit evidence',
    },
    articleFigures: [
      {
        src: '/seo/pdf-signature-audit-trail-overview.webp',
        alt: 'DullyPDF signature audit trail preview showing source hash, signer identity, ceremony time, and verification URL evidence.',
        caption: 'A useful audit trail starts when the source PDF is frozen before the signing invite is sent.',
        objectPosition: 'center top',
      },
      {
        src: '/seo/pdf-signature-audit-trail-overview.webp',
        alt: 'DullyPDF signature audit trail preview showing retained ceremony, signer, and artifact evidence.',
        caption: 'Completed signing workflows should retain evidence for the owner while keeping the public receipt focused and readable.',
        objectPosition: 'center top',
      },
    ],
  },
  'flat-vs-editable-pdf': {
    hubImage: {
      src: '/seo/flat-vs-editable-pdf-overview.webp',
      alt: 'DullyPDF flat versus editable PDF preview comparing live AcroForm fields with stable rendered output.',
      objectPosition: 'center top',
      eyebrow: 'Output mode',
    },
    articleFigures: [
      {
        src: '/seo/flat-vs-editable-pdf-overview.webp',
        alt: 'DullyPDF flat versus editable PDF preview comparing live AcroForm fields with stable rendered output.',
        caption: 'Editable PDFs are useful when another person must keep working inside live fields in a compatible viewer.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/field-colors-flat-export.png',
        alt: 'Flat PDF output with field values rendered into page content.',
        caption: 'Flat PDFs are usually safer for final records because the values no longer depend on live field rendering.',
        objectPosition: 'center top',
      },
    ],
  },
  'search-fill-pdf-review': {
    hubImage: {
      src: '/seo/search-fill-pdf-review-overview.webp',
      alt: 'DullyPDF Search and Fill review preview showing a selected row mapped into a PDF with pass/fail output checks.',
      objectPosition: 'center top',
      eyebrow: 'Review loop',
    },
    articleFigures: [
      {
        src: '/seo/search-fill-pdf-review-overview.webp',
        alt: 'DullyPDF Search and Fill review preview showing a selected row mapped into a PDF with pass/fail output checks.',
        caption: 'Search & Fill should start from a selected record, not a blind export of every row.',
        objectPosition: 'center top',
      },
      {
        src: '/seo/csv-calc-screenshot.png',
        alt: 'Spreadsheet row source data prepared for Search and Fill PDF review.',
        caption: 'The review step catches mapping and output issues before the document is downloaded, signed, or reused.',
      },
    ],
  },
  'openai-pdf-data-privacy': {
    hubImage: {
      src: '/seo/openai-pdf-data-privacy-overview.webp',
      alt: 'DullyPDF OpenAI data boundary preview showing which PDF workflow context is sent for rename, images, rows, and API fill.',
      objectPosition: 'center top',
      eyebrow: 'AI boundaries',
    },
    articleFigures: [
      {
        src: '/seo/openai-pdf-data-privacy-overview.webp',
        alt: 'DullyPDF OpenAI data boundary preview showing which PDF workflow context is sent for rename, images, rows, and API fill.',
        caption: 'Rename and mapping use PDF and schema context, while Search & Fill row values stay out of those OpenAI requests.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/Extract_Images.webp',
        alt: 'DullyPDF Fill from Images workflow where uploaded source documents are intentionally used as AI input.',
        caption: 'Fill from Images has a different data path because the uploaded source image or document is what the model needs to read.',
        objectPosition: 'center top',
      },
    ],
  },
  'mobile-fillable-pdf-form': {
    hubImage: {
      src: '/demo/mobile-rename-remap.webp',
      alt: 'DullyPDF mobile-friendly rename and remap UI shown on a phone-sized viewport.',
      objectPosition: 'center top',
      eyebrow: 'Mobile UX',
    },
    articleFigures: [
      {
        src: '/demo/mobile-commonforms.webp',
        alt: 'DullyPDF detection step on a mobile-sized viewport.',
        caption: 'The workspace remains usable on phone-sized viewports for owners reviewing fields and templates between desktop sessions.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-field-list.webp',
        alt: 'DullyPDF field list on a mobile-sized viewport.',
        caption: 'Respondents complete a hosted form on their phone instead of editing a downloaded PDF in a mobile viewer.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview rendered after a mobile-collected response.',
        caption: 'The filled PDF is generated on the owner side after collection, with flat output recommended for mobile delivery.',
        objectPosition: 'center top',
      },
    ],
  },
  'stored-fill-by-link-responses': {
    hubImage: {
      src: '/demo/mock-form.webp',
      alt: 'DullyPDF mock respondent form preview representing a submission record that can be reused as a fill source.',
      objectPosition: 'center top',
      eyebrow: 'Stored responses',
    },
    articleFigures: [
      {
        src: '/demo/mock-form.webp',
        alt: 'DullyPDF mock respondent form preview representing a submission record that can be reused as a fill source.',
        caption: 'Each respondent submission stays attached to the saved template or open group instead of disappearing into a one-shot download.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/link-generated.webp',
        alt: 'DullyPDF Fill By Link generated state used to publish a hosted respondent form.',
        caption: 'A published link collects structured responses that the owner can later treat as fill source records.',
        objectPosition: 'center top',
      },
    ],
  },
  'group-api-fill-zip-packet': {
    hubImage: {
      src: '/demo/workflow-library/checkbox-card.webp',
      alt: 'DullyPDF workflow library preview representing the per-template structure that a group ZIP endpoint returns.',
      objectPosition: 'center top',
      eyebrow: 'Group API',
    },
    articleFigures: [
      {
        src: '/demo/workflow-library/checkbox-card.webp',
        alt: 'DullyPDF workflow library preview representing the per-template structure that a group ZIP endpoint returns.',
        caption: 'The group ZIP endpoint keeps each member template as its own PDF inside one response archive.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/create-group.webp',
        alt: 'DullyPDF Create Group UI used to assemble saved templates into a reusable packet workflow.',
        caption: 'The packet endpoint reflects the assembled group: one JSON record fills every member template into per-template PDFs.',
        objectPosition: 'center top',
      },
    ],
  },
  'batch-rename-map-pdf-group': {
    hubImage: {
      src: '/demo/workflow-library/commonforms-card.webp',
      alt: 'DullyPDF detection preview representing the per-template field set that a group rename and map pass cleans up.',
      objectPosition: 'center top',
      eyebrow: 'Group rename + map',
    },
    articleFigures: [
      {
        src: '/demo/workflow-library/commonforms-card.webp',
        alt: 'DullyPDF detection preview representing the per-template field set that a group rename and map pass cleans up.',
        caption: 'Rename + Map Group runs across every saved template in the active group so the packet shares consistent field names.',
        objectPosition: 'center top',
      },
      {
        src: '/seo/ai-pdf-field-renaming-overview.webp',
        alt: 'DullyPDF AI rename and schema mapping dialog for a single PDF template.',
        caption: 'Single-template rename and group-level rename share the same review loop; the group action just spans every member.',
        objectPosition: 'center top',
      },
    ],
  },
  'verify-signed-pdf': {
    hubImage: {
      src: '/demo/workflow-library/field-list-card.webp',
      alt: 'DullyPDF field list preview representing the retained record metadata that the public verification page reflects.',
      objectPosition: 'center top',
      eyebrow: 'Public verification',
    },
    articleFigures: [
      {
        src: '/demo/workflow-library/field-list-card.webp',
        alt: 'DullyPDF field list preview representing the retained record metadata that the public verification page reflects.',
        caption: 'The public verification page reflects retained ceremony metadata without depending on the recipient PDF viewer trust chain.',
        objectPosition: 'center top',
      },
      {
        src: '/seo/pdf-signature-audit-trail-overview.webp',
        alt: 'DullyPDF signature audit trail preview showing retained ceremony, signer, and artifact evidence.',
        caption: 'The validation page is the public surface of the broader audit evidence model retained on the owner side.',
        objectPosition: 'center top',
      },
    ],
  },
  'no-code-pdf-automation': {
    hubImage: {
      src: '/seo/no-code-pdf-automation-overview.webp',
      alt: 'DullyPDF no-code PDF automation preview showing detected fields, saved template state, fill methods, and final output.',
      objectPosition: 'center top',
      eyebrow: 'No-code workflow',
    },
    articleFigures: [
      {
        src: '/seo/no-code-pdf-automation-overview.webp',
        alt: 'DullyPDF no-code PDF automation preview showing detected fields, saved template state, fill methods, and final output.',
        caption: 'No-code PDF automation still begins with a reviewed field model, not blind document output.',
        objectPosition: 'center top',
      },
      {
        src: '/demo/mock-form.webp',
        alt: 'Respondent-facing DullyPDF web form generated from a saved PDF template.',
        caption: 'Once the template is trusted, it can support respondent collection, row-based fill, API generation, groups, or signing.',
        objectPosition: 'center top',
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
      src: '/demo/mobile-filled.webp',
      alt: 'DullyPDF filled PDF preview representing borrower packet output after structured data is applied.',
      eyebrow: 'Borrower mapping',
      objectPosition: 'center top',
    },
    articleFigures: [
      {
        src: '/demo/mobile-filled.webp',
        alt: 'DullyPDF filled PDF preview representing borrower packet output after structured data is applied.',
        caption: 'Loan and finance workflows get more dependable after borrower and disclosure fields are normalized into one stable schema instead of being reinterpreted on each packet.',
        objectPosition: 'center top',
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
      src: '/seo/pdf-signature-audit-trail-overview.webp',
      alt: 'DullyPDF signature audit trail preview representing controlled legal PDF record evidence.',
      eyebrow: 'Record control',
      objectPosition: 'center top',
    },
    articleFigures: [
      {
        src: '/seo/pdf-signature-audit-trail-overview.webp',
        alt: 'DullyPDF signature audit trail preview representing controlled legal PDF record evidence.',
        caption: 'Legal template work becomes safer when the document is normalized before it is routed into review, signature, or archive under deadline pressure.',
        objectPosition: 'center top',
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
      src: '/demo/create-group.webp',
      alt: 'DullyPDF saved-template group manager representing recurring nonprofit intake packet templates.',
      eyebrow: 'Program intake',
      objectPosition: 'center top',
    },
    articleFigures: [
      {
        src: '/demo/create-group.webp',
        alt: 'DullyPDF saved-template group manager representing recurring nonprofit intake packet templates.',
        caption: 'Nonprofit teams often save time when volunteer or client information is collected once and then reused across recurring packet documents.',
        objectPosition: 'center top',
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
      src: '/seo/qr-code-record-lookup-pdf-overview.webp',
      alt: 'DullyPDF logistics-style record lookup preview with a QR code tied to shipment data.',
      eyebrow: 'Shipment output',
      objectPosition: 'center top',
    },
    articleFigures: [
      {
        src: '/seo/qr-code-record-lookup-pdf-overview.webp',
        alt: 'DullyPDF logistics-style record lookup preview with a QR code tied to shipment data.',
        caption: 'Dispatch and back-office teams gain leverage when recurring shipment and receipt documents can be filled from route data instead of rebuilt by hand.',
        objectPosition: 'center top',
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
      src: '/seo/pdf-change-order-calculations-overview.webp',
      alt: 'DullyPDF construction change order calculation preview showing revised total output.',
      eyebrow: 'Project packets',
      objectPosition: 'center top',
    },
    articleFigures: [
      {
        src: '/seo/pdf-change-order-calculations-overview.webp',
        alt: 'DullyPDF construction change order calculation preview showing revised total output.',
        caption: 'Construction workflows become easier to maintain when recurring permit, inspection, and change-order documents are treated as reusable templates instead of ad hoc project files.',
        objectPosition: 'center top',
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
  'manufacturing-pdf-automation': {
    hubImage: {
      src: '/seo/manufacturing-pdf-automation-overview.webp',
      alt: 'DullyPDF manufacturing PDF automation preview with lot barcode and yield calculation fields.',
      objectPosition: 'center center',
      eyebrow: 'Manufacturing templates',
    },
    articleFigures: [
      {
        src: '/seo/manufacturing-pdf-automation-overview.webp',
        alt: 'A manufacturing PDF template preview showing lot barcode, inspection fields, defect count, and yield calculation output.',
        caption: 'Manufacturing templates often need custom fields, lot or batch barcodes, and calculated quality metrics in one reviewed PDF layout.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final manufacturing PDF output after mapped quality values have been applied.',
        caption: 'Inspection and quality forms become easier to reuse when score, pass rate, and yield outputs are calculated from source inputs.',
        objectPosition: 'center top',
      },
    ],
  },
  'field-service-pdf-automation': {
    hubImage: {
      src: '/seo/field-service-pdf-automation-overview.webp',
      alt: 'DullyPDF field service PDF automation preview with service ticket barcode and total due calculation.',
      objectPosition: 'center center',
      eyebrow: 'Field service templates',
    },
    articleFigures: [
      {
        src: '/seo/field-service-pdf-automation-overview.webp',
        alt: 'A field service work order PDF preview showing asset barcode, labor and parts fields, and total due calculation.',
        caption: 'Field service forms are strong candidates for barcode lookup, technician notes, labor and parts calculations, and final customer signoff.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final field service output after mapped work order values have been applied.',
        caption: 'A work order barcode or QR code gives the field team a fast route back to the asset, ticket, or service record.',
        objectPosition: 'center top',
      },
    ],
  },
  'warehouse-inventory-pdf-automation': {
    hubImage: {
      src: '/seo/warehouse-inventory-pdf-automation-overview.webp',
      alt: 'DullyPDF warehouse inventory PDF automation preview with SKU barcode and variance calculation.',
      objectPosition: 'center center',
      eyebrow: 'Warehouse templates',
    },
    articleFigures: [
      {
        src: '/seo/warehouse-inventory-pdf-automation-overview.webp',
        alt: 'A warehouse inventory PDF template preview showing SKU barcode, count fields, and variance calculation.',
        caption: 'Warehouse PDFs often combine SKU or bin barcodes with count sheets, receiving forms, variance calculations, and supervisor review.',
        objectPosition: 'center center',
      },
      {
        src: '/seo/csv-calc-screenshot.png',
        alt: 'Spreadsheet source rows representing warehouse inventory values before barcode and quantity outputs are generated.',
        caption: 'Inventory templates are strongest when barcode fields and quantities come from the same mapped row data.',
      },
    ],
  },
  'procurement-pdf-automation': {
    hubImage: {
      src: '/seo/procurement-pdf-automation-overview.webp',
      alt: 'DullyPDF procurement PDF automation preview with purchase order barcode and PO total calculation.',
      objectPosition: 'center center',
      eyebrow: 'Procurement templates',
    },
    articleFigures: [
      {
        src: '/seo/procurement-pdf-automation-overview.webp',
        alt: 'A procurement PDF template preview showing PO barcode, vendor fields, approval fields, and purchase order total calculation.',
        caption: 'Procurement PDFs benefit from reusable vendor fields, PO barcodes, approval metadata, and total calculations tied to the same record.',
        objectPosition: 'center center',
      },
      {
        src: '/seo/database-schema.png',
        alt: 'Database schema diagram representing procurement source values used to generate purchase order PDFs.',
        caption: 'Purchase orders and quote requests usually need calculations before the final PDF is ready for approval or vendor delivery.',
      },
    ],
  },
  'utilities-energy-pdf-automation': {
    hubImage: {
      src: '/seo/utilities-energy-pdf-automation-overview.webp',
      alt: 'DullyPDF utilities and energy PDF automation preview with meter lookup QR code and usage calculation.',
      objectPosition: 'center center',
      eyebrow: 'Utilities templates',
    },
    articleFigures: [
      {
        src: '/seo/utilities-energy-pdf-automation-overview.webp',
        alt: 'A utilities and energy PDF template preview showing meter QR code, inspection fields, and usage delta calculation.',
        caption: 'Utilities and energy teams often need fixed service forms with asset lookup codes, meter readings, inspection scores, and calculated usage deltas.',
        objectPosition: 'center center',
      },
      {
        src: '/demo/mobile-filled.webp',
        alt: 'Filled PDF preview representing a final utilities or energy service PDF after mapped asset values have been applied.',
        caption: 'QR record lookup works well for meter, site, and asset records that need to connect the PDF back to the operational system.',
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
  ...INDIA_WORKFLOW_VISUAL_ENTRIES,
  ...INDIA_INDUSTRY_VISUAL_ENTRIES,
  ...SPANISH_VISUAL_ENTRIES,
  ...HIGH_INTENT_OPPORTUNITY_VISUAL_ENTRIES,
};
