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
4. Outline only the lifecycle stages the named task actually needs. Identity
   and routing are normally required. Add observations, authorization,
   exception handling, or closeout only when the user must record or decide
   those things. A receipt, reservation, or sign-in log must not be expanded
   into an intake-to-closeout governance packet.
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

When the document itself grants or withholds permission, consent, a release, a
waiver, or authorization, it must include both a direct control that records
the decision and a `signatures` receipt identifying the signer or responsible
witness. Mentioning “permission” in a title or completion label is not a
decision. Derivative checklists, intake records, information sheets, logs,
reports, and worksheets should instead verify or route the underlying decision
without pretending to grant it.

Choice controls should begin with a neutral prompt such as `Select`. The
renderer also inserts `Select` when an authored choice list begins with a
substantive result, so a newly opened form never appears approved, completed,
acceptable, or otherwise decided before the user makes a selection.

Before drafting, list the irreducible inputs a user needs to perform the job.
Those values must appear as direct `fields`, `table` columns, or `textarea`
inputs. A checklist may confirm that a reservation time, patient date of birth,
inspection reading, authorization choice, or delivery result was verified, but
it cannot substitute for a place to record that value. A blank rendered form
must let an operator complete the task named in the title without opening a
second shadow document.

Do not expose generator IDs, bracketed machine codes, prompt instructions,
phrases such as “title-swapped,” or other internal authoring commentary in
customer-visible copy. Do not force unrelated workflows through one fixed
section/block/control envelope. Shared lifecycle concepts are expected, but
the direct inputs, repeated rows, decision controls, and overall form size
should follow the actual task.

When unresolved work is part of the task, make it visible with a condition,
immediate action, owner, due point, escalation path, and final disposition.
When closeout is part of the task, identify the outcome, remaining limitations,
next action, responsible owner, handoff, and review or acceptance. Do not add
either stage solely to make the form look comprehensive.

Risk tiers may be elevated from the catalog plan when the authored workflow
requires it; they must never be downgraded. Tier B and C forms need explicit
qualified-review, stop, escalation, and record-boundary prompts appropriate to
the subject.

The automated floors are two sections, 12 controls, two block types,
task-specific lifecycle coverage, and intent-specific language. They are not
targets. Inherently focused absence notes, reservations, and acknowledgments
are capped at three sections, 110 controls, and two rendered pages. A Tier-C
focused task may use four sections, 180 controls, and three pages for required
review language. Standard operational forms are capped at eight sections, 400
controls, and six pages; genuinely complex applications, assessments, plans,
and packets at ten sections, 500 controls, and eight pages.

Those are fail-safe ceilings, not recommended sizes. Ordinary receipts, logs,
sign-in records, checklists, requests, and work orders should still be one to
three pages unless repeated rows or real task complexity justify more. The
approved first-release exemplars show that a detailed custody log or incident
record can legitimately be longer; a restaurant reservation or absence note
cannot. Do not add filler fields to meet a floor or use every available page.

## Required verification

Validate the candidate alone first:

```bash
python3 -m scripts.form_catalog_factory validate-spec path/to/spec.json
python3 -m scripts.form_catalog_factory qa-spec path/to/spec.json \
  --output tmp/form-catalog-factory/<worker>/<catalog-id>-spec-qa.json
```

Then validate it with its intended peer wave so semantic near-duplicates are
visible. The final report must have zero errors, zero warnings, and no
near-duplicate pair. Batch QA also rejects customer-visible machine or
authoring language, a full block/control structure reused across more than 25
forms, the same task profile and section-role sequence reused across more than
40 forms, or an eight-word metadata or section/block-guidance phrase reused
across more than 40 forms. A control label of four or more words also fails when
it appears in more than 25 percent of a batch, with a 40-form minimum before
that rule applies. Repeating the same guidance across multiple sections of one
form also fails; each section must explain its distinct task. Those are safety
floors: a smaller profile or archetype wave still needs independent semantic
review for direct core inputs, proportionate length, natural copy, and task
fit.

Every title, section or block label, field or table label, checklist item, and
choice must start with polished sentence case. Adjacent repeated words such as
`Scope Scope` fail QA. Do not evade reuse checks by attaching a task noun to
generic shorthand such as `Cleaning requester/reporter`; write the natural
label a real operator would expect.

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

Release QA also rejects a multi-page form when the lowest widget on the final
page remains above 45 percent of the page height from the PDF bottom edge. This
catches a sparse tail even when it contains more than the six controls covered
by the narrower orphan-page check. Rebalance real workflow content; do not add
filler fields merely to satisfy the metric.

Finally inspect every rendered page at readable resolution. Check title and
section continuity, label wrapping, table headers, widget alignment, notices,
page balance, footer clearance, and the final handoff. Automated QA cannot
approve visual quality. The independent reviewer must also open a deterministic
sample spanning every profile and archetype, then confirm that the form records
the title's core values directly rather than mentioning them only in checklist
prose.

The current non-legacy theme rejects any one-line title, section, block, notice,
or field label that would have to be ellipsized at the renderer's minimum font
size. Shorten the label or give it a wider field; do not rely on the tooltip to
repair visibly truncated copy.

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
