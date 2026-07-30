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

Typical ownership is:

- specification completion records `spec_hash`;
- render completion records the PDF, thumbnail, and field-schema hashes plus
  content-addressed candidate URIs;
- QA completion records `qa_evidence_uri`.

The ledger reserves unique `(section, filename)`, public slug, and optional
intent fingerprint values. These constraints prevent exact identity
collisions. Semantic duplicate detection still belongs in the selector and
review workflow before approval.

## Batch assignment and immutable freeze

Create a batch with `create_batch()`, including its pinned Git base commit,
renderer commit, and exact target count. `assign_to_batch()` only accepts items
whose ownership is `first_party`; official and public-source forms fail closed.
An item cannot belong to two batches, and assignment cannot exceed the target.

`freeze_batch()` succeeds only when:

- assigned item count exactly equals `target_count`;
- every item is `review_approved`;
- every item is first-party;
- all required candidate hashes, URIs, and QA evidence are present.

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
  --ledger tmp/form-catalog-factory/runtime/factory.sqlite3 \
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
  --ledger tmp/form-catalog-factory/runtime/factory.sqlite3 \
  --claim tmp/form-catalog-factory/runtime/claims/author-03-0001.json \
  --lease-seconds 3600
```

Completion verifies the exact claimed identity, runs content QA with zero
warnings, hashes the specification, and advances only through the ledger:

```bash
python3 -m scripts.form_catalog_factory complete-spec \
  --ledger tmp/form-catalog-factory/runtime/factory.sqlite3 \
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
  --ledger tmp/form-catalog-factory/runtime/factory.sqlite3 \
  --batch-id catalog-20260729-001 \
  --worker-id bootstrap-review \
  --claim-root tmp/form-catalog-factory/runtime/bootstrap-claims
```

This runs peer content QA first, claims each exact identity, and records its
hash. A matching `spec_ready` item is an idempotent no-op; any other stage or
hash conflict fails closed.

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
