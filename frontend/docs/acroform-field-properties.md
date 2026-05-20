# AcroForm Field Properties

DullyPDF's field editor is not only drawing boxes over a PDF. For editable downloads, it has to
write real PDF AcroForm data so the values remain inside fillable fields after download, reopening,
typing, Fill By Link, API Fill, and signing workflows. This document explains the PDF keys that make
that work and why they matter to the product.

## Why This Matters

Editable PDF output has to preserve two separate things:

- The field data a viewer edits, such as the field name, value, type, flags, and export value.
- The visual appearance a viewer shows, such as the font, size, checked state, border, and widget
  rectangle.

If DullyPDF only draws filled text onto the page and then leaves an empty editable field on top, users
see a duplicated or misleading document: the visible text is not actually inside the field, and typing
in the PDF viewer can reveal the original field font or stale empty widget. The product invariant is:

- Editable exports put values and styling into AcroForm fields and widget appearances.
- Flat exports bake values into page content and remove live widgets.

This is important for trust. Users expect an editable download to remain editable in Adobe, Chrome,
Preview, and downstream business systems, while flat downloads should behave like final non-editable
records.

## Mental Model

A fillable PDF usually has four related layers:

- Catalog `/AcroForm`: the document-level form object. It owns the list of fields and shared resources.
- Field dictionaries: logical field records, such as `customer_name` or a radio group.
- Widget annotations: page-level rectangles that users see and click.
- Appearance streams: mini PDF drawing programs attached to widgets so viewers know how a field looks.

Some simple PDFs combine a field dictionary and widget annotation in one object. More complex PDFs keep
the logical field as a parent and put one or more widget annotations in `/Kids`.

## DullyPDF Export Rules

Editable exports should:

- Ensure the PDF catalog has an `/AcroForm`.
- Register every live field in `/AcroForm /Fields`.
- Store text-like values in `/V` and usually `/DV`.
- Store selected fonts, point sizes, and font colors in `/DA`.
- Register the selected Base 14 font in `/AcroForm /DR /Font`.
- Attach widget-owned `/AP` streams so viewers show the filled value immediately.
- Keep checkbox and radio widgets synchronized across `/V`, `/AS`, and `/AP`; generated button appearances draw only selected marks so existing PDF box/circle artwork is not doubled.
- Remove stale same-name widgets when DullyPDF replaces a detected/source widget with a moved or edited
  version.
- Avoid adding a separate page-content text layer underneath live widgets.

Flat exports should:

- Render the final visible text, checkmarks, radio selections, signatures, and images into page content.
- Remove interactive widgets and stale `/AcroForm` metadata when the output is meant to be non-editable.
- Avoid leaving hidden live fields that can be edited after download.

## AcroForm Root Keys

The `/AcroForm` dictionary lives under the PDF catalog and describes the form as a whole.

| Key | Meaning | DullyPDF relevance |
| --- | --- | --- |
| `/Fields` | Array of top-level field references. | Required for editable exports. If a widget is not registered here, strict viewers may ignore it. |
| `/NeedAppearances` | Hint asking the viewer to regenerate appearances. | Helpful fallback, but not enough for production because viewers handle it differently and may overwrite styling. |
| `/DR` | Default resources, including shared fonts. | Required for Base 14 font resources used by `/DA` and appearance streams. |
| `/DA` | Default appearance string for variable text fields. | Provides fallback font, size, and color when a field does not define its own `/DA`. DullyPDF writes the global font color here for fields that inherit global color. |
| `/Q` | Default text justification: `0` left, `1` center, `2` right. | Useful if DullyPDF adds alignment controls later. |
| `/SigFlags` | Signature-related document flags. | Relevant to signing workflows when the PDF contains digital signature fields. |
| `/CO` | Calculation order array. | DullyPDF writes calculated fields in dependency order for editable exports and preserves unrelated existing entries when safe. |
| `/XFA` | XML Forms Architecture data. | Legacy/dynamic form technology. DullyPDF should treat it carefully because normal AcroForm edits may not fully update XFA forms. |

## Common Field Dictionary Keys

Field dictionaries describe logical form fields.

| Key | Meaning | DullyPDF relevance |
| --- | --- | --- |
| `/FT` | Field type. Common values are `/Tx`, `/Btn`, `/Ch`, and `/Sig`. | Maps to DullyPDF text, checkbox/radio, combo/list, and signature concepts. Date-like values use text fields or schema/question date semantics rather than a separate AcroForm field type. |
| `/T` | Partial field name. | The name DullyPDF saves, maps, fills, and exposes through Fill By Link/API Fill. |
| `/TU` | Alternate user-facing field name. | Can support accessibility/tooltips or friendlier labels later. |
| `/TM` | Mapping name used when exporting form data. | Useful for integration exports, but not currently the primary DullyPDF identifier. |
| `/Parent` | Parent field reference. | Used for grouped fields and parent/child widget structures. |
| `/Kids` | Child field or widget references. | Used when one logical field has multiple widgets, especially radio groups. |
| `/Ff` | Field flags bitmask. | Controls read-only, required, no-export, multiline, radio behavior, combo behavior, and related semantics. |
| `/V` | Current field value. | The core value DullyPDF must write for editable downloads. |
| `/DV` | Default field value. | Useful so reset/default behavior matches the filled export. |
| `/AA` | Additional actions triggered by field events. | Should generally be preserved from source PDFs unless DullyPDF intentionally strips risky behavior. |

## Calculation Field Keys

DullyPDF-managed calculation fields are still ordinary text fields in the PDF. The safe formula model
lives in DullyPDF metadata, and generated Acrobat JavaScript is only a compatibility layer for
editable PDFs.

For number inputs:

- `/FT /Tx` stores the field as a normal text field.
- `/AA /K`, `/AA /V`, and `/AA /F` can carry generated numeric keystroke, validation, and format
  actions.
- `/V`, `/DV`, and `/AP` still carry the precomputed/current value so viewers that do not run
  JavaScript display the right value.

For calculated outputs and calculated intermediates:

- `/FT /Tx` stores the calculated value as a normal text field.
- `/Ff` includes the `ReadOnly` bit so users do not type into computed outputs.
- `/AA /C` carries generated calculate JavaScript produced from the safe AST.
- `/AA /F` carries generated formatting behavior when needed.
- `/V`, `/DV`, and `/AP` carry the value DullyPDF computed server-side before export.

The catalog `/AcroForm /CO` array lists DullyPDF-owned calculated fields in topological dependency
order. Chained intermediates therefore appear before downstream outputs. Unrelated existing `/CO`
entries are kept ahead of the DullyPDF-owned calculation order when they are not replaced.

Generated editable PDFs also include `/DullyPDFCalculations` document metadata. That payload stores
roles, value types, formula ASTs, dependencies, and output settings for DullyPDF re-import. It does
not store user-authored JavaScript as the source of truth.

Imported third-party calculation JavaScript is never executed during analysis. DullyPDF detects the
presence of `/AA /C`, numeric action patterns, and `/CO` references, then either hydrates supported
DullyPDF metadata or marks the field as an external imported calculation that must be rebuilt before
it becomes editable in the formula builder.

## Variable Text Keys

Text fields and editable combo boxes use variable text behavior.

| Key | Meaning | DullyPDF relevance |
| --- | --- | --- |
| `/DA` | Default appearance string, such as `/Helv 10 Tf 0 0 0 rg`. | Stores the font resource, font size, and text color. This is where field font, size, and color settings belong. |
| `/Q` | Field-specific justification. | Future alignment control can map here. |
| `/DS` | Default rich-text style string. | Relevant only if rich text is supported later. |
| `/RV` | Rich-text value. | Should not be used unless DullyPDF explicitly supports rich text. |
| `/MaxLen` | Maximum input length. | Can support field-level character limits. |

Common text field `/Ff` flags include:

| Flag | Meaning | Product impact |
| --- | --- | --- |
| `ReadOnly` | User cannot edit the field. | Could support locked generated fields. |
| `Required` | Field should be filled before submit/export. | Useful for validation in Fill By Link and editor workflows. |
| `NoExport` | Field is excluded from form-data export. | Matters if DullyPDF exports FDF/JSON field data later. |
| `Multiline` | Text can span multiple lines. | Requires different appearance generation and wrapping. |
| `Password` | Viewer masks the value. | Usually not appropriate for generated business PDFs. |
| `FileSelect` | Field stores a file path. | Should generally not be created by DullyPDF. |
| `DoNotSpellCheck` | Viewer disables spellcheck. | Optional quality control for IDs or codes. |
| `DoNotScroll` | Text should not scroll beyond the visible box. | Important if DullyPDF wants overflow prevention inside editable fields. |
| `Comb` | Text is split into equal character cells. | Useful for SSN, ZIP, phone, or code fields if paired with `/MaxLen`. |
| `RichText` | Field uses rich-text value data. | Higher complexity; avoid unless rich text is a real product requirement. |

## Button Field Keys

PDF button fields cover checkboxes, radio buttons, and push buttons.

| Key | Meaning | DullyPDF relevance |
| --- | --- | --- |
| `/V` | Current logical value. | For checkboxes/radio groups, this should match the selected export value or `/Off`. |
| `/AS` | Widget appearance state. | Must match the selected state in `/AP`, such as `/Yes` or `/Off`. |
| `/Opt` | Export values for radio choices. | Useful for preserving existing source radio option names. |
| `/Ff` | Button behavior flags. | Distinguishes checkbox, radio, and pushbutton behavior. |

Common button `/Ff` flags include:

| Flag | Meaning | Product impact |
| --- | --- | --- |
| `Pushbutton` | Button performs an action instead of storing a value. | Usually out of scope for DullyPDF field filling. |
| `Radio` | Buttons in a group are mutually exclusive. | Required for radio-group exports and Fill By Link single-choice questions. |
| `NoToggleToOff` | Radio selection cannot be cleared by clicking selected option. | DullyPDF-created radio groups should leave this clear so selected options can be clicked off. |
| `RadiosInUnison` | Same-value radio widgets toggle together. | Preserve if importing complex source forms. |

## Choice Field Keys

Choice fields cover combo boxes and list boxes.

| Key | Meaning | DullyPDF relevance |
| --- | --- | --- |
| `/Opt` | Available choices, sometimes with separate export/display values. | Required for stable dropdown/list behavior. |
| `/V` | Current selected value or values. | DullyPDF fill value for editable outputs. |
| `/I` | Selected option indexes. | Important for multi-select lists and viewer compatibility. |
| `/TI` | Top visible option index. | Mostly viewer presentation state. |
| `/DA` | Text appearance for editable combo text. | Should follow the same font rules as text fields. |

Common choice `/Ff` flags include:

| Flag | Meaning | Product impact |
| --- | --- | --- |
| `Combo` | Render as dropdown instead of list box. | Maps to combo/dropdown behavior. |
| `Edit` | User can type a custom value into the combo box. | Requires text appearance handling. |
| `Sort` | Viewer may sort options. | Preserve existing source behavior. |
| `MultiSelect` | Multiple list options can be selected. | Maps to list-style schema values. |
| `DoNotSpellCheck` | Disable spellcheck for editable combo text. | Useful for codes or IDs. |
| `CommitOnSelChange` | Commit value immediately when selection changes. | Mostly viewer event behavior. |

## Signature Field Keys

Signature fields use `/FT /Sig`.

| Key | Meaning | DullyPDF relevance |
| --- | --- | --- |
| `/V` | Signature dictionary when digitally signed. | Signing workflows must treat this as cryptographic document state, not ordinary text. |
| `/Lock` | Field/document locking behavior after signing. | Relevant to future support for embedded PDF signature fields. |
| `/SV` | Seed value constraints for signing. | Relevant only to advanced digital-signature workflows. |

DullyPDF's visible signing marks are product-level signing artifacts. They are not the same thing as a
fully populated PDF `/Sig` field unless the backend explicitly embeds a digital signature.

## Widget Annotation Keys

Widget annotations are the visible, clickable parts of fields on a page.

| Key | Meaning | DullyPDF relevance |
| --- | --- | --- |
| `/Type` | Usually `/Annot`. | Identifies the object as an annotation. |
| `/Subtype` | `/Widget` for form widgets. | Required for fillable field UI in PDF viewers. |
| `/Rect` | Widget rectangle in PDF coordinates. | Maps to DullyPDF field geometry. |
| `/P` | Page reference. | Helps viewers resolve which page owns the widget. |
| `/Parent` | Logical parent field. | Needed when the widget is a child of a field dictionary. |
| `/F` | Annotation flags. | Controls visibility, printing, hidden state, and related behavior. |
| `/AP` | Appearance dictionary. | The key to showing filled values/checkmarks without a separate flat text layer. |
| `/AS` | Current appearance state. | Must point to the active checkbox/radio appearance. |
| `/MK` | Appearance characteristics such as border/background/caption. | Useful for button styling and potential color/background controls. |
| `/BS` | Border style dictionary. | Controls border width/style in some viewers. |
| `/Border` | Older border array. | Preserve or set consistently for viewer compatibility. |
| `/C` | Annotation color. | Can support border color or annotation color if DullyPDF exposes it later. |
| `/H` | Highlight mode on click. | Mostly viewer interaction polish. |
| `/A` | Activation action. | Should be handled carefully because actions can run viewer behavior. |
| `/AA` | Additional event actions. | Preserve intentionally or strip based on security policy. |

Important annotation flags in `/F` include invisible, hidden, print, no zoom, no rotate, no view,
read-only, locked, toggle no view, and locked contents. For DullyPDF exports, `Print` is usually
important so fields render when printed.

## Appearance Streams

`/AP` is an appearance dictionary attached to a widget annotation.

| Key | Meaning | DullyPDF relevance |
| --- | --- | --- |
| `/N` | Normal appearance. | Required for ordinary display. |
| `/R` | Rollover appearance. | Optional hover appearance. |
| `/D` | Down appearance. | Optional pressed/clicked appearance. |

For text widgets, `/AP /N` is usually a single stream that draws the current value with the selected
font. For checkboxes and radio buttons, `/AP /N` is usually a dictionary of states such as `/Off` and
`/Yes`; the widget's `/AS` chooses which state is visible.

The important distinction is that a widget appearance is still part of the field. It is not the same as
flat page content. That is why editable exports can have `/AP` without being considered flattened.

## Font Keys and Base 14 Fonts

Text appearance uses font resources. A `/DA` string normally references a font resource name, font size,
and color:

```pdf
/Helv 10 Tf 0 0 0 rg
```

This means: use the `/Helv` font resource at `10` points with RGB black text. The resource name
must exist in `/AcroForm /DR /Font` or the widget appearance's own `/Resources /Font`. DullyPDF uses
short AcroForm font resource aliases such as `/Helv`, `/Time`, `/TiIt`, and `/CoBo`, while the
underlying `/BaseFont` remains the selected Helvetica, Times, or Courier Base 14 font. Those aliases
match common AcroForm generators more closely and give PDF viewers a better chance of using the
selected font while the user is actively typing in an exported editable field.

Editable exports also mirror the selected font resource into the field's own `/DR /Font` dictionary
and set normal widget annotation keys such as `/Type`, `/F`, and `/P`; this keeps focused field
editing from falling back to the document default when a viewer does not fully walk the AcroForm root
resources.

The PDF Base 14 fonts are the practical built-in font set DullyPDF can use without embedding font files:

- `Courier`
- `Courier-Bold`
- `Courier-Oblique`
- `Courier-BoldOblique`
- `Helvetica`
- `Helvetica-Bold`
- `Helvetica-Oblique`
- `Helvetica-BoldOblique`
- `Times-Roman`
- `Times-Bold`
- `Times-Italic`
- `Times-BoldItalic`
- `Symbol`
- `ZapfDingbats`

Helvetica works reliably because PDF viewers are expected to know these standard base fonts. Arbitrary
fonts are harder because DullyPDF would need to embed font programs, subset glyphs, write encoding data,
and ensure appearance streams reference the embedded resources correctly.

DullyPDF exposes only the 12 text-safe Base 14 fonts for text field controls: Helvetica, Times,
and Courier families. `Symbol` and `ZapfDingbats` remain part of the PDF Base 14 set, but they use
symbol encodings and are not reliable for normal user-typed text in editable form fields.

Global font color and per-field font color can coexist. The AcroForm root `/DA` stores the workspace
fallback color, while a field-level `/DA` can override that color for one text field. DullyPDF also
stores a compact `/DullyPDFAppearance` document metadata payload in generated editable PDFs so
re-uploading a DullyPDF download can distinguish inherited global color from a true per-field custom
color in the Field Editor.

DullyPDF-only image, PDF417, barcode, and QR helpers are not native AcroForm field types. Editable exports
write blank tagged text widgets as positional anchors and store app-only helper metadata in
`/DullyPDFAppearance` so DullyPDF can restore the helper type, dimensions, dependency mappings, and
visual payload on re-upload. Flat exports stamp the final helper visual into page content before
flattening and should not require DullyPDF metadata for ordinary PDF viewers to display the result.
Public Fill By Link, group Fill By Link, and Template API materialization run the same helper preparation
server-side: Code 128 barcodes, PDF417 payloads, and QR codes are generated as PNG data URLs before stamping, then
flat exports remove live widgets as usual.

## Product Invariants

DullyPDF should keep these rules stable:

- Field names in `/T` are product identifiers. Changing them can break saved mappings, Fill By Link,
  API Fill, and signing anchors.
- Values for editable output belong in `/V`; visible text-only drawing belongs to flat output.
- Widget `/AP` is allowed and expected in editable output when it is attached to the widget.
- Page-content text under a live field is not acceptable in editable output because it creates duplicate
  or stale values.
- Font settings and font colors belong in normalized DullyPDF appearance data, `/DA`, and `/AP` resources.
- DullyPDF-only helper values belong in DullyPDF metadata and stamped page content, not in visible AcroForm
  text values.
- Calculation formulas belong in the DullyPDF safe formula model. Generated Acrobat JavaScript belongs in
  `/AA` actions for editable compatibility only.
- Calculated output values must be materialized into `/V`, `/DV`, and `/AP` before export so non-JS viewers
  show the server-computed value.
- Calculated outputs and intermediates must be read-only text fields, and `/CO` must follow dependency order.
- Checkbox/radio state must keep `/V`, `/AS`, and `/AP` state names synchronized.
- Checkboxes must be exported as independently toggleable button fields. When reusing a source
  widget, DullyPDF clears stale radio, pushbutton, no-toggle, read-only, hidden, and locked flags that
  would prevent the checkbox from being clicked on and off.
- Radio options in the same group must be child widgets under one parent button field. Reused source
  widgets should not remain as separate same-name top-level fields because strict viewers can route
  clicks to the first field with that name.
- Radio groups must set the `Radio` button flag and clear `NoToggleToOff`, `Pushbutton`, and stale
  read-only flags so Adobe and Chrome can both switch between options and clear the selected option.
- Radio option appearance/export state names must be unique within a parent group. If incoming option
  keys collide, the exporter suffixes the emitted PDF state names while keeping the group structure
  valid.
- Flat output should not leave interactive fields behind unless the export mode explicitly says editable.
- Existing source PDF structures should be preserved when possible, but stale duplicate widgets should be
  removed when DullyPDF replaces or moves a field.

## Testing Expectations

Backend unit tests should verify:

- Editable text fields contain `/V`, `/DV`, `/DA`, and widget `/AP`.
- Editable page content streams do not contain a second flat copy of the filled text.
- Selected Base 14 fonts are registered in `/AcroForm /DR /Font` and referenced by `/DA` and `/AP`.
- Global font color is present on the AcroForm root `/DA`, per-field color overrides win in field `/DA`
  and widget `/AP` streams, and generated PDFs include `/DullyPDFAppearance` metadata for re-upload
  hydration.
- Existing widgets update in place without duplicate same-name widgets.
- Checkbox and radio widgets have matching `/V`, `/AS`, and `/AP` states with mark-only generated button appearances.
- Flat exports remove live widgets and stale `/AcroForm` metadata.
- Calculation field tests should verify generated `/AA /C`, `/AA /K`, `/AA /V`, `/AA /F`, read-only flags,
  `/CO` order, `/DullyPDFCalculations` metadata, and server-computed `/V`, `/DV`, and `/AP` values.

Integration tests should cover:

- `/api/forms/materialize` editable and flat downloads.
- Saved template reopen and download.
- Fill By Link respondent downloads in editable and flat modes.
- API Fill outputs that use the saved template snapshot.
- Re-uploading a DullyPDF-generated calculated PDF so safe calculation metadata hydrates without parsing
  arbitrary JavaScript.

End-to-end smoke tests should:

- Set global and per-field fonts, font sizes, and font colors in the UI.
- Download editable PDFs and confirm typing in the viewer keeps text inside the fields.
- Download flat PDFs and confirm no interactive widgets remain.
- Render downloaded PDFs to images so visual font, size, and checkbox/radio states can be inspected.
- Reopen saved templates and DullyPDF-generated editable downloads and confirm field geometry, values,
  fonts, font-size controls, and inherited/custom color controls hydrate.
- For calculation fields, verify DullyPDF preview/materialization values in Chrome and run separate Adobe
  Acrobat QA for live editable recalculation.
