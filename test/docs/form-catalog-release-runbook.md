# Form Catalog Immutable Release Runbook

This runbook covers the release foundation for replacing DullyPDF-authored
catalog forms without overwriting long-cached production objects. It does not
change the existing frontend catalog index by itself.

## Safety model

Catalog PDF and thumbnail responses use a one-year immutable cache policy.
Every changed asset must therefore receive a new release-scoped object name.
The release tooling:

- validates local bytes against SHA-256 and byte counts;
- accepts at most 1,000 forms per release by default;
- requires PDF and WebP magic bytes;
- requires `catalogId` to equal
  `<sourceSection>/<filename-without-.pdf>` exactly;
- restricts destinations to `releases/<release-id>/assets/`;
- snapshots validated bytes before upload, stages them with bounded create-only
  SDK writes plus provider-checked MD5, and accepts a retry collision only when
  the existing object is an exact match;
- performs one paginated exact-prefix inventory instead of one subprocess per
  object, verifying the provider MD5, generation, byte count, content type,
  cache policy, and complete release metadata;
- atomically retains separate stage and promotion inventory reports with the
  expected and observed inventory digests;
- records and verifies the exact source, batch-base, and renderer commits;
- requires `rendererCommit` to equal `sourceCommit`, verifies the imported
  renderer/QA sources and tracked dependency pins from that same clean Git
  tree, and records the observed Python, Pillow, Poppler, and native-library
  runtime fingerprint;
- requires a canonically hashed frozen-ledger attestation whose exact item
  identities and PDF/thumbnail hashes equal the release manifest;
- updates the small active-release pointer with an object-generation
  precondition;
- serializes every production Hosting deploy and pointer promotion through one
  generation-bound GCS lock, then re-queries the exact Firebase live-channel
  release while holding that lock and requires at least five minutes of the
  exact remote lease at each final Hosting, rollback, or pointer mutation
  boundary;
- never removes unrelated bucket objects.

The active pointer is operational release state. The current frontend does not
read it at runtime. The tracked `form_catalog_releases/active.json` contract is
the build-time pointer: the catalog index applies its validated replacement
asset paths and immutable PDF metadata while retaining each existing
`sourceSection`, filename, slug, title, and category identity.

## Manifest format

Release manifests are generated artifacts tied to the exact commit that
produced the forms. Generate the manifest during exact-commit CI or stamp the
source commit before packaging; do not try to commit a manifest that claims its
own as-yet-unknown commit hash.

```json
{
  "schemaVersion": 1,
  "releaseId": "catalog-20260729-001",
  "sourceCommit": "0123456789abcdef0123456789abcdef01234567",
  "baseCommit": "0123456789abcdef0123456789abcdef01234567",
  "rendererCommit": "0123456789abcdef0123456789abcdef01234567",
  "rendererRuntime": {
    "schemaVersion": 1,
    "requirementsPath": "backend/requirements.txt",
    "requirementsSha256": "<SHA-256>",
    "pythonImplementation": "CPython",
    "pythonVersion": "<version>",
    "pythonExecutable": "<basename>",
    "pythonExecutableSha256": "<SHA-256>",
    "packages": {
      "pillow": "<exact tracked version>",
      "pypdf": "<exact tracked version>",
      "reportlab": "<exact tracked version>"
    },
    "pdftoppmExecutable": "pdftoppm",
    "pdftoppmExecutableSha256": "<SHA-256>",
    "pdftoppmVersion": "<observed version>",
    "pillowLibraries": {
      "webp": {"available": true, "version": "<observed version>"},
      "zlib": {"available": true, "version": "<observed version>"}
    }
  },
  "previousReleaseId": "catalog-20260728-004",
  "createdAt": "2026-07-29T16:30:00Z",
  "forms": [
    {
      "catalogId": "construction_trades/dct_2700__contractor_payment",
      "slug": "contractor-payment-application",
      "sourceSection": "construction_trades",
      "filename": "dct_2700__contractor_payment.pdf",
      "pageCount": 2,
      "pdf": {
        "sourcePath": "assets/construction_trades/dct-2700.pdf",
        "objectPath": "releases/catalog-20260729-001/assets/construction_trades/dct-2700.pdf",
        "contentType": "application/pdf",
        "sha256": "<64 lowercase hexadecimal characters>",
        "bytes": 77245
      },
      "thumbnail": {
        "sourcePath": "assets/construction_trades/dct-2700.webp",
        "objectPath": "releases/catalog-20260729-001/assets/construction_trades/dct-2700.webp",
        "contentType": "image/webp",
        "sha256": "<64 lowercase hexadecimal characters>",
        "bytes": 28410
      }
    }
  ]
}
```

`catalogId` is derived from the exact source identity and `slug` is the stable
published URL identity. A replacement keeps both. A form whose intent changes
materially should be published as a new catalog entry with an explicit redirect
decision. The tracked catalog title remains the public SEO title. The internal
PDF title may expand that wording to describe the workflow more precisely; it
is not part of the stable replacement identity.

### Tracked active-release contract

The reviewed release is activated for frontend builds through
`form_catalog_releases/active.json`:

```json
{
  "schemaVersion": 1,
  "releaseId": "catalog-20260729-001",
  "sourceCommit": "0123456789abcdef0123456789abcdef01234567",
  "manifestSha256": "<SHA-256 of the exact release.json bytes>",
  "previousReleaseId": "catalog-20260728-004",
  "activatedAt": "2026-07-29T18:00:00Z",
  "replacements": [
    {
      "sourceSection": "construction_trades",
      "filename": "dct_2700__contractor_payment.pdf",
      "pdfPath": "releases/catalog-20260729-001/assets/construction_trades/dct-2700.pdf",
      "thumbnailPath": "releases/catalog-20260729-001/assets/construction_trades/dct-2700.webp",
      "sha256": "<64 lowercase hexadecimal characters>",
      "bytes": 77245,
      "pageCount": 2
    }
  ]
}
```

The initial tracked contract has null release metadata and an empty replacement
array. Release manifests are limited to 1,000 newly staged forms, while the
tracked contract is cumulative so earlier replacements remain active across
later trains. Every mapping may point at the immutable release that introduced
that replacement. Index generation rejects unknown or ambiguous source targets,
duplicate mappings or asset paths, mixed PDF/thumbnail release IDs, and any
asset path outside `releases/<release-id>/assets/`.

## Bind build and visual-review evidence

Build the entire tracked selection from one exact source commit. Do not merge
per-worker PDFs: workers author and review specs in isolated lanes, while the
release builder rerenders the final tracked set with the pinned deterministic
renderer.

If the open batch was created before the specifications and release tooling
were committed, its provisional renderer commit can differ from the final
source commit. Do not edit the SQLite ledger directly. After all members are
registered at `spec_ready`, commit and push the exact source, wait for its CI
gate, and inspect the read-only retarget fence:

```bash
python3 -m scripts.form_catalog_factory inspect-open-batch-retarget \
  --ledger tmp/form-catalog-factory/runtime/factory-v3.sqlite3 \
  --selection form_catalog_releases/planning/catalog-20260729-001-selection.json
```

The inspection must report `eligible: true`, the exact target count at
`spec_ready`, and no blockers. Copy its expected commits, selection digest,
batch version, and complete-state digest into the one fenced mutation:

```bash
python3 -m scripts.form_catalog_factory retarget-open-batch-source \
  --ledger tmp/form-catalog-factory/runtime/factory-v3.sqlite3 \
  --selection form_catalog_releases/planning/catalog-20260729-001-selection.json \
  --batch-id catalog-20260729-001 \
  --expected-selection-digest "<selection_digest>" \
  --expected-base-commit "<base_commit>" \
  --expected-renderer-commit "<renderer_commit>" \
  --expected-batch-version "<batch_version>" \
  --expected-state-digest "<state_digest>" \
  --new-source-commit "$GITHUB_SHA" \
  --actor release-controller \
  --idempotency-key "retarget:catalog-20260729-001:$GITHUB_SHA"
```

The operation preserves the inspected base commit, requires the new source to
equal clean Git `HEAD`, requires the selection bytes to be tracked there, and
verifies that the base remains its ancestor. In one transaction it rechecks
exact membership, old commits, batch version, and full state digest; rejects
leases or any rendered, QA, review, release, or frozen evidence; changes only
the open batch renderer provenance; increments its version; and records an
audit event. The batch `source_commit` remains unbound until reviewed-release
reconciliation proves the exact final build. An identical retry returns the
stored result, while any stale expected value or non-lowercase Git object ID
fails closed. A provenance typo can be corrected only while the batch remains
evidence-free: inspect a new fence and retarget from the now-current renderer
commit with a new idempotency key.

```bash
python3 -m scripts.form_catalog_factory build-release \
  --selection form_catalog_releases/planning/catalog-20260729-001-selection.json \
  --spec-root form_catalog_specs/candidates \
  --output-root tmp/catalog-release \
  --source-commit "$GITHUB_SHA" \
  --base-commit "$BATCH_BASE_COMMIT" \
  --renderer-commit "$RENDERER_COMMIT" \
  --workers 8
```

The command fails unless `sourceCommit` is the current exact Git `HEAD`,
`rendererCommit` equals it, the tracked worktree is clean, the base commit is
an ancestor, and the selection, selected specifications, imported renderer/QA
modules, and `backend/requirements.txt` are tracked at those exact bytes. Run
the build in an environment whose Pillow, pypdf, and ReportLab versions exactly
match the tracked pins. The report and manifest record the observed Python
binary hash, package versions, `pdftoppm` binary hash/version, and Pillow native
library versions.

This is source-pinned, runtime-observed reproducibility, not a cross-machine
hermetic-build claim. The gate proves deterministic rerendering within the
recorded environment and publishes only the exact reviewed PDF bytes. A future
containerized toolchain can strengthen cross-machine reproduction without
changing the exact-byte release rule.

Create one or more pending receipts from that exact build report:

```bash
python3 -m scripts.form_catalog_factory prepare-visual-review \
  --build-report tmp/catalog-release/build-report.json \
  --reviewer visual-reviewer-01 \
  --output tmp/catalog-release/visual-review-01.json
```

Every receipt is bound to the raw build-report SHA-256. For each assigned form,
the reviewer must inspect the exact `pdfSha256` at readable resolution, list
all pages in order under `pagesReviewed`, record no unresolved defects, and set
the item to `approved`. A passing receipt also requires a timezone-qualified
`reviewedAt`. Parallel receipts must be disjoint and together cover the exact
1,000-form build.

Only then advance the fenced ledger:

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

Repeat `--visual-review` for split review receipts. The command first verifies
the entire selection; clean source/base/renderer provenance; source/spec/schema
hashes; the exact release-manifest hash; PDF, thumbnail, and automated QA bytes;
object paths; page counts; field counts; and page-review coverage.
It performs no transitions unless every input is valid. Successful render, QA,
and review completions store both evidence paths and hashes in the ledger, and
the immutable batch freeze binds those hashes into its canonical manifest.

Freeze only after reconciliation reports the full target count at
`review_approved`. Use a stable idempotency key derived from the reviewed build
so an interrupted retry cannot create a second operation:

```bash
python3 -m scripts.form_catalog_factory freeze-batch \
  --ledger tmp/form-catalog-factory/runtime/factory-v3.sqlite3 \
  --batch-id catalog-20260729-001 \
  --idempotency-key "freeze:catalog-20260729-001:<build-report-sha256>" \
  --output tmp/catalog-release/frozen-ledger-manifest.json
```

The output contains the ledger's canonical manifest and `frozenDigest`; retain
it with the release evidence. The command fails closed unless exactly 1,000
first-party items are approved and every artifact, QA, and visual-review hash
and URI is present.

## Validate locally

```bash
python3 scripts/validate-form-catalog-release.py \
  --manifest tmp/catalog-release/release.json \
  --asset-root tmp/catalog-release \
  --frozen-ledger-manifest tmp/catalog-release/frozen-ledger-manifest.json
```

CI can consume the complete validated plan:

```bash
python3 scripts/validate-form-catalog-release.py \
  --manifest tmp/catalog-release/release.json \
  --asset-root tmp/catalog-release \
  --frozen-ledger-manifest tmp/catalog-release/frozen-ledger-manifest.json \
  --format json
```

## Stage immutable assets

The deployment wrapper is a dry run unless `--execute` is present.

```bash
bash scripts/deploy-form-catalog-release.sh \
  --action stage \
  --manifest tmp/catalog-release/release.json \
  --frozen-ledger-manifest tmp/catalog-release/frozen-ledger-manifest.json \
  --asset-root tmp/catalog-release \
  --bucket gs://dullypdf-form-catalog-assets-east4 \
  --project dullypdf \
  --expected-commit "$GITHUB_SHA" \
  --inventory-report tmp/catalog-release/stage-gcs-inventory.json
```

Review the plan, then run the same command with `--execute`. Execution requires
`--expected-commit` and `--inventory-report`; the expected commit must match
`sourceCommit`. A dry run never initializes a cloud client or writes the report.
The wrapper validates once, validates and snapshots the frozen ledger
attestation, copies every asset and the manifest into a private immutable
snapshot, then uploads only those snapshotted bytes. It uses the exact
`google-cloud-storage==3.9.0` pin from `backend/requirements.txt`, one
long-lived client, at most 12 create-only uploads in flight, and one paginated
exact-prefix inventory. Set `FORM_CATALOG_PYTHON_BIN` only when the pinned
interpreter is somewhere other than `backend/.venv/bin/python`. The stage
command uploads the listed assets plus both immutable package attestations:

`releases/<release-id>/release-manifest.json`

`releases/<release-id>/frozen-ledger-manifest.json`

For a 1,000-form train, the exact inventory is 2,002 objects: one PDF and one
thumbnail per form plus the two attestations. `--gcs-workers`, `--gcs-page-size`,
and `--gcs-timeout-seconds` may tune the bounded operation within the enforced
limits. The SDK uses Application Default Credentials, so configure WIF,
`GOOGLE_APPLICATION_CREDENTIALS`, or `gcloud auth application-default login`;
an active `gcloud` CLI account alone is not ADC. Existing objects and the active
pointer remain unchanged.

## Frontend preview and production promotion

After staging, run the following gates in order:

1. Generate the cumulative `form_catalog_releases/active.json` from the reviewed
   manifest and current active contract. Each replacement identifies an
   existing `sourceSection/filename` and supplies its release-scoped
   PDF/thumbnail paths, SHA-256, byte count, and page count.
2. Rebuild and commit the generated catalog index with the active contract.
   After the commit, produce an exact mapping report. The verifier compares the
   raw committed bytes, requires the generated `releases/*` mappings to equal
   the cumulative active contract, rejects any uncontracted release asset, and
   requires the current release's manifest forms to equal the current
   release-namespace subset.
3. Run static HTML, sitemap, slug, canonical, robots, preview, and catalog
   handoff checks. The catalog HTML must contain the server-rendered identity
   marker emitted by `FormCatalogFormPage`.
4. Build once and deploy that exact artifact to a preview target. Do not rebuild
   between preview and production.
5. Verify every changed form and representative editor fill round trips in
   preview.
6. Record the currently serving Firebase Hosting version as the rollback
   version, then deploy the exact approved artifact under the global
   non-cancelling controlled-deploy lock.
7. Download the `form-catalog-hosting-evidence-*` artifact emitted by the
   successful controlled deploy. The workflow captures the rollback version
   before deployment, parses the exact version returned by
   `firebase --json deploy`, confirms that version is serving on the live
   channel, and binds the receipt to the tracked release and manifest hash.
8. Run the checked-in post-live finalizer. It holds the same production lock
   continuously across exact Hosting-state verification, HTTP sampling, real
   browser canaries, and the pointer compare-and-swap.
9. The finalizer promotes only after every gate passes. A pre-CAS gate failure
   automatically creates a new Firebase live release serving the receipt's
   recorded rollback version, verifies that rollback, proves the catalog
   pointer stayed unchanged, and writes a machine rollback receipt.

Prepare and commit the tracked build inputs:

```bash
python3 -m scripts.form_catalog_factory prepare-activation \
  --manifest tmp/catalog-release/release.json \
  --current-active form_catalog_releases/active.json \
  --activated-at "<timezone-qualified activation timestamp>" \
  --output form_catalog_releases/active.json

node scripts/build-form-catalog-index.mjs
git add form_catalog_releases/active.json frontend/src/config/formCatalogData.mjs
git commit

python3 -m scripts.form_catalog_factory verify-active-mapping \
  --active-release form_catalog_releases/active.json \
  --form-catalog-data frontend/src/config/formCatalogData.mjs \
  --manifest tmp/catalog-release/release.json \
  --repo-root . \
  --output tmp/catalog-release/form-catalog-active-mapping.json
```

Do not hand-edit the generated module or introduce a `releases/*` URL outside
the active contract. Production controlled deploy repeats this verification
from Git `HEAD`, downloads the exact immutable
`releases/<release-id>/release-manifest.json`, and repeats the same report
immediately before the Vite build. The Hosting evidence hashes the raw active
contract, generated module, immutable manifest, and mapping report and binds
their mapping digests and Git commit to the deployed commit.

Create the reproducible sample from the exact selection, build report, and
manifest. Ten random identities are combined with worst-case canaries for
largest page count, largest and smallest field count, alphabetical boundaries,
and present B/C risk tiers:

```bash
python3 -m scripts.form_catalog_factory plan-samples \
  --selection form_catalog_releases/planning/catalog-20260729-001-selection.json \
  --build-report tmp/catalog-release/build-report.json \
  --manifest tmp/catalog-release/release.json \
  --random-count 10 \
  --output tmp/catalog-release/live-samples.json
```

The sample plan records the raw release-manifest SHA-256 and source commit.
Selection, build report, and manifest must have exactly the same catalog IDs
and release ID; the report must bind the exact selection and release-manifest
hashes, and every PDF/thumbnail mapping, page count, and commit field must match
the manifest exactly.

The production deploy must produce a Hosting receipt like this:

```json
{
  "schemaVersion": 1,
  "reportType": "form-catalog-hosting-deployment",
  "producer": "controlled-deploy",
  "environment": "production",
  "projectId": "dullypdf",
  "site": "dullypdf",
  "releaseId": "catalog-20260729-001",
  "sourceCommit": "0123456789abcdef0123456789abcdef01234567",
  "manifestSha256": "<SHA-256 of the exact release.json bytes>",
  "hostingVersion": "sites/dullypdf/versions/<new-version-id>",
  "rollbackHostingVersion": "sites/dullypdf/versions/<previous-version-id>",
  "siteOrigins": [
    "https://dullypdf.com",
    "https://dullypdf.web.app"
  ],
  "deployedAt": "2026-07-29T18:00:00Z",
  "deploymentCommit": "<exact controlled-deploy commit>",
  "workflowRunId": "<GitHub Actions run ID>",
  "workflowRunAttempt": "<GitHub Actions run attempt>",
  "hostingReleaseName": "<exact Firebase live-channel release resource>",
  "ok": true
}
```

The version IDs must come from the Hosting deployment/API response, not a label
chosen by the operator. Download the receipt from the exact controlled-deploy
run and preserve it as
`tmp/catalog-release/form-catalog-hosting-evidence.json`:

```bash
gh run download <controlled-deploy-run-id> \
  --name "form-catalog-hosting-evidence-<release-id>-<run-id>-<attempt>" \
  --dir tmp/catalog-release
```

The artifact includes the pre-deploy snapshot, raw Firebase deploy result,
active-mapping report, raw deployed active contract and generated catalog
module, immutable release manifest, and Hosting receipt. Hosting evidence is
created immediately after Firebase returns the exact live version, before the
workflow's hosted smoke. If that smoke or any later workflow step fails, the
workflow attempts the same lock-verified rollback before releasing the
production lock. It refuses mutation when the original Firebase result cannot
prove which version this run deployed.

Run the post-live controller first without `--execute`, then repeat the exact
command with `--execute`:

```bash
SOURCE_COMMIT="$(jq -r .sourceCommit tmp/catalog-release/release.json)"
DEPLOYMENT_COMMIT="$(jq -r .deploymentCommit tmp/catalog-release/form-catalog-hosting-evidence.json)"

bash scripts/finalize-form-catalog-release.sh \
  --manifest tmp/catalog-release/release.json \
  --frozen-ledger-manifest tmp/catalog-release/frozen-ledger-manifest.json \
  --asset-root tmp/catalog-release \
  --hosting-evidence tmp/catalog-release/form-catalog-hosting-evidence.json \
  --active-mapping-evidence tmp/catalog-release/form-catalog-active-mapping.json \
  --active-release-contract tmp/catalog-release/form-catalog-active.json \
  --form-catalog-data tmp/catalog-release/form-catalog-data.mjs \
  --sample-plan tmp/catalog-release/live-samples.json \
  --selection form_catalog_releases/planning/catalog-20260729-001-selection.json \
  --build-report tmp/catalog-release/build-report.json \
  --live-report tmp/catalog-release/live-http-report.json \
  --browser-output-dir mcp/debugging/mcp-screenshots/catalog-20260729-001 \
  --rollback-receipt tmp/catalog-release/form-catalog-hosting-rollback.json \
  --expected-commit "$SOURCE_COMMIT" \
  --expected-deployment-commit "$DEPLOYMENT_COMMIT" \
  --expected-workflow-run-id "<controlled-deploy run ID>" \
  --expected-workflow-run-attempt "<controlled-deploy run attempt>"
```

Execution is pinned to the production project, Hosting site, bucket, public
origins, direct asset origin, and active-pointer object. It acquires the shared
production lock, rechecks the exact pointer and Hosting release, then runs HTTP
and browser gates and promotion without releasing the lock. The wrapper
snapshots all small control inputs before the long-running gate so another
authoring terminal cannot replace the rollback target or evidence mid-run.
The build-report snapshot stays beside the original report because its QA paths
are relative to that directory. Promotion reopens every QA and visual-review
file and requires its bytes to match the frozen ledger attestation.
The mapping verifier reads the canonical active/index paths from the recorded
Hosting `deploymentCommit`, not mutable current `HEAD`, so a later unrelated
commit in another terminal cannot invalidate the exact deployed bytes. Always
pass the raw active/index copies downloaded from the controlled-deploy artifact.

Production execution requires
`DULLYPDF_E2E_EMAIL`/`DULLYPDF_E2E_PASSWORD`, or the existing
`SMOKE_LOGIN_EMAIL`/`SMOKE_LOGIN_PASSWORD` aliases, in the invoking environment.
The canary account must have one generated-PDF download remaining for each
planned browser identity. Add `--execute` only after the dry-run bindings pass.

The controller's HTTP phase verifies every sampled catalog page on both public
origins and verifies PDF and thumbnail bytes through the direct immutable GCS
origin,
`https://storage.googleapis.com/dullypdf-form-catalog-assets-east4`. Its
internal `validate-live --hosting-version <exact receipt version>` binding
prevents a report for one Hosting release from authorizing another.

Do not use `https://dullypdf.com/form-catalog-assets` as an asset base. There is
no supported site-origin proxy for that path.

The HTTP gate requires exact SHA-256 and byte counts, PDF/WebP magic and content
types, one-year immutable cache headers, expected PDF page and field counts,
and an explicit catalog identity marker with the sampled source section,
filename, PDF URL, and hash. A generic HTTP 200 page does not pass. Exact hash
equality means the already approved local PDF QA applies to the live bytes
without rerunning all-page rendering on production.

The sample plan also chooses at most three browser canaries. The controller
invokes the checked-in Playwright producer with the exact source commit,
manifest hash, sample-plan hash, Hosting-evidence bytes, and Hosting version.
Never place credentials in a report or command log. Missing authentication and
exhausted download quota are reported as different failures.

Immediately before the fresh Hosting check and pointer compare-and-swap, the
controller re-lists the complete release prefix while holding the shared
production lock. It writes the exact promotion inventory to
`<browser-output-dir>/promotion-gcs-inventory.json`; the report is retained
beside the browser report and hashed artifacts. Promotion therefore requires
both SDK ADC for immutable-object inventory and the pinned `gcloud` production
identity for lock, Hosting, and pointer operations.

The producer uses `@playwright/test` Chromium and, for exactly the ordered
`browserCatalogIds`:

1. open `/forms/<slug>` and confirm title, page count, thumbnail, and
   high-resolution preview;
2. activate the primary fillable-form button and confirm the workspace loads
   the same catalog identity without an error banner;
3. verify field overlays appear, enter representative text and checkbox values,
   download the result, and reopen it to confirm the values persist;
4. capture the catalog page and populated workspace, and preserve the reopened
   filled PDF, under `mcp/debugging/mcp-screenshots/<release-id>/`.

Use one largest-field canary, one highest-risk canary when present, and one
seeded-random canary. A browser failure blocks pointer promotion even when the
HTTP sample passes. The browser report must:

- use `reportType: form-catalog-browser-canary`, `producer: playwright`, and
  `producerVersion: form-catalog-browser-canary-v1`;
- repeat the exact release ID, source commit, manifest SHA-256, sample-plan
  SHA-256, raw Hosting-evidence SHA-256, Hosting version, deployment timestamp,
  direct immutable asset origin, and one deployed site origin;
- contain results for exactly `browserCatalogIds`, in the same order;
- record successful `catalogIdentity`, `immutablePdfPath`, `fieldOverlays`, and
  `fillSaveReopen` checks for every canary;
- record concrete catalog identity attributes, preview dimensions, immutable
  workspace source response, field and overlay counts, exact text and checkbox
  inputs, editable-download identity, fresh-workspace reopen values, and an
  independent `pypdf` reopen;
- reference one catalog-page PNG, one populated-workspace PNG, and one filled
  PDF per canary with a relative path, byte count, and SHA-256.

Place `browser-canary-report.json` beside those artifacts so relative paths can
be verified. The producer writes the passing report only after the entire
ordered run succeeds. Promotion opens every artifact, checks its hash and byte
count, checks decodable PNG dimensions and PDF magic bytes, and independently
reopens the filled PDF to verify the recorded text and checkbox values. A
hand-authored `ok: true` report or a report without the machine observations
does not pass.

Run the producer's non-browser binding and artifact tests with:

```bash
npm run test:playwright:form-catalog-canary:unit
python3 -m pytest -q scripts/form_catalog_factory/tests/test_browser_pdf_probe.py
```

The finalizer performs pointer promotion; do not run a separate promotion
command. It verifies all staged remote metadata and evidence files, recomputes
the exact ten-random plus required-canary sample, and checks controlled-deploy
commit/run provenance. The internal promotion receives the verified browser
artifact through `--browser-report`; a missing or hand-authored boolean report
cannot authorize the pointer. Immediately before the generation-guarded pointer
compare-and-swap it re-queries Firebase Hosting and requires the version,
release name, and release time to equal the snapshotted receipt. The pointer
records the Hosting identity, raw mapping hashes and digests, release/frozen
attestations, sample/HTTP/browser report hashes, workflow provenance, and lock
owner/generation. An exact retry after a successful CAS is idempotent.

The lock owner, generation, creation time, and expiry are recorded in the lock
object. Release requires the exact owner and generation. Acquisition waits for
a bounded interval; an expired lock can be removed only after reading its owner
and expiry and using a generation-match delete. The lease is longer than the
controlled workflow timeout, so an active deployment cannot be treated as
stale. If lock cleanup fails after a verified pointer CAS, the command reports
the cleanup warning explicitly; retry is safe and the expired generation can be
reclaimed.

## Failure and rollback

If asset staging or preview verification fails, do not deploy the frontend.
Immutable staged objects can remain unreferenced for later diagnosis.

If HTTP, browser, or promotion validation fails before the pointer CAS, the
armed finalizer verifies the shared lock, old/absent pointer, exact failed
Hosting version, and recorded rollback version. It then uses Firebase's official
same-site release endpoint to create a new live release serving the recorded
rollback version, confirms that live identity, rechecks the unchanged pointer,
and writes `form-catalog-hosting-rollback.json`. Unexpected nonzero exits and
trappable `HUP`, `INT`, and `TERM` signals use the same guarded path. `SIGKILL`
cannot be trapped. A killed process can leave its two-hour lease in place, so a
new finalizer may wait rather than recover immediately. Let `acquire` perform
its generation-safe stale takeover after `expiresAt`; do not delete the lock
object blindly. If urgent operator repair is required, first classify the exact
live Hosting release and operational pointer, then use the retained lock state
and owner with `form-catalog-production-lock.sh --action verify|release`.
Release still requires the recorded owner and exact object generation.

The controller never rolls back when the operational pointer already names the
target release, when Hosting moved to an unrelated version, when the lock
identity is stale, or when the original Firebase result cannot prove the failed
version. Those cases are reported for operator intervention without a fallback
mutation. After verified rollback the pointer remains unchanged; mark the
attempted release failed in the release log and rerun the prior release smoke.

If a later monitoring signal requires rollback after pointer promotion, restore
the exact recorded rollback Hosting version first. A follow-up rollback release
should then record the state transition rather than editing or deleting
immutable assets. Standard rollback must not depend on the bucket's soft-delete
window.

## Required release evidence

Retain the exact-commit CI result, frozen manifest and its SHA-256, stage and
promotion GCS inventory reports, provider MD5 verification, tracked activation
diff, controlled-deploy Hosting receipt, deterministic sample plan, live HTTP
report, browser report plus hashed artifacts, prior release ID, pointer
generation, and final status. All evidence must name the same release ID,
source commit, manifest SHA-256, sample-plan SHA-256 where applicable, and
Hosting version, and its timestamps must follow the deployment. The controlled deploy
lock is global and non-cancelling; a second release waits rather than replacing
an in-flight promotion.
