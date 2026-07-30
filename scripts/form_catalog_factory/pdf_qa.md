# Form catalog PDF QA

`pdf_qa.py` provides deterministic structural validation for generated
DullyPDF catalog forms. It is deliberately separate from catalog replacement
and deployment: a failed result is evidence for the factory orchestrator, not
permission to delete or publish an asset.

## Validation gates

Every PDF is checked for:

- PDF magic bytes, readable pypdf structure, at least one page, and no
  encryption.
- A non-empty AcroForm and page-level widgets.
- Unsafe or unsupported actions, including JavaScript, launch/submit actions,
  external URI actions, embedded files, XFA, rich media, and document open or
  additional actions.
- Non-empty, unique field names. Multiple widgets may share one name only for
  a valid radio-button group.
- Non-empty field tooltips and supported field types (`/Tx`, `/Btn`, `/Ch`,
  and `/Sig`).
- Positive widget rectangles contained by their page crop boxes.
- Agreement between pypdf's AcroForm field enumeration and page widgets.
- Successful Poppler rasterization of every page to a non-empty PNG.
- A synthetic fill, save, reopen, and value-verification pass for text,
  checkbox/radio, and choice fields when those field types are available.
- Per-page widget counts and lowest-widget depth metrics used by the release
  builder to reject orphaned final pages and sparse interior spill pages.
- Optional manifest byte-count and SHA-256 expectations.

Unsafe-action detection is intentionally conservative because these PDFs are
publicly hosted blank templates. An action-bearing PDF should be reviewed and
redesigned rather than allowlisted casually.

## Python API

```python
from scripts.form_catalog_factory.pdf_qa import (
    validate_batch,
    validate_manifest,
    validate_pdf,
)

single_result = validate_pdf(
    "form_catalog/field_service/example.pdf",
    expected_sha256="...",
    expected_bytes=12345,
)

batch_report = validate_batch(
    ["one.pdf", "two.pdf"],
    relative_to=".",
    workers=2,
)

manifest_report = validate_manifest(
    "form_catalog/manifest.json",
    "form_catalog",
    workers=4,
)
```

All functions return plain JSON-compatible dictionaries. Per-file failures are
reported in `errors` instead of raising. Invalid batch configuration or an
invalid input manifest raises an exception so the caller cannot mistake a
misconfigured run for a successful empty batch.

The report schema is:

```json
{
  "schema_version": "dullypdf.form_catalog_pdf_qa.v1",
  "ok": true,
  "summary": {
    "total": 1,
    "passed": 1,
    "failed": 0,
    "errors": 0,
    "warnings": 0
  },
  "batch_errors": [],
  "results": [
    {
      "path": "field_service/example.pdf",
      "sha256": "...",
      "bytes": 12345,
      "ok": true,
      "errors": [],
      "warnings": [],
      "metrics": {
        "pages": 2,
        "fields": 80,
        "widgets": 80,
        "field_types": {"/Btn": 20, "/Tx": 60},
        "objects_scanned": 1000,
        "rendered_pages": 2,
        "synthetic_fill_attempted": 80,
        "synthetic_fill_verified": 80,
        "widgets_per_page": [42, 38],
        "lowest_widget_bottom_ratio_per_page": [0.12, 0.21],
        "last_page_lowest_widget_bottom_ratio": 0.21
      }
    }
  ]
}
```

Input paths and result arrays are sorted, issue arrays are deduplicated and
sorted, and reports omit timestamps. The same inputs therefore produce stable
JSON apart from intentional PDF or environment changes.

## Command line

Validate explicit files:

```bash
python3 scripts/form_catalog_factory/pdf_qa.py \
  form_catalog/field_service/one.pdf \
  form_catalog/field_service/two.pdf \
  --catalog-root form_catalog \
  --workers 2 \
  --output tmp/pdfs/catalog-pdf-qa.json
```

Validate all successful entries in a catalog manifest:

```bash
python3 scripts/form_catalog_factory/pdf_qa.py \
  --manifest form_catalog/manifest.json \
  --catalog-root form_catalog \
  --workers 4 \
  --output tmp/pdfs/catalog-pdf-qa.json
```

The command exits `0` only when every selected PDF and the batch itself pass.
It exits `1` for validation failures. `--no-render` and
`--no-synthetic-fill` exist for focused diagnostics and should not be used for
a release gate.

Poppler's `pdftoppm` must be available. Use `--render-root` only when retained
page PNGs are useful for a visual-review stage; otherwise the validator renders
into temporary directories and removes them.

## Scope

This module checks deterministic PDF structure and fill behavior. It does not
judge whether a form's workflow is complete, wording is legally appropriate,
labels are visually clipped, or information collection is proportionate.
Those remain separate semantic and rendered-page review gates in the catalog
factory.
