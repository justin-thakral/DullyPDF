import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import IntentLandingPage from '../../../../src/components/pages/IntentLandingPage';

describe('IntentLandingPage', () => {
  it('renders requested intent copy and related links', () => {
    render(<IntentLandingPage pageKey="fillable-form-field-name" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Standardize Fillable Form Field Names for Reliable Auto-Fill' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Try DullyPDF Now' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'PDF to Database Template' }).getAttribute('href')).toBe(
      '/pdf-to-database-template',
    );
  });

  it('renders long-form article sections for expanded landing pages', () => {
    render(<IntentLandingPage pageKey="fill-pdf-from-csv" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Workflow examples for Fill PDF From CSV' })).toBeTruthy();
    expect(screen.getByAltText('Patient intake PDF preview with fields already filled from structured data.')).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'How Search and Fill works once the template is mapped' }),
    ).toBeTruthy();
    expect(
      screen.getByText(/DullyPDF treats the PDF template and the row data as two separate layers/i),
    ).toBeTruthy();
  });

  it('renders the catalog explainer route with direct catalog links', () => {
    render(<IntentLandingPage pageKey="pdf-form-catalog" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Browse a PDF Form Catalog of Official Blank Forms' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'What each catalog entry contains' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse Form Catalog' }).getAttribute('href')).toBe('/forms');
    expect(
      screen.getAllByRole('link', { name: 'Government Form Automation' }).some((link) => (
        link.getAttribute('href') === '/government-form-automation'
      )),
    ).toBe(true);
    expect(
      screen.getByRole('heading', { level: 2, name: 'All form catalog categories in DullyPDF' }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Settlement statements, tenant packets, housing disclosures, and borrower-facing real-estate forms/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/Representative PDF: HUD-1 — Settlement Statement\./i),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse Real Estate & Housing' }).getAttribute('href')).toBe(
      '/forms?category=real_estate_housing',
    );
  });

  it('renders the advanced image and barcode field route with source-backed figures', () => {
    render(<IntentLandingPage pageKey="pdf-image-qr-barcode-fields" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'PDF Image, QR Code, PDF417 & 1D Barcode Fields' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Workflow examples for Image, QR, PDF417 & 1D Barcode Fields' }),
    ).toBeTruthy();
    expect(
      screen.getByAltText('A DullyPDF PDF template preview showing image, QR Code, PDF417, and 1D barcode field regions.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'When Acrobat or a specialist barcode tool is the better choice' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Adobe Acrobat | Add and test barcode fields, including PDF417 and QR Code symbologies' }).getAttribute('href'),
    ).toBe('https://helpx.adobe.com/in/acrobat/desktop/work-with-pdf-forms/insert-barcodes/add-barcode-fields.html');
  });

  it('renders the add image field route with focused image-field copy', () => {
    render(<IntentLandingPage pageKey="add-image-field-to-pdf" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Add Image Fields to Fillable PDFs Online' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Workflow examples for Add Image Field to PDF' }),
    ).toBeTruthy();
    expect(
      screen.getByAltText('A DullyPDF PDF template preview showing uploaded photo, reusable image placeholder, and logo image field regions.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Image field versus adding a static image to a PDF' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Adobe Acrobat | Create forms and add form components, including Image Field' }).getAttribute('href'),
    ).toBe('https://helpx.adobe.com/sg/acrobat/desktop/work-with-pdf-forms/create-forms/create.html');
  });

  it('renders the add QR code field route with focused QR copy', () => {
    render(<IntentLandingPage pageKey="add-qr-code-field-to-pdf" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Add QR Code Fields to Fillable PDFs' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Workflow examples for Add QR Code Field to PDF' }),
    ).toBeTruthy();
    expect(
      screen.getByAltText('A DullyPDF PDF template preview showing a record URL source field generating a QR Code field.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Static QR code payloads and dynamic destinations' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'DENSO WAVE | What is a QR Code?' }).getAttribute('href'),
    ).toBe('https://www.denso-wave.com/en/system/qr/fundamental/qrcode/qrc/index.html');
  });

  it('renders the remaining image and barcode field SEO routes with source-backed visuals', () => {
    const cases = [
      {
        pageKey: 'add-pdf417-barcode-field-to-pdf',
        h1: 'Add PDF417 Barcode Fields to Fillable PDFs',
        workflowHeading: 'Workflow examples for Add PDF417 Barcode Field to PDF',
        imageAlt: 'A DullyPDF PDF template preview showing multiple source values combined into one PDF417 barcode field.',
        articleHeading: 'How DullyPDF builds the PDF417 payload',
        sourceName: 'Adobe Acrobat | Add barcode fields, including PDF417 and QR Code symbologies',
      },
      {
        pageKey: 'add-1d-barcode-field-to-pdf',
        h1: 'Add 1D Barcode Fields to Fillable PDFs',
        workflowHeading: 'Workflow examples for Add 1D Barcode Field to PDF',
        imageAlt: 'A DullyPDF PDF template preview showing a 1D barcode field generated from a short numeric source value.',
        articleHeading: 'DullyPDF scope for 1D barcode helpers',
        sourceName: 'GS1 US | Barcode types, including linear 1D barcode examples',
      },
      {
        pageKey: 'add-barcode-to-pdf-form',
        h1: 'Add a Barcode to a PDF Form Online',
        workflowHeading: 'Workflow examples for Add Barcode to PDF Form',
        imageAlt: 'A DullyPDF PDF template preview showing barcode helper fields placed into a reusable PDF form.',
        articleHeading: 'Start with the barcode job, not the barcode shape',
        sourceName: 'Adobe Acrobat | Add barcode fields and select symbology',
      },
      {
        pageKey: 'pdf417-vs-qr-code-pdf-forms',
        h1: 'PDF417 vs QR Code for PDF Forms',
        workflowHeading: 'Workflow examples for PDF417 vs QR Code for PDF Forms',
        imageAlt: 'A DullyPDF PDF template comparison showing PDF417 for structured data and QR Code for a verification URL.',
        articleHeading: 'Short answer: PDF417 is data-heavy, QR Code is link-friendly',
        sourceName: 'DENSO WAVE | What is a QR Code?',
      },
      {
        pageKey: 'generate-pdf-barcodes-from-csv',
        h1: 'Generate PDF Barcodes From CSV or Database Fields',
        workflowHeading: 'Workflow examples for Generate PDF Barcodes From CSV',
        imageAlt: 'A DullyPDF PDF template preview showing CSV or database values feeding barcode helper fields.',
        articleHeading: 'Map the source value before drawing the barcode',
        sourceName: 'Adobe Acrobat | Add barcode fields and encode selected form fields',
      },
      {
        pageKey: 'image-upload-fields-pdf-forms',
        h1: 'Image Upload Fields in PDF Forms',
        workflowHeading: 'Workflow examples for Image Upload Fields in PDF Forms',
        imageAlt: 'A DullyPDF PDF template preview showing image upload fields for variable document images.',
        articleHeading: 'Image upload field versus static image',
        sourceName: 'Adobe Acrobat | Create forms and add form components, including Image Field',
      },
    ] as const;

    cases.forEach(({ pageKey, h1, workflowHeading, imageAlt, articleHeading, sourceName }) => {
      const { unmount } = render(<IntentLandingPage pageKey={pageKey} />);

      expect(screen.getByRole('heading', { level: 1, name: h1 })).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: workflowHeading })).toBeTruthy();
      expect(screen.getByAltText(imageAlt)).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: articleHeading })).toBeTruthy();
      expect(screen.getByRole('link', { name: sourceName })).toBeTruthy();

      unmount();
    });
  });

  it('renders the high-value long-tail image and barcode routes with focused copy', () => {
    const cases = [
      {
        pageKey: 'add-code-128-barcode-to-pdf',
        h1: 'Add Code 128 Barcodes to PDF Forms',
        workflowHeading: 'Workflow examples for Add Code 128 Barcode to PDF',
        imageAlt: 'A DullyPDF PDF template preview showing a Code 128 barcode field generated from a short internal source value.',
        articleHeading: 'Code 128 versus GS1-128, UPC, and EAN',
        sourceName: 'GS1 US | What is a GS1-128 barcode?',
      },
      {
        pageKey: 'work-order-barcode-pdf',
        h1: 'Add Barcodes to Work Order PDFs',
        workflowHeading: 'Workflow examples for Work Order Barcode PDF',
        imageAlt: 'A DullyPDF PDF template preview showing a work order barcode field generated from a work order source value.',
        articleHeading: 'Choose 1D barcode for scanner IDs and QR Code for record lookup',
        sourceName: 'DENSO WAVE | What is a QR Code?',
      },
      {
        pageKey: 'asset-tag-barcode-pdf-form',
        h1: 'Add Asset Tag Barcodes to PDF Forms',
        workflowHeading: 'Workflow examples for Asset Tag Barcode PDF Form',
        imageAlt: 'A DullyPDF PDF template preview showing an asset tag barcode field with mapped location and inspection fields.',
        articleHeading: '1D barcode versus QR Code for asset forms',
        sourceName: 'GS1 US | GS1-128 barcodes and asset identifiers',
      },
      {
        pageKey: 'qr-code-verification-pdf',
        h1: 'Add QR Code Verification Links to PDFs',
        workflowHeading: 'Workflow examples for QR Code Verification PDF',
        imageAlt: 'A DullyPDF PDF template preview showing a verification QR code field generated from a validation URL.',
        articleHeading: 'A verification QR code is a link, not proof by itself',
        sourceName: 'CheckMySign | PDF verification URL and QR code pattern',
      },
      {
        pageKey: 'qr-code-payment-link-pdf',
        h1: 'Add Payment QR Codes to PDF Invoices',
        workflowHeading: 'Workflow examples for QR Code Payment Link PDF',
        imageAlt: 'A DullyPDF PDF invoice template preview showing a payment QR code generated from a payment link field.',
        articleHeading: 'Why payment QR codes work well on invoice PDFs',
        sourceName: 'Zoho Invoice | Add QR Code on Invoices',
      },
      {
        pageKey: 'qr-code-record-lookup-pdf',
        h1: 'Add Record Lookup QR Codes to PDFs',
        workflowHeading: 'Workflow examples for QR Code Record Lookup PDF',
        imageAlt: 'A DullyPDF PDF template preview showing a QR code field generated from a record lookup URL.',
        articleHeading: 'Static PDF, dynamic destination',
        sourceName: 'GS1 | Digital Link and web-connected barcode scanning',
      },
      {
        pageKey: 'scannable-pdf-form',
        h1: 'Create Scannable PDF Forms With QR and Barcode Fields',
        workflowHeading: 'Workflow examples for Scannable PDF Form',
        imageAlt: 'A DullyPDF PDF template preview showing QR Code, PDF417, and 1D barcode helper output in one scannable PDF form.',
        articleHeading: 'What makes a PDF form scannable',
        sourceName: 'GS1 US | Barcode types and scannable identifiers',
      },
      {
        pageKey: 'pdf-photo-upload-field',
        h1: 'Add Photo Upload Fields to PDF Forms',
        workflowHeading: 'Workflow examples for PDF Photo Upload Field',
        imageAlt: 'A DullyPDF PDF template preview showing a photo upload field beside applicant details.',
        articleHeading: 'Photo upload field versus pasted photo',
        sourceName: 'Adobe Acrobat | Create forms and add form components, including Image Field',
      },
      {
        pageKey: 'id-photo-field-pdf-form',
        h1: 'Add ID Photo Fields to PDF Forms',
        workflowHeading: 'Workflow examples for ID Photo Field PDF Form',
        imageAlt: 'A DullyPDF PDF template preview showing an ID photo field beside ID number and expiration fields.',
        articleHeading: 'ID image fields need stronger review than generic photos',
        sourceName: 'Adobe Acrobat | Image Field as a form component',
      },
      {
        pageKey: 'receipt-upload-field-pdf-form',
        h1: 'Add Receipt Upload Fields to PDF Forms',
        workflowHeading: 'Workflow examples for Receipt Upload Field PDF Form',
        imageAlt: 'A DullyPDF PDF template preview showing a receipt upload field beside vendor, amount, and expense-date fields.',
        articleHeading: 'Receipt field versus attachment workflow',
        sourceName: 'Adobe Acrobat | Create forms and add Image Field components',
      },
    ] as const;

    cases.forEach(({ pageKey, h1, workflowHeading, imageAlt, articleHeading, sourceName }) => {
      const { unmount } = render(<IntentLandingPage pageKey={pageKey} />);

      expect(screen.getByRole('heading', { level: 1, name: h1 })).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: workflowHeading })).toBeTruthy();
      expect(screen.getByAltText(imageAlt)).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: articleHeading })).toBeTruthy();
      expect(screen.getByRole('link', { name: sourceName })).toBeTruthy();

      unmount();
    });
  });

  it('renders the PDF calculation fields route with safe-formula copy', () => {
    render(<IntentLandingPage pageKey="pdf-calculation-fields" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Create PDF Calculation Fields Without JavaScript' }),
    ).toBeTruthy();
    expect(
      screen.getByAltText('DullyPDF field editor showing calculation field creation controls for number inputs and calculated outputs.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Safe formulas instead of arbitrary Acrobat JavaScript' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Adobe Acrobat Help | Configure form fields for calculations and set calculation order' }).getAttribute('href'),
    ).toBe('https://helpx.adobe.com/ca/acrobat/desktop/work-with-pdf-forms/customize-form-fields/set-calculation-fields.html');
  });

  it('renders every supporting calculation SEO route with focused article copy', () => {
    const routes = [
      {
        pageKey: 'pdf-form-calculations-not-working',
        heading: 'PDF Form Calculations Not Working in Chrome, Preview, or Mobile?',
        articleHeading: 'Why browser and mobile PDF viewers are risky for live calculations',
      },
      {
        pageKey: 'add-calculated-field-to-pdf',
        heading: 'Add a Calculated Field to an Existing PDF Form',
        articleHeading: 'Build the formula from field references',
      },
      {
        pageKey: 'fillable-pdf-total-field',
        heading: 'Create a Total Field in a Fillable PDF',
        articleHeading: 'Common total-field patterns',
      },
      {
        pageKey: 'api-fill-calculated-pdf',
        heading: 'Fill a Calculated PDF From JSON and Let the Server Compute Totals',
        articleHeading: 'The caller should send inputs, not derived totals',
      },
      {
        pageKey: 'pdf-form-javascript-calculation-alternative',
        heading: 'A Safer Alternative to Acrobat JavaScript Calculations',
        articleHeading: 'DullyPDF stores formulas as data',
      },
      {
        pageKey: 'pdf-calculation-order',
        heading: 'PDF Calculation Order for Dependent Fields',
        articleHeading: 'Think of formulas as a graph',
      },
      {
        pageKey: 'pdf-invoice-calculation-template',
        heading: 'PDF Invoice Calculation Template for Subtotals, Tax, and Amount Due',
        articleHeading: 'Typical invoice calculation fields',
      },
      {
        pageKey: 'pdf-order-form-calculations',
        heading: 'PDF Order Form Calculations for Quantity, Price, Shipping, and Total',
        articleHeading: 'Choose the right source for order data',
      },
      {
        pageKey: 'pdf-estimate-quote-calculations',
        heading: 'PDF Estimate and Quote Calculations for Labor, Materials, and Deposits',
        articleHeading: 'Good fields make quote formulas easier to audit',
      },
    ] as const;

    routes.forEach(({ pageKey, heading, articleHeading }) => {
      cleanup();
      render(<IntentLandingPage pageKey={pageKey} />);

      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: articleHeading })).toBeTruthy();
      expect(screen.getAllByRole('link', { name: 'PDF Calculation Fields' }).length).toBeGreaterThan(0);
    });
  });

  it('renders the second calculation SEO batch with operational workflow copy', () => {
    const routes = [
      {
        pageKey: 'calculated-pdf-from-csv',
        heading: 'Fill Calculated PDF Fields From CSV or Excel Rows',
        articleHeading: 'CSV should provide source facts, not final calculated fields',
      },
      {
        pageKey: 'fill-by-link-calculated-pdf',
        heading: 'Collect Number Inputs by Link and Generate Calculated PDFs',
        articleHeading: 'The public form should collect inputs, not totals',
      },
      {
        pageKey: 'flat-vs-editable-calculated-pdf',
        heading: 'Flat vs Editable PDFs When Calculated Fields Matter',
        articleHeading: 'Editable calculated PDFs are for continued field work',
      },
      {
        pageKey: 'pdf-expense-report-calculations',
        heading: 'PDF Expense Report Calculations for Reimbursements and Totals',
        articleHeading: 'Expense reports are a natural fit for source inputs plus totals',
      },
      {
        pageKey: 'pdf-timesheet-calculations',
        heading: 'PDF Timesheet Calculations for Hours, Rates, and Totals',
        articleHeading: 'Use numeric hours, not time parsing',
      },
      {
        pageKey: 'pdf-purchase-order-calculations',
        heading: 'PDF Purchase Order Calculations for Line Items and Totals',
        articleHeading: 'Purchase orders need stable line-item assumptions',
      },
      {
        pageKey: 'pdf-construction-bid-calculations',
        heading: 'PDF Construction Bid Calculations for Labor, Materials, and Markup',
        articleHeading: 'Construction bid PDFs need explainable totals',
      },
      {
        pageKey: 'pdf-change-order-calculations',
        heading: 'PDF Change Order Calculations for Added Cost, Credits, and Revised Total',
        articleHeading: 'Change orders need totals that match the visible inputs',
      },
      {
        pageKey: 'pdf-mileage-reimbursement-calculation',
        heading: 'PDF Mileage Reimbursement Calculation Forms',
        articleHeading: 'Mileage forms should make the rate and adjustment explicit',
      },
      {
        pageKey: 'pdf-inspection-score-calculations',
        heading: 'PDF Inspection Score Calculations for Checklists and Audits',
        articleHeading: 'Inspection scoring works best with numeric source fields',
      },
    ] as const;

    routes.forEach(({ pageKey, heading, articleHeading }) => {
      cleanup();
      render(<IntentLandingPage pageKey={pageKey} />);

      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: articleHeading })).toBeTruthy();
      expect(screen.getAllByRole('link', { name: 'PDF Calculation Fields' }).length).toBeGreaterThan(0);
    });
  });

  it('renders the merge fillable PDF forms route with product figures and support links', () => {
    render(<IntentLandingPage pageKey="merge-fillable-pdf-forms" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Merge Fillable PDF Forms Safely' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Workflow examples for Merge Fillable PDF Forms' }),
    ).toBeTruthy();
    expect(
      screen.getByAltText('DullyPDF merge fillable PDF forms preview showing inserted source pages, review pass status, and output validation.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Why generic PDF merging breaks down for form workflows' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create Group docs' }).getAttribute('href')).toBe(
      '/usage-docs/create-group',
    );
  });

  it('renders the reorder fillable PDF pages route with page-order review copy', () => {
    render(<IntentLandingPage pageKey="reorder-fillable-pdf-pages" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Reorder Fillable PDF Pages Safely' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Workflow examples for Reorder Fillable PDF Pages' }),
    ).toBeTruthy();
    expect(
      screen.getByAltText('DullyPDF Manage Pages dialog showing page 2 moved ahead of page 1 in the 1915 fillable PDF.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Why reordering a fillable PDF needs field-aware review' }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole('link', { name: 'Merge Fillable PDF Forms' }).some((link) => (
        link.getAttribute('href') === '/merge-fillable-pdf-forms'
      )),
    ).toBe(true);
  });

  it('renders the split fillable PDF forms route with selected-page export copy', () => {
    render(<IntentLandingPage pageKey="split-fillable-pdf-forms" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Split Fillable PDF Forms Safely' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Workflow examples for Split Fillable PDF Forms' }),
    ).toBeTruthy();
    expect(
      screen.getByAltText('DullyPDF Download Specific Pages dialog selecting page 1 from the 1915 fillable PDF for flat output.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Why splitting fillable PDFs needs more care than cutting pages' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Save & Download docs' }).getAttribute('href')).toBe(
      '/usage-docs/save-download-profile',
    );
  });

  it('renders the delete pages from fillable PDF route with page cleanup copy', () => {
    render(<IntentLandingPage pageKey="delete-pages-from-fillable-pdf" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Delete Pages From Fillable PDFs Safely' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Workflow examples for Delete Pages From Fillable PDF' }),
    ).toBeTruthy();
    expect(
      screen.getByAltText('DullyPDF Manage Pages dialog showing page 2 removed from the 1915 fillable PDF.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Why deleting pages from a fillable PDF is not just page cleanup' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Editor workflow docs' }).getAttribute('href')).toBe(
      '/usage-docs/editor-workflow',
    );
  });

  it('renders the compress fillable PDF forms route with lossless optimization copy', () => {
    render(<IntentLandingPage pageKey="compress-fillable-pdf-forms" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Compress Fillable PDF Forms Safely' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Workflow examples for Compress Fillable PDF Forms' }),
    ).toBeTruthy();
    expect(
      screen.getByAltText('DullyPDF Compress / Optimize PDF dialog showing lossless cleanup for a fillable PDF.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Why compression is different for fillable PDF workflows' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Save & Download docs' }).getAttribute('href')).toBe(
      '/usage-docs/save-download-profile',
    );
  });

  it('renders the DullyPDF highlight SEO routes with distinct workflow copy', () => {
    const routes = [
      {
        pageKey: 'ai-pdf-field-renaming',
        heading: 'AI PDF Field Renaming and Schema Mapping',
        articleHeading: 'Why field names matter more than they look',
      },
      {
        pageKey: 'fill-pdf-from-image',
        heading: 'Fill PDF Forms From Images and Scanned Documents',
        articleHeading: 'When image-based filling is the right workflow',
      },
      {
        pageKey: 'save-reusable-pdf-template',
        heading: 'Save Reusable PDF Templates for Repeat Filling',
        articleHeading: 'A saved template is the product of the review loop',
      },
      {
        pageKey: 'pdf-packet-workflow',
        heading: 'PDF Packet Workflows With Saved Template Groups',
        articleHeading: 'Packets are different from one-off PDF filling',
      },
      {
        pageKey: 'merge-fillable-pdf-forms',
        heading: 'Merge Fillable PDF Forms Safely',
        articleHeading: 'Why generic PDF merging breaks down for form workflows',
      },
      {
        pageKey: 'reorder-fillable-pdf-pages',
        heading: 'Reorder Fillable PDF Pages Safely',
        articleHeading: 'Why reordering a fillable PDF needs field-aware review',
      },
      {
        pageKey: 'rotate-fillable-pdf-pages',
        heading: 'Rotate Fillable PDF Pages Safely',
        articleHeading: 'Why rotation matters for fillable PDFs, not just PDF viewers',
      },
      {
        pageKey: 'split-fillable-pdf-forms',
        heading: 'Split Fillable PDF Forms Safely',
        articleHeading: 'Why splitting fillable PDFs needs more care than cutting pages',
      },
      {
        pageKey: 'delete-pages-from-fillable-pdf',
        heading: 'Delete Pages From Fillable PDFs Safely',
        articleHeading: 'Why deleting pages from a fillable PDF is not just page cleanup',
      },
      {
        pageKey: 'compress-fillable-pdf-forms',
        heading: 'Compress Fillable PDF Forms Safely',
        articleHeading: 'Why compression is different for fillable PDF workflows',
      },
      {
        pageKey: 'fill-pdf-link-signature',
        heading: 'Collect PDF Answers by Link and Route the Record for Signature',
        articleHeading: 'The link should collect data before signature starts',
      },
      {
        pageKey: 'pdf-signature-audit-trail',
        heading: 'PDF Signature Audit Trail and Verification Workflow',
        articleHeading: 'An audit trail starts before the email is sent',
      },
      {
        pageKey: 'flat-vs-editable-pdf',
        heading: 'Flat vs Editable PDF Output for Fillable Forms',
        articleHeading: 'Editable PDFs preserve live field behavior',
      },
      {
        pageKey: 'search-fill-pdf-review',
        heading: 'Search and Fill PDF Records With a Review Loop',
        articleHeading: 'Review is the difference between filling and automation',
      },
      {
        pageKey: 'openai-pdf-data-privacy',
        heading: 'OpenAI PDF Data Boundaries in DullyPDF Workflows',
        articleHeading: 'Different DullyPDF workflows have different data paths',
      },
      {
        pageKey: 'mobile-fillable-pdf-form',
        heading: 'Mobile-Friendly Fillable PDF Forms Without a PDF App',
        articleHeading: 'Mobile PDF viewers are not a reliable fill surface',
      },
      {
        pageKey: 'stored-fill-by-link-responses',
        heading: 'Reuse Stored Fill By Link Responses as PDF Fill Sources',
        articleHeading: 'A submission is data, not just a finished PDF',
      },
      {
        pageKey: 'group-api-fill-zip-packet',
        heading: 'Group API Fill — JSON to PDF Packet as a ZIP',
        articleHeading: 'Packets often need a programmatic path, not a browser path',
      },
      {
        pageKey: 'batch-rename-map-pdf-group',
        heading: 'Batch Rename and Map PDF Field Names Across a Saved Group',
        articleHeading: 'Why packet field naming drifts and why it matters',
      },
      {
        pageKey: 'verify-signed-pdf',
        heading: 'Verify a Signed PDF Online With a Retained Validation Page',
        articleHeading: 'A viewer trust badge is not the same as verification',
      },
      {
        pageKey: 'no-code-pdf-automation',
        heading: 'No-Code PDF Automation for Existing Forms',
        articleHeading: 'No-code does not mean no review',
      },
    ] as const;

    routes.forEach(({ pageKey, heading, articleHeading }) => {
      cleanup();
      render(<IntentLandingPage pageKey={pageKey} />);

      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: articleHeading })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Try DullyPDF Now' }).getAttribute('href')).toBe('/');
    });
  });

  it('renders the focused PDF conversion demo on the PDF to Fillable route', () => {
    render(<IntentLandingPage pageKey="pdf-to-fillable-form" />);

    expect(screen.getByRole('heading', { level: 2, name: '3-minute PDF to Fillable walkthrough' })).toBeTruthy();
    expect(screen.getByTitle('3-minute PDF to Fillable walkthrough')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Watch on YouTube' }).getAttribute('href')).toBe(
      'https://youtu.be/JIVx5VrtkAg?si=XsswWbjanIVnY5vp',
    );
  });

  it('renders the fill-by-file demo on the Fill PDF from CSV route', () => {
    render(<IntentLandingPage pageKey="fill-pdf-from-csv" />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Fill PDF from CSV, Excel, or JSON' }),
    ).toBeTruthy();
    expect(screen.getByTitle('Fill PDF from CSV, Excel, or JSON')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Watch on YouTube' }).getAttribute('href')).toBe(
      'https://youtu.be/CT3IEzh4p10',
    );
  });

  it('renders the web form + sign demo on the Fill PDF By Link route', () => {
    render(<IntentLandingPage pageKey="fill-pdf-by-link" />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Fill a PDF web form and sign it in the browser' }),
    ).toBeTruthy();
    expect(screen.getByTitle('Fill a PDF web form and sign it in the browser')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Watch on YouTube' }).getAttribute('href')).toBe(
      'https://youtu.be/mXtmgrCOitM',
    );
  });

  it('uses targeted supporting docs from the shared SEO dataset', () => {
    render(<IntentLandingPage pageKey="pdf-fill-api" />);

    expect(screen.queryByRole('heading', { level: 2, name: /Workflow examples for /i })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Watch on YouTube' })).toBeNull();
    expect(screen.queryByTitle(/E-Sign Pipeline/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'API Fill' }).getAttribute('href')).toBe('/usage-docs/api-fill');
    expect(screen.getByRole('link', { name: 'Rename + Mapping' }).getAttribute('href')).toBe(
      '/usage-docs/rename-mapping',
    );
  });

  it('renders supporting visuals for industry landing pages', () => {
    render(<IntentLandingPage pageKey="government-form-automation" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Workflow examples for Government Form Automation' })).toBeTruthy();
    expect(screen.getByAltText('Official IRS W-4 form page showing a fixed government layout.')).toBeTruthy();
  });

  it('renders the customizable industry solution routes with barcode and calculation proof', () => {
    const cases = [
      {
        pageKey: 'manufacturing-pdf-automation',
        h1: 'Manufacturing PDF Automation for Quality, Work Orders, and Lot Records',
        workflowHeading: 'Workflow examples for Manufacturing PDF Automation',
        imageAlt: 'A manufacturing PDF template preview showing lot barcode, inspection fields, defect count, and yield calculation output.',
        articleHeading: 'Barcode fields for lots, serials, and production travelers',
        sourceName: 'GS1 US | Barcode types and 1D/2D barcode guidance',
      },
      {
        pageKey: 'field-service-pdf-automation',
        h1: 'Field Service PDF Automation for Work Orders, Assets, and Service Totals',
        workflowHeading: 'Workflow examples for Field Service PDF Automation',
        imageAlt: 'A field service work order PDF preview showing asset barcode, labor and parts fields, and total due calculation.',
        articleHeading: 'Labor and parts calculations',
        sourceName: 'SafetyCulture | Work order form guidance and PDF report output',
      },
      {
        pageKey: 'warehouse-inventory-pdf-automation',
        h1: 'Warehouse Inventory PDF Automation for Counts, Barcodes, and Variance Forms',
        workflowHeading: 'Workflow examples for Warehouse Inventory PDF Automation',
        imageAlt: 'A warehouse inventory PDF template preview showing SKU barcode, count fields, and variance calculation.',
        articleHeading: 'Quantity and variance calculations',
        sourceName: 'CRS Emergency Field Operations Manual | Warehouse forms',
      },
      {
        pageKey: 'procurement-pdf-automation',
        h1: 'Procurement PDF Automation for Purchase Orders, Vendor Forms, and Approvals',
        workflowHeading: 'Workflow examples for Procurement PDF Automation',
        imageAlt: 'A procurement PDF template preview showing PO barcode, vendor fields, approval fields, and purchase order total calculation.',
        articleHeading: 'Purchase-order calculations',
        sourceName: 'Adobe Acrobat Help | Configure form fields for calculations',
      },
      {
        pageKey: 'utilities-energy-pdf-automation',
        h1: 'Utilities and Energy PDF Automation for Meter, Asset, and Service Forms',
        workflowHeading: 'Workflow examples for Utilities & Energy PDF Automation',
        imageAlt: 'A utilities and energy PDF template preview showing meter QR code, inspection fields, and usage delta calculation.',
        articleHeading: 'Reading and usage calculations',
        sourceName: 'DENSO WAVE | What is a QR Code?',
      },
    ] as const;

    cases.forEach(({ pageKey, h1, workflowHeading, imageAlt, articleHeading, sourceName }) => {
      const { unmount } = render(<IntentLandingPage pageKey={pageKey} />);

      expect(screen.getByRole('heading', { level: 1, name: h1 })).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: workflowHeading })).toBeTruthy();
      expect(screen.getByAltText(imageAlt)).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: articleHeading })).toBeTruthy();
      expect(screen.getByRole('link', { name: sourceName })).toBeTruthy();

      unmount();
    });
  });

  it('renders curated catalog forms and automation steps for catalog-backed industry pages', () => {
    render(<IntentLandingPage pageKey="healthcare-pdf-automation" />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Featured healthcare and medical PDFs from the DullyPDF catalog' }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole('link', { name: 'Open CMS-855I in DullyPDF' })
        .every((link) => link.getAttribute('href') === '/forms/cms-855i'),
    ).toBe(true);
    expect(screen.getByText('10 specific forms to automate on this route')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'API Fill docs' }).getAttribute('href'),
    ).toBe('/usage-docs/api-fill');
    expect(
      screen.getByRole('link', { name: 'Signature workflow docs' }).getAttribute('href'),
    ).toBe('/usage-docs/signature-workflow');
  });

  it('keeps public catalog CTAs crawl-safe and removes direct government file URLs from official-source links', () => {
    render(<IntentLandingPage pageKey="government-form-automation" />);

    expect(
      screen.getAllByRole('link', { name: /Open .* in DullyPDF/i }).every((link) => (
        link.getAttribute('href')?.startsWith('/forms/')
      )),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'Official source' }).every((link) => (
        !(link.getAttribute('href') ?? '').includes('sites/default/files')
      )),
    ).toBe(true);
  });

  it('renders inline legal footnotes and the numbered source list for authority-style pages', () => {
    render(<IntentLandingPage pageKey="esign-ueta-pdf-workflow" />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Legal footnotes and sources for E-SIGN / UETA PDF Workflow' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /See legal footnote/i }).length).toBeGreaterThan(5);
    expect(screen.getByRole('link', { name: 'See legal footnote 1a' }).getAttribute('href')).toBe('#footnote-esign-7001');
    expect(screen.getByRole('link', { name: 'See legal footnote 1b' }).getAttribute('href')).toBe('#footnote-esign-7001');
    expect(
      screen.getByRole('link', { name: '15 U.S.C. § 7001 | General rule of validity and related provisions' }).getAttribute('href'),
    ).toBe('https://www.law.cornell.edu/uscode/text/15/7001');
    expect(
      screen.getByRole('link', { name: '21 CFR Part 11 | Electronic records and electronic signatures' }).getAttribute('href'),
    ).toBe('https://www.law.cornell.edu/cfr/text/21/part-11');
    expect(
      screen.getByRole('link', { name: 'Back to first reference for footnote 1a' }).getAttribute('href'),
    ).toBe('#footnote-ref-esign-7001-1');
  });
});
