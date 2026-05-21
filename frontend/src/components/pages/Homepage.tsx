/**
 * Homepage Component for DullyPDF
 *
 * Desktop keeps the original two-panel layout.
 * Mobile shows a dedicated walkthrough-only experience.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import './Homepage.css';
import { CommonFormsAttribution } from '../ui/CommonFormsAttribution';
import { ContactDialog } from '../features/ContactDialog';
import { SiteFooter } from '../ui/SiteFooter';

interface HomepageProps {
  onStartWorkflow: () => void;
  onStartDemo?: () => void;
  userEmail?: string | null;
  authPending?: boolean;
  onSignIn?: () => void;
  onOpenProfile?: () => void;
  market?: HomepageMarket;
}

export type HomepageMarket = 'global' | 'india' | 'spanish';

type DemoWalkthroughStep = {
  id: string;
  title: ReactNode;
  description: ReactNode;
  imageWebp: string;
  imagePng: string;
  alt: string;
};

const GLOBAL_DEMO_WALKTHROUGH: DemoWalkthroughStep[] = [
  {
    id: 'raw-pdf',
    title: 'Start with the raw intake PDF',
    description:
      'Begin with the source form exactly as the clinic provides it. DullyPDF reads the layout before any edits.',
    imageWebp: '/demo/mobile-raw-pdf.webp',
    imagePng: '/demo/mobile-raw-pdf.png',
    alt: 'Raw PDF intake form with blank fields and section headers.',
  },
  {
    id: 'commonforms',
    title: (
      <>
        Candidate fields highlighted with <CommonFormsAttribution />
      </>
    ),
    description:
      'The ML detector finds input regions and labels them with confidence-scored field tags for review.',
    imageWebp: '/demo/mobile-commonforms.webp',
    imagePng: '/demo/mobile-commonforms.png',
    alt: 'Detected fields overlayed on the PDF with CommonForms by jbarrow tag labels.',
  },
  {
    id: 'inspector',
    title: 'Inspector for precise edits',
    description:
      'Use the inspector to add, rename, and adjust text, checkbox, and radio field types without touching the PDF source.',
    imageWebp: '/demo/mobile-inspector.webp',
    imagePng: '/demo/mobile-inspector.png',
    alt: 'Field inspector panel showing add field actions and edit controls.',
  },
  {
    id: 'field-list',
    title: 'Field list to filter and audit',
    description:
      'Review every detected field, filter by confidence, and verify sizes or pages with quick scanning.',
    imageWebp: '/demo/mobile-field-list.webp',
    imagePng: '/demo/mobile-field-list.png',
    alt: 'Field list panel with confidence filters and detected field entries.',
  },
  {
    id: 'rename-remap',
    title: 'OpenAI rename + OpenAI remap',
    description:
      'OpenAI rename standardizes field names, and OpenAI remap aligns them to database columns so the template is ready for repeat fills.',
    imageWebp: '/demo/mobile-rename-remap.webp',
    imagePng: '/demo/mobile-rename-remap.png',
    alt: 'PDF overlay showing standardized field names after rename and remap.',
  },
  {
    id: 'link-generated',
    title: 'Optional public intake with Fill By Link',
    description:
      'After saving the template, publish a DullyPDF link you can send to users so they can submit answers without opening the PDF editor.',
    imageWebp: '/demo/link-generated.webp',
    imagePng: '/demo/link-generated.png',
    alt: 'Generated Fill By Link panel showing a shareable respondent link for the saved template.',
  },
  {
    id: 'mock-form',
    title: 'Respondents fill a mock form, not the PDF',
    description:
      'The public link opens a mobile-friendly HTML form where users submit answers. DullyPDF stores the response so you can generate the PDF later.',
    imageWebp: '/demo/mock-form.webp',
    imagePng: '/demo/mock-form.png',
    alt: 'Mock respondent form showing public question fields that collect answers outside the PDF editor.',
  },
  {
    id: 'extract-images',
    title: 'Optional extraction from images and documents',
    description:
      'Use this when the source data lives in files instead of a row: upload IDs, insurance cards, invoices, pay stubs, tax forms, utility bills, medical records, or similar photos and PDFs, and DullyPDF sends those files plus the named field schema and nearby label text to OpenAI so it can return confidence-scored candidates before the final fill, without sending the template page images themselves.',
    imageWebp: '/demo/Extract_Images.webp',
    imagePng: '/demo/Extract_Images.png',
    alt: 'Fill from information extracted from images and documents dialog showing candidate field values with confidence scores.',
  },
  {
    id: 'filled',
    title: 'Review the filled PDF before output',
    description:
      'Choose a matching database row, a stored respondent submission, or extracted candidates and populate the mapped fields before download or signing.',
    imageWebp: '/demo/mobile-filled.webp',
    imagePng: '/demo/mobile-filled.png',
    alt: 'Completed PDF form with patient data filled into the detected fields.',
  },
  {
    id: 'signature-request',
    title: 'Freeze the exact PDF, then send U.S. e-sign',
    description:
      'When the record is ready, DullyPDF freezes that exact PDF before the signer enters the ceremony and retains the immutable source PDF, final signed PDF, audit receipt, owner audit manifest, hashes, identity and verification state, timestamps, and any disclosure or authority-attestation evidence, which is enough for DullyPDF&apos;s intended U.S. business flow because the exact record and signer actions stay reproducible later.',
    imageWebp: '/demo/Signature.webp',
    imagePng: '/demo/Signature.png',
    alt: 'Signature request dialog showing signing mode, compliance readiness checks, and the immutable PDF send workflow.',
  },
  {
    id: 'create-group',
    title: 'Create groups for full document workflows',
    description:
      'Open a group to search and fill an entire packet, then rename and remap every template in that group at once for larger document workflows.',
    imageWebp: '/demo/create-group.webp',
    imagePng: '/demo/create-group.png',
    alt: 'Create Group workflow showing grouped templates for packet-wide Search and Fill and batch Rename + Map.',
  },
];

const INDIA_DEMO_WALKTHROUGH: DemoWalkthroughStep[] = [
  {
    id: 'raw-pdf',
    title: 'Start with an India operations PDF',
    description:
      'Begin with a KYC, vendor, HR, invoice, school, or clinic PDF exactly as the branch or back-office team receives it.',
    imageWebp: '/demo/mobile-raw-pdf.webp',
    imagePng: '/demo/mobile-raw-pdf.png',
    alt: 'Raw Indian operations PDF with blank fields and section headers.',
  },
  {
    id: 'commonforms',
    title: (
      <>
        Candidate fields highlighted with <CommonFormsAttribution />
      </>
    ),
    description:
      'The ML detector finds input regions and labels them with confidence-scored field tags for review before any India-specific mapping.',
    imageWebp: '/demo/mobile-commonforms.webp',
    imagePng: '/demo/mobile-commonforms.png',
    alt: 'Detected fields overlayed on an operations PDF with CommonForms by jbarrow tag labels.',
  },
  {
    id: 'inspector',
    title: 'Inspector for branch-level cleanup',
    description:
      'Use the inspector to add, rename, and adjust text, checkbox, radio, image, barcode, QR/PDF417, and calculated fields without touching the PDF source.',
    imageWebp: '/demo/mobile-inspector.webp',
    imagePng: '/demo/mobile-inspector.png',
    alt: 'Field inspector panel showing add field actions and edit controls.',
  },
  {
    id: 'field-list',
    title: 'Field list to filter and audit',
    description:
      'Review every detected field, filter by confidence, and verify sizes or pages before the template is used for repeated Indian records.',
    imageWebp: '/demo/mobile-field-list.webp',
    imagePng: '/demo/mobile-field-list.png',
    alt: 'Field list panel with confidence filters and detected field entries.',
  },
  {
    id: 'rename-remap',
    title: 'OpenAI rename + OpenAI remap',
    description:
      'OpenAI rename standardizes field names, and OpenAI remap aligns them to spreadsheet columns such as PAN, GSTIN, vendor code, employee ID, branch, invoice number, or student ID.',
    imageWebp: '/demo/mobile-rename-remap.webp',
    imagePng: '/demo/mobile-rename-remap.png',
    alt: 'PDF overlay showing standardized field names after rename and remap.',
  },
  {
    id: 'link-generated',
    title: 'Optional public intake with Fill By Link',
    description:
      'After saving the template, publish a DullyPDF link for applicants, vendors, employees, patients, students, or branch staff to submit answers without opening the PDF editor.',
    imageWebp: '/demo/link-generated.webp',
    imagePng: '/demo/link-generated.png',
    alt: 'Generated Fill By Link panel showing a shareable respondent link for the saved template.',
  },
  {
    id: 'mock-form',
    title: 'Respondents fill a web form, not the PDF',
    description:
      'The public link opens a mobile-friendly HTML form where users submit answers. DullyPDF stores the response so your team can generate the final PDF later.',
    imageWebp: '/demo/mock-form.webp',
    imagePng: '/demo/mock-form.png',
    alt: 'Mock respondent form showing public question fields that collect answers outside the PDF editor.',
  },
  {
    id: 'extract-images',
    title: 'Optional extraction from India documents',
    description:
      'Use this when the source data lives in files instead of a row: upload PAN cards, GST invoices, bank statements, delivery challans, employee records, school forms, clinic records, or similar photos and PDFs, and DullyPDF sends those files plus the named field schema and nearby label text to OpenAI so it can return confidence-scored candidates before the final fill, without sending the template page images themselves.',
    imageWebp: '/demo/Extract_Images.webp',
    imagePng: '/demo/Extract_Images.png',
    alt: 'Fill from information extracted from images and documents dialog showing candidate field values with confidence scores.',
  },
  {
    id: 'filled',
    title: 'Review the filled PDF before output',
    description:
      'Choose a matching spreadsheet row, a stored respondent submission, or extracted candidates and populate the mapped fields before downloading the final record.',
    imageWebp: '/demo/mobile-filled.webp',
    imagePng: '/demo/mobile-filled.png',
    alt: 'Completed PDF form with record data filled into the detected fields.',
  },
  {
    id: 'ready-output',
    title: 'Download final PDFs for India workflows',
    description:
      'When the KYC, vendor, HR, invoice, education, finance, or clinic record is ready, generate a flat PDF for review, email, archive, or handoff while keeping the cleaned template reusable for the next record.',
    imageWebp: '/demo/field-colors-flat-export.webp',
    imagePng: '/demo/field-colors-flat-export.png',
    alt: 'Flat PDF export preview showing completed fields rendered into the final page.',
  },
  {
    id: 'create-group',
    title: 'Create groups for full packet workflows',
    description:
      'Open a group to search and fill a full packet, then rename and remap every template at once for branch onboarding, vendor setup, admissions, finance, or clinic paperwork.',
    imageWebp: '/demo/create-group.webp',
    imagePng: '/demo/create-group.png',
    alt: 'Create Group workflow showing grouped templates for packet-wide Search and Fill and batch Rename + Map.',
  },
];

const SPANISH_DEMO_WALKTHROUGH: DemoWalkthroughStep[] = [
  {
    id: 'raw-pdf',
    title: 'Empieza con tu PDF operativo',
    description:
      'Usa el formulario PDF tal como lo recibe tu equipo: admisiones, altas, solicitudes, facturas, clínica, escuela o servicio.',
    imageWebp: '/demo/mobile-raw-pdf.webp',
    imagePng: '/demo/mobile-raw-pdf.png',
    alt: 'Formulario PDF en español con campos en blanco y encabezados de sección.',
  },
  {
    id: 'commonforms',
    title: (
      <>
        Campos candidatos resaltados con <CommonFormsAttribution />
      </>
    ),
    description:
      'El detector ML encuentra zonas de entrada y las marca con etiquetas y confianza para revisarlas antes del mapeo.',
    imageWebp: '/demo/mobile-commonforms.webp',
    imagePng: '/demo/mobile-commonforms.png',
    alt: 'Campos detectados sobre un formulario PDF con etiquetas de CommonForms by jbarrow.',
  },
  {
    id: 'inspector',
    title: 'Inspector para limpiar la plantilla',
    description:
      'Agrega, renombra y ajusta campos de texto, casillas, radios, imágenes, códigos, QR/PDF417 y cálculos sin modificar el PDF fuente.',
    imageWebp: '/demo/mobile-inspector.webp',
    imagePng: '/demo/mobile-inspector.png',
    alt: 'Panel inspector de campos con acciones para agregar y editar campos.',
  },
  {
    id: 'field-list',
    title: 'Lista de campos para auditar',
    description:
      'Revisa cada campo detectado, filtra por confianza y valida páginas o tamaños antes de reutilizar el formulario PDF rellenable.',
    imageWebp: '/demo/mobile-field-list.webp',
    imagePng: '/demo/mobile-field-list.png',
    alt: 'Lista de campos con filtros de confianza y entradas detectadas.',
  },
  {
    id: 'rename-remap',
    title: 'OpenAI renombra y mapea',
    description:
      'OpenAI normaliza nombres de campos y los alinea con columnas como nombre, documento, cliente, factura, expediente, fecha o total.',
    imageWebp: '/demo/mobile-rename-remap.webp',
    imagePng: '/demo/mobile-rename-remap.png',
    alt: 'Formulario PDF con nombres de campos normalizados después de renombrar y mapear.',
  },
  {
    id: 'link-generated',
    title: 'Captura opcional con Fill By Link',
    description:
      'Guarda la plantilla y publica un enlace DullyPDF para que clientes, pacientes, alumnos, proveedores o empleados envíen respuestas.',
    imageWebp: '/demo/link-generated.webp',
    imagePng: '/demo/link-generated.png',
    alt: 'Panel de Fill By Link con enlace compartible para una plantilla guardada.',
  },
  {
    id: 'mock-form',
    title: 'Los usuarios llenan un formulario web',
    description:
      'El enlace abre un formulario HTML apto para móvil. DullyPDF guarda la respuesta para generar el PDF final después de revisarla.',
    imageWebp: '/demo/mock-form.webp',
    imagePng: '/demo/mock-form.png',
    alt: 'Formulario web de respuesta con preguntas públicas fuera del editor PDF.',
  },
  {
    id: 'extract-images',
    title: 'Extracción opcional desde documentos',
    description:
      'Cuando los datos vienen en archivos, sube identificaciones, facturas, recibos, contratos, historiales, órdenes, solicitudes o fotos. DullyPDF envía esos archivos, el esquema de campos y texto cercano a OpenAI para devolver candidatos con confianza antes del llenado final, sin enviar imágenes de la plantilla.',
    imageWebp: '/demo/Extract_Images.webp',
    imagePng: '/demo/Extract_Images.png',
    alt: 'Diálogo para llenar desde información extraída de imágenes y documentos con candidatos y confianza.',
  },
  {
    id: 'filled',
    title: 'Revisa el PDF rellenado',
    description:
      'Elige una fila de Excel o CSV, una respuesta guardada o candidatos extraídos, y completa los campos mapeados antes de descargar.',
    imageWebp: '/demo/mobile-filled.webp',
    imagePng: '/demo/mobile-filled.png',
    alt: 'Formulario PDF completado con datos en los campos detectados.',
  },
  {
    id: 'ready-output',
    title: 'Descarga PDFs finales para tu flujo',
    description:
      'Cuando el registro esté listo, genera un PDF plano para revisión, email, archivo o entrega, y conserva la plantilla limpia para el siguiente caso.',
    imageWebp: '/demo/field-colors-flat-export.webp',
    imagePng: '/demo/field-colors-flat-export.png',
    alt: 'Vista previa de exportacion PDF plana con campos completados en la pagina final.',
  },
  {
    id: 'create-group',
    title: 'Crea grupos para paquetes completos',
    description:
      'Abre un grupo para buscar y llenar un paquete completo, luego renombra y mapea todas las plantillas para admisiones, clientes, RR. HH., finanzas o servicio.',
    imageWebp: '/demo/create-group.webp',
    imagePng: '/demo/create-group.png',
    alt: 'Flujo Create Group con plantillas agrupadas para Search and Fill y Rename plus Map.',
  },
];

type HomepageFeature = {
  title: ReactNode;
  description: ReactNode;
};

type HomepageLaunchReviewCopy = {
  cardTitle: string;
  cardDescription: string;
  linksLabel: string;
  mobileKicker: string;
  mobileHeading: string;
  mobileDescription: string;
};

type HomepageCopy = {
  mobileTagline: string;
  titleLines: ReactNode[];
  leadDescription: ReactNode;
  featuresTitle: string;
  features: HomepageFeature[];
  mobileDemoHeading: string;
  mobileDemoDescription: ReactNode;
  ctaTitle: string;
  ctaDescription: (onContactClick: () => void) => ReactNode;
  secondaryIntro: ReactNode;
  secondaryCta: {
    href: string;
    label: string;
  };
  workflowButtonLabel: string;
  demoButtonLabel: string;
  mobileWarning: string;
  mobileDemoButtonLabel: string;
  mobileContactButtonLabel: string;
  mobileLegalLinkLabel: string;
  demoKicker: string;
  mobileDemoStepLabel: (step: number, total: number) => string;
  previousDemoAriaLabel: string;
  nextDemoAriaLabel: string;
  profileLabel: string;
  signInLabel: string;
  quickInfoViewLabel: string;
  launchReview: HomepageLaunchReviewCopy;
  quickInfo: Array<
    | { kind: 'text'; label: string; value: string }
    | { kind: 'link'; label: string; value: string; href: string; ariaLabel: string }
  >;
};

const GLOBAL_FEATURES: HomepageFeature[] = [
  {
    title: 'PDF to Form with AI-Powered Field Detection',
    description:
      'The detection pipeline analyzes your PDF and automatically identifies potential form fields with confidence scoring and field names pulled from nearby labels.',
  },
  {
    title: 'Editing, PDF Tools, and Smart Fields',
    description:
      'Review detected fields, then resize, rename, reposition, style fonts/sizes/colors, merge, delete pages, compress PDFs, add image or barcode helpers, and configure calculated outputs.',
  },
  {
    title: 'Publish Fill By Link, API Fill, or Connect Local Data',
    description:
      'Save the template, then either publish a DullyPDF Fill By Link web form for clients to answer, expose a template-scoped API Fill endpoint, or upload a CSV/Excel/JSON/TXT schema file to map PDF fields to database headers for Search & Fill.',
  },
  {
    title: 'Search, Fill from Images, Generate, or Route Into U.S. E-Sign',
    description:
      "Choose a matching database row, a stored respondent submission, or upload images and documents like IDs, invoices, pay stubs, or records. DullyPDF fills the template from those sources, generates the PDF only when you download it, or routes eligible records into DullyPDF's supported U.S. e-sign workflow.",
  },
];

const INDIA_FEATURES: HomepageFeature[] = [
  {
    title: 'PDF to Form for Indian Operations',
    description:
      'Analyze KYC, vendor setup, HR joining, GST invoice, school, finance, clinic, and branch PDFs, then review confidence-scored fields before saving a reusable template.',
  },
  {
    title: 'Editing, PDF Tools, and Smart Fields',
    description:
      'Resize, rename, reposition, style fonts/sizes/colors, merge, delete pages, compress PDFs, add image or barcode helpers, and configure calculated outputs for the exact PDF your team uses.',
  },
  {
    title: 'Collect India Data by Link, API, or Local Files',
    description:
      'Publish a Fill By Link web form, expose a template-scoped API Fill endpoint, or upload CSV/Excel/JSON/TXT files with applicant, vendor, employee, student, patient, branch, or invoice columns.',
  },
  {
    title: 'Search, Extract, Review, and Download Final PDFs',
    description:
      'Choose a spreadsheet row, stored respondent submission, or extracted candidates from PAN, GST, invoice, bank, delivery, employee, school, or clinic documents, then generate the final PDF when needed.',
  },
];

const SPANISH_FEATURES: HomepageFeature[] = [
  {
    title: 'PDF a formulario rellenable con detección por IA',
    description:
      'Analiza tu PDF y detecta posibles campos con puntuación de confianza y nombres sugeridos desde las etiquetas cercanas.',
  },
  {
    title: 'Editor, herramientas PDF y campos inteligentes',
    description:
      'Revisa campos, ajusta tamaño y posición, renombra, cambia fuentes, une o elimina páginas, comprime PDFs y agrega imágenes, códigos o cálculos.',
  },
  {
    title: 'Publica Fill By Link, API Fill o conecta datos locales',
    description:
      'Guarda la plantilla, publica un formulario web, expone un endpoint JSON-a-PDF o sube CSV/Excel/JSON/TXT para mapear columnas y rellenar PDFs.',
  },
  {
    title: 'Busca, extrae, revisa y genera PDFs finales',
    description:
      'Elige una fila, una respuesta guardada o candidatos extraídos desde documentos; DullyPDF rellena la plantilla y genera el PDF solo al descargar.',
  },
];

const HOMEPAGE_COPY: Record<HomepageMarket, HomepageCopy> = {
  global: {
    mobileTagline: 'Automatic PDF->Template',
    titleLines: [
      'Automatic PDF to Fillable Forms, Fill By Link or API,',
      'Database Map Fields and U.S. E-Sign Workflows',
    ],
    leadDescription: (
      <>
        DullyPDF converts raw PDFs into fillable forms using{' '}
        <CommonFormsAttribution />{' '}
        for field detection with writable areas at input fields. Editor fields can be text, checkbox, radio, date,
        signature, image, barcode, QR/PDF417, or calculated, with global or per-field fonts, sizes, colors, and
        alignment. Once your form is ready, upload CSV, Excel, JSON, or TXT schema files, map PDF fields to database
        headers, and fill the PDF from Search &amp; Fill rows; publish a DullyPDF Fill By Link form so responses can
        fill the PDF later; expose API Fill; or route supported records into U.S. e-sign workflows. Database rows stay
        in browser for Search &amp; Fill.
      </>
    ),
    featuresTitle: 'Complete Workflow Process',
    features: GLOBAL_FEATURES,
    mobileDemoHeading: 'See the pipeline on mobile',
    mobileDemoDescription:
      'Use the arrows to move through detection, template cleanup, intake options, extraction, final fill, and the immutable e-sign handoff.',
    ctaTitle: 'Build, Share, Fill and Sign',
    ctaDescription: (onContactClick) => (
      <>
        Detect fields on any PDF with AI, then reuse the same template to bulk fill from CSV or Excel, publish a hosted
        Fill By Link web form, expose a JSON-to-PDF API, extract from photos of IDs and scanned documents, or route into
        a U.S. E-SIGN/UETA e-signature.{' '}Questions?{' '}
        <button
          type="button"
          className="cta-description-contact"
          onClick={onContactClick}
        >
          Contact me
        </button>
        .
      </>
    ),
    secondaryIntro:
      'Pre-Made Form Catalog has fillable templates from every major industry: healthcare, insurance and ACORD, HR onboarding, finance and loans, real estate and leases, legal, logistics, government and tax, education, and nonprofits. Optionally open in the DullyPDF UI for form workflows.',
    secondaryCta: {
      href: '/forms',
      label: 'Go to the Pre-Made Form Catalog',
    },
    workflowButtonLabel: 'Detect Fields & Open the Form Workspace',
    demoButtonLabel: 'See an Interactive Demo',
    mobileWarning:
      'mobile device detected, please open on computer for full functionality. Mobile site is for explanation and demo only',
    mobileDemoButtonLabel: 'Demo',
    mobileContactButtonLabel: 'Contact',
    mobileLegalLinkLabel: 'Docs & Privacy & Terms',
    demoKicker: 'Demo walkthrough',
    mobileDemoStepLabel: (step, total) => `Step ${step} of ${total}`,
    previousDemoAriaLabel: 'Previous demo step',
    nextDemoAriaLabel: 'Next demo step',
    profileLabel: 'Profile',
    signInLabel: 'Sign in',
    quickInfoViewLabel: 'View',
    launchReview: {
      cardTitle: 'Launches / Review',
      cardDescription: 'Free users can help by liking DullyPDF or leaving an honest review.',
      linksLabel: 'Links:',
      mobileKicker: 'Official links',
      mobileHeading: 'Review DullyPDF',
      mobileDescription:
        'Free users can help by liking DullyPDF or leaving an honest review on the public launch and review pages.',
    },
    quickInfo: [
      { kind: 'text', label: 'Supported:', value: 'PDF files up to 50MB' },
      {
        kind: 'link',
        label: 'Free Feats:',
        value: 'Unlimited PDF to form and form builder',
        href: '/free-features',
        ariaLabel: 'View free features',
      },
      {
        kind: 'link',
        label: 'Premium Feats:',
        value: 'High usage for all DullyPDF features.',
        href: '/premium-features',
        ariaLabel: 'View premium features',
      },
    ],
  },
  india: {
    mobileTagline: 'India PDF workflows',
    titleLines: [
      'India PDF Form Automation for KYC, Vendor, HR, and Invoice Workflows',
      'Fill By Link, API Fill, and CSV/Excel Search & Fill',
    ],
    leadDescription: (
      <>
        DullyPDF helps India teams convert KYC, vendor onboarding, HR joining, invoice, education, finance, and clinic
        PDFs into reusable fillable templates using <CommonFormsAttribution /> for field detection with writable areas
        at input fields. Editor fields can be text, checkbox, radio, date, image, barcode, QR/PDF417, or calculated,
        with global or per-field fonts, sizes, colors, and alignment. After cleanup, upload CSV, Excel, JSON, or TXT
        files with applicant, employee, student, patient, vendor, GST invoice, branch, or loan data; map PDF fields to
        local schema headers; fill PDFs from Search &amp; Fill rows; publish a DullyPDF Fill By Link intake form; or
        expose API Fill for internal systems. Search &amp; Fill rows stay in browser.
      </>
    ),
    featuresTitle: 'India Workflow Process',
    features: INDIA_FEATURES,
    mobileDemoHeading: 'See the India pipeline on mobile',
    mobileDemoDescription:
      'Use the arrows to move through detection, branch-ready template cleanup, intake options, India document extraction, final output, and grouped packet setup.',
    ctaTitle: 'Build India PDF Workflows',
    ctaDescription: (onContactClick) => (
      <>
        Detect fields on KYC, vendor, HR, invoice, school, clinic, finance, or government-style PDFs with AI. Reuse the
        template to bulk fill from CSV or Excel, publish Fill By Link, expose API Fill, or extract values from scanned
        IDs and records.{' '}Questions?{' '}
        <button
          type="button"
          className="cta-description-contact"
          onClick={onContactClick}
        >
          Contact me
        </button>
        .
      </>
    ),
    secondaryIntro:
      'India examples: map PAN, GSTIN, vendor codes, employee IDs, admissions, loan files, clinic intake, delivery challans, purchase orders, or branch spreadsheets into stable PDFs. Start with Excel or KYC, then compare adjacent India workflows.',
    secondaryCta: {
      href: '/in/fill-pdf-from-excel',
      label: 'View the Excel Workflow',
    },
    workflowButtonLabel: 'Detect Fields & Open the Form Workspace',
    demoButtonLabel: 'See an Interactive Demo',
    mobileWarning:
      'mobile device detected, please open on computer for full functionality. Mobile site is for explanation and demo only',
    mobileDemoButtonLabel: 'Demo',
    mobileContactButtonLabel: 'Contact',
    mobileLegalLinkLabel: 'Docs & Privacy & Terms',
    demoKicker: 'Demo walkthrough',
    mobileDemoStepLabel: (step, total) => `Step ${step} of ${total}`,
    previousDemoAriaLabel: 'Previous demo step',
    nextDemoAriaLabel: 'Next demo step',
    profileLabel: 'Profile',
    signInLabel: 'Sign in',
    quickInfoViewLabel: 'View',
    launchReview: {
      cardTitle: 'Launches / Review',
      cardDescription: 'Free users can help by liking DullyPDF or leaving an honest review.',
      linksLabel: 'Links:',
      mobileKicker: 'Official links',
      mobileHeading: 'Review DullyPDF',
      mobileDescription:
        'Free users can help by liking DullyPDF or leaving an honest review on the public launch and review pages.',
    },
    quickInfo: [
      { kind: 'text', label: 'Supported:', value: 'PDF files up to 50MB' },
      {
        kind: 'link',
        label: 'Free Feats:',
        value: 'Detection, templates, links, and API trials',
        href: '/free-features',
        ariaLabel: 'View free features',
      },
      {
        kind: 'link',
        label: 'Premium Feats:',
        value: 'Higher template, API, and link limits',
        href: '/premium-features',
        ariaLabel: 'View premium features',
      },
    ],
  },
  spanish: {
    mobileTagline: 'PDF a plantilla',
    titleLines: [
      'Crear formularios PDF rellenables con IA',
      'Rellenar PDFs con CSV, Excel, Fill By Link o API',
    ],
    leadDescription: (
      <>
        DullyPDF convierte PDFs existentes en formularios PDF rellenables usando <CommonFormsAttribution /> para
        detectar campos editables en las zonas de entrada. Los campos del editor pueden ser texto, casilla, radio,
        fecha, imagen, código de barras, QR/PDF417 o cálculo, con fuentes, tamaños, colores y alineación globales o por
        campo. Cuando la plantilla esté lista, sube archivos CSV, Excel, JSON o TXT, mapea campos PDF a columnas de tu
        base de datos y rellena el PDF desde filas de Search &amp; Fill; publica un formulario Fill By Link para recibir
        respuestas; o expone API Fill para sistemas internos. Reutiliza la misma plantilla para cada nuevo registro,
        lote o paquete sin repetir la detección inicial. Las filas de Search &amp; Fill permanecen en el navegador.
      </>
    ),
    featuresTitle: 'Proceso completo para formularios PDF',
    features: SPANISH_FEATURES,
    mobileDemoHeading: 'Mira el flujo en móvil',
    mobileDemoDescription:
      'Usa las flechas para ver detección, limpieza de plantilla, captura por enlace, extracción, revisión final y paquetes.',
    ctaTitle: 'Crear, compartir y rellenar PDFs',
    ctaDescription: (onContactClick) => (
      <>
        Detecta campos en cualquier PDF con IA y reutiliza la plantilla para rellenar desde CSV o Excel, publicar un
        formulario Fill By Link, exponer una API JSON-a-PDF o extraer valores desde fotos, identificaciones, facturas y
        documentos escaneados.{' '}¿Preguntas?{' '}
        <button
          type="button"
          className="cta-description-contact"
          onClick={onContactClick}
        >
          Contacto
        </button>
        .
      </>
    ),
    secondaryIntro:
      'Para búsquedas en español: formularios PDF rellenables de admisión, inscripción, alta de clientes, solicitudes, órdenes de trabajo, autorizaciones, presupuestos, facturas, contratos de servicio, expedientes escolares, clínica y RR. HH. También cubre hojas a PDF, CSV a PDF y formularios PDF con API. Revisa la documentación para preparar una plantilla limpia.',
    secondaryCta: {
      href: '/es/usage-docs/getting-started',
      label: 'Ver la documentación de uso',
    },
    workflowButtonLabel: 'Detectar campos y abrir el editor',
    demoButtonLabel: 'Ver demo interactiva',
    mobileWarning:
      'dispositivo móvil detectado; abre DullyPDF en una computadora para usar todas las funciones. Esta vista móvil solo explica el flujo.',
    mobileDemoButtonLabel: 'Demo',
    mobileContactButtonLabel: 'Contacto',
    mobileLegalLinkLabel: 'Docs, privacidad y términos',
    demoKicker: 'Recorrido demo',
    mobileDemoStepLabel: (step, total) => `Paso ${step} de ${total}`,
    previousDemoAriaLabel: 'Paso anterior de la demo',
    nextDemoAriaLabel: 'Paso siguiente de la demo',
    profileLabel: 'Perfil',
    signInLabel: 'Iniciar sesión',
    quickInfoViewLabel: 'Ver',
    launchReview: {
      cardTitle: 'Lanzamientos / reseñas',
      cardDescription: 'Los usuarios gratis pueden apoyar a DullyPDF con una reseña honesta.',
      linksLabel: 'Enlaces:',
      mobileKicker: 'Enlaces oficiales',
      mobileHeading: 'Reseña DullyPDF',
      mobileDescription:
        'Los usuarios gratis pueden apoyar a DullyPDF dejando una reseña honesta en las páginas públicas.',
    },
    quickInfo: [
      { kind: 'text', label: 'Compatible:', value: 'PDFs de hasta 50MB' },
      {
        kind: 'link',
        label: 'Gratis:',
        value: 'Detección, plantillas, enlaces y API de prueba',
        href: '/free-features',
        ariaLabel: 'Ver funciones gratis',
      },
      {
        kind: 'link',
        label: 'Premium:',
        value: 'Más límites para plantillas, API y enlaces',
        href: '/premium-features',
        ariaLabel: 'Ver funciones premium',
      },
    ],
  },
};

const HOMEPAGE_LAYOUT_READY_ATTRIBUTE = 'data-homepage-layout-ready';
const HOMEPAGE_HYDRATION_COVER_ATTRIBUTE = 'data-homepage-hydration-cover';
const HOMEPAGE_HYDRATION_COVER_ELEMENT_ID = 'homepage-hydration-cover';

type LaunchReviewLink = {
  label: string;
  href: string;
  variant: string;
  imageSrc?: string;
  imageAlt?: string;
};

const LAUNCH_REVIEW_LINKS: LaunchReviewLink[] = [
  {
    label: 'SaaSCity',
    href: 'https://saascity.io/live/dullypdf',
    variant: 'saascity',
    imageSrc: 'https://saascity.io/badges/featured-dark.svg',
    imageAlt: 'Featured on SaaSCity',
  },
  {
    label: 'G2',
    href: 'https://www.g2.com/products/dullypdf/reviews',
    variant: 'g2',
  },
  {
    label: 'Product Hunt',
    href: 'https://www.producthunt.com/products/dullypdf/reviews/new',
    variant: 'product-hunt',
    imageSrc: 'https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=950935&theme=light',
    imageAlt: 'Find us on Product Hunt',
  },
  {
    label: 'GitHub',
    href: 'https://github.com/justin-thakral/DullyPDF',
    variant: 'github',
  },
];

type LaunchReviewLinksProps = {
  className: string;
  linkClassName: string;
  textOnly?: boolean;
};

const LaunchReviewLinks = ({ className, linkClassName, textOnly = false }: LaunchReviewLinksProps) => (
  <div className={className}>
    {LAUNCH_REVIEW_LINKS.map((link) => (
      <a
        key={link.href}
        className={`${linkClassName} ${linkClassName}--${link.variant}${!textOnly && link.imageSrc ? ` ${linkClassName}--badge` : ''}`}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={textOnly ? undefined : link.imageAlt ?? link.label}
      >
        {!textOnly && link.imageSrc ? (
          <img
            className="launch-review-badge-image"
            src={link.imageSrc}
            alt={link.imageAlt}
            width={link.variant === 'product-hunt' ? 250 : 150}
            height={54}
            loading="lazy"
            decoding="async"
          />
        ) : (
          link.label
        )}
      </a>
    ))}
  </div>
);

const LaunchReviewCard = ({ copy }: { copy: HomepageLaunchReviewCopy }) => (
  <div className="launch-review-card" aria-labelledby="launch-review-title">
    <div className="launch-review-copy-row">
      <span className="launch-review-title" id="launch-review-title">
        {copy.cardTitle}
      </span>
      <span className="launch-review-copy">
        {copy.cardDescription}
      </span>
    </div>
    <div className="launch-review-links-row">
      <span className="launch-review-links-label">{copy.linksLabel}</span>
      <LaunchReviewLinks className="launch-review-links" linkClassName="launch-review-link" />
    </div>
  </div>
);

const MobileLaunchReviewSection = ({ copy }: { copy: HomepageLaunchReviewCopy }) => (
  <section className="homepage-mobile-launch-links" aria-labelledby="homepage-mobile-launch-links-title">
    <p className="mobile-launch-kicker">{copy.mobileKicker}</p>
    <h3 id="homepage-mobile-launch-links-title">{copy.mobileHeading}</h3>
    <p>
      {copy.mobileDescription}
    </p>
    <LaunchReviewLinks
      className="homepage-mobile-launch-list"
      linkClassName="homepage-mobile-launch-link"
      textOnly
    />
  </section>
);

/**
 * Landing page describing the end-to-end workflow.
 */
const Homepage: React.FC<HomepageProps> = ({
  onStartWorkflow,
  onStartDemo,
  userEmail,
  authPending,
  onSignIn,
  onOpenProfile,
  market = 'global',
}) => {
  const demoRef = useRef<HTMLDivElement | null>(null);
  const demoNavRef = useRef<HTMLDivElement | null>(null);
  const descriptionPanelRef = useRef<HTMLDivElement | null>(null);
  const descriptionContentRef = useRef<HTMLDivElement | null>(null);
  const actionPanelRef = useRef<HTMLDivElement | null>(null);
  const actionContentRef = useRef<HTMLDivElement | null>(null);
  const [activeDemoIndex, setActiveDemoIndex] = useState(0);
  const [demoFocusActive, setDemoFocusActive] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [desktopFitScale, setDesktopFitScale] = useState(1);
  const [desktopActionScale, setDesktopActionScale] = useState(1);
  const userInitial = useMemo(() => (userEmail ? userEmail.charAt(0).toUpperCase() : null), [userEmail]);
  const activeMarket: HomepageMarket = market === 'india' || market === 'spanish' ? market : 'global';
  const homepageCopy = HOMEPAGE_COPY[activeMarket];
  const demoWalkthrough = activeMarket === 'india'
    ? INDIA_DEMO_WALKTHROUGH
    : activeMarket === 'spanish'
      ? SPANISH_DEMO_WALKTHROUGH
      : GLOBAL_DEMO_WALKTHROUGH;

  const activeStep = demoWalkthrough[activeDemoIndex];
  const hasPrev = activeDemoIndex > 0;
  const hasNext = activeDemoIndex < demoWalkthrough.length - 1;

  const pendingScrollBehavior = useRef<ScrollBehavior | null>(null);

  const scrollDemoToViewportBottom = (behavior: ScrollBehavior) => {
    if (typeof window === 'undefined') return;

    // On mobile we keep the demo card pinned to the bottom of the viewport while stepping.
    // This avoids scrolling all the way to the page footer (which sits below the demo).
    const anchor = demoNavRef.current ?? demoRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const anchorBottom = rect.bottom + window.scrollY;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const targetTop = Math.min(maxScroll, Math.max(0, anchorBottom - window.innerHeight));
    window.scrollTo({ top: targetTop, behavior });
  };

  const requestBottomScroll = (behavior: ScrollBehavior) => {
    pendingScrollBehavior.current = behavior;
    scrollDemoToViewportBottom(behavior);
  };

  const handleScrollToDemo = () => {
    setDemoFocusActive(true);
    requestBottomScroll('smooth');
  };

  const handlePrevStep = () => {
    setDemoFocusActive(true);
    setActiveDemoIndex((prev) => Math.max(0, prev - 1));
    requestBottomScroll('auto');
  };

  const handleNextStep = () => {
    setDemoFocusActive(true);
    setActiveDemoIndex((prev) => Math.min(demoWalkthrough.length - 1, prev + 1));
    requestBottomScroll('auto');
  };

  const handleOpenContact = () => {
    setContactOpen(true);
  };

  const handleCloseContact = () => {
    setContactOpen(false);
  };

  const computeDesktopFitScale = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 1020px)').matches) {
      setDesktopFitScale(1);
      setDesktopActionScale(1);
      return;
    }

    const leftPanel = descriptionPanelRef.current;
    const leftContent = descriptionContentRef.current;
    const rightPanel = actionPanelRef.current;
    const rightContent = actionContentRef.current;
    if (!leftPanel || !leftContent || !rightPanel || !rightContent) return;

    const leftMinVisualGap = 36;
    const rightMinVisualGap = 48;
    const fitSafetyOffset = 8;
    const leftTargetHeight = Math.max(0, leftPanel.clientHeight - leftMinVisualGap - fitSafetyOffset);
    const rightTargetHeight = Math.max(0, rightPanel.clientHeight - rightMinVisualGap - fitSafetyOffset);
    const leftRatio = leftContent.scrollHeight > 0 ? leftTargetHeight / leftContent.scrollHeight : 1;
    const rightRatio = rightContent.scrollHeight > 0 ? rightTargetHeight / rightContent.scrollHeight : 1;

    const minScale =
      window.innerHeight <= 680
        ? 0.72
        : window.innerHeight <= 760
          ? 0.78
          : window.innerHeight <= 900
            ? 0.84
            : 0.9;
    let nextScale = Math.max(minScale, Math.min(1, leftRatio, rightRatio));
    if (nextScale >= 0.993 && window.innerWidth >= 1536 && window.innerHeight <= 1020) {
      nextScale = 0.988;
    }
    const roundedScale = Number(nextScale.toFixed(3));
    setDesktopFitScale((prev) => (Math.abs(prev - roundedScale) < 0.004 ? prev : roundedScale));

    const leftPanelRect = leftPanel.getBoundingClientRect();
    const rightPanelRect = rightPanel.getBoundingClientRect();
    const leftPanelStyles = window.getComputedStyle(leftPanel);
    const rightPanelStyles = window.getComputedStyle(rightPanel);
    const leftVisualTop = leftPanelRect.top + (parseFloat(leftPanelStyles.paddingTop) || 0);
    const rightVisualTop = rightPanelRect.top + (parseFloat(rightPanelStyles.paddingTop) || 0);
    const leftVisualBottom = leftVisualTop + leftContent.scrollHeight * roundedScale;
    const targetRightHeight = Math.max(0, leftVisualBottom - rightVisualTop);
    const rawActionScale = rightContent.scrollHeight > 0 ? targetRightHeight / rightContent.scrollHeight : roundedScale;
    const minActionScale =
      window.innerHeight <= 680
        ? 0.68
        : window.innerHeight <= 760
          ? 0.72
          : window.innerHeight <= 900
            ? 0.76
            : 0.82;
    const maxActionScale = activeMarket !== 'global' && window.innerWidth >= 1440
      ? 1.14
      : window.innerWidth >= 1440
        ? 1.06
        : 1;
    const nextActionScale = Math.max(minActionScale, Math.min(maxActionScale, rawActionScale));
    const roundedActionScale = Number(nextActionScale.toFixed(3));
    setDesktopActionScale((prev) => (Math.abs(prev - roundedActionScale) < 0.004 ? prev : roundedActionScale));
  }, [activeMarket]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 1020px)');
    const heightQuery = window.matchMedia('(max-height: 700px)');
    const updateScrollLock = () => {
      const shouldLockScroll = !mediaQuery.matches && !heightQuery.matches;
      document.documentElement.classList.toggle('homepage-no-scroll', shouldLockScroll);
      document.body.classList.toggle('homepage-no-scroll', shouldLockScroll);
    };

    updateScrollLock();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateScrollLock);
      heightQuery.addEventListener('change', updateScrollLock);
    } else {
      const legacyMediaQuery = mediaQuery as MediaQueryList & {
        addListener: (listener: (event: MediaQueryListEvent) => void) => void;
        removeListener: (listener: (event: MediaQueryListEvent) => void) => void;
      };
      const legacyHeightQuery = heightQuery as MediaQueryList & {
        addListener: (listener: (event: MediaQueryListEvent) => void) => void;
        removeListener: (listener: (event: MediaQueryListEvent) => void) => void;
      };
      legacyMediaQuery.addListener(updateScrollLock);
      legacyHeightQuery.addListener(updateScrollLock);
    }
    window.addEventListener('resize', updateScrollLock);
    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', updateScrollLock);
        heightQuery.removeEventListener('change', updateScrollLock);
      } else {
        const legacyMediaQuery = mediaQuery as MediaQueryList & {
          addListener: (listener: (event: MediaQueryListEvent) => void) => void;
          removeListener: (listener: (event: MediaQueryListEvent) => void) => void;
        };
        const legacyHeightQuery = heightQuery as MediaQueryList & {
          addListener: (listener: (event: MediaQueryListEvent) => void) => void;
          removeListener: (listener: (event: MediaQueryListEvent) => void) => void;
        };
        legacyMediaQuery.removeListener(updateScrollLock);
        legacyHeightQuery.removeListener(updateScrollLock);
      }
      window.removeEventListener('resize', updateScrollLock);
      document.documentElement.classList.remove('homepage-no-scroll');
      document.body.classList.remove('homepage-no-scroll');
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 1020px)').matches) return;
    if (!demoFocusActive) return;
    const behavior = pendingScrollBehavior.current ?? 'auto';
    pendingScrollBehavior.current = null;
    const raf = requestAnimationFrame(() => {
      scrollDemoToViewportBottom(behavior);
    });
    const timeout = window.setTimeout(() => {
      scrollDemoToViewportBottom(behavior);
    }, 150);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [activeDemoIndex, demoFocusActive]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rafId = 0;
    const scheduleFitCheck = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        computeDesktopFitScale();
      });
    };

    scheduleFitCheck();
    window.addEventListener('resize', scheduleFitCheck);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof window.ResizeObserver === 'function') {
      resizeObserver = new window.ResizeObserver(() => {
        scheduleFitCheck();
      });
      if (descriptionPanelRef.current) resizeObserver.observe(descriptionPanelRef.current);
      if (actionPanelRef.current) resizeObserver.observe(actionPanelRef.current);
      if (descriptionContentRef.current) resizeObserver.observe(descriptionContentRef.current);
      if (actionContentRef.current) resizeObserver.observe(actionContentRef.current);
    }

    if (typeof document !== 'undefined' && 'fonts' in document && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        scheduleFitCheck();
      });
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleFitCheck);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [computeDesktopFitScale]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    let cancelled = false;
    const waitForNextFrame = () => new Promise<void>((resolve) => {
      if (typeof window === 'undefined') {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => resolve());
    });

    const markInitialLayoutReady = async () => {
      if ('fonts' in document && document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // Ignore font readiness errors and continue to the frame barrier.
        }
      }

      // The desktop homepage applies a measured fit scale after mount and again
      // after fonts resolve. Waiting a couple of frames keeps the bootstrap cover
      // active until those post-mount geometry writes land.
      await waitForNextFrame();
      await waitForNextFrame();

      if (cancelled) {
        return;
      }
      document.documentElement.setAttribute(HOMEPAGE_LAYOUT_READY_ATTRIBUTE, 'true');
      document.getElementById(HOMEPAGE_HYDRATION_COVER_ELEMENT_ID)?.remove();
      document.documentElement.removeAttribute(HOMEPAGE_HYDRATION_COVER_ATTRIBUTE);
    };

    document.documentElement.removeAttribute(HOMEPAGE_LAYOUT_READY_ATTRIBUTE);
    void markInitialLayoutReady();

    return () => {
      cancelled = true;
      document.documentElement.removeAttribute(HOMEPAGE_LAYOUT_READY_ATTRIBUTE);
      document.getElementById(HOMEPAGE_HYDRATION_COVER_ELEMENT_ID)?.remove();
      document.documentElement.removeAttribute(HOMEPAGE_HYDRATION_COVER_ATTRIBUTE);
    };
  }, []);

  const homepageStyle = useMemo(
    () => ({
      '--homepage-fit-scale': desktopFitScale,
      '--homepage-action-scale': desktopActionScale,
    } as CSSProperties),
    [desktopActionScale, desktopFitScale],
  );

  const authAction = userEmail ? (
    <button
      type="button"
      className="homepage-auth-button homepage-auth-button--active"
      onClick={onOpenProfile}
      title={userEmail}
    >
      {userInitial ? <span className="homepage-auth-avatar">{userInitial}</span> : null}
      <span className="homepage-auth-label">{homepageCopy.profileLabel}</span>
    </button>
  ) : (authPending || onSignIn) ? (
    <button
      type="button"
      className={authPending ? 'homepage-auth-button homepage-auth-button--pending' : 'homepage-auth-button'}
      onClick={onSignIn}
      disabled={authPending || !onSignIn}
      aria-busy={authPending || undefined}
    >
      {homepageCopy.signInLabel}
    </button>
  ) : null;

  return (
    <div className="homepage-container" style={homepageStyle}>
      <header className="homepage-mobile-header">
        <div className="homepage-mobile-header__row">
          <span className="homepage-mobile-tagline">{homepageCopy.mobileTagline}</span>
          <div className="homepage-mobile-actions">
            {authAction}
            <div className="homepage-mobile-logo">
              <picture>
                <source srcSet="/DullyPDF_logo_social_full_bleed.webp" type="image/webp" />
                <img
                  className="homepage-logo-image"
                  src="/DullyPDF_logo_social_full_bleed.png"
                  alt="DullyPDF"
                  fetchPriority="high"
                  decoding="async"
                />
              </picture>
              <span className="homepage-logo-text">DullyPDF</span>
            </div>
          </div>
        </div>
      </header>

      <section className="homepage-mobile-layout">
        <div className="mobile-cta">
          <p className="mobile-warning">
            {homepageCopy.mobileWarning}
          </p>
          <button type="button" className="mobile-demo-button" onClick={handleScrollToDemo}>
            {homepageCopy.mobileDemoButtonLabel}
          </button>
          <button type="button" className="mobile-contact-button" onClick={handleOpenContact}>
            {homepageCopy.mobileContactButtonLabel}
          </button>
          <a href="/es/usage-docs" className="mobile-contact-button mobile-legal-button">
            {homepageCopy.mobileLegalLinkLabel}
          </a>
        </div>

        <div className="mobile-copy">
          <h2 className="mobile-main-title">
            {homepageCopy.titleLines.map((line) => (
              <span className="homepage-main-title-line" key={String(line)}>
                {line}
              </span>
            ))}
          </h2>
          <p className="mobile-description">
            {homepageCopy.leadDescription}
          </p>
        </div>

        <div className="mobile-steps">
          <h3>{homepageCopy.featuresTitle}</h3>
          <div className="feature-list">
            {homepageCopy.features.map((feature, index) => (
              <div className="feature-item" key={`${activeMarket}-mobile-feature-${index + 1}`}>
                <span className="feature-number">{index + 1}</span>
                <div className="feature-content">
                  <h4>{feature.title}</h4>
                  <p>{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="homepage-mobile-demo" ref={demoRef} id="homepage-demo">
        <div className="mobile-demo-header">
          <p className="demo-kicker">{homepageCopy.demoKicker}</p>
          <h3>{homepageCopy.mobileDemoHeading}</h3>
          <p>{homepageCopy.mobileDemoDescription}</p>
        </div>
        <div className="mobile-demo-card">
          <div className="mobile-demo-media">
            <picture>
              <source srcSet={activeStep.imageWebp} type="image/webp" />
              <img
                src={activeStep.imagePng}
                alt={activeStep.alt}
                loading="lazy"
                decoding="async"
                onLoad={() => {
                  if (demoFocusActive) {
                    scrollDemoToViewportBottom('auto');
                  }
                }}
              />
            </picture>
          </div>
          <div className="mobile-demo-content">
            <span className="mobile-demo-step">
              {homepageCopy.mobileDemoStepLabel(activeDemoIndex + 1, demoWalkthrough.length)}
            </span>
            <h4>{activeStep.title}</h4>
            <div className="mobile-demo-description">{activeStep.description}</div>
          </div>
          <div className="mobile-demo-nav" ref={demoNavRef}>
            <button
              type="button"
              className="mobile-demo-arrow"
              onClick={handlePrevStep}
              disabled={!hasPrev}
              aria-label={homepageCopy.previousDemoAriaLabel}
            >
              ←
            </button>
            <div className="mobile-demo-progress">
              {activeDemoIndex + 1} / {demoWalkthrough.length}
            </div>
            <button
              type="button"
              className="mobile-demo-arrow"
              onClick={handleNextStep}
              disabled={!hasNext}
              aria-label={homepageCopy.nextDemoAriaLabel}
            >
              →
            </button>
          </div>
        </div>
      </section>

      <MobileLaunchReviewSection copy={homepageCopy.launchReview} />

      <div className="homepage-content-shell">
        <div className="homepage-content homepage-desktop-layout">
          {/* Left Panel - Project Description */}
          <div className="description-panel" ref={descriptionPanelRef}>
            <div className="description-content" ref={descriptionContentRef}>
              <h1 className="homepage-main-title">
                {homepageCopy.titleLines.map((line) => (
                  <span className="homepage-main-title-line" key={String(line)}>
                    {line}
                  </span>
                ))}
              </h1>

              <div className="description-text">
                <p className="lead-description">
                  {homepageCopy.leadDescription}
                </p>

                <div className="features-section">
                  <h3>{homepageCopy.featuresTitle}</h3>
                  <div className="feature-list">
                    {homepageCopy.features.map((feature, index) => (
                      <div className="feature-item" key={`${activeMarket}-desktop-feature-${index + 1}`}>
                        <span className="feature-number">{index + 1}</span>
                        <div className="feature-content">
                          <h4>{feature.title}</h4>
                          <p>{feature.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Right Panel - Call to Action */}
          <div className="action-panel" ref={actionPanelRef}>
            <div className="action-content" ref={actionContentRef}>
              <div className="cta-section">
                <h3>{homepageCopy.ctaTitle}</h3>
                <p className="cta-description">
                  {homepageCopy.ctaDescription(handleOpenContact)}
                </p>

                <div className="cta-buttons">
                  <button
                    onClick={onStartWorkflow}
                    className="try-now-button"
                  >
                    {homepageCopy.workflowButtonLabel}
                  </button>
                  {onStartDemo ? (
                    <button
                      onClick={onStartDemo}
                      className="demo-button"
                      type="button"
                    >
                      {homepageCopy.demoButtonLabel}
                    </button>
                  ) : null}
                </div>

                <p className="cta-catalog-intro">
                  {homepageCopy.secondaryIntro}
                </p>

                <div className="cta-buttons">
                  <a href={homepageCopy.secondaryCta.href} className="demo-button">
                    {homepageCopy.secondaryCta.label}
                  </a>
                </div>

                <div className="quick-info">
                  {homepageCopy.quickInfo.map((item) => (
                    item.kind === 'text' ? (
                      <div className="info-item" key={`${activeMarket}-${item.label}`}>
                        <span className="info-label">{item.label}</span>
                        <span className="info-value">{item.value}</span>
                      </div>
                    ) : (
                      <a
                        href={item.href}
                        className="info-item info-item--link"
                        aria-label={item.ariaLabel}
                        key={`${activeMarket}-${item.label}`}
                      >
                        <span className="info-main">
                          <span className="info-label">{item.label}</span>
                          <span className="info-value">{item.value}</span>
                        </span>
                        <span className="info-cta">{homepageCopy.quickInfoViewLabel}</span>
                      </a>
                    )
                  ))}
                </div>

                <LaunchReviewCard copy={homepageCopy.launchReview} />
              </div>

            </div>
          </div>
        </div>
      </div>
      <SiteFooter hideFormCatalog={activeMarket !== 'global'} locale={activeMarket === 'spanish' ? 'es' : 'en'} />
      <ContactDialog open={contactOpen} onClose={handleCloseContact} defaultEmail={userEmail} />
    </div>
  );
};

export default Homepage;
