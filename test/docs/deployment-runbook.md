# Deployment Runbook

This runbook covers how DullyPDF is deployed, how GitHub Actions authenticates,
and how to verify a dev deploy before promoting anything further.

## Current Deploy Model

DullyPDF uses one explicit deploy workflow:

- `.github/workflows/controlled-deploy.yml`

Deploys do not happen on ordinary branch pushes. Normal pushes and pull requests
run Hybrid QA only. Deploys require either:

1. `workflow_dispatch`
2. a deploy tag push

`Hybrid QA` now uses a short `changes` job plus a single `qa` job. The `qa` job
runs the baseline gate first, then the targeted backend and real Playwright
selectors inside the same job so GitHub does not show padded skipped-job counts.

Supported deploy components:

- `frontend`
- `backend`
- `detectors`
- `workers`
- `all`

Supported deploy environments:

- `dev`
- `prod`

`backend_image` is allowed only for `backend` and `all`.

## Auth

GitHub-hosted deploys should authenticate with Workload Identity Federation
(WIF), not with long-lived service-account keys.

Configured WIF providers:

- dev: `projects/696001046696/locations/global/workloadIdentityPools/github-actions/providers/github`
- prod: `projects/916039292611/locations/global/workloadIdentityPools/github-actions/providers/github`

Configured service accounts:

- dev: `github-actions-dev@dullypdf-dev.iam.gserviceaccount.com`
- prod: `github-actions-prod@dullypdf.iam.gserviceaccount.com`

Required IAM bindings on those service accounts:

- `roles/iam.workloadIdentityUser` for the GitHub OIDC principal set
- `roles/iam.serviceAccountTokenCreator` granted to the service account itself

Required repo-level auth secrets:

- `GCP_WORKLOAD_IDENTITY_PROVIDER_DEV`
- `GCP_SERVICE_ACCOUNT_DEV`
- `GCP_WORKLOAD_IDENTITY_PROVIDER_PROD`
- `GCP_SERVICE_ACCOUNT_PROD`

Required environment-level deploy material:

- `development/BACKEND_ENV_FILE_B64_DEV`
- `development/FRONTEND_ENV_OVERRIDE_B64_DEV`
- `production/BACKEND_ENV_FILE_B64_PROD`
- `production/FRONTEND_ENV_OVERRIDE_B64_PROD`

Operational expectation:

- WIF is the normal auth path.
- If WIF is healthy, remove any leftover long-lived key secret such as `GCP_CREDENTIALS_JSON_DEV`.
- Deploy jobs should fail loudly if WIF or environment material is missing.
- Hybrid QA also exports `FIREBASE_SERVICE_ACCOUNT_ID` for seeded browser
  fixtures so Firebase Admin can mint custom tokens via IAM `signBlob` under
  WIF instead of trying metadata-server discovery.

## Trigger Examples

Manual dispatch is the cleanest option when you need an explicit target or a
custom backend image.

Tag examples:

```bash
git tag deploy-dev-frontend-20260403-1
git push origin deploy-dev-frontend-20260403-1
```

```bash
git tag deploy-dev-backend-20260403-1
git push origin deploy-dev-backend-20260403-1
```

```bash
git tag deploy-dev-all-20260403-1
git push origin deploy-dev-all-20260403-1
```

Dry-run examples:

```bash
git tag deploy-dev-all-dryrun-20260403-1
git push origin deploy-dev-all-dryrun-20260403-1
```

Manual dispatch inputs:

- `environment`
- `component`
- `backend_image`
- `dry_run`

## Verification Checklist

For a dev deploy, verify all of the following:

1. `Hybrid QA` passed on the same commit you intend to deploy.
2. `Controlled Deploy` completed successfully for the requested component.
3. `https://dullypdf-dev.web.app/` returns `200`.
4. `https://dullypdf-dev.web.app/api/health` returns `{"status":"ok"}` when backend was part of the deploy.
5. The hosted Playwright smoke passed for `frontend` or `all`.

Recommended additional local verification before merging risky runtime changes:

1. Start `npm run dev:stack`
2. Run the targeted backend selector:

```bash
RUN_TEMPLATE_API=true RUN_WORKSPACE=true RUN_SHARED_RUNTIME=true bash scripts/ci/run_targeted_backend_suites.sh
```

3. Run the targeted Playwright selector:

```bash
RUN_TEMPLATE_API=true RUN_WORKSPACE=true RUN_SHARED_RUNTIME=true RUN_PLAYWRIGHT_SAFE=true bash scripts/ci/run_targeted_playwright_suites.sh
```

## Important Real Browser Coverage

GitHub Hybrid QA uses only real Playwright flows. The rename+remap smoke uses a
smaller real consent PDF rather than the 211-field intake packet because the
smaller asset keeps synchronous OpenAI mapping within stable CI latency bounds
while still exercising the live rename and remap backend paths.

Current important GitHub Playwright flows:

- `npm run test:playwright:template-api:real`
- `npm run test:playwright:openai-rename`
- `npm run test:playwright:openai-rename-remap`
- `npm run test:playwright:saved-form-snapshot:real`
- `npm run test:playwright:fill-link-download:real`
- `npm run test:playwright:signing-envelope`

## History Cleanup Rule

When cleaning deploy history on `main`, only remove commits whose CI/CD runs
failed and have since been replaced by a green commit carrying the same intent.
Do not rewrite away commits that already have fully green QA and deploy history.

## Dev Cleanup

After repeated dev verification runs, clean only unused cloud artifacts:

- stale Artifact Registry images not referenced by active Cloud Run revisions
- stale dev-only Cloud Run revisions or services no longer used by deploy scripts
- temporary verification branches and tags

Do not delete active images or revisions that are still serving `dullypdf-dev`.
