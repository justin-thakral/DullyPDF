# High-value form specifications

This tracked directory is the reproducible source for DullyPDF-authored catalog
replacements. Raw PDFs and thumbnails remain outside Git; each release records
their immutable hashes and versioned object paths.

## Authoring boundary

Agents may research and author one JSON specification per claimed catalog ID.
They do not place PDF coordinates, update the generated frontend catalog, push
Git commits, or deploy assets. The deterministic renderer under
`scripts/form_catalog_factory/` owns layout, semantic widget names, pagination,
and PDF construction.

Read and follow [AUTHORING.md](AUTHORING.md) for the complete research,
content, QA, visual-review, and claim-handoff contract.

`catalog_id` is the existing stable source identity:
`<source_section>/<source_filename-without-.pdf>`. It must not be shortened,
renamed, or prefixed with a source-family label.

Candidate specifications remain grouped by source family until a release
integrator freezes an approved set. A frozen release manifest is immutable; a
correction produces a new revision and hash rather than editing a deployed
artifact in place.

## Required workflow depth

Each retained form must capture its real operational task rather than a topic
inserted into a generic shell. Specifications normally need identity and
routing plus the task's direct inputs. Add only the lifecycle stages that the
task actually uses:

- identity and routing information;
- workflow-specific observations, evidence, or line items;
- decisions and authorization;
- exception and escalation paths;
- completion, handoff, and accountable closeout.

The last four are conditional, not a universal template. Field count and page
count are not goals by themselves. Inherently focused tasks are limited to two
rendered pages, with one additional page for Tier-C review needs. Standard and
complex profiles have broader fail-safe ceilings, while authoring review still
requires the shortest form that fully performs the task. Content QA caps
sections and controls for those profiles and rejects repeated semantic
workflow skeletons.

## Local commands

```bash
python3 -m scripts.form_catalog_factory validate-spec \
  form_catalog_specs/candidates
```

```bash
python3 -m scripts.form_catalog_factory render \
  form_catalog_specs/candidates \
  --output-root tmp/form-catalog-factory/rendered
```

Run the PDF QA command documented in
`scripts/form_catalog_factory/pdf_qa.md` before a candidate can enter a frozen
release.

Run content QA before rendering:

```bash
python3 -m scripts.form_catalog_factory qa-spec \
  form_catalog_specs/candidates \
  --output tmp/form-catalog-factory/spec-qa.json
```

This gate checks workflow depth, fillable-control depth, intent-specific
language, lifecycle coverage, risk-review prompts, customer-visible internal
codes or authoring copy, task-proportional size, excessive full-structure or
semantic-skeleton reuse, generic or repeated section guidance, repeated long
metadata or instructional phrases, control labels reused across most of a
batch, lowercase or repeated-word discrete UI copy, and exact or near-duplicate
content. It complements PDF QA; neither gate substitutes for the independent
semantic and visual review stages recorded in the ledger.
