# Form Catalog Factory Ledger

`ledger.py` is the single-host coordination layer for catalog-factory workers.
It uses SQLite in WAL mode so readers and short write transactions can proceed
concurrently without workers coordinating through shared JSON files. The
database is runtime state; reviewed form specifications and frozen release
manifests remain the durable, source-controlled record.

## Item state semantics

The normal production path is:

```text
queued
  -> spec_claimed -> spec_ready
  -> render_claimed -> rendered
  -> qa_claimed -> qa_passed
  -> review_claimed -> review_approved
  -> batch_frozen
  -> upload_claimed -> staging_uploaded
  -> canary_claimed -> canary_live
  -> release_claimed -> live
```

The four authoring and QA boundaries are intentional. A worker cannot skip from
`queued` to `rendered`, and the worker doing review claims a separate stage
after automated or visual QA has passed.

Additional states:

- `retry_wait` holds a retryable failure until `not_before`. It remembers the
  ready state associated with the failed stage.
- `blocked` is a non-retryable failure requiring intervention.
- `superseded` and `retired` are terminal catalog decisions.

The lease policies are defined in `LEASE_POLICIES`. Each claim stage has one
ready predecessor and one successful successor. This keeps crash recovery
deterministic: an expired `render_claimed` task returns to `spec_ready`, for
example, without guessing which work was durable.

## Claims, fencing, and crash recovery

`claim_next()` performs these operations in one `BEGIN IMMEDIATE` transaction:

1. Release retries whose backoff is complete.
2. Requeue expired leases.
3. Select the highest-priority eligible item.
4. Set the claimed state, random lease token, owner, expiration, and attempt.
5. Increment the item's `fence_epoch`.

Workers must retain the returned `WorkLease`. `heartbeat()`,
`complete_lease()`, and `fail_lease()` compare all of the following:

- catalog ID
- claimed stage
- worker ID
- random lease token
- fence epoch
- unexpired deadline

When a crashed task is reclaimed, its fence epoch increases. A resumed stale
worker therefore cannot publish over the replacement worker even if it still
has the old token. Heartbeats should run every one or two minutes for the
default 15-minute lease, with the actual lease duration chosen to leave
several missed-heartbeat intervals before expiration.

`requeue_expired()` and `release_due_retries()` are safe to run from a periodic
reaper. Claims also run both repairs before selecting work, so recovery does
not depend on a perfectly reliable scheduler.

## Idempotency

Mutating operations accept an idempotency key where a network or process retry
could otherwise repeat work:

- `add_item()`
- `claim_next()`
- `complete_lease()`
- `fail_lease()`
- `create_batch()`
- `assign_to_batch()`
- `retarget_open_batch_source()`
- `bind_release_evidence()`
- `freeze_batch()`

The ledger stores the action, scope, canonical request hash, and result in the
same transaction as the state change. Reusing a key with the identical request
returns the original result; reusing it with different inputs raises
`IdempotencyConflictError`. Even an empty `claim_next()` result is recorded, so
retrying that exact request cannot accidentally claim a later item.

A useful worker convention is:

```text
<catalog-id>:<stage>:<input-hash>:<worker-run-id>
```

The input hash should change whenever the specification or prerequisite
artifact changes.

A claim key belongs to one lease attempt. Do not reuse it after that lease
expires: the stored result intentionally identifies the old fenced capability.
Use a new attempt key so `claim_next()` can reap the expired lease and issue a
new token. The reviewed-release reconciler claims an exact catalog identity
without a persisted claim key, then uses a deterministic key only for the
fenced completion.

## Candidate artifacts

`complete_lease(..., artifact_updates=...)` is the fenced way to register
candidate outputs. Supported fields are:

- `spec_hash`
- `pdf_hash`
- `thumbnail_hash`
- `schema_hash`
- `pdf_uri`
- `thumbnail_uri`
- `qa_evidence_uri`
- `qa_evidence_hash`
- `review_evidence_uri`
- `review_evidence_hash`

Typical ownership is:

- specification completion records `spec_hash`;
- render completion records the PDF, thumbnail, and field-schema hashes plus
  content-addressed candidate URIs;
- QA completion records the automated evidence URI and exact SHA-256;
- visual-review completion records the page-review receipt URI and exact
  SHA-256.

The ledger reserves unique `(section, filename)`, public slug, and optional
intent fingerprint values. These constraints prevent exact identity
collisions. Semantic duplicate detection still belongs in the selector and
review workflow before approval.

## Batch assignment and immutable freeze

Create a batch with `create_batch()`, including its pinned Git base commit,
renderer commit, and exact target count. `assign_to_batch()` only accepts items
whose ownership is `first_party`; official and public-source forms fail closed.
An item cannot belong to two batches, and assignment cannot exceed the target.

The tracked specifications are normally committed after a batch is opened.
When that final source commit differs from the provisional renderer commit,
`retarget_open_batch_source()` is the only supported way to update the open
batch provenance. It accepts one new source commit and writes that value as the
renderer commit, so the final renderer and source cannot diverge. The batch
`source_commit` evidence field remains null until the exact reviewed build is
bound.

Retargeting is intentionally narrower than ordinary batch editing. It requires
an exact expected base commit, renderer commit, batch version, complete-state
digest, tracked-selection digest, and catalog-ID set. The full batch and every
member are read and updated in one transaction. It succeeds only when exactly
the target count is assigned, every member is first-party `spec_ready` with a
spec hash, no lease is present, and no item or batch contains rendered, QA,
review, release, or frozen evidence. Frozen batches are still protected by the
same database immutability triggers. A successful retarget increments the batch
version and emits one `batch_open_source_retargeted` audit event containing the
old and new provenance and both state digests.

After the complete release package and page-review receipts validate,
`bind_release_evidence()` seals the open batch to one exact source commit,
selection digest, build-report hash, and release-manifest hash. The binding is
write-once and prevents later membership changes.

`freeze_batch()` succeeds only when:

- assigned item count exactly equals `target_count`;
- the write-once release-evidence binding is complete;
- every item is `review_approved`;
- every item is first-party;
- all required candidate hashes, URIs, automated-QA evidence, and
  human-review evidence are present.

The freeze builds a canonically sorted manifest, hashes it with SHA-256, stores
both, changes the batch to `frozen`, and advances all items to `batch_frozen`
in one transaction. Database triggers then prevent:

- changing frozen membership;
- deleting a frozen item or batch;
- changing frozen identity, candidate artifacts, or manifest data.

Release stages may still advance and acquire leases because their state and
lease columns are not part of the frozen artifact surface. A discovered defect
must create a new batch revision and new digest; it must not edit the frozen
manifest in place.

## Integration API

Minimal worker usage:

```python
from scripts.form_catalog_factory.ledger import (
    CatalogFactoryLedger,
    Stage,
)

ledger = CatalogFactoryLedger("tmp/form-catalog-factory.sqlite3")
lease = ledger.claim_next(
    worker_id="spec-agent-03",
    claimed_stage=Stage.SPEC_CLAIMED,
    batch_id="batch-0007",
    idempotency_key="agent-03:claim:42",
)

if lease is not None:
    # Do expensive work outside the transaction and heartbeat periodically.
    lease = ledger.heartbeat(lease)
    ledger.complete_lease(
        lease,
        idempotency_key=f"{lease.catalog_id}:spec:output-sha",
        artifact_updates={"spec_hash": "..."},  # SHA-256
    )
```

Batch integration:

```python
batch = ledger.create_batch(
    batch_id="batch-0007",
    target_count=1000,
    base_commit="...",
    renderer_commit="...",
    idempotency_key="create:batch-0007",
)
ledger.assign_to_batch(
    batch_id=batch.batch_id,
    catalog_ids=candidate_ids,
    idempotency_key="assign:batch-0007:selection-sha",
)
ledger.bind_release_evidence(
    batch_id=batch.batch_id,
    source_commit="...",
    selection_digest="...",
    build_report_hash="...",
    release_manifest_hash="...",
    idempotency_key="bind:batch-0007:release-evidence",
)
frozen = ledger.freeze_batch(
    batch_id=batch.batch_id,
    idempotency_key="freeze:batch-0007:approval-sha",
)
print(frozen.batch.frozen_digest)
```

The CLI keeps lease tokens in mode-`0600` runtime claim files rather than
copying them into prompts:

```bash
python3 -m scripts.form_catalog_factory claim-spec \
  --ledger tmp/form-catalog-factory/runtime/factory-v3.sqlite3 \
  --batch-id catalog-20260729-001 \
  --worker-id author-03 \
  --lease-seconds 3600 \
  --catalog-id construction_trades/dct_1007__home_remodel_estimate_request_form \
  --idempotency-key author-03:claim:0001 \
  --output tmp/form-catalog-factory/runtime/claims/author-03-0001.json
```

Omit `--catalog-id` when the worker should take the highest-priority eligible
item. Supplying it is useful for a cohesive family lane; the claim still
succeeds only when that exact item is eligible in the requested batch.

Long-running workers extend the same fenced lease:

```bash
python3 -m scripts.form_catalog_factory heartbeat-claim \
  --ledger tmp/form-catalog-factory/runtime/factory-v3.sqlite3 \
  --claim tmp/form-catalog-factory/runtime/claims/author-03-0001.json \
  --lease-seconds 3600
```

Completion verifies the exact claimed identity, runs content QA with zero
warnings, hashes the specification, and advances only through the ledger:

```bash
python3 -m scripts.form_catalog_factory complete-spec \
  --ledger tmp/form-catalog-factory/runtime/factory-v3.sqlite3 \
  --claim tmp/form-catalog-factory/runtime/claims/author-03-0001.json \
  --spec form_catalog_specs/candidates/longtail/example.json \
  --idempotency-key author-03:complete:0001
```

Use `fail-claim` for a retryable or permanent authoring failure. Never reuse a
claim file for another catalog identity. An expired or reclaimed claim is a
fenced stale capability and cannot publish.

For reviewed specifications created before a batch was opened, the integrator
can reconcile them without bypassing fencing:

```bash
python3 -m scripts.form_catalog_factory register-specs \
  form_catalog_specs/candidates \
  --ledger tmp/form-catalog-factory/runtime/factory-v3.sqlite3 \
  --batch-id catalog-20260729-001 \
  --worker-id bootstrap-review \
  --claim-root tmp/form-catalog-factory/runtime/bootstrap-claims
```

This runs peer content QA first, claims each exact identity, and records its
hash. A matching `spec_ready` item is an idempotent no-op; any other stage or
hash conflict fails closed.

If the exact clean Git commit containing those specifications differs from the
commit recorded when the still-open batch was created, first inspect the
read-only fence:

```bash
python3 -m scripts.form_catalog_factory inspect-open-batch-retarget \
  --ledger tmp/form-catalog-factory/runtime/factory-v3.sqlite3 \
  --selection form_catalog_releases/planning/catalog-20260729-001-selection.json
```

Review `eligible`, `blockers`, the old commits, `batch_version`,
`selection_digest`, and `state_digest`. Then copy those values exactly into the
mutation:

```bash
python3 -m scripts.form_catalog_factory retarget-open-batch-source \
  --ledger tmp/form-catalog-factory/runtime/factory-v3.sqlite3 \
  --selection form_catalog_releases/planning/catalog-20260729-001-selection.json \
  --batch-id catalog-20260729-001 \
  --expected-selection-digest "<selection_digest>" \
  --expected-base-commit "<old base_commit>" \
  --expected-renderer-commit "<old renderer_commit>" \
  --expected-batch-version "<batch_version>" \
  --expected-state-digest "<state_digest>" \
  --new-source-commit "<exact clean Git HEAD>" \
  --actor release-controller \
  --idempotency-key "retarget:catalog-20260729-001:<new-source-commit>"
```

The operation always preserves the inspected base commit and verifies that it
is an ancestor of the new source. The command also requires the selection to
be tracked at those exact bytes in the clean source commit. A retry must use
the same idempotency key and unchanged arguments; stale commits, version,
selection, membership, or state digest fail closed. Never update these columns
with a SQLite command. Git object IDs must be full lowercase hexadecimal
values. If an operator discovers a provenance typo while the batch is still
evidence-free, inspect a fresh fence and issue a second retarget with the
current renderer commit, incremented version, new state digest, corrected
source commit, and a new idempotency key.

After one complete release build, create a pending review receipt:

```bash
python3 -m scripts.form_catalog_factory prepare-visual-review \
  --build-report tmp/catalog-release/build-report.json \
  --reviewer visual-reviewer-01 \
  --output tmp/catalog-release/visual-review-01.json
```

The reviewer must inspect the exact PDF hash named by every item, set
`reviewedAt`, mark the top-level receipt passing, mark each item approved, and
list every page number exactly once in `pagesReviewed`. Split receipts are
allowed for parallel review, but their catalog IDs must be disjoint and their
union must equal the complete build.

Reconcile only after every receipt is complete:

```bash
python3 -m scripts.form_catalog_factory reconcile-reviewed-release \
  --ledger tmp/form-catalog-factory/runtime/factory-v3.sqlite3 \
  --batch-id catalog-20260729-001 \
  --selection form_catalog_releases/planning/catalog-20260729-001-selection.json \
  --build-report tmp/catalog-release/build-report.json \
  --manifest tmp/catalog-release/release.json \
  --visual-review tmp/catalog-release/visual-review-01.json \
  --worker-id release-review-reconciler
```

The command validates the complete selection and every spec, PDF, thumbnail,
QA record, visual-review receipt, byte count, and hash before changing the
ledger. It first seals the batch to the exact source, selection, build report,
and release manifest, then claims each exact identity through the render, QA,
and review stages. Rerunning the same inputs is idempotent, including after an
expired crash lease is reaped and fenced. A partial receipt, duplicate
identity, changed byte, active claim, stale spec hash, or conflicting prior
artifact fails closed before new transitions begin.

Freeze the exact reconciled batch and persist its canonical ledger manifest:

```bash
python3 -m scripts.form_catalog_factory freeze-batch \
  --ledger tmp/form-catalog-factory/runtime/factory-v3.sqlite3 \
  --batch-id catalog-20260729-001 \
  --idempotency-key "freeze:catalog-20260729-001:<build-report-sha256>" \
  --output tmp/catalog-release/frozen-ledger-manifest.json
```

The command is idempotent for the same key, writes the stored manifest and
`frozenDigest`, and refuses to freeze a wrong-sized or incompletely evidenced
batch.

The orchestrator should treat `LeaseLostError` as a command to discard local
results, not as a retry of the same publish call. It should treat
`FreezeValidationError`, `BatchFrozenError`, and `ConflictError` as fail-closed
control-plane decisions requiring corrected inputs.

## Operational notes

- Keep the SQLite file on a local filesystem. WAL is not safe on every network
  filesystem.
- Back up the database for audit history, but rebuildability comes from tracked
  specifications and frozen manifests rather than from copying in-progress
  leases.
- SQLite serializes short write transactions. Expensive research, rendering,
  PDF inspection, and uploads must happen after `claim_next()` returns and
  before the fenced completion transaction.
- If workers later run on multiple machines, retain these state and fencing
  semantics while moving the ledger to a transactional distributed database.
