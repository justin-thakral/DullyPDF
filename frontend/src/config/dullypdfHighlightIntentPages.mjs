export const DULLYPDF_HIGHLIGHT_INTENT_PAGES = [
  {
    key: 'ai-pdf-field-renaming',
    category: 'workflow',
    path: '/ai-pdf-field-renaming',
    navLabel: 'AI Field Renaming',
    heroTitle: 'AI PDF Field Renaming and Schema Mapping',
    heroSummary:
      'Use AI to turn messy PDF field labels into clean template names, align fields to schema headers, and review confidence before filling records.',
    seoTitle: 'AI PDF Field Renaming and Schema Mapping | DullyPDF',
    seoDescription:
      'Rename PDF form fields with AI, map them to CSV, SQL, Excel, or JSON schema headers, and review confidence before filling reusable templates.',
    seoKeywords: [
      'ai pdf field renaming',
      'rename pdf form fields with ai',
      'pdf schema mapping',
      'map pdf fields to csv columns',
      'map pdf fields to database columns',
      'pdf field name cleanup',
      'pdf form field mapping ai',
      'rename and map pdf form fields',
    ],
    valuePoints: [
      'Convert vague or duplicated PDF widget names into reviewable template names.',
      'Map fields to schema headers so Search & Fill, API Fill, and stored responses target the right places.',
      'Review confidence and checkbox/radio behavior before a template becomes reusable.',
    ],
    proofPoints: [
      'DullyPDF supports Rename, Map Schema, Rename + Map, and Rename + Map Group actions.',
      'Schema sources include CSV, XLSX, JSON, SQL, and TXT headers for mapping workflows.',
      'OpenAI actions warn before sending PDF/schema context, and row values are not included in rename/map payloads.',
    ],
    articleSections: [
      {
        title: 'Why field names matter more than they look',
        paragraphs: [
          'A PDF can look fillable while still being operationally fragile. Generic widget names, duplicate labels, and old authoring-tool identifiers make it difficult to know which record value should fill each field. That problem gets worse in packets because the same label can appear across several documents with slightly different meaning.',
          'AI field renaming is useful because it gives the operator a cleaner first draft of the template model. The goal is not blind automation. The goal is to move from unreadable field names into a reviewable set of names that can be mapped, tested, and saved.',
        ],
      },
      {
        title: 'Rename first, map second when the PDF is messy',
        paragraphs: [
          'Mapping works best when the current field names already resemble the schema headers. Many PDFs do not start that way. Running rename first can turn weak labels into names such as applicant_first_name, policy_number, vendor_tax_id, or signer_email, which gives the mapping pass a stronger target.',
          'DullyPDF also supports a combined Rename + Map action when the template is ready for both passes. That is useful after field geometry and types have been reviewed, but before Search & Fill, Fill By Link, group filling, or API publication depends on the template.',
        ],
      },
      {
        title: 'Checkbox and radio fields need structured review',
        paragraphs: [
          'Text fields are usually direct mappings. Checkbox and radio groups need more care because the source value might behave like a boolean, an enum, a presence signal, or a list. If those rules are wrong, a filled PDF can look almost right while one selected option is wrong.',
          'DullyPDF keeps group keys, option keys, mapping confidence, and radio-group suggestions visible for review. That is why this workflow belongs between detection cleanup and production fill, not after documents have already been sent out.',
        ],
      },
      {
        title: 'What AI mapping should not decide by itself',
        paragraphs: [
          'AI can accelerate naming and alignment, but it should not replace the operator review pass. Teams still need to validate field geometry, source headers, checkbox semantics, required fields, and one representative output before trusting a reusable template.',
          'This is especially important for official, financial, healthcare, legal, HR, or signature-bound PDFs. The mapping layer helps with document mechanics. It does not decide business rules, eligibility, filing requirements, or legal meaning.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can AI rename PDF form fields in DullyPDF?',
        answer:
          'Yes. DullyPDF can run AI rename to suggest cleaner field names, then lets the operator review and save the template.',
      },
      {
        question: 'Can fields be mapped to CSV or database headers?',
        answer:
          'Yes. DullyPDF can map PDF fields to schema headers from CSV, XLSX, JSON, SQL, or TXT sources.',
      },
      {
        question: 'Are row values sent to OpenAI for rename and map?',
        answer:
          'No. Rename and mapping use PDF/schema context, not the selected row values or current field input values.',
      },
      {
        question: 'Should I run AI mapping before reviewing detection?',
        answer:
          'No. Review obvious field geometry, type, checkbox, and radio issues first so the AI pass works from a cleaner template.',
      },
    ],
    relatedIntentPages: ['pdf-to-database-template', 'fillable-form-field-name', 'pdf-checkbox-automation', 'pdf-radio-button-editor'],
    relatedDocs: ['rename-mapping', 'detection', 'editor-workflow'],
  },
  {
    key: 'fill-pdf-from-image',
    category: 'workflow',
    path: '/fill-pdf-from-image',
    navLabel: 'Fill PDF From Image',
    heroTitle: 'Fill PDF Forms From Images and Scanned Documents',
    heroSummary:
      'Upload photos, IDs, invoices, or scanned documents and use AI vision to extract matching values into a reviewed PDF template.',
    seoTitle: 'Fill PDF Forms From Images and Scanned Documents | DullyPDF',
    seoDescription:
      'Extract values from photos, IDs, invoices, receipts, or scanned documents into mapped PDF form fields using DullyPDF vision-assisted fill.',
    seoKeywords: [
      'fill pdf from image',
      'fill pdf from scanned document',
      'extract data from image to pdf form',
      'ocr fill pdf form',
      'auto fill pdf from photo',
      'invoice image to pdf form',
      'id image to pdf form',
      'document image pdf fill',
    ],
    valuePoints: [
      'Use unstructured source images when the data does not start in a clean spreadsheet.',
      'Extract values into the active template field schema for operator review.',
      'Pay attention to confidence and source quality before downloading or saving final output.',
    ],
    proofPoints: [
      'Fill from Images and Documents accepts browser-supported image formats and PDF documents.',
      'Each image costs 1 credit; PDF documents cost 1 credit per 5 pages.',
      'The AI receives uploaded images/documents plus template field schema and label context, not row data from Search & Fill.',
    ],
    articleSections: [
      {
        title: 'When image-based filling is the right workflow',
        paragraphs: [
          'Some PDF workflows do not start with CSV rows. A staff member may have a photo of an ID, a scanned invoice, a receipt, an insurance card, a pay stub, or a supporting document that contains the values needed for the template. Manually reading that source and typing each field is slow and error-prone.',
          'Fill from Images and Documents is for that gap. The template provides the target field schema, the uploaded image provides source evidence, and the operator reviews the extracted values before the PDF becomes a final output.',
        ],
      },
      {
        title: 'This is extraction into a template, not generic OCR',
        paragraphs: [
          'Generic OCR turns a page into text. DullyPDF has a narrower job: match information from the source image to the fields in the active PDF template. That makes clean field names and nearby label context important because they tell the AI what the final document needs.',
          'The best results usually come after the template has already been detected, renamed, and reviewed. A messy template gives the extraction step weaker targets.',
        ],
      },
      {
        title: 'Source image quality controls output quality',
        paragraphs: [
          'Image-based filling is sensitive to blur, glare, partial cropping, low contrast, and screenshots that compress the text. Teams should test realistic images, not only perfect examples, before they rely on the workflow.',
          'A good review pass checks both the extracted value and the source. If the document is unreadable to a human, the operator should not treat the AI output as authoritative just because a value appeared in a field.',
        ],
      },
      {
        title: 'Use structured sources when you already have them',
        paragraphs: [
          'If the same data already exists as CSV, Excel, JSON, or a system record, use Search & Fill or API Fill instead. Image extraction is strongest when the source truly is visual or scanned.',
          'That boundary keeps the workflow practical. Use the cleanest source available, then choose the DullyPDF fill path that preserves review and output quality.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF fill a PDF from a photo or scan?',
        answer:
          'Yes. Fill from Images and Documents can extract values from uploaded images or documents into the active template field schema.',
      },
      {
        question: 'Is this the same as OCR?',
        answer:
          'No. OCR extracts text. DullyPDF uses the template field schema and label context to place extracted values into matching PDF fields.',
      },
      {
        question: 'What should I review after image extraction?',
        answer:
          'Review every extracted value, confidence, source readability, and final PDF output before saving or sending the document.',
      },
    ],
    relatedIntentPages: ['pdf-to-fillable-form', 'fill-pdf-from-csv', 'pdf-to-database-template', 'image-upload-fields-pdf-forms'],
    relatedDocs: ['fill-from-images', 'rename-mapping', 'editor-workflow'],
  },
  {
    key: 'save-reusable-pdf-template',
    category: 'workflow',
    path: '/save-reusable-pdf-template',
    navLabel: 'Reusable PDF Templates',
    heroTitle: 'Save Reusable PDF Templates for Repeat Filling',
    heroSummary:
      'Turn one reviewed PDF setup into a saved template that preserves fields, mapping, appearance, fill rules, and reopenable editor state.',
    seoTitle: 'Save Reusable PDF Templates for Repeat Filling | DullyPDF',
    seoDescription:
      'Save reusable fillable PDF templates with field metadata, mappings, appearance, fill rules, and editor snapshots for repeat Search & Fill, links, API, and signing.',
    seoKeywords: [
      'save reusable pdf template',
      'reusable fillable pdf template',
      'saved pdf form template',
      'repeat pdf filling template',
      'fillable pdf template workflow',
      'save pdf field mapping',
      'reopen pdf form template',
      'pdf template automation',
    ],
    valuePoints: [
      'Save reviewed field geometry, names, mapping rules, field appearance, and fill behavior.',
      'Reopen templates without rebuilding the field set on every repeat workflow.',
      'Use saved templates as the base for Fill By Link, API Fill, groups, and signing workflows.',
    ],
    proofPoints: [
      'Saved forms persist versioned editor snapshots for reopen and group-switch hydration.',
      'Saved templates preserve deterministic fill rules for checkbox, radio, and text split/join behavior.',
      'Profile limits keep saved forms visible and lock excess templates on downgrade instead of silently deleting them.',
    ],
    articleSections: [
      {
        title: 'A saved template is the product of the review loop',
        paragraphs: [
          'The valuable part of a PDF automation workflow is not the first upload. It is the reviewed template that comes out of detection cleanup, rename, mapping, fill testing, and output inspection. Saving that state is what prevents the team from repeating the same setup work every time the form returns.',
          'DullyPDF saved templates keep the operational metadata beside the source PDF: field geometry, names, types, mappings, appearance choices, and fill rules. That makes the next run start from a trusted baseline instead of a blank editor.',
        ],
      },
      {
        title: 'Save before publishing dependent workflows',
        paragraphs: [
          'Fill By Link, API Fill, signing, and grouped packet workflows need a stable source template. Publishing those workflows from an unsaved or unreviewed setup creates unnecessary risk because the downstream link or endpoint depends on whatever metadata exists at that moment.',
          'The practical order is simple: detect, clean, rename or map, test one record, save the template, then publish dependent workflows. That order keeps later changes intentional.',
        ],
      },
      {
        title: 'Saved snapshots reduce re-extraction churn',
        paragraphs: [
          'Reopened templates hydrate from saved editor snapshots and stored metadata instead of forcing a full field extraction every time. That matters for operators who return to the same forms daily or switch between templates inside a group.',
          'The snapshot is not a substitute for version review when the source form changes. It is a way to preserve the known-good template state for the exact source PDF that has already been reviewed.',
        ],
      },
      {
        title: 'When to create a new template instead of editing the old one',
        paragraphs: [
          'If the underlying PDF revision changes materially, create or validate a new template rather than blindly reusing the old geometry. If the form layout is unchanged and only a schema column changed, a focused remap may be enough.',
          'Good template maintenance is conservative. Preserve canonical templates, avoid duplicate near-copies, and update only the part of the setup that actually changed.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I save a PDF template and reuse it later?',
        answer:
          'Yes. DullyPDF saved forms preserve PDF bytes, field metadata, mappings, appearance, and fill rules for repeat workflows.',
      },
      {
        question: 'Do saved templates support Fill By Link and API Fill?',
        answer:
          'Yes. Fill By Link and API Fill start from saved template snapshots, not from temporary unsaved editor state.',
      },
      {
        question: 'Should I save before testing a fill?',
        answer:
          'Test one representative fill before treating the saved template as production-ready. Saving preserves the setup, but QA proves it.',
      },
    ],
    relatedIntentPages: ['pdf-to-fillable-form', 'fill-pdf-by-link', 'pdf-fill-api', 'pdf-packet-workflow'],
    relatedDocs: ['save-download-profile', 'editor-workflow', 'getting-started'],
  },
  {
    key: 'pdf-packet-workflow',
    category: 'workflow',
    path: '/pdf-packet-workflow',
    navLabel: 'PDF Packet Workflow',
    heroTitle: 'PDF Packet Workflows With Saved Template Groups',
    heroSummary:
      'Group related saved PDF templates into a repeat packet, switch between documents, run batch Rename + Map, and fill the packet from one record.',
    seoTitle: 'PDF Packet Workflows With Saved Template Groups | DullyPDF',
    seoDescription:
      'Create saved PDF template groups for onboarding packets, claim packets, application packets, and other repeat document sets that share one data record.',
    seoKeywords: [
      'pdf packet workflow',
      'group pdf templates',
      'fill pdf packet from one record',
      'pdf packet automation',
      'saved pdf form group',
      'batch rename map pdf packet',
      'document packet automation',
      'multi form pdf workflow',
    ],
    valuePoints: [
      'Organize several saved templates under one named packet workflow.',
      'Switch between member templates without leaving the workspace context.',
      'Run Search & Fill, Fill By Link, and batch Rename + Map around the group model.',
    ],
    proofPoints: [
      'Create Group workflows are documented at canonical `/es/usage-docs/create-group` routes.',
      'Open groups can publish one merged Fill By Link built from distinct respondent-facing fields.',
      'Group API Fill can return a ZIP packet of per-template PDFs for packet workflows.',
    ],
    articleSections: [
      {
        title: 'Packets are different from one-off PDF filling',
        paragraphs: [
          'A packet workflow appears when one person, claim, job, applicant, project, or customer record has to populate several related PDFs. The operational problem is not only filling each form. It is keeping the packet consistent so the same source facts land correctly across every document.',
          'DullyPDF groups give teams a reusable way to keep those templates together. The group becomes the working context for switching forms, filling from a shared record, and managing packet-level publishing decisions.',
        ],
      },
      {
        title: 'Build the group from stable saved templates',
        paragraphs: [
          'A group should be assembled from templates that have already been reviewed individually. If one member has weak field names or untested checkbox behavior, the packet inherits that weakness.',
          'The safer rollout is to validate each anchor form, save it, create the group, then test one representative record across the whole packet. That turns packet automation into a controlled workflow instead of a larger version of the same manual risk.',
        ],
      },
      {
        title: 'Merged respondent forms are useful, but need boundaries',
        paragraphs: [
          'Group Fill By Link can publish one merged HTML form from the distinct respondent-facing fields across the group. That is useful when a respondent should answer once and the owner later generates several PDFs from the stored submission.',
          'The group link is tied to the current group schema. When membership changes, DullyPDF closes the active group link so the next publish reflects the updated template set.',
        ],
      },
      {
        title: 'API and ZIP output fit packet operations',
        paragraphs: [
          'Some teams need packet output from an internal system rather than a browser operator. Group API Fill supports that shape by returning a ZIP of per-template PDFs from one group-scoped endpoint.',
          'That is a better fit for packet generation than pretending one massive PDF is always the right output. Keeping each template separate can make review, replacement, and retention easier.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF group several PDF templates together?',
        answer:
          'Yes. Saved forms can be organized into groups for packet workflows, template switching, group filling, and batch Rename + Map.',
      },
      {
        question: 'Can one respondent link collect answers for a whole group?',
        answer:
          'Yes. An open group can publish one merged Fill By Link from the distinct respondent-facing fields across the group.',
      },
      {
        question: 'Can an API generate a whole PDF packet?',
        answer:
          'Yes. Group API Fill can generate a ZIP containing the per-template PDFs for the group workflow.',
      },
    ],
    relatedIntentPages: ['merge-fillable-pdf-forms', 'batch-fill-pdf-forms', 'fill-pdf-by-link', 'pdf-fill-api'],
    relatedDocs: ['create-group', 'search-fill', 'api-fill'],
  },
  {
    key: 'merge-fillable-pdf-forms',
    category: 'workflow',
    path: '/merge-fillable-pdf-forms',
    navLabel: 'Merge Fillable PDF Forms',
    heroTitle: 'Merge Fillable PDF Forms Safely',
    heroSummary:
      'Use DullyPDF page tools to insert, reorder, rotate, or delete pages in an active PDF, then review fields before saving, filling, signing, or publishing the template.',
    seoTitle: 'Merge Fillable PDF Forms Safely | DullyPDF',
    seoDescription:
      'Insert pages from another PDF, reorder or delete pages, then review fields before saving a reusable DullyPDF template, link, API fill, or signing workflow.',
    seoKeywords: [
      'merge fillable pdf forms',
      'combine fillable pdf forms',
      'merge pdf forms without losing fields',
      'combine pdf forms into one document',
      'insert pages into fillable pdf',
      'fillable pdf page organizer',
      'merge pdf template workflow',
      'combine pdf packet forms',
      'merge pdf forms for signature',
      'pdf form page management',
    ],
    valuePoints: [
      'Decide whether pages belong in one source PDF or in a saved template group.',
      'Stage page insertion, deletion, rotation, and ordering before rewriting the active source PDF.',
      'Review field metadata after page changes so the merged template stays dependable.',
    ],
    proofPoints: [
      'The PDF Tools menu includes Manage Pages for staged delete, reorder, rotate, and insert-from-PDF edits.',
      'Inserted pages start without DullyPDF field metadata, so field cleanup remains part of the merge workflow.',
      'Saved template groups stay available when separate PDFs should remain separate but share one record context.',
      'Compress / Optimize PDF can run after page structure is stable using lossless cleanup that keeps the current PDF bytes when the optimized result is larger.',
    ],
    articleSections: [
      {
        title: 'Why generic PDF merging breaks down for form workflows',
        paragraphs: [
          'A generic merge tool can put pages in the same file, but most teams searching for a way to merge fillable PDF forms need more than page concatenation. They need the resulting document to remain usable as a template: fields should be findable, names should still make sense, mapped values should still land in the right places, and the final output should survive review before it is sent, signed, or archived.',
          'That is the difference DullyPDF should make clear. The page operation is only one part of the workflow. The safer sequence is to manage pages, inspect the field model, run one representative fill, and only then treat the merged PDF as a reusable template.',
        ],
        bullets: [
          'Best fit: one final document must contain pages from multiple PDFs and still go through DullyPDF field review.',
          'Poor fit: one-off page stitching where no template, mapping, Fill By Link, API Fill, or signing workflow will follow.',
        ],
      },
      {
        title: 'When to merge pages and when to keep PDFs as a group',
        paragraphs: [
          'Not every packet should become one large PDF. If the documents need separate templates, separate downloads, or group API output as a ZIP of member PDFs, a saved template group is usually cleaner. Groups keep each recurring PDF as its own reviewed template while still letting one record drive the packet.',
          'Merging pages makes more sense when the business process expects one combined document: one source PDF, one final output, one signature handoff, or one archive record. The important decision is not whether combining pages is possible. It is whether combining pages improves the operational workflow or hides useful document boundaries.',
        ],
        bullets: [
          'Use Manage Pages when the final PDF should be one combined document.',
          'Use Create Group when the packet should keep separate member templates that share data.',
          'Avoid turning unrelated PDFs into one template just because they happen to be sent together.',
        ],
      },
      {
        title: 'How DullyPDF handles page insertion inside a template',
        paragraphs: [
          'Inside the editor, PDF Tools exposes Manage Pages. That dialog stages the page plan before the active source PDF is rewritten. Operators can delete pages, move pages up or down, rotate pages in 90-degree steps, and insert selected page ranges from another PDF.',
          'That staged approach matters because page changes can affect the field model. Existing current-PDF pages can keep their reviewed fields through reorder, rotation, or deletion handling, but inserted pages are new source pages. After insertion, those pages need field creation or a broader template setup pass before they can participate in filling.',
        ],
      },
      {
        title: 'What happens to fields after page changes',
        paragraphs: [
          'A fillable PDF template is a combination of the source PDF bytes and DullyPDF metadata: field names, field types, geometry, mappings, appearance, fill rules, and other workflow settings. Page changes update the source document, but they do not remove the need to inspect that metadata.',
          'The practical rule is simple: any page operation should be followed by field QA. Deleted pages should not leave stale fields behind. Reordered pages should still show fields in the right visual place. Rotated pages need geometry review. Inserted pages start without DullyPDF field metadata, so add fields manually or rerun the relevant template workflow if those pages need detection.',
        ],
      },
      {
        title: 'A safe merge checklist before publishing or signing',
        paragraphs: [
          'The highest-risk mistake is treating a merged file as finished immediately after the pages look right. The page order may be correct while field names, checkbox groups, signatures, or mapped values still need cleanup. A short QA checklist catches that before the template becomes a public link, API endpoint, or signing source.',
          'After merging, review the field list, inspect each inserted page, run one Search & Fill record or manual fill, download the expected output mode, and compare the result against the source. If the merged document will be signed, freeze and send it only after the filled version has been reviewed.',
        ],
        bullets: [
          'Confirm the final page order and remove any placeholder pages.',
          'Review field count, geometry, names, types, and required signature anchors.',
          'Run one representative fill before saving, publishing, API enabling, or sending for signature.',
          'Choose flat output for final records and editable output only when live fields must remain available.',
        ],
      },
      {
        title: 'Compression belongs after the merged template is stable',
        paragraphs: [
          'DullyPDF also exposes Compress / Optimize PDF from the PDF Tools menu. That action is intentionally lossless: it rewrites object streams and deflates streams without trying to reduce image quality, and it keeps the current PDF bytes if the optimized result would be larger.',
          'Run that step after the page structure is stable, not while the template is still being rearranged. Compression should be a cleanup pass on a reviewed document, not a substitute for field QA or page-order review.',
        ],
      },
      {
        title: 'Why this page should not promise magic field preservation',
        paragraphs: [
          'Some searchers want to merge fillable PDFs and keep every original form field exactly as each outside PDF author created it. That is a risky promise for any workflow tool because source PDFs may carry inconsistent AcroForm names, duplicate widget identifiers, incompatible appearances, or fields that were never designed to coexist in one file.',
          'DullyPDF should compete by being clearer, not by overclaiming. It can help teams combine pages into a reviewed template workflow, preserve the operator-visible review loop, and connect the final template to filling, links, API output, and signing. That is stronger than pretending page merging alone makes a reliable form workflow.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I merge fillable PDF forms in DullyPDF?',
        answer:
          'Yes. Use PDF Tools > Manage Pages to insert pages from another PDF into the active source PDF, then review or add fields before saving the merged template.',
      },
      {
        question: 'Will inserted pages keep their DullyPDF fields automatically?',
        answer:
          'No. Inserted pages start without DullyPDF field metadata. Add fields manually after insertion or rerun the broader template workflow if those pages need detector-generated fields.',
      },
      {
        question: 'Should I merge a packet or use a saved template group?',
        answer:
          'Merge pages when the final workflow needs one combined PDF. Use a saved template group when the packet should keep separate member templates that share one record context.',
      },
      {
        question: 'Can I compress the PDF after merging forms?',
        answer:
          'Yes. Compress / Optimize PDF runs lossless cleanup after the page structure is stable, and DullyPDF keeps the current PDF bytes if optimization would make the file larger.',
      },
      {
        question: 'Can a merged PDF go into Fill By Link, API Fill, or signing?',
        answer:
          'Yes, after the merged template is reviewed and saved. Run at least one representative fill before publishing a link, enabling an API endpoint, or freezing the document for signature.',
      },
    ],
    supportSections: [
      {
        title: 'Use the right DullyPDF workflow after merging',
        paragraphs: [
          'A merged PDF is safest when it flows into the same review paths as any other template: editor cleanup, saved template reuse, Search & Fill validation, and the correct final output mode.',
        ],
        links: [
          {
            label: 'Editor workflow docs',
            href: '/es/usage-docs/editor-workflow',
            description: 'Review fields, geometry, names, types, and output behavior after page changes.',
          },
          {
            label: 'Create Group docs',
            href: '/es/usage-docs/create-group',
            description: 'Keep related PDFs as separate templates when a grouped packet is cleaner than one merged file.',
          },
          {
            label: 'Search & Fill docs',
            href: '/es/usage-docs/search-fill',
            description: 'Run one representative row through the merged template before publishing or signing.',
          },
        ],
      },
    ],
    relatedIntentPages: ['pdf-packet-workflow', 'batch-fill-pdf-forms', 'save-reusable-pdf-template', 'flat-vs-editable-pdf'],
    relatedDocs: ['editor-workflow', 'create-group', 'search-fill', 'save-download-profile'],
  },
  {
    key: 'reorder-fillable-pdf-pages',
    category: 'workflow',
    path: '/reorder-fillable-pdf-pages',
    navLabel: 'Reorder Fillable PDF Pages',
    heroTitle: 'Reorder Fillable PDF Pages Safely',
    heroSummary:
      'Move pages inside an active fillable PDF with staged page tools, keep current-page fields traveling with their pages, and review the template before reuse.',
    seoTitle: 'Reorder Fillable PDF Pages Safely | DullyPDF',
    seoDescription:
      'Reorder pages in a fillable PDF with DullyPDF Manage Pages, keep current-page fields with their source pages, and review field geometry before reuse.',
    seoKeywords: [
      'reorder fillable pdf pages',
      'rearrange fillable pdf pages',
      'reorder pdf pages with form fields',
      'organize fillable pdf pages',
      'move pages in fillable pdf',
      'rearrange editable pdf pages',
      'reorder pdf form pages',
      'fillable pdf page organizer',
      'reorder pdf template pages',
      'reorder pdf pages without losing fields',
    ],
    valuePoints: [
      'Stage the final page order before rewriting the active source PDF.',
      'Move fields on current PDF pages with the pages they belong to.',
      'Review page-dependent mappings, signatures, calculations, and final output before saving or publishing.',
    ],
    proofPoints: [
      'Manage Pages provides Up and Down controls for each page card and summarizes staged order changes before applying them.',
      'Fields on reordered current-PDF pages move with those pages in the active field set.',
      'The final page plan must keep at least one page before DullyPDF applies changes.',
      'Page management stays connected to the broader editor workflow, so operators can review fields, save templates, publish links, run API Fill, or send for signature after the page order is stable.',
    ],
    articleSections: [
      {
        title: 'Why reordering a fillable PDF needs field-aware review',
        paragraphs: [
          'Reordering pages in a normal PDF is mostly a visual operation. Reordering pages in a fillable PDF template also changes how the operator should reason about fields, page references, mapped values, signature locations, image helpers, barcode helpers, and calculated outputs. A document can look correctly ordered while a workflow dependency still needs review.',
          'DullyPDF treats page order as part of template setup. The page move happens inside Manage Pages, then the resulting template should go back through field review before it becomes a saved template, Fill By Link, API endpoint, signing source, or final download.',
        ],
        bullets: [
          'Best fit: moving pages into the order the recurring template should keep.',
          'Poor fit: creating a one-off partial copy for one recipient; selected-page download is safer for that.',
        ],
      },
      {
        title: 'Use Manage Pages when the source page order should change',
        paragraphs: [
          'The permanent reorder path is PDF Tools > Manage Pages. Each page card has Up and Down controls, and the Summary panel reports when the order has changed. DullyPDF does not rewrite the active source PDF until the staged plan is applied.',
          'That staging step matters because a page-order mistake can change what reviewers, respondents, or signers see first. Treat the dialog as a planning surface: move pages, inspect the final order, reset if needed, then apply only when the sequence is correct.',
        ],
      },
      {
        title: 'What happens to fields when current pages move',
        paragraphs: [
          'Fields on reordered current-PDF pages move with those pages. That keeps field geometry attached to the same visual source page instead of leaving fields behind on the old page number.',
          'This does not remove the need for review. A field may still rely on context from a nearby page, a signature instruction, a calculated total, or a checkbox explanation that moved relative to the rest of the packet. The field can travel correctly while the overall document order still deserves QA.',
        ],
      },
      {
        title: 'Check page dependencies before changing the order',
        paragraphs: [
          'Many PDFs are structured as more than isolated pages. An instruction page may explain the next page. A disclosure may need to appear before a signature. A calculation summary may belong after supporting line items. A barcode or QR field may need to stay near the values it represents.',
          'Before applying a reordered template, check those dependencies explicitly. The goal is not just a visually pleasing order. The goal is an order that still works for filling, review, signing, printing, and archiving.',
        ],
        bullets: [
          'Keep instructions, disclosures, and signature pages in a defensible sequence.',
          'Check calculation summaries, totals, barcode helpers, image helpers, and checkbox/radio explanations.',
          'Run one representative fill after the order changes.',
        ],
      },
      {
        title: 'Reorder, split, merge, delete, and compress are different jobs',
        paragraphs: [
          'Reordering changes the sequence of pages in the active source PDF. Splitting exports a selected-page subset. Merging inserts pages from another PDF. Deleting removes pages from the source template. Compression performs lossless cleanup after the document structure is stable.',
          'Keeping those jobs separate makes the workflow safer. If the source template should keep the new sequence, use Manage Pages and reorder. If only one output should use a different subset, use Download specific pages. If the file is large, clean up pages first and optimize after review.',
        ],
      },
      {
        title: 'A safe reorder checklist before saving or publishing',
        paragraphs: [
          'After applying page reordering, treat the document like a changed template. The final order should be reviewed visually, but the field model and output behavior need review too.',
          'That review is especially important before Fill By Link, API Fill, or signing because those workflows depend on the saved template state. Once a public link, endpoint, or signing request uses the template, page-order mistakes become harder to catch.',
        ],
        bullets: [
          'Confirm the visible page sequence and final page count.',
          'Review field overlays, field names, checkbox/radio groups, signatures, image helpers, barcode helpers, and calculations.',
          'Run one Search & Fill row, link response, or API payload through the reordered template.',
          'Download the intended output mode and inspect the final PDF before relying on it.',
        ],
      },
      {
        title: 'Save only after the page order is stable',
        paragraphs: [
          'A saved DullyPDF template should represent the order the team actually wants to reuse. If the template is still being rearranged, avoid publishing dependent workflows until the page sequence has settled.',
          'Once the order is stable, save the template and continue into the workflow that fits the job: Search & Fill, Fill By Link, API Fill, selected-page output, signing, or compression as a final cleanup pass.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF reorder pages in a fillable PDF?',
        answer:
          'Yes. Use PDF Tools > Manage Pages, then move page cards with the Up and Down controls before applying the staged source-PDF update.',
      },
      {
        question: 'Do PDF fields move with reordered pages?',
        answer:
          'Fields on reordered current-PDF pages move with those pages. Review the field overlays and final output after applying the new order.',
      },
      {
        question: 'Does reordering pages change my saved template?',
        answer:
          'It changes the active source PDF after you apply the staged plan. Save the template only after reviewing the new order and field behavior.',
      },
      {
        question: 'Can I reorder pages without deleting or inserting anything?',
        answer:
          'Yes. Use only the Up and Down controls in Manage Pages, then apply the staged order when the final sequence is correct.',
      },
      {
        question: 'Should I reorder pages before Fill By Link, API Fill, or signing?',
        answer:
          'Yes. Reorder and review the source template before publishing a link, enabling API Fill, or sending the filled PDF for signature.',
      },
    ],
    supportSections: [
      {
        title: 'Reordering belongs in template review',
        paragraphs: [
          'Page order is part of the reusable template contract. Apply the order deliberately, then verify fields and output before the template feeds public or automated workflows.',
        ],
        links: [
          {
            label: 'Editor workflow docs',
            href: '/es/usage-docs/editor-workflow',
            description: 'Review field geometry, names, mappings, and output behavior after page-order changes.',
          },
          {
            label: 'Save & Download docs',
            href: '/es/usage-docs/save-download-profile',
            description: 'Understand when a changed source template should be saved versus when selected-page output is enough.',
          },
          {
            label: 'Merge Fillable PDF Forms',
            href: '/merge-fillable-pdf-forms',
            description: 'Use insertion and grouping guidance when reordering is part of a broader page-management workflow.',
          },
        ],
      },
    ],
    relatedIntentPages: ['merge-fillable-pdf-forms', 'delete-pages-from-fillable-pdf', 'split-fillable-pdf-forms', 'compress-fillable-pdf-forms'],
    relatedDocs: ['editor-workflow', 'save-download-profile', 'search-fill'],
  },
  {
    key: 'rotate-fillable-pdf-pages',
    category: 'workflow',
    path: '/rotate-fillable-pdf-pages',
    navLabel: 'Rotate Fillable PDF Pages',
    heroTitle: 'Rotate Fillable PDF Pages Safely',
    heroSummary:
      'Turn sideways or upside-down PDF pages 90 degrees at a time with staged Manage Pages controls, keep current-page fields traveling with their pages, and review geometry before reuse.',
    seoTitle: 'Rotate Fillable PDF Pages Safely | DullyPDF',
    seoDescription:
      'Rotate pages in a fillable PDF with DullyPDF Manage Pages, keep current-page fields with their source pages, and review field geometry before saving the template.',
    seoKeywords: [
      'rotate fillable pdf pages',
      'rotate pdf form pages',
      'rotate pages in fillable pdf',
      'rotate pdf without losing fields',
      'rotate scanned pdf form pages',
      'rotate landscape pdf form',
      'fix sideways pdf form page',
      'rotate pdf template pages',
      'rotate pdf form 90 degrees',
      'pdf page rotation form fields',
    ],
    valuePoints: [
      'Stage 90-degree rotation before rewriting the active source PDF.',
      'Rotate sideways scans, landscape pages, or misoriented form pages without rebuilding the template.',
      'Review field geometry and overlays after rotation so the saved template still matches the visible page.',
    ],
    proofPoints: [
      'Manage Pages supports rotation in 90-degree steps alongside delete, reorder, and insert-from-PDF operations.',
      'Fields on rotated current-PDF pages move with those pages, so geometry follows the visible rotation instead of staying on the old axis.',
      'The staged plan must keep at least one page before DullyPDF applies changes, and operators can reset before applying.',
      'After page changes, DullyPDF refreshes the active PDF bytes and backend session so Rename/Map and field review continue against the updated document.',
    ],
    articleSections: [
      {
        title: 'Why rotation matters for fillable PDFs, not just PDF viewers',
        paragraphs: [
          'A viewer-level rotation only changes what one person sees on screen. The PDF bytes stay the same. That is fine for casual reading, but it does not fix the underlying file for a template workflow. The next operator, respondent, or signer can still receive a sideways page.',
          'Rotating a fillable PDF inside DullyPDF is a different operation. It updates the active source PDF so the corrected orientation becomes part of the template, the saved snapshot, and any downstream link, API output, or signed record. That is the difference between a personal viewing hack and a real template fix.',
        ],
        bullets: [
          'Best fit: scans imported sideways, landscape pages that should be portrait, or misoriented pages that need to stay corrected in the saved template.',
          'Poor fit: temporary viewer rotation for one person; that does not change the PDF and does not propagate to recipients.',
        ],
      },
      {
        title: 'Use Manage Pages when the source orientation should change',
        paragraphs: [
          'The permanent rotation path is PDF Tools > Manage Pages. Each page card has controls for rotating in 90-degree steps so the operator can stage the final orientation before the active source PDF is rewritten.',
          'That staging is important because rotation interacts with field geometry. A page-by-page plan lets the operator confirm which pages should change, inspect the resulting orientation, reset before applying, and only then commit the source-PDF update.',
        ],
      },
      {
        title: 'What happens to fields when current pages rotate',
        paragraphs: [
          'Fields on rotated current-PDF pages move with those pages. After rotation, the field overlay should appear over the visually correct positions on the rotated page rather than staying attached to the old orientation.',
          'That behavior keeps the template usable, but it does not remove the need for review. Field width and height may now feel different against the rotated visible area, and signature boxes, image fields, or barcode helpers should be inspected so the visible layout still makes sense.',
        ],
      },
      {
        title: 'Rotation, reorder, merge, delete, and compress are different jobs',
        paragraphs: [
          'Rotation changes orientation. Reorder changes sequence. Merge inserts new pages. Delete removes pages. Compression performs lossless cleanup after the structure is stable. Mixing these in one mental step makes mistakes easier to miss.',
          'Keep each operation deliberate. Rotate the pages that need rotation, reorder if the sequence should change, then move on to other page edits in their own pass. That makes review easier and keeps the saved template honest about what actually changed.',
        ],
        bullets: [
          'Rotate when orientation is wrong for the recurring template.',
          'Reorder when the sequence should change.',
          'Merge or delete when the document should gain or lose pages entirely.',
          'Compress only after page structure is stable.',
        ],
      },
      {
        title: 'A safe rotation checklist before saving or publishing',
        paragraphs: [
          'After applying rotation, treat the template like any other page-edited document. The visible orientation should look correct on every screen the workflow uses, and the field model deserves the same review pass that follows other Manage Pages operations.',
          'That review especially matters before Fill By Link, API Fill, or signing because those workflows depend on the saved template. A rotated page that still has misaligned signature anchors or oddly sized text fields can quietly produce bad output once the public link or signing request is live.',
        ],
        bullets: [
          'Confirm every rotated page looks correct on desktop and mobile previews.',
          'Review field overlays, signature anchors, image helpers, and barcode helpers on the rotated pages.',
          'Run one Search & Fill row, link response, or API payload through the rotated template before publishing.',
          'Choose flat output for final records once the rotation is verified.',
        ],
      },
      {
        title: 'Save only after the rotated orientation is stable',
        paragraphs: [
          'A saved DullyPDF template should represent the orientation the team actually wants to reuse. If the template is still being rotated, avoid publishing dependent workflows until the final orientation has settled.',
          'Once the rotation is stable, save the template and continue into the workflow that fits the job: Search & Fill, Fill By Link, API Fill, selected-page output, signing, or compression as a final cleanup pass.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF rotate pages in a fillable PDF?',
        answer:
          'Yes. Use PDF Tools > Manage Pages, then rotate page cards in 90-degree steps before applying the staged source-PDF update.',
      },
      {
        question: 'Do PDF fields rotate with their pages?',
        answer:
          'Fields on rotated current-PDF pages move with those pages, so the overlay follows the visible orientation. Review the rotated geometry before saving.',
      },
      {
        question: 'Is this different from rotating in a PDF viewer?',
        answer:
          'Yes. Viewer rotation only changes what one person sees. DullyPDF rotation rewrites the active source PDF so the orientation persists in the template and any downstream link, API, or signed record.',
      },
      {
        question: 'Can I rotate one page without changing the others?',
        answer:
          'Yes. Manage Pages stages rotation per page card, so only the selected pages change before the staged plan is applied.',
      },
      {
        question: 'Should I rotate pages before Fill By Link, API Fill, or signing?',
        answer:
          'Yes. Rotate and review the source template before publishing a link, enabling API Fill, or sending the filled PDF for signature so respondents and signers see the corrected orientation.',
      },
    ],
    supportSections: [
      {
        title: 'Rotation belongs in template review',
        paragraphs: [
          'Orientation is part of the reusable template contract. Apply rotation deliberately, then verify fields and output before the template feeds public or automated workflows.',
        ],
        links: [
          {
            label: 'Editor workflow docs',
            href: '/es/usage-docs/editor-workflow',
            description: 'Review field geometry, names, mappings, and output behavior after orientation changes.',
          },
          {
            label: 'Save & Download docs',
            href: '/es/usage-docs/save-download-profile',
            description: 'Save the rotated template only after the orientation and field overlays are stable.',
          },
          {
            label: 'Reorder Fillable PDF Pages',
            href: '/reorder-fillable-pdf-pages',
            description: 'Use sequence controls when the issue is page order rather than page orientation.',
          },
        ],
      },
    ],
    relatedIntentPages: ['reorder-fillable-pdf-pages', 'merge-fillable-pdf-forms', 'delete-pages-from-fillable-pdf', 'compress-fillable-pdf-forms'],
    relatedDocs: ['editor-workflow', 'save-download-profile', 'search-fill'],
  },
  {
    key: 'split-fillable-pdf-forms',
    category: 'workflow',
    path: '/split-fillable-pdf-forms',
    navLabel: 'Split Fillable PDF Forms',
    heroTitle: 'Split Fillable PDF Forms Safely',
    heroSummary:
      'Export selected PDF pages as a flat or editable subset without changing the active workspace, or use page tools when the source template itself should be trimmed.',
    seoTitle: 'Split Fillable PDF Forms Safely | DullyPDF',
    seoDescription:
      'Choose specific pages from a fillable PDF, export a flat or editable subset, and keep field review clear before saving templates, links, API output, or signature workflows.',
    seoKeywords: [
      'split fillable pdf forms',
      'split pdf form without losing fields',
      'download specific pages from fillable pdf',
      'extract pages from fillable pdf',
      'split editable pdf form',
      'split flat pdf form',
      'pdf selected page export',
      'separate pdf form pages',
      'split pdf template workflow',
      'fillable pdf page subset',
    ],
    valuePoints: [
      'Export only the pages you need without mutating the active workspace PDF.',
      'Choose flat or editable output for the selected-page subset.',
      'Use Manage Pages only when the source template itself should lose pages.',
    ],
    proofPoints: [
      'The Download menu includes Download specific pages for selected-page flat or editable exports.',
      'Selected-page export keeps fields on the chosen pages and remaps them into the new page order.',
      'The page range input accepts individual pages, ranges, reverse ranges, last, and all.',
      'Manage Pages remains available when page deletion should rewrite the active source PDF instead of producing a one-off download.',
    ],
    articleSections: [
      {
        title: 'Why splitting fillable PDFs needs more care than cutting pages',
        paragraphs: [
          'A normal PDF splitter only asks which pages should be extracted. A fillable PDF workflow has another layer: field metadata, output mode, mappings, signatures, calculations, and saved-template state. If those details are ignored, the split file may look right while the fields no longer behave the way the operator expects.',
          'DullyPDF treats splitting as a workflow choice. Sometimes you need a one-off selected-page output from the current filled record. Other times you need to permanently trim the source template and review fields again. Those are different jobs, and they should not be collapsed into one vague split button.',
        ],
        bullets: [
          'Best fit: exporting a page subset from a reviewed template or trimming a source form under operator review.',
          'Poor fit: blind batch splitting where dozens of independent output files should be generated with no review step.',
        ],
      },
      {
        title: 'Use Download specific pages for one-off split output',
        paragraphs: [
          'The safest split path for an ad hoc output is the Download menu. Download specific pages lets the operator choose a page range, select flat or editable output, and export only those pages without changing the active workspace PDF. The original template stays open and intact.',
          'That matters when the team needs a partial copy for a recipient, an internal review packet, a supporting attachment, or a final record that should include only some pages. The split is an output decision, not a template mutation.',
        ],
        bullets: [
          'Use editable output when someone must keep working inside live fields.',
          'Use flat output when the selected pages are a final record or recipient copy.',
          'Use the full download when omitted pages contain required context, signatures, or calculations.',
        ],
      },
      {
        title: 'Use Manage Pages when the source PDF itself should change',
        paragraphs: [
          'If the template should permanently remove pages, use PDF Tools and Manage Pages instead. That path stages page deletion before rewriting the active source PDF. After the change, fields on deleted pages are removed and fields on kept pages remain part of the active template workflow.',
          'This is the right path when a recurring form has cover pages, instruction pages, duplicate sheets, or obsolete sections that should not stay in the saved template. Because the source document changes, it should be followed by the same field QA you would run after any page edit.',
        ],
      },
      {
        title: 'What happens to fields in selected-page exports',
        paragraphs: [
          'Selected-page export includes fields that live on the chosen pages and remaps those fields into the output page order. Fields on omitted pages are not included because those pages are not part of the split file. That is usually what the operator wants, but it means page selection needs to account for dependencies.',
          'If a selected page references information, signatures, checkbox context, or calculated values that appear on an omitted page, the output may be incomplete even though the selected pages exported correctly. Include the dependent pages or build a separate reviewed template for that narrower document.',
        ],
      },
      {
        title: 'Page ranges should be explicit and reviewable',
        paragraphs: [
          'The page picker supports common range syntax such as individual pages, ranges, reverse ranges, all, and last. That makes it fast to export pages like 1-2 and 5 without manually deleting the rest of the document.',
          'For recurring work, write down the intended range and test it with a representative record. A split workflow should be predictable enough that another operator can choose the same pages and understand why those pages belong together.',
        ],
      },
      {
        title: 'When a split should become its own saved template',
        paragraphs: [
          'If the same page subset is needed repeatedly, do not keep treating it as an ad hoc split forever. Create or save a template that represents that subset, review its fields, and use that template directly through Search & Fill, Fill By Link, API Fill, or signing.',
          'That keeps repeat workflows cleaner. One-off selected-page downloads are useful, but recurring documents deserve their own template boundary so field names, mappings, output behavior, and QA expectations stay stable.',
        ],
      },
      {
        title: 'A safe split checklist before sending a partial PDF',
        paragraphs: [
          'Before sending a split output, confirm that the selected pages include the required context, the output mode matches the recipient need, fields on kept pages are populated correctly, and no signature or calculation dependency was left behind on an omitted page.',
          'That review is especially important when the partial PDF will become a final record. A split file can be technically valid while still missing the page that explains a checkbox, contains a signature, or carries a total that another page references.',
        ],
        bullets: [
          'Confirm the intended page range before exporting.',
          'Choose flat output for final records and editable output only when live fields must remain available.',
          'Check selected pages for field values, signatures, barcode/image helpers, and calculation outputs.',
          'If the subset will recur, save a dedicated template instead of relying on memory.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF split a fillable PDF form?',
        answer:
          'Yes. Use Download specific pages to export a selected page subset as flat or editable output without changing the active workspace PDF.',
      },
      {
        question: 'Will fields remain in the split PDF?',
        answer:
          'Fields on selected pages are included and remapped into the new output pages. Fields on omitted pages are not included.',
      },
      {
        question: 'Does Download specific pages change my saved template?',
        answer:
          'No. It creates a one-off selected-page output. Use Manage Pages when the active source PDF itself should be trimmed.',
      },
      {
        question: 'Can DullyPDF create many split PDFs at once?',
        answer:
          'Not as a blind batch splitter. The current workflow exports one reviewed page subset at a time; recurring subsets should become saved templates or groups.',
      },
      {
        question: 'Should split outputs be flat or editable?',
        answer:
          'Use flat output for final recipient copies and records. Use editable output when someone needs to continue working in live PDF fields.',
      },
    ],
    supportSections: [
      {
        title: 'Split output fits into the same review workflow',
        paragraphs: [
          'Selected-page exports are strongest after the template has already been reviewed. The split output should inherit that quality instead of becoming a shortcut around QA.',
        ],
        links: [
          {
            label: 'Save & Download docs',
            href: '/es/usage-docs/save-download-profile',
            description: 'Understand full downloads, selected-page downloads, saved templates, and output mode choices.',
          },
          {
            label: 'Editor workflow docs',
            href: '/es/usage-docs/editor-workflow',
            description: 'Review fields and page changes before relying on a split output.',
          },
          {
            label: 'Flat vs Editable PDF',
            href: '/flat-vs-editable-pdf',
            description: 'Choose the right output mode for final records versus continued field editing.',
          },
        ],
      },
    ],
    relatedIntentPages: ['merge-fillable-pdf-forms', 'flat-vs-editable-pdf', 'save-reusable-pdf-template', 'pdf-packet-workflow'],
    relatedDocs: ['save-download-profile', 'editor-workflow', 'create-group'],
  },
  {
    key: 'delete-pages-from-fillable-pdf',
    category: 'workflow',
    path: '/delete-pages-from-fillable-pdf',
    navLabel: 'Delete Pages From Fillable PDF',
    heroTitle: 'Delete Pages From Fillable PDFs Safely',
    heroSummary:
      'Remove instruction pages, duplicates, or obsolete sections from an active PDF while keeping field cleanup, saved-template QA, and final output review explicit.',
    seoTitle: 'Delete Pages From Fillable PDFs Safely | DullyPDF',
    seoDescription:
      'Delete pages from a fillable PDF template, remove fields on deleted pages, and review the remaining field model before saving, publishing, filling, or signing.',
    seoKeywords: [
      'delete pages from fillable pdf',
      'remove pages from fillable pdf',
      'delete pdf form pages',
      'remove pages from pdf form',
      'delete pages without losing pdf fields',
      'remove instruction pages from pdf form',
      'delete blank pages from fillable pdf',
      'trim fillable pdf template',
      'pdf page deletion field cleanup',
      'fillable pdf page management',
    ],
    valuePoints: [
      'Stage page deletion before rewriting the active source PDF.',
      'Remove fields that belonged to deleted pages instead of leaving stale template metadata behind.',
      'Use selected-page download when you only need a partial output and should not mutate the template.',
    ],
    proofPoints: [
      'Manage Pages supports staged delete, reorder, rotate, and insert-from-PDF operations before applying source-PDF changes.',
      'When a source page is deleted, DullyPDF removes fields on that page from the active field set.',
      'The final page plan must keep at least one page before changes can be applied.',
      'After page changes, DullyPDF refreshes the active PDF bytes and backend session when possible so Rename/Map can continue against the updated document.',
    ],
    articleSections: [
      {
        title: 'Why deleting pages from a fillable PDF is not just page cleanup',
        paragraphs: [
          'Deleting a page from an ordinary PDF is mostly a layout operation. Deleting a page from a fillable PDF template also changes the field model. Any text fields, checkbox groups, signatures, image helpers, barcode helpers, mappings, or calculated outputs on the removed page must stop participating in the workflow.',
          'That is why DullyPDF treats page deletion as a template-editing step, not only a file-size cleanup step. The goal is to remove pages without leaving stale field metadata behind, then review the remaining template before it becomes a saved form, link, API endpoint, or signing source.',
        ],
        bullets: [
          'Best fit: removing cover pages, instruction pages, duplicates, blank pages, obsolete sections, or packet pages that should not stay in the reusable template.',
          'Poor fit: hiding pages from one recipient while the source template should remain unchanged; use selected-page download for that.',
        ],
      },
      {
        title: 'Use Manage Pages when the template should permanently lose pages',
        paragraphs: [
          'The permanent delete path is PDF Tools > Manage Pages. The dialog lets the operator select pages, mark them for removal, inspect the staged final page count, reset before applying, and then rewrite the active source PDF only after the staged plan is accepted.',
          'That staging step is important because deleting the wrong page can remove fields and context the workflow still needs. Treat the dialog like a review gate: confirm the pages, confirm the final count, and only then apply the source-PDF change.',
        ],
      },
      {
        title: 'Use Download specific pages when deletion is only an output decision',
        paragraphs: [
          'Sometimes the operator does not need to delete anything from the template. They only need a partial copy for a recipient, a supporting attachment, or an internal reviewer. In that case, Download specific pages is safer because it exports a selected page subset without changing the active workspace PDF.',
          'That distinction keeps reusable templates stable. Delete pages when the source should change. Export selected pages when only this one output should be shorter.',
        ],
        bullets: [
          'Delete pages for permanent source cleanup.',
          'Download specific pages for one-off partial output.',
          'Create a separate saved template when the same trimmed document will recur.',
        ],
      },
      {
        title: 'What happens to fields on deleted pages',
        paragraphs: [
          'Fields on deleted source pages are removed from the active field set. Fields on retained pages continue with those pages, and reordered pages carry their fields into the new order. That behavior prevents the most dangerous failure mode: a saved template that still thinks a removed page has fillable fields.',
          'The remaining fields still deserve review. After deletion, scan the field list and the visual overlay for missing context, broken group logic, orphaned calculations, or signatures that depended on the removed page.',
        ],
      },
      {
        title: 'Common pages to delete and pages to keep',
        paragraphs: [
          'Good deletion candidates are pages that do not belong in the recurring fill workflow: duplicate pages, accidental blanks, obsolete versions, local cover sheets, or instructions that your internal process stores somewhere else. Removing those pages can make the template cleaner and reduce avoidable review noise.',
          'Be more careful with disclosure pages, signature instructions, calculation summaries, legal notices, or any page that explains a checkbox or recipient obligation. A page can be visually boring and still be necessary context for the final record.',
        ],
      },
      {
        title: 'A safe deletion checklist before saving or publishing',
        paragraphs: [
          'After applying page deletion, treat the document like a changed template. Verify the final page count, review the remaining field list, test one representative fill, and check the output mode that the next workflow will use.',
          'That is especially important before Fill By Link, API Fill, or signing. Those workflows rely on the saved template state. If deletion removed a field that was mapped, calculated, or expected by a signer, the problem should be caught before a public link or immutable signing source depends on it.',
        ],
        bullets: [
          'Confirm the deleted pages were not required for context, signatures, calculations, or disclosures.',
          'Review field names, geometry, checkbox/radio groups, image helpers, barcode helpers, and calculation dependencies.',
          'Run one fill against representative data before saving, publishing, API enabling, or sending for signature.',
          'Use Compress / Optimize PDF only after the page structure and fields are stable.',
        ],
      },
      {
        title: 'Compression comes after deletion, not before QA',
        paragraphs: [
          'Deleting pages may reduce the document size, but compression is still a separate cleanup step. DullyPDF Compress / Optimize PDF performs lossless cleanup and keeps the current PDF bytes when the optimized result would be larger.',
          'Run compression after the template is stable. It should be the finishing pass on a reviewed source PDF, not a replacement for checking the remaining pages and fields.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF delete pages from a fillable PDF?',
        answer:
          'Yes. Use PDF Tools > Manage Pages to select pages, mark them for deletion, and apply the staged source-PDF update.',
      },
      {
        question: 'What happens to fields on deleted pages?',
        answer:
          'Fields on deleted source pages are removed from the active field set so the template does not retain stale fields for pages that no longer exist.',
      },
      {
        question: 'Should I delete pages or download specific pages?',
        answer:
          'Delete pages when the source template itself should change. Use Download specific pages when you only need a one-off partial output.',
      },
      {
        question: 'Can I delete instruction pages from an official form?',
        answer:
          'Only if your workflow no longer needs those pages. Keep instruction, disclosure, signature, or legal-context pages when they are required for the final record.',
      },
      {
        question: 'Can deleted-page templates still be used for Fill By Link, API Fill, or signing?',
        answer:
          'Yes, after reviewing and saving the updated template. Run at least one representative fill before publishing or freezing the document for signature.',
      },
    ],
    supportSections: [
      {
        title: 'Deletion should stay tied to template review',
        paragraphs: [
          'Page deletion is safest when it is followed by the same review steps as any other template change: field cleanup, representative fill, output check, and then save or publish.',
        ],
        links: [
          {
            label: 'Editor workflow docs',
            href: '/es/usage-docs/editor-workflow',
            description: 'Review the remaining fields and page geometry after source-PDF changes.',
          },
          {
            label: 'Save & Download docs',
            href: '/es/usage-docs/save-download-profile',
            description: 'Compare permanent template changes with one-off selected-page downloads.',
          },
          {
            label: 'Search & Fill docs',
            href: '/es/usage-docs/search-fill',
            description: 'Test one representative record before relying on the trimmed template.',
          },
        ],
      },
    ],
    relatedIntentPages: ['split-fillable-pdf-forms', 'merge-fillable-pdf-forms', 'save-reusable-pdf-template', 'flat-vs-editable-pdf'],
    relatedDocs: ['editor-workflow', 'save-download-profile', 'search-fill'],
  },
  {
    key: 'compress-fillable-pdf-forms',
    category: 'workflow',
    path: '/compress-fillable-pdf-forms',
    navLabel: 'Compress Fillable PDF Forms',
    heroTitle: 'Compress Fillable PDF Forms Safely',
    heroSummary:
      'Run lossless PDF cleanup after template or page changes so a fillable PDF can shrink when possible while pages, fields, and geometry stay stable.',
    seoTitle: 'Compress Fillable PDF Forms Safely | DullyPDF',
    seoDescription:
      'Use DullyPDF Compress / Optimize PDF for lossless cleanup that rewrites object streams, deflates streams, keeps field geometry, and avoids larger replacements.',
    seoKeywords: [
      'compress fillable pdf forms',
      'compress fillable pdf',
      'reduce fillable pdf size',
      'compress pdf without losing fields',
      'optimize pdf form',
      'lossless pdf compression',
      'compress pdf template',
      'reduce pdf form file size',
      'compress editable pdf',
      'pdf form optimization',
    ],
    valuePoints: [
      'Run lossless cleanup after template review, page management, or selected output checks.',
      'Keep the same pages and field geometry in the active workspace.',
      'Avoid replacing the current PDF bytes when optimization would make the file larger.',
    ],
    proofPoints: [
      'Compress / Optimize PDF runs in Lossless cleanup mode from the PDF Tools workflow.',
      'The cleanup pass removes unreachable PDF objects, rewrites object streams, and deflates page, image, and font streams without intentionally lowering image quality.',
      'DullyPDF keeps the same pages and field geometry in the active workspace after optimization.',
      'If the optimized result is larger, DullyPDF keeps the current PDF bytes instead of replacing them with a larger file.',
    ],
    articleSections: [
      {
        title: 'Why compression is different for fillable PDF workflows',
        paragraphs: [
          'A normal PDF compression tool usually treats the file as a delivery asset. A fillable PDF template is more than that. It carries a page layout, live fields, DullyPDF metadata, mappings, signatures, barcode helpers, image helpers, calculation outputs, and saved workflow state that may feed links, API output, or repeated Search & Fill runs.',
          'That is why compression should be positioned as a finishing pass, not a shortcut around template review. The useful goal is to clean up PDF bytes after the document has been reviewed, while keeping the same page and field model the operator already approved.',
        ],
        bullets: [
          'Best fit: lossless cleanup after the template structure is stable and file size matters.',
          'Poor fit: trying to fix a bloated template before deleting obsolete pages or reviewing fields.',
        ],
      },
      {
        title: 'What DullyPDF Compress / Optimize PDF actually does',
        paragraphs: [
          'DullyPDF Compress / Optimize PDF is intentionally conservative. The workflow removes unreachable PDF objects, rewrites object streams, and deflates page, image, and font streams without intentionally lowering image quality. It is a cleanup pass for the active PDF, not a lossy image-downsampling promise.',
          'The dialog labels the mode as Lossless cleanup because the target is stability. The same pages and field geometry remain in the active workspace, so the operator can continue with field review, saving, selected-page output, Fill By Link, API Fill, or signing after the cleanup pass.',
        ],
      },
      {
        title: 'What compression should not promise',
        paragraphs: [
          'Some PDFs are already compact. Others are dominated by image data, embedded fonts, or authoring decisions that a lossless cleanup pass should not aggressively rewrite. In those cases, a responsible compression workflow may save little or nothing.',
          'That is not a failure of the template workflow. It is the correct boundary between safe optimization and destructive compression. If a team needs heavy image downsampling, that should be a separate choice with separate quality review, not a hidden side effect of optimizing a fillable form template.',
        ],
        bullets: [
          'No guaranteed file-size reduction for every source PDF.',
          'No intentional image-quality reduction in the DullyPDF cleanup pass.',
          'No substitute for deleting unnecessary pages when the file is large because the template contains unnecessary pages.',
        ],
      },
      {
        title: 'When to run compression in the workflow',
        paragraphs: [
          'The safest order is to finish structural edits first. Merge or insert pages, split selected outputs, permanently delete obsolete source pages when needed, review fields, test one representative fill, and then run compression if file size still matters.',
          'Running compression earlier is usually wasted effort because later page changes rewrite the active PDF again. Run it after the document shape is stable and before the template is saved, published, downloaded, or sent into a signature workflow.',
        ],
        bullets: [
          'After Manage Pages operations such as insert, reorder, rotate, or delete.',
          'After confirming field names, geometry, mappings, image helpers, barcode helpers, and calculations.',
          'Before final download, template save, Fill By Link publication, API use, or signing when smaller bytes matter.',
        ],
      },
      {
        title: 'Why DullyPDF keeps the current bytes if optimization is larger',
        paragraphs: [
          'Compression tools can make a PDF bigger when the source was already optimized or when the rewrite changes object layout without creating enough savings. DullyPDF avoids that regression by keeping the current PDF bytes if the optimized result would be larger.',
          'That behavior is important for operators who are cleaning up production templates. The workflow should never make a file larger just because the user pressed an Optimize button. It should either produce a smaller safe result or preserve the current version.',
        ],
      },
      {
        title: 'Compression QA checklist',
        paragraphs: [
          'After compression, review the same things that make a fillable PDF useful: pages, fields, mappings, signatures, barcode helpers, image helpers, calculations, and final output. A smaller file is only helpful if the template still behaves the same way.',
          'For high-stakes or repeat workflows, run one representative fill and compare the output mode users will actually receive. Editable output should preserve live field behavior where intended. Flat output should render the expected values into the page content.',
        ],
        bullets: [
          'Confirm the page count and visual layout did not change.',
          'Check field overlays, field list entries, mapped values, signatures, image helpers, barcode helpers, and calculated fields.',
          'Run one representative Search & Fill, link response, or API input before relying on the optimized template.',
          'Download the same output mode the workflow will use and inspect the final PDF.',
        ],
      },
      {
        title: 'Compression is not a substitute for template cleanup',
        paragraphs: [
          'If the PDF is large because it includes unused pages, obsolete packets, duplicates, or instructions that do not belong in the recurring template, page cleanup should happen first. Compression can clean up bytes, but it should not decide which pages or fields are operationally necessary.',
          'The practical rule is simple: remove or split structure deliberately, review the remaining template, then optimize. That keeps compression in its proper role as a safe final cleanup step.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF compress fillable PDF forms?',
        answer:
          'Yes. Use PDF Tools > Compress / Optimize PDF to run lossless cleanup on the active PDF while keeping the same pages and field geometry.',
      },
      {
        question: 'Will compression remove PDF form fields?',
        answer:
          'DullyPDF keeps the same pages and field geometry in the active workspace. Still review the field model and final output after optimization before publishing or signing.',
      },
      {
        question: 'Does compression reduce every fillable PDF?',
        answer:
          'No. Some PDFs are already optimized or cannot shrink safely with lossless cleanup. If the optimized result is larger, DullyPDF keeps the current PDF bytes.',
      },
      {
        question: 'Does DullyPDF lower image quality to compress PDFs?',
        answer:
          'No. Compress / Optimize PDF deflates streams without intentionally lowering image quality. Heavy image downsampling should be treated as a separate workflow with its own review.',
      },
      {
        question: 'Should I compress before signing or publishing a Fill By Link?',
        answer:
          'Compress after page structure, fields, mappings, and output behavior have been reviewed. Then save, publish, download, API enable, or send for signature from the stable optimized template.',
      },
    ],
    supportSections: [
      {
        title: 'Optimization belongs after review',
        paragraphs: [
          'Compression is safest when it follows the same operator review loop as other template changes: page structure, field cleanup, representative fill, output check, then final save or publish.',
        ],
        links: [
          {
            label: 'Editor workflow docs',
            href: '/es/usage-docs/editor-workflow',
            description: 'Review fields, geometry, mappings, signatures, helper fields, and output behavior before optimization becomes final.',
          },
          {
            label: 'Save & Download docs',
            href: '/es/usage-docs/save-download-profile',
            description: 'Choose flat, editable, or selected-page output after the optimized PDF is ready.',
          },
          {
            label: 'Flat vs Editable PDF',
            href: '/flat-vs-editable-pdf',
            description: 'Decide whether final records should preserve live fields or bake values into the page.',
          },
        ],
      },
    ],
    relatedIntentPages: ['delete-pages-from-fillable-pdf', 'split-fillable-pdf-forms', 'merge-fillable-pdf-forms', 'flat-vs-editable-pdf'],
    relatedDocs: ['editor-workflow', 'save-download-profile', 'search-fill'],
  },
  {
    key: 'fill-pdf-link-signature',
    category: 'workflow',
    path: '/fill-pdf-link-signature',
    navLabel: 'Fill Link + Signature',
    heroTitle: 'Collect PDF Answers by Link and Route the Record for Signature',
    heroSummary:
      'Publish a hosted web form, collect respondent answers, materialize the filled PDF, and continue into an email-based signing ceremony when the template requires it.',
    seoTitle: 'Collect PDF Answers by Link and Route for Signature | DullyPDF',
    seoDescription:
      'Use DullyPDF Fill By Link with post-submit signing to collect web-form answers, generate the filled PDF, and route the immutable record for email signature.',
    seoKeywords: [
      'fill pdf link signature',
      'web form to signed pdf',
      'collect pdf answers and sign',
      'fillable pdf link with signature',
      'pdf web form signature workflow',
      'respondent form to signed pdf',
      'fill by link signature',
      'online pdf form and signature',
    ],
    valuePoints: [
      'Collect respondent data in a mobile-friendly hosted form instead of asking people to edit the PDF directly.',
      'Map signer name and email questions before enabling post-submit signature requests.',
      'Materialize the reviewed filled PDF before the signer ceremony continues.',
    ],
    proofPoints: [
      'Template Fill By Link can enable `Require signature after submit` when signer identity questions are mapped.',
      'The backend materializes the immutable filled PDF from the stored response before sending the signing invite.',
      'Signature widgets stay out of the public respondent form because signature capture belongs to the signing ceremony.',
    ],
    articleSections: [
      {
        title: 'The link should collect data before signature starts',
        paragraphs: [
          'External respondents usually should not be asked to download a PDF, fill it in a random viewer, save it correctly, and then figure out how to sign it. A hosted web form is easier to complete and gives the owner structured answers to review.',
          'When signature is required after submit, DullyPDF uses the respondent answers to materialize the filled PDF first. The signing request then operates on that fixed source record instead of on a still-changing web form.',
        ],
      },
      {
        title: 'Signer identity mapping is a prerequisite',
        paragraphs: [
          'A post-submit signature workflow needs a visible full-name question and a visible email question so the signing invite can go to the right person. DullyPDF treats those mapped signer questions as required while signing stays enabled.',
          'This is intentionally stricter than a normal respondent form. A missing or invalid signer email should fail before a public submission creates an unusable signing request.',
        ],
      },
      {
        title: 'Signature fields are not ordinary respondent questions',
        paragraphs: [
          'A signature widget in the PDF should not turn into a generic web-form text box. Signature capture has its own ceremony, identity checks, review step, and retained evidence model.',
          'That is why DullyPDF excludes PDF signature widgets from public Fill By Link questions and routes signature work through the signing workflow instead.',
        ],
      },
      {
        title: 'Use this for records that need a controlled handoff',
        paragraphs: [
          'This workflow fits ordinary business records such as consents, acknowledgments, approvals, service agreements, internal authorizations, and similar forms where data collection and signature are connected.',
          'It is not a blanket legal answer for every document class or jurisdiction. Excluded or regulated document categories need separate policy review before being handled through a self-serve signing workflow.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can Fill By Link require a signature after submission?',
        answer:
          'Yes. A saved template link can require signature after submit when the signer full-name and email questions are mapped.',
      },
      {
        question: 'Does the respondent sign inside the public web form?',
        answer:
          'No. The public form collects answers first. Signature capture happens in the separate signing ceremony after the filled PDF is materialized.',
      },
      {
        question: 'Can group Fill By Link require signature after submit?',
        answer:
          'The post-submit signing handoff is a template-link workflow. Group links currently work from the merged PDF-derived field set.',
      },
    ],
    relatedIntentPages: ['fill-pdf-by-link', 'pdf-signature-workflow', 'esign-ueta-pdf-workflow', 'pdf-signature-audit-trail'],
    relatedDocs: ['fill-by-link', 'signature-workflow', 'save-download-profile'],
  },
  {
    key: 'pdf-signature-audit-trail',
    category: 'workflow',
    path: '/pdf-signature-audit-trail',
    navLabel: 'Signature Audit Trail',
    heroTitle: 'PDF Signature Audit Trail and Verification Workflow',
    heroSummary:
      'Freeze the exact filled PDF, route it for email signature, retain audit artifacts, and let recipients verify completed records through a public validation page.',
    seoTitle: 'PDF Signature Audit Trail and Verification Workflow | DullyPDF',
    seoDescription:
      'Create a controlled PDF signing workflow with immutable source records, retained audit evidence, signed artifacts, and public verification links.',
    seoKeywords: [
      'pdf signature audit trail',
      'signed pdf verification',
      'electronic signature audit trail pdf',
      'verify signed pdf online',
      'pdf signing evidence',
      'esign audit receipt',
      'immutable signed pdf workflow',
      'pdf signature validation link',
    ],
    valuePoints: [
      'Freeze the reviewed filled PDF before sending it for signature.',
      'Retain source and signed artifact metadata, ceremony timestamps, and completion evidence.',
      'Expose a public verification page so recipients can re-check the retained record later.',
    ],
    proofPoints: [
      'Completed signing flows expose `/verify-signing/:token` validation pages.',
      'Owner audit evidence is broader than the public receipt and preserves source/signed hashes and ceremony state.',
      'When configured, DullyPDF can embed a cryptographic PDF signature; otherwise the retained audit path remains the intended verification route.',
    ],
    articleSections: [
      {
        title: 'An audit trail starts before the email is sent',
        paragraphs: [
          'A useful PDF signing workflow does not begin at the signer click. It begins when the owner freezes the exact source record that the signer will review. If the source PDF can keep changing after the invite is sent, the audit story becomes weak.',
          'DullyPDF materializes the current filled record into an immutable source artifact before the signing ceremony. That source boundary is what connects the signature to the exact record the owner intended to send.',
        ],
      },
      {
        title: 'The owner evidence is richer than the public receipt',
        paragraphs: [
          'Public recipients need a readable receipt and verification path. Owners often need more operational detail: request identifiers, source and signed hashes, sender and signer identity fields, delivery state, OTP or access-check state, ceremony timestamps, retained artifact paths, and completion metadata.',
          'DullyPDF separates those audiences. The public receipt is intentionally narrower, while owner-side downloads expose the detailed evidence needed for internal review or dispute preparation.',
        ],
      },
      {
        title: 'Verification links are different from viewer trust badges',
        paragraphs: [
          'A PDF viewer trust badge depends on the embedded certificate chain and the viewer trust store. In development or self-signed configurations, viewers may show the embedded certificate as untrusted even when the record has a retained audit path.',
          'DullyPDF therefore treats the retained validation page and audit artifacts as an important verification path. When production PDF-signing identity is configured, embedded cryptographic signatures can add another inspection layer.',
        ],
      },
      {
        title: 'Scope matters for legal and regulated documents',
        paragraphs: [
          'The signing workflow is designed around ordinary supported business records and core U.S. electronic-signature mechanics. It is not a universal claim that every document type can be signed through a self-serve flow.',
          'Teams should keep excluded categories, notarization-required workflows, real-property recording, court documents, and other regulated programs outside the generic workflow unless they have completed separate policy review.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Does DullyPDF keep an audit trail for signed PDFs?',
        answer:
          'Yes. DullyPDF retains owner-side evidence such as source/signed hashes, request metadata, signer state, timestamps, and retained artifacts.',
      },
      {
        question: 'Can recipients verify a completed signing record later?',
        answer:
          'Yes. Completed signing flows expose a public verification page linked from the audit receipt.',
      },
      {
        question: 'Does this guarantee every document is legally valid?',
        answer:
          'No. DullyPDF supports signing workflow mechanics, but document category, jurisdiction, and policy requirements still need appropriate review.',
      },
    ],
    relatedIntentPages: ['pdf-signature-workflow', 'esign-ueta-pdf-workflow', 'fill-pdf-link-signature'],
    relatedDocs: ['signature-workflow', 'save-download-profile', 'troubleshooting'],
  },
  {
    key: 'flat-vs-editable-pdf',
    category: 'workflow',
    path: '/flat-vs-editable-pdf',
    navLabel: 'Flat vs Editable PDF',
    heroTitle: 'Flat vs Editable PDF Output for Fillable Forms',
    heroSummary:
      'Choose editable PDFs when live fields must remain available and flat PDFs when final records need stable appearance across browsers, phones, and email previews.',
    seoTitle: 'Flat vs Editable PDF Output for Fillable Forms | DullyPDF',
    seoDescription:
      'Learn when to download editable PDFs with live fields and when to flatten filled PDFs so values render consistently across viewers and devices.',
    seoKeywords: [
      'flat vs editable pdf',
      'flatten fillable pdf fields',
      'editable pdf output',
      'flat pdf final record',
      'fillable pdf viewer compatibility',
      'pdf form fields not showing',
      'download flat pdf',
      'download editable pdf',
    ],
    valuePoints: [
      'Use editable output when another user must keep working inside live AcroForm fields.',
      'Use flat output when recipients need the completed record to look the same everywhere.',
      'Match the output mode to the next workflow step: draft editing, respondent receipt, signature, archive, or customer delivery.',
    ],
    proofPoints: [
      'DullyPDF supports both editable and flat downloads from the editor.',
      'Fill By Link respondent downloads default toward flat output for external viewer stability.',
      'Signature workflows freeze a flattened immutable source artifact before the signer ceremony.',
    ],
    articleSections: [
      {
        title: 'Editable PDFs preserve live field behavior',
        paragraphs: [
          'Editable PDFs are useful when the next person needs to keep typing into fields, changing checkbox selections, or continuing the form workflow in a compatible viewer. The values remain attached to AcroForm widgets rather than being drawn directly into the page.',
          'That flexibility has a tradeoff. Different PDF viewers handle field appearances, scripts, active field states, and mobile previews differently. Editable output is best when the viewer and next step are known.',
        ],
      },
      {
        title: 'Flat PDFs are better for final records',
        paragraphs: [
          'A flat PDF draws the completed values into the page content. That makes the output more stable for customers, respondents, signers, archives, email previews, and mobile devices because the file no longer depends on live widget rendering.',
          'If nobody needs to keep editing the fields, flat output is usually the safer final delivery mode. It turns the completed form into a record instead of another draft.',
        ],
      },
      {
        title: 'Common decision points',
        paragraphs: [
          'Use editable output for internal drafts, Acrobat-first workflows, and templates that still need field-level review. Use flat output for signed source records, respondent receipts, customer copies, invoices, approvals, and archive-ready PDFs.',
          'The right answer can change during one workflow. A team might use editable output during internal review and flat output once the document is ready to send.',
        ],
      },
      {
        title: 'Why viewer compatibility drives the decision',
        paragraphs: [
          'Many users discover the flat/editable difference only after a recipient says the values look wrong or missing. That is often a viewer issue rather than a fill issue.',
          'DullyPDF pages should be direct about that tradeoff. Editable fields are useful, but final records should not depend on every recipient having the same PDF viewer behavior.',
        ],
      },
    ],
    faqs: [
      {
        question: 'What is a flat PDF?',
        answer:
          'A flat PDF has the completed values drawn into the page content instead of relying on live form widgets for display.',
      },
      {
        question: 'When should I use editable PDF output?',
        answer:
          'Use editable output when another person still needs to edit live fields in a compatible PDF viewer.',
      },
      {
        question: 'Which output is better for signatures and final records?',
        answer:
          'Flat output is usually safer because the signer or recipient sees the fixed completed record.',
      },
    ],
    relatedIntentPages: ['acroform-field-appearance', 'fillable-pdf-fonts-colors', 'pdf-signature-workflow', 'pdf-form-calculations-not-working'],
    relatedDocs: ['save-download-profile', 'fill-by-link', 'signature-workflow'],
  },
  {
    key: 'search-fill-pdf-review',
    category: 'workflow',
    path: '/search-fill-pdf-review',
    navLabel: 'Search & Fill Review',
    heroTitle: 'Search and Fill PDF Records With a Review Loop',
    heroSummary:
      'Search CSV, Excel, JSON, or stored respondent records, fill one reviewed PDF, catch mapping issues, and only then download, save, sign, or scale the workflow.',
    seoTitle: 'Search and Fill PDF Records With Review | DullyPDF',
    seoDescription:
      'Use DullyPDF Search & Fill to choose records, validate mapped output, catch field mismatches, and produce reviewed PDFs from structured data.',
    seoKeywords: [
      'search and fill pdf',
      'review pdf fill before download',
      'fill pdf records with review',
      'pdf field mapping validation',
      'csv pdf fill review',
      'stored respondent pdf fill',
      'validate filled pdf output',
      'pdf fill qa workflow',
    ],
    valuePoints: [
      'Search records instead of blindly generating files from every row.',
      'Use clear and refill loops to catch mapping, checkbox, date, and text-transform problems.',
      'Fail closed when a selected record does not line up with any PDF field names.',
    ],
    proofPoints: [
      'Search & Fill supports CSV, XLSX, JSON rows and stored Fill By Link respondent records.',
      'DullyPDF warns when selected record data does not line up with mapped PDF fields instead of silently saving an unchanged document.',
      'Mapped fill rules and text transforms persist with saved templates for repeat use.',
    ],
    articleSections: [
      {
        title: 'Review is the difference between filling and automation',
        paragraphs: [
          'Blind batch filling sounds efficient until a mapping mistake repeats across dozens of PDFs. A review loop is slower on the first record and much safer for the workflow. It lets the operator inspect whether the selected data actually landed in the right places.',
          'DullyPDF Search & Fill is built around that operator-controlled step: search, choose a row or respondent, fill the template, inspect the output, clear or adjust, then download or move into the next workflow.',
        ],
      },
      {
        title: 'Search matters when spreadsheets are not clean',
        paragraphs: [
          'Operational spreadsheets often have repeated names, partial identifiers, missing values, and columns that do not match the PDF labels perfectly. Search helps the operator find the right record before fill instead of generating the wrong document from a neighboring row.',
          'The search step also makes stored Fill By Link submissions useful. A respondent submission becomes another structured record that can be selected and materialized into the saved template when the owner is ready.',
        ],
      },
      {
        title: 'The failure mode should be loud',
        paragraphs: [
          'A dangerous PDF workflow silently produces an unchanged or partially filled document. That can make the operator think the process succeeded when no meaningful field match happened.',
          'DullyPDF now fails closed when the selected record does not align with any PDF field names. The dialog stays open and warns the user instead of quietly saving a bad output.',
        ],
      },
      {
        title: 'What to inspect before scaling',
        paragraphs: [
          'Check the obvious text fields first, then dates, checkbox groups, radio groups, split/join transforms, calculation outputs, and final flat or editable appearance. The best first test record is one that exercises edge cases rather than a perfect sample.',
          'After one representative record works, the saved template can support repeat Search & Fill, Fill By Link respondent review, group packet filling, or API publication with more confidence.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I review a filled PDF before downloading it?',
        answer:
          'Yes. Search & Fill fills the active workspace so the operator can inspect the output before downloading, saving, signing, or refilling.',
      },
      {
        question: 'Can stored Fill By Link responses be used in Search & Fill?',
        answer:
          'Yes. Stored respondent submissions can be selected and materialized into the active template or group.',
      },
      {
        question: 'What happens if no record fields match the PDF?',
        answer:
          'DullyPDF warns and keeps the Search & Fill dialog open instead of silently saving an unchanged document.',
      },
    ],
    relatedIntentPages: ['fill-pdf-from-csv', 'fill-pdf-by-link', 'pdf-to-database-template', 'batch-fill-pdf-forms'],
    relatedDocs: ['search-fill', 'rename-mapping', 'troubleshooting'],
  },
  {
    key: 'openai-pdf-data-privacy',
    category: 'workflow',
    path: '/openai-pdf-data-privacy',
    navLabel: 'OpenAI Data Boundaries',
    heroTitle: 'OpenAI PDF Data Boundaries in DullyPDF Workflows',
    heroSummary:
      'Understand which DullyPDF actions can send PDF or schema context to OpenAI, which values stay out of rename/map requests, and how to choose the right workflow.',
    seoTitle: 'OpenAI PDF Data Boundaries in DullyPDF Workflows',
    seoDescription:
      'See how DullyPDF separates AI rename, mapping, and vision extraction payloads from local Search & Fill row data and reviewed PDF output workflows.',
    seoKeywords: [
      'openai pdf data privacy',
      'pdf ai data boundaries',
      'openai pdf form mapping privacy',
      'ai pdf field rename privacy',
      'pdf schema mapping openai',
      'does pdf data go to openai',
      'search and fill privacy',
      'ai pdf workflow privacy',
    ],
    valuePoints: [
      'Separate optional AI setup actions from local row selection and review workflows.',
      'Know that Rename and Map can send PDF/schema context, but not selected Search & Fill row values.',
      'Treat Fill from Images differently because uploaded source images or documents are the AI input for that feature.',
    ],
    proofPoints: [
      'Rename and mapping dialogs warn before sending PDF/schema content to OpenAI.',
      'Row data and field input values are not included in OpenAI rename/map requests.',
      'Search & Fill selected row data stays in the browser, while API Fill sends JSON record data to the backend by design.',
    ],
    articleSections: [
      {
        title: 'Different DullyPDF workflows have different data paths',
        paragraphs: [
          'A privacy page is useful only if it is specific. DullyPDF has several workflows, and they do not all send the same data to the same place. AI rename, schema mapping, Fill from Images, Search & Fill, Fill By Link, and API Fill each have different boundaries.',
          'That means the right question is not simply whether DullyPDF uses AI. The better question is which action you are running and what that action needs to complete its job.',
        ],
      },
      {
        title: 'Rename and map use PDF and schema context',
        paragraphs: [
          'Rename and mapping can send PDF page imagery, field overlay tags, field names, nearby label context, and schema headers so the model can suggest names or align fields to columns. Those actions are optional and warn users before the AI request.',
          'Selected Search & Fill row values and current field input values are not included in rename/map requests. That is an important distinction for teams that want AI help during setup without sending the actual record row used later for filling.',
        ],
      },
      {
        title: 'Fill from Images intentionally sends source documents',
        paragraphs: [
          'Fill from Images and Documents is different because the uploaded source image or document is the evidence the model must read. The feature cannot extract values from an ID photo, invoice, or scan without using that source as AI input.',
          'Teams should choose this workflow only when the source is visual or scanned and the benefit is worth the data path. If the same information already exists in CSV, Excel, JSON, or a system record, use Search & Fill or API Fill instead.',
        ],
      },
      {
        title: 'Search & Fill and API Fill have different boundaries',
        paragraphs: [
          'Search & Fill keeps selected row data in the browser while the operator reviews the active workspace. API Fill is intentionally a hosted backend workflow: callers send JSON record data to the template endpoint, and the backend materializes the PDF under server-side limits and activity tracking.',
          'Those are both valid workflows, but they answer different operational needs. Browser review is useful for operator-controlled filling. API Fill is useful when another system must generate PDFs programmatically.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Does DullyPDF send Search & Fill row values to OpenAI for rename or mapping?',
        answer:
          'No. Rename and mapping do not include selected row values or current field input values.',
      },
      {
        question: 'What can AI rename and mapping send?',
        answer:
          'They can send PDF page context, field overlay metadata, field names, label context, and schema headers so the model can suggest names and mappings.',
      },
      {
        question: 'Does Fill from Images send uploaded images to AI?',
        answer:
          'Yes. That feature uses the uploaded source image or document as the input needed to extract values.',
      },
      {
        question: 'Is API Fill browser-local?',
        answer:
          'No. API Fill is a backend endpoint workflow where JSON record data is sent to the server to materialize PDFs.',
      },
    ],
    relatedIntentPages: ['ai-pdf-field-renaming', 'fill-pdf-from-image', 'fill-pdf-from-csv', 'pdf-fill-api'],
    relatedDocs: ['rename-mapping', 'fill-from-images', 'search-fill', 'api-fill'],
  },
  {
    key: 'mobile-fillable-pdf-form',
    category: 'workflow',
    path: '/mobile-fillable-pdf-form',
    navLabel: 'Mobile-Friendly Fillable PDF',
    heroTitle: 'Mobile-Friendly Fillable PDF Forms Without a PDF App',
    heroSummary:
      'Collect respondent answers in a hosted, mobile-first web form, then materialize the filled PDF on the owner side instead of asking phones to render a fillable PDF in a viewer.',
    seoTitle: 'Mobile-Friendly Fillable PDF Forms Without a PDF App | DullyPDF',
    seoDescription:
      'Collect mobile PDF answers in a hosted web form, skip phone PDF viewer quirks, and generate the filled PDF later for download, link, API, or signing workflows.',
    seoKeywords: [
      'mobile pdf form',
      'fillable pdf on phone',
      'responsive fillable pdf form',
      'mobile friendly pdf form',
      'pdf form for mobile',
      'fillable pdf without app',
      'pdf form fill on phone',
      'mobile web form to pdf',
      'pdf form for iphone',
      'pdf form for android',
    ],
    valuePoints: [
      'Skip the unreliable mobile PDF viewer experience by collecting answers in a hosted web form.',
      'Keep the source PDF as the system of record while respondents answer on phones, tablets, or desktop.',
      'Materialize the filled PDF on the owner side for download, signing, link delivery, or API output.',
    ],
    proofPoints: [
      'Fill By Link publishes a hosted web form derived from the saved template field schema.',
      'Respondents answer in their phone browser instead of editing a downloaded PDF.',
      'Owners can materialize the filled PDF later from the stored response, including flat output that renders consistently on mobile viewers.',
    ],
    articleSections: [
      {
        title: 'Mobile PDF viewers are not a reliable fill surface',
        paragraphs: [
          'A fillable PDF assumes a viewer that can render AcroForm widgets, accept keyboard input into them, save the document with values preserved, and let the respondent return the file. Many mobile PDF viewers do none of that consistently. Field appearances differ, scripts may not run, signature widgets behave inconsistently, and the saved file path is often unclear to the respondent.',
          'That is why "mobile fillable PDF" is usually the wrong framing. The real job is collecting structured answers from a phone in a way the recipient can trust, then producing the PDF later from those answers.',
        ],
        bullets: [
          'Mobile viewers vary widely in how they render AcroForm widgets and signature fields.',
          'Downloads, saves, and returns from a mobile viewer are easy to lose or mishandle.',
          'A respondent often only needs to answer; they do not need to "use a PDF" at all.',
        ],
      },
      {
        title: 'Collect data in a hosted form, deliver the PDF afterward',
        paragraphs: [
          'DullyPDF Fill By Link publishes a hosted web form derived from the saved PDF template field schema. Respondents complete it in their mobile browser with native form controls, validation, and tap targets sized for phones.',
          'The PDF is materialized later on the owner side from the stored response. That separates the respondent surface (mobile-friendly web form) from the output surface (the filled PDF the owner needs for downstream workflows).',
        ],
        bullets: [
          'Respondent experience: hosted mobile form, no PDF reader required.',
          'Owner experience: structured response data and a generated PDF on demand.',
          'Output choices: flat or editable PDF, single-link or grouped packet output.',
        ],
      },
      {
        title: 'Flat output is usually the right delivery mode for mobile',
        paragraphs: [
          'When the filled PDF is delivered to the same respondent or another mobile recipient, a flat PDF avoids the same viewer-compatibility problems all over again. Values are drawn into the page content instead of relying on live AcroForm widgets.',
          'Editable output still has its place for internal review on desktop, but mobile delivery is generally safer with flat output. That is also why Fill By Link respondent downloads lean toward flat output for external viewer stability.',
        ],
      },
      {
        title: 'Mobile and packet workflows work the same way',
        paragraphs: [
          'Groups extend this model to multi-document packets. A merged group link can collect one response that fills several PDFs on the owner side, which is much easier on phones than trying to fill several separate fillable PDFs in a mobile viewer.',
          'That combination — hosted mobile form, group-merged questions, owner-side PDF materialization — is usually the right pattern for any workflow where respondents are expected to answer from phones.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can people fill a PDF form on a phone with DullyPDF?',
        answer:
          'Yes. Fill By Link publishes a hosted mobile-friendly web form, then DullyPDF materializes the filled PDF on the owner side from the stored response.',
      },
      {
        question: 'Do respondents need a PDF app installed?',
        answer:
          'No. The respondent only needs a browser. The PDF is generated on the owner side after the form is submitted.',
      },
      {
        question: 'Should mobile recipients receive editable or flat PDFs?',
        answer:
          'Flat output is usually safer for mobile delivery because values render consistently across mobile PDF viewers.',
      },
      {
        question: 'Can a group of PDFs share one mobile form?',
        answer:
          'Yes. An open group can publish one merged Fill By Link from the distinct respondent-facing fields across the group.',
      },
    ],
    relatedIntentPages: ['fill-pdf-by-link', 'fill-pdf-link-signature', 'flat-vs-editable-pdf', 'pdf-packet-workflow'],
    relatedDocs: ['fill-by-link', 'save-download-profile', 'signature-workflow'],
  },
  {
    key: 'stored-fill-by-link-responses',
    category: 'workflow',
    path: '/stored-fill-by-link-responses',
    navLabel: 'Stored Link Responses',
    heroTitle: 'Reuse Stored Fill By Link Responses as PDF Fill Sources',
    heroSummary:
      'Treat stored respondent submissions as a structured record source for Search & Fill, packet generation, signing, or API materialization instead of one-shot downloads.',
    seoTitle: 'Reuse Stored Fill By Link Responses as PDF Fill Sources | DullyPDF',
    seoDescription:
      'Use stored Fill By Link submissions as a record source for Search & Fill, packet generation, signing, or API-driven PDF materialization across templates and groups.',
    seoKeywords: [
      'stored pdf form responses',
      'fill by link submissions',
      'reuse pdf form submissions',
      'pdf form response database',
      'stored web form to pdf',
      'pdf submissions to fill',
      'fill pdf from stored response',
      'pdf form respondent records',
      'pdf form submission history',
      'fill template from web form response',
    ],
    valuePoints: [
      'Treat each submission as a structured record that can be filled into the same template later.',
      'Move a stored response into Search & Fill, packet generation, signing, or API output without retyping.',
      'Keep respondent data on the saved template instead of relying on email attachments or local files.',
    ],
    proofPoints: [
      'Saved templates and open groups expose a responses tab beside Fill By Link configuration.',
      'Search & Fill can select stored Fill By Link submissions as the active record source.',
      'Signing flows can materialize the filled PDF from the stored response before sending the signing invite.',
    ],
    articleSections: [
      {
        title: 'A submission is data, not just a finished PDF',
        paragraphs: [
          'Many web form tools treat each submission as a single PDF download. The PDF is the deliverable and the underlying data disappears into an email or attachment. That makes follow-up workflows harder than they need to be: every reuse means typing the same values back in.',
          'DullyPDF keeps submissions as structured records on the saved template (or open group). Each record stays tied to its field schema, can be searched, and can be selected as the source data for any future fill against the same template.',
        ],
      },
      {
        title: 'Use Search & Fill to bring a stored response into the active workspace',
        paragraphs: [
          'Search & Fill is the natural way to drive a fresh fill from a stored response. The operator picks the submission, the template fills with those values in the active workspace, and the output can be downloaded, saved, signed, or refilled after review.',
          'That review step matters because the stored response is now feeding a regenerated PDF. Mapped values, checkbox semantics, and signature dependencies still deserve a look before the output is treated as final.',
        ],
      },
      {
        title: 'Group submissions can drive whole packets',
        paragraphs: [
          'When the saved template lives in an open group with a merged Fill By Link, one respondent submission can feed several member templates on the owner side. That is useful for onboarding, claim, and application packets where the same record should populate multiple documents.',
          'The group submission stays structured the same way a single-template submission does, so the owner can select it, regenerate the packet, send portions for signing, or push it through Group API Fill if a programmatic packet is needed.',
        ],
      },
      {
        title: 'Where stored responses fit and where they do not',
        paragraphs: [
          'Stored responses are useful for repeat workflows: regenerating a PDF when the source template is updated, restarting a stalled signing ceremony, exporting a packet to a new recipient, or re-running review after a mapping change. They keep the record alive without forcing every operator to be the data source.',
          'They are not a replacement for proper records retention in regulated workflows. The audit trail for signed records lives in the signing artifacts, not in the editable response store, and stored responses should be deleted when retention policies require it.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Does DullyPDF store Fill By Link submissions?',
        answer:
          'Yes. Submissions are kept on the saved template or open group and can be reused as a structured record source.',
      },
      {
        question: 'Can a stored response be used in Search & Fill?',
        answer:
          'Yes. Search & Fill can select stored Fill By Link submissions and fill the active template from those values.',
      },
      {
        question: 'Can a stored response feed a signing workflow?',
        answer:
          'Yes. Signing materializes the filled PDF from the stored response before sending the signing invite.',
      },
      {
        question: 'Can stored responses be deleted?',
        answer:
          'Yes. Owners can delete stored responses when retention policies or respondent requests require it.',
      },
    ],
    relatedIntentPages: ['fill-pdf-by-link', 'search-fill-pdf-review', 'fill-pdf-link-signature', 'pdf-packet-workflow'],
    relatedDocs: ['fill-by-link', 'search-fill', 'signature-workflow'],
  },
  {
    key: 'group-api-fill-zip-packet',
    category: 'workflow',
    path: '/group-api-fill-zip-packet',
    navLabel: 'Group API ZIP Packet',
    heroTitle: 'Group API Fill — JSON to PDF Packet as a ZIP',
    heroSummary:
      'Publish a group-scoped API endpoint that accepts one JSON record and returns a ZIP of per-template PDFs, so back-office systems can generate full packets without driving the editor.',
    seoTitle: 'Group API Fill — JSON to PDF Packet as a ZIP | DullyPDF',
    seoDescription:
      'Use DullyPDF Group API Fill to publish a JSON-to-PDF-packet endpoint that returns a ZIP of per-template PDFs from one shared record, with key rotation and activity logs.',
    seoKeywords: [
      'pdf packet api',
      'json to pdf packet',
      'pdf zip api',
      'generate pdf packet from json',
      'group pdf api',
      'pdf bundle api endpoint',
      'multi pdf api fill',
      'json to multiple pdfs',
      'pdf packet automation api',
      'json to pdf zip endpoint',
    ],
    valuePoints: [
      'Generate a full packet of per-template PDFs from one JSON record posted to a group endpoint.',
      'Skip browser-side work for systems that already have the record data ready.',
      'Rotate keys, audit recent activity, and copy server-side examples from the workspace header.',
    ],
    proofPoints: [
      'Open groups can publish a JSON-to-ZIP API Fill endpoint scoped to the group.',
      'The endpoint accepts one JSON record and returns a ZIP of per-template PDFs for the group.',
      'API Fill manager exposes key rotation, recent activity, and server-side example snippets without leaving the editor.',
    ],
    articleSections: [
      {
        title: 'Packets often need a programmatic path, not a browser path',
        paragraphs: [
          'Search & Fill and Fill By Link cover operator-driven and respondent-driven workflows. Both keep a human in the loop. That is the right shape for review-heavy workflows, but it is the wrong shape when a back-office system already has the record data and just needs the PDFs back.',
          'Group API Fill is for that case. A group exposes a single endpoint that accepts a JSON record and returns the per-template PDFs as a ZIP. The caller does not have to load the editor, pick a row, or simulate a respondent.',
        ],
      },
      {
        title: 'What the endpoint actually does',
        paragraphs: [
          'The group endpoint takes one JSON object whose keys map to the merged group field schema. DullyPDF fills each member template from those values and packages the per-template PDFs into a ZIP. That keeps the caller integration simple: one request, one response, one archive.',
          'Each template inside the group still keeps its own field model, mappings, and fill rules. That is the difference between a packet ZIP and a single merged PDF: the templates remain separate and reviewable, so replacement, retention, and downstream routing stay manageable.',
        ],
      },
      {
        title: 'Key management lives in the workspace header',
        paragraphs: [
          'Saved templates and open groups expose an API Fill manager directly in the workspace header. Operators can publish or revoke the endpoint, rotate the API key, review recent activity, and copy ready-to-paste cURL, Node.js, or Python examples.',
          'That keeps the production endpoint tied to the same template review the editor already enforces. The published packet endpoint represents the state of the group at publish time, not an arbitrary draft.',
        ],
      },
      {
        title: 'When to use this vs. template-scoped API Fill or Fill By Link',
        paragraphs: [
          'Use template-scoped API Fill when one PDF is needed per request. Use Group API Fill when the same record should produce a packet of related PDFs in one call. Use Fill By Link when the data source is a human respondent, not a back-office system.',
          'The three workflows share the same template foundation. The difference is who provides the record data and what shape the response should take.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF return a ZIP of PDFs from one API call?',
        answer:
          'Yes. Group API Fill accepts one JSON record and returns a ZIP of the per-template PDFs in the group.',
      },
      {
        question: 'Do I need to open the editor to call the endpoint?',
        answer:
          'No. Once published, the endpoint can be called directly from a back-office system without opening the workspace.',
      },
      {
        question: 'Can I rotate the API key without recreating the endpoint?',
        answer:
          'Yes. The API Fill manager exposes key rotation, revoke, and recent activity in the workspace header.',
      },
      {
        question: 'Does Group API Fill include signing?',
        answer:
          'No. Signing is a separate workflow that operates on a frozen filled PDF; the group endpoint returns the filled PDFs themselves.',
      },
    ],
    relatedIntentPages: ['pdf-fill-api', 'pdf-packet-workflow', 'fill-pdf-by-link', 'no-code-pdf-automation'],
    relatedDocs: ['api-fill', 'create-group', 'save-download-profile'],
  },
  {
    key: 'batch-rename-map-pdf-group',
    category: 'workflow',
    path: '/batch-rename-map-pdf-group',
    navLabel: 'Batch Rename + Map Group',
    heroTitle: 'Batch Rename and Map PDF Field Names Across a Saved Group',
    heroSummary:
      'Run one AI rename and schema-mapping pass across every saved template in a group so packet workflows share consistent field names before publishing links, API output, or signing.',
    seoTitle: 'Batch Rename and Map PDF Fields Across a Group | DullyPDF',
    seoDescription:
      'Apply AI Rename + Map across an entire saved template group so packet field names line up, schema headers match, and downstream Fill By Link, API, and signing workflows stay consistent.',
    seoKeywords: [
      'batch rename pdf fields',
      'rename pdf form fields across group',
      'map pdf fields to schema in group',
      'pdf template group rename map',
      'batch rename and map pdf',
      'group pdf field cleanup',
      'pdf packet field naming',
      'consistent pdf field names across packet',
      'rename pdf fields ai group',
      'pdf group schema mapping',
    ],
    valuePoints: [
      'Apply rename and schema mapping to every saved template in a group in one operator-controlled pass.',
      'Keep packet field names consistent so one record can fill the whole packet correctly.',
      'Catch group-wide naming drift before Fill By Link, API Fill, or signing workflows depend on it.',
    ],
    proofPoints: [
      'DullyPDF supports Rename, Map Schema, Rename + Map, and Rename + Map Group actions.',
      'Group operations run across all member templates in the active group instead of one template at a time.',
      'OpenAI actions warn before sending PDF/schema context, and row values are not included in rename/map payloads.',
    ],
    articleSections: [
      {
        title: 'Why packet field naming drifts and why it matters',
        paragraphs: [
          'Most packets are assembled from PDFs created at different times by different authors. One form labels a field `applicant_first_name`, another labels the same concept `First Name (Applicant)`, and a third uses a generic widget name from the original authoring tool. Until those names line up, the same record cannot fill the packet cleanly.',
          'A single-template rename does not solve this. The fix has to apply across every member template so the merged group schema and one shared record can drive the packet end-to-end.',
        ],
      },
      {
        title: 'Run Rename + Map at the group level',
        paragraphs: [
          'DullyPDF exposes a Rename + Map Group action that runs across every saved template in the active group. The operator picks the schema source, reviews suggestions per template, and the group ends up with consistent field names ready for shared filling.',
          'This is still operator-reviewed work, not blind automation. The group-level run accelerates setup; the operator still validates field geometry, checkbox/radio semantics, and one representative fill before the packet is treated as production-ready.',
        ],
      },
      {
        title: 'Do this before publishing dependent workflows',
        paragraphs: [
          'Merged group Fill By Link, Group API Fill, and packet signing all depend on consistent field naming. Publishing any of those before the group rename + map pass tends to ship inconsistency to respondents, callers, or signers.',
          'The safer order is to assemble the group from reviewed templates, run Rename + Map at the group level, test one representative record across the whole packet, and only then publish the dependent workflow.',
        ],
      },
      {
        title: 'What the AI pass should not decide',
        paragraphs: [
          'A group-level rename is still a template setup step. It should not replace review of checkbox semantics, radio group rules, signature anchors, calculation dependencies, or business meaning across documents.',
          'Treat the AI suggestions as a strong first draft. Catch the disagreements before the packet becomes a public link, automated endpoint, or signing source.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF rename PDF fields across a whole group?',
        answer:
          'Yes. Rename + Map Group applies the rename and schema-mapping pass across every saved template in the active group.',
      },
      {
        question: 'Does Rename + Map Group send row data to OpenAI?',
        answer:
          'No. Row values are not included. The AI pass uses PDF/schema context for each template in the group.',
      },
      {
        question: 'Should I run group rename before publishing the group?',
        answer:
          'Yes. Consistent field names across the packet should be in place before the group exposes a merged link, API endpoint, or signing workflow.',
      },
      {
        question: 'Can I rerun the group action after editing one member template?',
        answer:
          'Yes. The action can be rerun, but rerun cost and review still apply, so it is best to consolidate edits before another full-group pass.',
      },
    ],
    relatedIntentPages: ['ai-pdf-field-renaming', 'pdf-packet-workflow', 'fill-pdf-by-link', 'pdf-fill-api'],
    relatedDocs: ['rename-mapping', 'create-group', 'editor-workflow'],
  },
  {
    key: 'verify-signed-pdf',
    category: 'workflow',
    path: '/verify-signed-pdf',
    navLabel: 'Verify Signed PDF',
    heroTitle: 'Verify a Signed PDF Online With a Retained Validation Page',
    heroSummary:
      'Give recipients a public, link-based way to re-check a completed PDF signing record without trusting only the embedded PDF viewer badge or the original email invite.',
    seoTitle: 'Verify a Signed PDF Online With a Retained Validation Page | DullyPDF',
    seoDescription:
      'Recipients can verify a completed PDF signing record through a public DullyPDF validation page that points back to the retained source, signed artifact, and ceremony metadata.',
    seoKeywords: [
      'verify signed pdf online',
      'pdf signature verification link',
      'signed pdf validation page',
      'check pdf signature online',
      'verify electronic signature pdf',
      'pdf signing receipt verification',
      'signed pdf qr verification',
      'public pdf signature check',
      'validate signed pdf without acrobat',
      'pdf esign verification link',
    ],
    valuePoints: [
      'Recipients can re-check a completed signing record without keeping the original email invite.',
      'Verification does not depend on each PDF viewer accepting an embedded signing certificate.',
      'The receipt links back to the retained source and signed artifacts, not just to a viewer trust badge.',
    ],
    proofPoints: [
      'Completed signing flows expose `/verify-signing/:token` validation pages.',
      'Audit receipts include a QR-backed verification link that points to the retained record.',
      'The validation page reflects retained ceremony metadata, signer identity fields, and source/signed hashes that the owner audit evidence also preserves.',
    ],
    articleSections: [
      {
        title: 'A viewer trust badge is not the same as verification',
        paragraphs: [
          'A green checkmark inside a PDF viewer depends on the embedded certificate chain and the viewer trust store. In development or self-signed configurations, viewers may flag the embedded certificate as untrusted even when the record is genuinely retained.',
          'That is why a verification path that does not depend on each viewer is important. The retained DullyPDF validation page lets a recipient confirm the record exists, when it was completed, and what the signing ceremony recorded.',
        ],
      },
      {
        title: 'What the validation page actually shows',
        paragraphs: [
          'The public page reflects the retained signing record: ceremony completion state, signer identity fields, source and signed artifact references, and the verification token in the URL itself. It is intentionally narrower than the owner-side audit evidence, which preserves additional dispute-grade detail.',
          'That separation matters. Recipients should be able to confirm a record without exposing OTP state, retained-artifact paths, internal request identifiers, or other operational metadata that belongs to the owner.',
        ],
      },
      {
        title: 'How recipients reach the verification page',
        paragraphs: [
          'Completed signing audit receipts include the verification URL and a QR-backed link, so a recipient can re-check the record later without keeping the original signing email. The link works the same on desktop and mobile.',
          'That is especially useful for retention-heavy workflows where the original invite may not be reachable months or years later. The retained record stays addressable by its public token.',
        ],
      },
      {
        title: 'Where the boundaries are',
        paragraphs: [
          'The retained validation page is part of the broader signing workflow model. It supports core E-SIGN mechanics around signer intent, association with the exact record, and later-reference retention, but it is not a blanket legal determination for every document class or jurisdiction.',
          'Excluded or regulated document categories still need their own policy review. The verification page is one element of a defensible workflow, not a universal legal proof.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can recipients verify a completed signed PDF online?',
        answer:
          'Yes. Completed signing flows expose a public validation page linked from the audit receipt and a QR-backed verification link.',
      },
      {
        question: 'Does verification depend on a PDF viewer trust badge?',
        answer:
          'No. The retained validation page does not require a specific viewer trust chain; it confirms the retained record exists with ceremony metadata.',
      },
      {
        question: 'What does the public verification page show?',
        answer:
          'It reflects retained ceremony state, signer identity fields, source/signed artifact references, and the verification token itself. Owner-side audit evidence is broader and stays internal.',
      },
      {
        question: 'Is the verification page a legal determination?',
        answer:
          'No. It supports core E-SIGN mechanics and later-reference retention. Document categories and jurisdictions still require separate policy review.',
      },
    ],
    relatedIntentPages: ['pdf-signature-audit-trail', 'pdf-signature-workflow', 'esign-ueta-pdf-workflow', 'fill-pdf-link-signature'],
    relatedDocs: ['signature-workflow', 'save-download-profile', 'troubleshooting'],
  },
  {
    key: 'no-code-pdf-automation',
    category: 'workflow',
    path: '/no-code-pdf-automation',
    navLabel: 'No-Code PDF Automation',
    heroTitle: 'No-Code PDF Automation for Existing Forms',
    heroSummary:
      'Build repeat PDF workflows from existing documents with field detection, AI rename and mapping, Search & Fill, Fill By Link, API Fill, groups, and signing.',
    seoTitle: 'No-Code PDF Automation for Existing Forms | DullyPDF',
    seoDescription:
      'Automate existing PDF forms without rebuilding them from scratch: detect fields, map schemas, fill from data, collect by link, publish APIs, and route signatures.',
    seoKeywords: [
      'no code pdf automation',
      'pdf workflow automation no code',
      'automate existing pdf forms',
      'no code fillable pdf workflow',
      'pdf form automation tool',
      'automate pdf data entry',
      'existing pdf to automated workflow',
      'no code document automation pdf',
    ],
    valuePoints: [
      'Start from PDFs your team already uses instead of rebuilding every form in a web-form builder.',
      'Use focused setup steps: detect fields, clean names, map schema, test one record, then publish only what is ready.',
      'Choose the right output path for each workflow: manual review, respondent collection, API generation, packet groups, or signing.',
    ],
    proofPoints: [
      'The main pipeline runs CommonForms detection, optional OpenAI rename, schema mapping, editor review, and Search & Fill.',
      'Saved templates can support Fill By Link, API Fill, grouped packets, and signing workflows.',
      'Public docs and intent pages route users into focused setup guides instead of treating every workflow as one generic feature.',
    ],
    articleSections: [
      {
        title: 'No-code does not mean no review',
        paragraphs: [
          'The strongest no-code PDF workflows still have a setup discipline. A person needs to confirm that detected fields are real, names are clear, checkbox and radio behavior is explicit, mappings line up with source data, and the final PDF looks right.',
          'DullyPDF is built around that reality. It reduces manual field creation and repeated data entry, but it keeps review visible because recurring PDFs usually carry operational consequences.',
        ],
      },
      {
        title: 'Start from existing PDFs, not blank app screens',
        paragraphs: [
          'Many teams already have the PDF that customers, agencies, vendors, employees, or partners expect. Rebuilding the workflow from scratch can create a second version of the form and a new maintenance problem.',
          'DullyPDF works best when the source PDF layout should remain intact. The automation layer sits around the document: field detection, mapping, filling, collection, API generation, and signing.',
        ],
      },
      {
        title: 'Choose the workflow after the template works',
        paragraphs: [
          'A working template can support several next steps. Search & Fill is best for operator-controlled review. Fill By Link is best for external respondents. API Fill is best for system-generated PDFs. Groups are best for packets. Signing is best after the filled record is frozen.',
          'Those workflow choices should come after one representative fill succeeds. Publishing too early only spreads template mistakes into more places.',
        ],
      },
      {
        title: 'Where a different tool is better',
        paragraphs: [
          'DullyPDF is not a full page-design editor, a dynamic document-generation engine for arbitrary page growth, or a replacement for legal, tax, medical, payroll, or compliance review. It is a focused workflow tool for recurring PDFs with stable layouts.',
          'That focus is what makes the no-code claim practical. It should win the jobs where existing PDFs need repeatable field operations, not every document task on the market.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can DullyPDF automate existing PDF forms without code?',
        answer:
          'Yes. Operators can upload an existing PDF, detect fields, clean the template, map data, and reuse it without writing code.',
      },
      {
        question: 'Can developers still use DullyPDF programmatically?',
        answer:
          'Yes. API Fill publishes saved templates as JSON-to-PDF endpoints when a programmatic workflow is the right fit.',
      },
      {
        question: 'Is DullyPDF a full document design tool?',
        answer:
          'No. DullyPDF is focused on existing PDFs, field workflows, filling, collection, API generation, packets, and signing.',
      },
    ],
    relatedIntentPages: ['pdf-to-fillable-form', 'ai-pdf-field-renaming', 'fill-pdf-from-csv', 'fill-pdf-by-link', 'pdf-fill-api'],
    relatedDocs: ['getting-started', 'editor-workflow', 'search-fill'],
  },
];
