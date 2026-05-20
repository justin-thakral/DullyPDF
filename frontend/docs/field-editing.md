# Field Editing Guide

Field editing is centered around three coordinated areas: overlay (PDF), the left `Browser`, and the
right `Field Editor`. The side panels keep instructional copy in collapsible description rows so the active controls
stay compact while still exposing context for page navigation, display mode, global appearance, filters,
field details, create tools, bulk style conversion, keyboard movement, history, and shortcuts.

## Display modes and toggles

- `Display mode` presets:
  - `Review`: overlays + names
  - `Edit`: overlays + transform resize controls (default when a form opens)
  - `Fill`: interactive input controls
- `Transform`: enables field moving and resize handles for geometry editing.
- `Fields`: show/hide overlay boxes.
- `Names`: show/hide overlay labels.
- `Info`: show/hide input controls on the PDF for entering values.
- In `Info`, checkbox and radio controls keep the visible control outline at the real field size while rendering slightly oversized check/dot marks for tiny PDF boxes so selected states stay readable.
- Editable and flat PDF exports render only generated checkbox/radio selection marks for selected states. The source PDF's own box or circle artwork remains visible instead of receiving a second generated control outline.
- `Transform` and `Info` are mutually exclusive to avoid drag/edit conflicts (enabling one disables the other).
- `All`: list fields from all pages in the Browser.
- `Clear`: clear current field values in the session.
- `Global font`: chooses the workspace font for text fields from the text-safe PDF Base 14 font subset. `Default (Helvetica)` preserves the current DullyPDF font behavior in preview and exported PDFs. Symbol-only Base 14 fonts (`Symbol`, `ZapfDingbats`) are not exposed for typed fields because common PDF viewers cannot reliably map normal typed text into those encodings.
- `Global font size`: chooses whether text fields keep `Auto (dynamic)` or use a custom workspace point size in the fill preview and generated PDFs.
- `Global font color`: chooses the workspace text color for text fields. It is written to the AcroForm root appearance and used by every field that has not selected a custom color.
- `Global alignment`: chooses the workspace text alignment for text fields. It is written to generated AcroFields and used by every field that has not selected a custom alignment.
- The schema/source dropdown keeps Search & Fill actions close to the active source: `Search & Fill` opens the modal, `Clear Field Information` clears current field values without disconnecting the source, and `Disconnect Data Source` removes the attached source.

## Creating and selecting fields

- Use Field Editor create tools (`Text`, `Signature`, `Checkbox`, `Radio`, `Quick Radio`) to draw fields directly on the PDF.
- DullyPDF-only create tools (`Image`, `PDF417`, `1D Barcode`, `QR Code`) sit below the native field tools. They are editor template helpers rather than native AcroForm widget types; editable exports store tagged text anchors plus DullyPDF metadata so the helpers can be restored when the PDF is reopened, and flat exports render their final visuals into page content.
- Calculation create tools (`Number Input`, `Calculated Output`) create text fields with DullyPDF calculation metadata. Number inputs stay editable numeric text fields, while calculated outputs are read-only text fields whose values are computed from a safe formula model.
- Activating a create tool exits `Transform` and `Info` so drawing does not compete with drag handles or inline inputs.
- Turning the create tool off restores the previous viewer display mode/toggles.
- New fields are added to the current page.
- Click without dragging to place a default-size field at the pointer location, or drag past the click threshold to size the field from the gesture.
- `Quick Radio` lets you marquee-select checkbox fields on the active page and convert them into one radio group.
- `Bulk Convert Font` sits below the create tools and uses the same marquee-selection behavior to collect text fields on the active page. Choose font, font size, font color, or alignment first, quick-select the target fields, then convert the selection to that one setting.
- Press `Esc` to exit an active create tool.
- Select fields from the overlay or the left Browser.
- Selecting a field in the list can jump pages when needed.
- If the selected field is outside active list filters, the panel shows a `Reveal selected` action.

## Moving, resizing, and geometry

- Move and resize are enabled only while `Transform` is on.
- Drag a field to move it when `Transform` is enabled.
- Drag corner or edge handles to resize standard fields.
- Corner resizing defaults to standard freeform behavior (width and height change independently).
- Hold `Shift` while corner-resizing to preserve aspect ratio for that drag.
- Standard fields expose four corners (`TL`, `TR`, `BL`, `BR`) plus edge handles (`left`, `right`, `top`, `bottom`).
- Small fields (for example tiny checkboxes) use a single bottom-right handle and a larger move hit area.
- Geometry is clamped to page bounds with a minimum size.
- Field Editor geometry inputs edit `x`, `y`, `width`, and `height` directly.
- Coordinates are PDF points measured from the page top-left.

## Field Editor Editing

- Rename fields and change type/page assignment.
- Text fields can override the global field font with one of the supported text-safe Base 14 fonts, or inherit the global setting.
- Text fields can also set field-specific font-size behavior: `Use global` inherits the workspace font-size setting, `Auto` forces the current height-based sizing for that field, and `Custom` stores an individual point size.
- Text fields can set field-specific font colors. `Use global` inherits the workspace color; `Custom` stores a per-field hex color that overrides the global color in preview, editable downloads, flat downloads, Fill By Link, and API Fill materialization.
- Text fields can set field-specific alignment. `Use global` inherits the workspace alignment; `Left`, `Center`, and `Right` store a per-field alignment override that applies in preview, editable downloads, flat downloads, Fill By Link, and API Fill materialization.
- Text fields can be configured as calculation fields. `number_input` fields accept integer values in v1; `calculated_output` and `calculated_intermediate` fields are read-only and store formulas built from numeric fields, constants, unary minus, and `+`, `-`, `*`, `/`.
- The formula setup dialog stores an AST, not user-authored JavaScript. DullyPDF validates missing dependencies, unsupported nodes/operators, and dependency cycles before saving calculated fields.
- Calculated values are precomputed by DullyPDF before editable downloads, flat downloads, Fill By Link response downloads, API Fill outputs, and signing source materialization. Editable PDFs also include generated Acrobat JavaScript and `/AcroForm /CO` order for Adobe live recalculation, but the precomputed field value remains the cross-viewer source of truth.
- Unsupported imported AcroForm JavaScript is shown as locked external calculation metadata. DullyPDF summarizes the imported behavior and can rebuild it through the formula setup flow, but it does not display arbitrary JavaScript as editable source.
- Image fields expose PNG/JPEG upload, preview, and clear controls in the Field Editor.
- PDF417 fields expose basic manual name/DOB fallback inputs, source-field selectors for scan data, generated preview, and read-only scan text so the app-only barcode payload can be checked while designing a template.
- 1D Barcode fields expose either a 9-digit manual value or one source-field dependency. Dependency values resolve by field ID first and fall back to field name when an older mapping no longer has the same ID.
- QR Code fields expose either manual text or one source-field dependency. Dependency values resolve by field ID first and fall back to field name when an older mapping no longer has the same ID.
- DullyPDF-only dependencies can target standard PDF fields only. Image, PDF417, 1D Barcode, and QR Code helper fields are intentionally excluded as dependency sources to avoid self-dependencies and obvious cycles.
- Font, font-size, font-color, and alignment choices persist in saved templates and are applied when DullyPDF materializes editable or flat PDFs, including Fill By Link and API Fill outputs that reuse the saved snapshot.
- DullyPDF-generated editable PDFs include a small appearance metadata record so re-uploading that PDF can restore the global color/alignment and keep true per-field color/alignment overrides marked as custom in the Field Editor.
- DullyPDF-only helper metadata is written only for editable round-trip exports. Flat editor exports keep the final stamped image/barcode/PDF417/QR page content and should not depend on DullyPDF-specific metadata for viewing.
- Fill By Link, group Fill By Link downloads, and Template API fills generate 1D barcode, PDF417, and QR image payloads on the backend before stamping, so public/API exports do not depend on the browser-only editor preview generator.
- Editable exports store text values, selected font settings, and widget-owned appearance streams on the AcroForm fields instead of adding a separate page-content text layer under the field. Exported AcroFields use short Base 14 font resource aliases in `/DA` so the inactive value and the focused typing state resolve the same selected font in stricter PDF viewers.
- Editable calculation exports store calculated fields as normal `/FT /Tx` AcroForm text fields with `/V`, `/DV`, `/AP`, generated `/AA` actions, and DullyPDF calculation metadata. Live recalculation is Adobe-first; browser and mobile viewers may only show the precomputed value.
- Flat calculation exports bake the computed value into page content and remove live widgets, making them the most reliable final-record output.
- Radio `Group key` is the persisted single-choice identifier used by exported PDFs, Search & Fill, and Fill By Link.
- Editable PDF exports write checkbox and radio button widgets with explicit on/off appearance states,
  and those generated states draw only the selected check/dot mark so the original PDF control artwork is not covered or doubled. Reused source widgets are registered in the output AcroForm tree so strict viewers such as Chrome and Adobe can load, display, and toggle them.
- When a new or AI-suggested radio group key collides with a different existing radio group, the editor auto-suffixes the key to keep those groups separate downstream.
- The Field Editor header shows the selected field name, and its `Field details` guide calls out how to commit edits.
- Delete the selected field, or remove every field from the current workspace after confirming the bulk delete dialog.
- The `Create field` section includes bulk font conversion plus an `Arrow keys` movement toggle with a configurable point step for keyboard nudging.
- Undo/redo field edits with keyboard shortcuts (history depth: 10 snapshots).
- Workspace edits only change the editor overlay state; the underlying PDF bytes are rewritten later when you save or download.
- Toolbar actions that depend on the latest editor state now defer until the next tick so blur-committed Field Editor edits settle before Save, Fill By Web Form, API Fill, or Search & Fill reads the workspace.

## Confidence labels

- The Browser supports high/medium/low confidence filtering.
- Tier thresholds are:
  - high: `>= 0.60`
  - medium: `>= 0.30` and `< 0.60`
  - low: `< 0.30`
- Field confidence (`fieldConfidence`) comes from detection, or from OpenAI rename `isItAfieldConfidence` when available.
- Name confidence comes from OpenAI rename (`renameConfidence`) and/or schema alignment (`mappingConfidence`).
- Filtering primarily uses field confidence tiers.
- The field controls show a compact `Page Fields` count for the current page, and the list header includes a `Top` action for returning to the start of the scrollable field panel.

## OpenAI guardrails

- Rename, Map, and Rename+Map require explicit confirmation dialogs.
- The dialogs warn users before sending PDF/schema content to OpenAI.
- Row data and field input values are not included in OpenAI rename/map requests.
- Rename and Map now send a SHA-256 fingerprint of the active PDF, and the backend rejects the
  request if that document no longer matches the active backend session.
- Rename now derives radio-group suggestions from returned `checkboxRules` plus high-signal renamed checkbox layouts such as compact `yes/no`, `male/female`, and single-row enum groups. `Rename + Map` now uses the dedicated combined endpoint, while Map-only acts as a lightweight second pass: exact current-name matches are resolved locally first, then OpenAI only receives schema headers plus the remaining unresolved field names.
- When upload-time `Rename` or `Rename + Map` continues after the editor opens, the workspace shows a non-blocking banner so operators know field names are still being updated in the background.
- While those background Rename/Map updates are still mutating the workspace, Save and publish-style actions stay blocked so you do not persist or share a stale pre-OpenAI template snapshot.
- OpenAI-derived radio-group suggestions now auto-apply only when their confidence lands in the high tier (`>= 0.60`).
- Medium/low-confidence radio suggestions stay review-only, and their source fields keep checkbox behavior until you explicitly convert them.
- Fill By Link web forms only render radio questions for explicit radio widgets. Unconverted checkbox clusters stay checkbox-style (`boolean` or grouped multi-select) in the public form.
- Legacy checkbox-rule-derived radio suggestions still stay review-only when reopening older saved forms.
- Header action buttons now expose inline prerequisite hints when disabled (for example missing schema source for mapping).

## Search & Fill transform rules

- Search & Fill prefers direct mapped column values first.
- When a direct value is not available, it can apply deterministic `textTransformRules` emitted by schema mapping.
- Supported transform operations are:
  - `copy`
  - `concat`
  - `split_name_first_rest`
  - `split_delimiter`
- Transform rules are persisted with saved forms so the same split/join behavior replays on reload.

## Keyboard shortcuts

- `Ctrl/Cmd+Z`: undo
- `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y`: redo
- `Ctrl/Cmd+X`, `Delete`, or `Backspace`: delete selected field
- `T` / `S` / `C` / `R` / `Q`: set active create tool (`Text` / `Signature` / `Checkbox` / `Radio` / `Quick Radio`)
- `Esc`: clear active create tool
- `Ctrl/Cmd+F` or `/`: focus field search
- `[` and `]`: previous/next page
- `Arrow`: move selected field by the configured step when `Arrow keys` movement is enabled in the Field Editor
- `Alt+Arrow`: nudge selected field by 1 point
- `Shift+Alt+Arrow`: nudge selected field by 10 points
- `Ctrl/Cmd+0`: reset zoom to 100%
- `Shift` (while corner-dragging): temporary aspect-ratio lock
