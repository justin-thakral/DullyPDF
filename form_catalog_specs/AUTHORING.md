# High-value form authoring contract

This is the working contract for an agent that owns one fenced catalog
specification claim. The objective is not to maximize pages or controls. It is
to replace a low-value shell with a form that a real operator could use from
intake through closeout without creating a second shadow document.

## Non-negotiable boundaries

- Work only on the identity in the active claim file.
- Preserve `catalog_id`, `source_section`, `source_filename`, and `slug`
  exactly. A changed intent requires a new catalog entry, not a repurposed URL.
- Author JSON only under `form_catalog_specs/candidates/`. Do not hand-place
  PDF coordinates, edit generated catalog data, commit, upload, or deploy.
- Do not copy an official, government, licensed, or third-party form. DullyPDF
  replacements are original workflow templates.
- Do not turn a record into legal, medical, financial, engineering, or safety
  advice. Capture facts, decisions, evidence, escalation, and qualified review.
- Collect only information needed for the stated workflow. Avoid sensitive
  data that the form does not genuinely need.

## Research and design

1. Read the claimed catalog title, description, use case, source family, and
   risk tier. Inspect sibling titles so this form has a distinct job.
2. When domain facts matter, consult primary or authoritative sources for
   workflow concepts. Record concepts in original language; do not reproduce
   source wording or layout.
3. Write a one-sentence job statement: who opens the record, what event it
   controls, and what evidence proves it can be closed.
4. Outline the real lifecycle before writing fields:
   identity and routing; observations and evidence; decision and authorization;
   exceptions and escalation; completion, handoff, and accountable closeout.
5. Add domain-specific branches. A strong form asks questions that would not
   make sense on a generic “service request” with only the title changed.

## Specification quality

Use short semantic keys and plain, precise labels. Group related fields into
rows that can be completed in the same moment. Prefer:

- `fields` for concise identity, dates, statuses, readings, and routing;
- `checklist` for independent confirmations, never as a substitute for
  findings or explanation;
- `table` for repeated evidence, line items, owners, dates, and status;
- `textarea` for narrative facts, rationale, exceptions, and handoff;
- `notice` for a short boundary, stop condition, or routing safeguard;
- `signatures` for acknowledgment or authorization, not decorative sign-off.

Every form should make unresolved work visible. An exception needs a condition,
immediate action, owner, due point, escalation path, and final disposition when
those concepts apply. Closeout should identify the outcome, remaining
limitations, next action, responsible owner, handoff, and review or acceptance.

Risk tiers may be elevated from the catalog plan when the authored workflow
requires it; they must never be downgraded. Tier B and C forms need explicit
qualified-review, stop, escalation, and record-boundary prompts appropriate to
the subject.

The automated minimums—four sections, 45 controls, three block types, lifecycle
coverage, and intent-specific language—are rejection floors, not targets.
Do not add filler fields to satisfy them. A 200-control form is valuable only
when each control supports the workflow.

## Required verification

Validate the candidate alone first:

```bash
python3 -m scripts.form_catalog_factory validate-spec path/to/spec.json
python3 -m scripts.form_catalog_factory qa-spec path/to/spec.json \
  --output tmp/form-catalog-factory/<worker>/<catalog-id>-spec-qa.json
```

Then validate it with its intended peer wave so semantic near-duplicates are
visible. The final report must have zero errors, zero warnings, and no
near-duplicate pair.

Render with the current shared renderer:

```bash
python3 -m scripts.form_catalog_factory render path/to/spec.json \
  --output-root tmp/form-catalog-factory/<worker>/rendered
```

Run PDF QA with Poppler rendering and synthetic fill enabled. Verify:

- PDF and AcroForm structure are safe and readable;
- field count equals the specification control count;
- all pages rasterize;
- every supported control fills, saves, reopens, and retains its value;
- there is no orphan final page or sparse interior spill page.

Finally inspect every rendered page at readable resolution. Check title and
section continuity, label wrapping, table headers, widget alignment, notices,
page balance, footer clearance, and the final handoff. Automated QA cannot
approve visual quality.

Only after all checks pass should the worker complete the fenced claim with
`complete-spec`. A lost or expired lease means discard the publication attempt;
do not write over the replacement worker.

## Review handoff

Report:

- exact catalog identity and spec path;
- why the form is specific to its intended workflow;
- page and field counts;
- schema/content/PDF/fill-round-trip results;
- visual evidence location;
- risk-tier decision and any qualified-review safeguards;
- any unresolved concern.

“Generated successfully” is not approval. Approval requires useful content,
safe fill behavior, clean rendering, exact identity, and independent review.
