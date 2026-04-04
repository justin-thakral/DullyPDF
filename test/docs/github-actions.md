# GitHub QA And Deploy Workflows

This repo uses two GitHub Actions workflows for code changes and deploy control:

- `.github/workflows/hybrid-qa.yml`
- `.github/workflows/controlled-deploy.yml`

For operator-facing deploy steps, auth setup, and post-deploy verification, see
also:

- `test/docs/deployment-runbook.md`

## Hybrid QA

`hybrid-qa.yml` runs on every branch push, every pull request, and manual dispatch.
It now has two top-level jobs:

- `changes`
- `qa`

It follows a hybrid model:

- Always run the baseline gate:
  - `npm run test`
  - `cd frontend && npm run lint`
  - `npm run frontend:build:prod`
- Add targeted backend integration suites when changed files touch higher-risk areas.
- Add only real Playwright flows in GitHub Actions. The workflow avoids harnessed or mocked browser scripts and prefers seeded end-to-end flows that exercise the live frontend and backend.
- Keep the workflow summary honest. `changes` resolves the affected areas once, then `qa` runs baseline, targeted backend, and targeted real Playwright suites in sequence inside a single job. That avoids the earlier `2/4` style summary where downstream jobs were present only to be skipped.

Current real Playwright flows used by GitHub Actions:

- `npm run test:playwright:template-api:real`
- `npm run test:playwright:openai-rename`
- `npm run test:playwright:openai-rename-remap`
- `npm run test:playwright:saved-form-snapshot:real`
- `npm run test:playwright:fill-link-download:real`
- `npm run test:playwright:signing-envelope`

Several Playwright scripts still exist as local harness coverage for mocked UI scenarios. They are not part of the GitHub deploy gate until equivalent real end-to-end flows exist.

There is also a real downgrade-retention Playwright script on disk, but it currently exposes a billing/profile retention regression in the app, so it is not part of the always-on GitHub gate yet.

The `qa` job authenticates to the dev GCP project because the seeded real flows create Firebase users, pull Admin credentials from Secret Manager, and exercise the live backend. The job now starts both the backend and frontend locally before running browser suites.

The targeted routing is intentionally conservative around shared runtime files such as:

- `backend/api/middleware/**`
- `backend/firebaseDB/firebase_service.py`
- `backend/sessions/**`
- `frontend/src/services/api.ts`
- `.github/workflows/**`
- `scripts/ci/**`

If any of those change, the workflow widens the targeted test set instead of trying to be too clever.

## Local Dev Stack

`scripts/run-dev-stack.sh` now refreshes the OpenAI rename/remap worker URL and audience from the live Cloud Run service when the tracked stack env file is blank or stale.

That matters because local `npm run dev:stack` uses the real async worker path for rename and Rename + Map. If the stored worker URL drifts from the current Cloud Run URL, Cloud Tasks can mint an auth token with the wrong audience and the worker will reject the request.

The stack therefore prefers:

- `env/backend.dev.stack.env` for local defaults
- the live `dullypdf-openai-rename-remap` Cloud Run URL for the task audience when needed

This keeps local real Playwright flows aligned with the deployed dev worker.

## Controlled Deploys

`controlled-deploy.yml` is opt-in.

It supports two deploy entry paths:

1. `workflow_dispatch`
2. tag push

Tag naming controls only the deploy environment and component. Use manual dispatch when you need to set a custom backend image.

Supported tag format:

- `deploy-dev-frontend-<suffix>`
- `deploy-dev-backend-<suffix>`
- `deploy-dev-detectors-<suffix>`
- `deploy-dev-workers-<suffix>`
- `deploy-dev-all-<suffix>`
- `deploy-prod-frontend-<suffix>`
- `deploy-prod-backend-<suffix>`
- `deploy-prod-detectors-<suffix>`
- `deploy-prod-workers-<suffix>`
- `deploy-prod-all-<suffix>`

Optional dry-run tag variant:

- `deploy-dev-frontend-dryrun-<suffix>`
- `deploy-dev-backend-dryrun-<suffix>`
- `deploy-dev-detectors-dryrun-<suffix>`
- `deploy-dev-workers-dryrun-<suffix>`
- `deploy-dev-all-dryrun-<suffix>`
- `deploy-prod-frontend-dryrun-<suffix>`
- `deploy-prod-backend-dryrun-<suffix>`
- `deploy-prod-detectors-dryrun-<suffix>`
- `deploy-prod-workers-dryrun-<suffix>`
- `deploy-prod-all-dryrun-<suffix>`

Examples:

```bash
git tag deploy-dev-frontend-20260403-1
git push origin deploy-dev-frontend-20260403-1
```

```bash
git tag deploy-dev-frontend-dryrun-20260403-1
git push origin deploy-dev-frontend-dryrun-20260403-1
```

```bash
git tag deploy-prod-all-20260403-1
git push origin deploy-prod-all-20260403-1
```

## Dry Run

The deploy workflow supports `dry_run=true` on manual dispatch.

Dry run validates:

- tag or input parsing
- component routing
- backend image routing
- deploy command construction

Dry run skips:

- Google Cloud authentication
- secret decoding
- actual deploy execution
- deployed-site Playwright smoke

Use this first when you are changing workflow logic.

After non-dry frontend or `all` deploys, `controlled-deploy.yml` runs `npm run test:playwright:deployed-frontend:real` against the hosted site. The smoke covers homepage rendering, anonymous workspace entry, and the prerendered `/fill-pdf-from-csv` route. Public `/api/health` is checked only when the deploy also included backend via `component=all`.

The deploy workflow also avoids noisy skipped steps. Package install, env materialization, frontend smoke setup, and deploy verification steps now no-op internally when they are not relevant to the chosen component instead of disappearing behind step-level gates.

## Required GitHub Secrets

GitHub-hosted deploy jobs need auth and environment material that is not committed to the repo.

Preferred auth path: Workload Identity Federation. This is now the intended default for both dev and prod.

- `GCP_WORKLOAD_IDENTITY_PROVIDER_DEV`
- `GCP_SERVICE_ACCOUNT_DEV`
- `GCP_WORKLOAD_IDENTITY_PROVIDER_PROD`
- `GCP_SERVICE_ACCOUNT_PROD`

Legacy fallback auth path: long-lived service-account key JSON

- `GCP_CREDENTIALS_JSON_DEV`
- `GCP_CREDENTIALS_JSON_PROD`

The operational target is WIF-only auth. Once WIF is verified in GitHub-hosted
dev and prod runs, remove any leftover long-lived key secrets rather than
keeping them around as a quiet fallback.

Backend env files for GitHub-hosted deploys:

- `BACKEND_ENV_FILE_B64_DEV`
- `BACKEND_ENV_FILE_B64_PROD`

Optional frontend override files:

- `FRONTEND_ENV_OVERRIDE_B64_DEV`
- `FRONTEND_ENV_OVERRIDE_B64_PROD`

The backend env secrets should be base64-encoded `.env` files. The workflow decodes them into temporary files at runtime.

### Current GitHub Environment Layout

- `development`
  - `BACKEND_ENV_FILE_B64_DEV`
  - `FRONTEND_ENV_OVERRIDE_B64_DEV`
- `production`
  - `BACKEND_ENV_FILE_B64_PROD`
  - `FRONTEND_ENV_OVERRIDE_B64_PROD`

Repo-level auth secrets hold the WIF provider IDs and service-account emails. Environment-level secrets hold deploy-time env material.

### GCP WIF Setup

Both GCP projects use a `github-actions` workload identity pool with a `github` OIDC provider restricted to the `justin-thakral/DullyPDF` repository.

Provider resource names:

- dev: `projects/696001046696/locations/global/workloadIdentityPools/github-actions/providers/github`
- prod: `projects/916039292611/locations/global/workloadIdentityPools/github-actions/providers/github`

Service accounts:

- dev: `github-actions-dev@dullypdf-dev.iam.gserviceaccount.com`
- prod: `github-actions-prod@dullypdf.iam.gserviceaccount.com`

Each GitHub Actions service account must also grant itself
`roles/iam.serviceAccountTokenCreator`. Deploy auth itself only needs WIF, but
the seeded real Playwright fixtures mint Firebase custom tokens under ADC/WIF
and those calls reach IAM `signBlob`.

`Hybrid QA` now exports `FIREBASE_SERVICE_ACCOUNT_ID` alongside the WIF auth so
Firebase Admin can use the configured signer directly instead of probing the
metadata server on GitHub-hosted runners.

## Production Approval

The workflow uses the GitHub environment name `production` for prod deploys and `development` for dev deploys.

GitHub does not add approval rules from a YAML file by itself. Configure required reviewers for the `production` environment in the repository settings if you want manual approval before prod deploy execution.
