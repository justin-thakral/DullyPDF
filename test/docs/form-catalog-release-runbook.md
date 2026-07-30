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
- snapshots validated bytes before upload and stages them with create-only
  behavior plus a provider-checked MD5;
- verifies the provider MD5, byte count, content type, cache policy, and release
  metadata after upload;
- records the exact source commit;
- updates the small active-release pointer with an object-generation
  precondition;
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
        "sourcePath": "construction_trades/dct-2700.pdf",
        "objectPath": "releases/catalog-20260729-001/assets/construction_trades/dct-2700.pdf",
        "contentType": "application/pdf",
        "sha256": "<64 lowercase hexadecimal characters>",
        "bytes": 77245
      },
      "thumbnail": {
        "sourcePath": "construction_trades/dct-2700.webp",
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
decision.

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

## Validate locally

```bash
python3 scripts/validate-form-catalog-release.py \
  --manifest tmp/catalog-release/release.json \
  --asset-root tmp/catalog-release
```

CI can consume the complete validated plan:

```bash
python3 scripts/validate-form-catalog-release.py \
  --manifest tmp/catalog-release/release.json \
  --asset-root tmp/catalog-release \
  --format json
```

## Stage immutable assets

The deployment wrapper is a dry run unless `--execute` is present.

```bash
bash scripts/deploy-form-catalog-release.sh \
  --action stage \
  --manifest tmp/catalog-release/release.json \
  --asset-root tmp/catalog-release \
  --bucket gs://dullypdf-form-catalog-assets-east4 \
  --project dullypdf \
  --expected-commit "$GITHUB_SHA"
```

Review the plan, then run the same command with `--execute`. Execution requires
`--expected-commit`, and it must match `sourceCommit`. The wrapper validates
once, copies every asset and the manifest into a private immutable snapshot,
then uploads only those snapshotted bytes. The stage command uploads the listed
assets plus:

`releases/<release-id>/release-manifest.json`

Existing objects and the active pointer remain unchanged.

## Frontend preview and production promotion

After staging, run the following gates in order:

1. Update `form_catalog_releases/active.json` from the reviewed release
   manifest. Each replacement identifies an existing `sourceSection/filename`
   and supplies its release-scoped PDF/thumbnail paths, SHA-256, byte count, and
   page count.
2. Merge the new mappings into the existing cumulative replacement array, then
   rebuild the catalog index. The build fails when a replacement target is
   missing or duplicated, or when either path is outside
   `releases/<release-id>/assets/`.
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
8. Run release-bound HTTP verification and exact browser canaries.
9. Only after all three evidence files validate, promote the operational release
   pointer.

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
and release ID; the report and manifest must also share the same source commit.

The production deploy must produce a Hosting receipt like this:

```json
{
  "schemaVersion": 1,
  "reportType": "form-catalog-hosting-deployment",
  "producer": "controlled-deploy",
  "environment": "production",
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
  "ok": true
}
```

The version IDs must come from the Hosting deployment/API response, not a label
chosen by the operator. Download the receipt from the exact controlled-deploy
run and preserve it as `tmp/catalog-release/hosting-evidence.json`:

```bash
gh run download <controlled-deploy-run-id> \
  --name "form-catalog-hosting-evidence-<release-id>-<run-id>-<attempt>" \
  --dir tmp/catalog-release
```

After that exact Hosting version is live, verify every sampled catalog page on
both public origins and verify the PDF and thumbnail bytes through the actual
direct immutable GCS origin:

```bash
python3 -m scripts.form_catalog_factory validate-live \
  --sample-plan tmp/catalog-release/live-samples.json \
  --site-origin https://dullypdf.com \
  --site-origin https://dullypdf.web.app \
  --asset-base-url https://storage.googleapis.com/dullypdf-form-catalog-assets-east4 \
  --hosting-version "sites/dullypdf/versions/<new-version-id>" \
  --output tmp/catalog-release/live-http-report.json
```

Do not use `https://dullypdf.com/form-catalog-assets` as an asset base. There is
no supported site-origin proxy for that path.

The HTTP gate requires exact SHA-256 and byte counts, PDF/WebP magic and content
types, one-year immutable cache headers, expected PDF page and field counts,
and an explicit catalog identity marker with the sampled source section,
filename, PDF URL, and hash. A generic HTTP 200 page does not pass. Exact hash
equality means the already approved local PDF QA applies to the live bytes
without rerunning all-page rendering on production.

The sample plan also chooses at most three browser canaries. Drive each through
a real browser using the repository Chrome/Playwright workflow:

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

- use `reportType: form-catalog-browser-canary` and `producer: playwright`;
- repeat the exact release ID, source commit, manifest SHA-256, sample-plan
  SHA-256, Hosting version, and one deployed site origin;
- contain results for exactly `browserCatalogIds`, in the same order;
- record successful `catalogIdentity`, `immutablePdfPath`, `fieldOverlays`, and
  `fillSaveReopen` checks for every canary;
- reference one catalog-page PNG, one populated-workspace PNG, and one filled
  PDF per canary with a relative path, byte count, and SHA-256.

Place `browser-canary-report.json` beside those artifacts so relative paths can
be verified. Promotion opens every artifact, checks its hash and byte count, and
checks PNG/PDF magic bytes. An operator-authored `ok: true` without those
machine artifacts does not pass.

Pointer promotion is also dry-run-first:

```bash
bash scripts/deploy-form-catalog-release.sh \
  --action promote \
  --manifest tmp/catalog-release/release.json \
  --asset-root tmp/catalog-release \
  --bucket gs://dullypdf-form-catalog-assets-east4 \
  --project dullypdf \
  --expected-commit "$GITHUB_SHA" \
  --hosting-evidence tmp/catalog-release/hosting-evidence.json \
  --live-report tmp/catalog-release/live-http-report.json \
  --browser-report mcp/debugging/mcp-screenshots/catalog-20260729-001/browser-canary-report.json
```

Add `--execute` after reviewing the plan. Promotion verifies all staged remote
metadata and all three evidence files, confirms the current pointer equals
`previousReleaseId`, then updates `catalog-release-state/active.json` using the
observed GCS object generation. The pointer records the exact manifest,
Hosting, HTTP-report, and browser-report hashes. Concurrent or out-of-order
promotions fail their precondition.

## Failure and rollback

If asset staging or preview verification fails, do not deploy the frontend.
Immutable staged objects can remain unreferenced for later diagnosis.

If HTTP or browser verification fails before pointer promotion:

1. restore the exact `rollbackHostingVersion` recorded in the controlled-deploy
   receipt;
2. rerun the prior release smoke;
3. leave the active pointer unchanged;
4. mark the attempted release failed in the release log.

If a later monitoring signal requires rollback after pointer promotion, restore
the exact recorded rollback Hosting version first. A follow-up rollback release
should then record the state transition rather than editing or deleting
immutable assets. Standard rollback must not depend on the bucket's soft-delete
window.

## Required release evidence

Retain the exact-commit CI result, frozen manifest and its SHA-256, provider MD5
verification, tracked activation diff, controlled-deploy Hosting receipt,
deterministic sample plan, live HTTP report, browser report plus hashed
artifacts, prior release ID, pointer generation, and final status. All evidence
must name the same release ID, source commit, manifest SHA-256, sample-plan
SHA-256 where applicable, and Hosting version, and its timestamps must follow
the deployment. The controlled deploy
lock is global and non-cancelling; a second release waits rather than replacing
an in-flight promotion.
