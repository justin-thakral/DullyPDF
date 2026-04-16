# DullyPDF

**[dullypdf.com](https://dullypdf.com)** — Free PDF form automation platform that converts existing PDFs into reusable fillable templates with AI field detection, then fills them from spreadsheets, web form responses, API calls, or scanned documents.

Upload any PDF, let the AI detection pipeline find every text field, checkbox group, radio button, date, and signature region, then clean the template in the visual editor and reuse it across every fill workflow the platform supports. No Acrobat license needed.

## Platform Workflows

| Workflow | What it does |
|----------|-------------|
| [PDF to Fillable Form](https://dullypdf.com/pdf-to-fillable-form) | Detect fields automatically and build a reusable fillable template from any flat, scanned, or native PDF |
| [Fill PDF from Spreadsheet](https://dullypdf.com/fill-pdf-from-csv) | Map template fields to CSV, Excel, JSON, or TXT headers and bulk fill from matching rows — data stays in-browser |
| [Collect Answers by Web Form](https://dullypdf.com/fill-pdf-by-link) | Publish a hosted respondent form so clients submit answers that fill the PDF when you generate it |
| [JSON-to-PDF API Endpoint](https://dullypdf.com/pdf-fill-api) | Expose a template-scoped REST endpoint for programmatic document generation from structured payloads |
| [E-Signature Workflow](https://dullypdf.com/esign-ueta-pdf-workflow) | Route filled PDFs into email-based signing requests with immutable record freezing under U.S. E-SIGN and UETA |
| [Batch Fill PDF Forms](https://dullypdf.com/batch-fill-pdf-forms) | Automate high-volume filling across document packets and template groups from a single data source |
| [Fill from Photos and Scanned Documents](https://dullypdf.com/usage-docs/fill-from-images) | Extract data from IDs, invoices, pay stubs, and insurance cards using AI vision and populate template fields |
| [PDF Field Detection Tool](https://dullypdf.com/pdf-field-detection-tool) | Review AI-detected field candidates with confidence scoring before committing the template layout |
| [Field Name Normalization](https://dullypdf.com/fillable-form-field-name) | Standardize field names across messy or inconsistent PDF templates for reliable downstream mapping |

## Industry-Specific Solutions

| Industry | Supported document types |
|----------|------------------------|
| [Healthcare Intake Automation](https://dullypdf.com/healthcare-pdf-automation) | Patient registration, dental intake, HIPAA consent, and medical history forms |
| [Insurance Certificate Processing](https://dullypdf.com/insurance-pdf-automation) | ACORD certificates, carrier-specific policy forms, and COI packet workflows |
| [ACORD Form Filler](https://dullypdf.com/acord-form-automation) | ACORD 25, 24, 27, 28, 126, and 140 certificate of insurance templates |
| [HR Onboarding Document Automation](https://dullypdf.com/hr-pdf-automation) | New hire packets, benefits enrollment, W-4, I-9, and compliance forms |
| [Shipping and Freight Paperwork](https://dullypdf.com/logistics-pdf-automation) | Bills of lading, delivery receipts, customs declarations, and transport logs |
| [Loan Application PDF Automation](https://dullypdf.com/finance-loan-pdf-automation) | Mortgage applications, financial disclosures, and lending document packets |
| [Rental and Lease Packet Filler](https://dullypdf.com/real-estate-pdf-automation) | Rental applications, lease agreements, property disclosure, and tenant screening forms |
| [Legal Document Workflow](https://dullypdf.com/legal-pdf-workflow-automation) | Contracts, court filings, retainer agreements, and case intake packets |
| [Government Form Processing](https://dullypdf.com/government-form-automation) | Permit applications, tax forms, licensing packets, and public records requests |
| [Student Application Automation](https://dullypdf.com/education-form-automation) | Enrollment forms, transcript requests, financial aid applications, and registration packets |
| [Nonprofit Intake Automation](https://dullypdf.com/nonprofit-pdf-form-automation) | Grant applications, volunteer onboarding, donor pledge forms, and program intake |

## Documentation

- [Getting Started Guide](https://dullypdf.com/usage-docs/getting-started) — End-to-end walkthrough from PDF upload to filled output
- [Field Detection](https://dullypdf.com/usage-docs/detection) — How AI confidence scoring and field classification work
- [Editor Workflow](https://dullypdf.com/usage-docs/editor-workflow) — Visual field editing, geometry tools, and template cleanup
- [Rename and Schema Mapping](https://dullypdf.com/usage-docs/rename-mapping) — AI field renaming and database column alignment
- [Search and Fill](https://dullypdf.com/usage-docs/search-fill) — Row-based filling from structured data files
- [Fill By Link](https://dullypdf.com/usage-docs/fill-by-link) — Respondent web form publishing and answer collection
- [API Fill](https://dullypdf.com/usage-docs/api-fill) — Endpoint management, auth keys, and JSON schema
- [Signature Workflow](https://dullypdf.com/usage-docs/signature-workflow) — E-SIGN/UETA compliance scope and signing process
- [Template Groups](https://dullypdf.com/usage-docs/create-group) — Batch operations across multi-template document packets
- [Troubleshooting](https://dullypdf.com/usage-docs/troubleshooting) — Detection, mapping, and fill issue diagnosis

## Blog

- [How to Convert a PDF to a Fillable Form](https://dullypdf.com/blog/how-to-convert-pdf-to-fillable-form)
- [Auto-Fill PDFs from a Spreadsheet](https://dullypdf.com/blog/auto-fill-pdf-from-spreadsheet)
- [Automate Medical Intake Forms](https://dullypdf.com/blog/automate-medical-intake-forms)
- [Fill ACORD 25 Certificates Faster](https://dullypdf.com/blog/acord-25-certificate-fill-faster)
- [DullyPDF vs Adobe Acrobat for PDF Form Automation](https://dullypdf.com/blog/dullypdf-vs-adobe-acrobat-pdf-form-automation)
- [DullyPDF vs JotForm for PDF Data Collection](https://dullypdf.com/blog/dullypdf-vs-jotform-pdf-data-collection)
- [Stop Retyping Employee Data During HR Onboarding](https://dullypdf.com/blog/hr-onboarding-stop-retyping-employee-data)
- [How AI Finds Fields in a PDF Form](https://dullypdf.com/blog/pdf-form-field-detection-how-ai-finds-fields)
- [Map PDF Fields to Database Columns](https://dullypdf.com/blog/map-pdf-fields-to-database-columns)
- [All posts →](https://dullypdf.com/blog)

## Browse

- [Workflow Library](https://dullypdf.com/workflows) — All supported PDF automation workflows
- [Industry Solutions](https://dullypdf.com/industries) — Document automation by vertical
- [Free Features](https://dullypdf.com/free-features) — What is included at no cost
- [Premium Features](https://dullypdf.com/premium-features) — Higher limits for teams and production use
- [Privacy Policy](https://dullypdf.com/privacy) ·  [Terms of Service](https://dullypdf.com/terms)
- [LinkedIn](https://www.linkedin.com/company/dullypdf) · [YouTube](https://www.youtube.com/@DullyPDF) · [X](https://x.com/DullyPDF)

---

## Development

FastAPI + React app for detecting PDF form fields, renaming candidates with OpenAI, editing fields in a PDF viewer, and publishing native Fill By Link respondent forms from saved templates. The main pipeline is CommonForms (by [jbarrow](https://github.com/jbarrow/commonforms)) detection, optional OpenAI rename, schema-only mapping, and Search & Fill or Fill By Link respondent selection at generation time.

## Getting Started

This guide covers a quick local setup for the main pipeline and points to small, tracked fixtures for manual testing.

### Prereqs

- Node.js (for frontend tooling)
- Python 3.10+ (for backend)

### Run the full stack (dev)

From the repo root:

```bash
npm install
npm run dev
```

This starts the FastAPI backend and Vite frontend together, and also starts Stripe CLI webhook forwarding to the local billing webhook when `STRIPE_SECRET_KEY` is configured.

Notes for Stripe local billing:
- `npm run dev` injects the Stripe CLI session `whsec_...` into the backend process for that run.
- Checkout health enforcement is forced off for local CLI forwarding (`STRIPE_ENFORCE_WEBHOOK_HEALTH=false`) because Stripe CLI forwarding does not create a dashboard webhook endpoint.
- Set `STRIPE_DEV_LISTEN_ENABLED=false` to skip automatic Stripe forwarding.

You can still run frontend/backend separately with `npm run backend:dev` and `npm run frontend:dev`.

Open the UI at `http://localhost:5173`.

### Run the internal stats dashboard

From the repo root:

```bash
npm run stats
```

This starts a standalone local dashboard on `http://127.0.0.1:5174`. It is intentionally not part of the deployed frontend or backend app, and it reads the production Firestore project directly with your local Google credentials instead of using DullyPDF app sign-in.

### Run the prod-like stack

From the repo root:

```bash
npm run dev:stack
```

This runs the backend in Docker on host port `8010`, starts the frontend dev server on `5173`, targets the `dullypdf-dev` Cloud Tasks / Cloud Run services, and also auto-starts Stripe CLI webhook forwarding to `http://localhost:8010/api/billing/webhook` when `STRIPE_SECRET_KEY` is configured.

Notes for Stripe stack billing:
- `npm run dev:stack` injects the Stripe CLI session `whsec_...` into the backend container for that run.
- Checkout health enforcement is forced off for local CLI forwarding (`STRIPE_ENFORCE_WEBHOOK_HEALTH=false`) because Stripe CLI forwarding does not create a dashboard webhook endpoint.
- Set `STRIPE_DEV_LISTEN_ENABLED=false` to skip automatic Stripe forwarding.

### Environment setup

Backend dev env is local-only and created on first run:

- Backend: `env/backend.dev.env` (from `config/backend.dev.env.example`)

Frontend uses committed public env files:

- `config/public/frontend.dev.env`
- `config/public/frontend.stack.env`
- `config/public/frontend.prod.env`

Optional local frontend overrides can be added in ignored files:

- `env/frontend.dev.local.env`
- `env/frontend.stack.local.env`
- `env/frontend.prod.local.env`

`npm run backend:dev` loads `env/backend.dev.env`, then pulls Firebase Admin credentials via Secret Manager if configured.
`npm run frontend:dev` builds `frontend/.env.local` from `config/public/frontend.dev.env` and appends local override files when present.

### OpenAI (optional)

Rename and schema mapping require `OPENAI_API_KEY`. If the key is missing, those actions fail while CommonForms (by [jbarrow](https://github.com/jbarrow/commonforms)) detection still works.

### Plan limit messaging

- Free defaults are 5 saved forms, 5 detect pages, 50 fillable pages, no active Fill By Link cap with 25 accepted responses/month across the account, 1 API Fill endpoint with 250 successful fills/month and 25 pages/request, 25 sent signing requests/month, and 10 starter credits.
- Premium defaults are 100 saved forms, 100 detect pages, 1,000 fillable pages, no active Fill By Link cap with 10,000 accepted responses/month across the account, 20 API Fill endpoints with 10,000 successful fills/month and 250 pages/request, 10,000 sent signing requests/month, and a 500-credit monthly pool before refill packs.
- Respondents fill a DullyPDF-hosted HTML form. The final PDF is generated later when the owner selects a respondent inside the workspace.
- Public plan summaries are available at `/free-features` and `/premium-features`.

## Quick test files

Use the tracked fixtures in `quickTestFiles/`:

- `quickTestFiles/new_patient_forms_1915ccb015.pdf`
- `quickTestFiles/new_patient_forms_1915ccb015_mock.csv` (Search & Fill rows)
- `quickTestFiles/healthdb_vw_form_fields.csv` (schema headers)

Notes:
- CSV/Excel/JSON rows stay in the browser; only headers/types are sent to the server.
- Do not add PHI/PII to tracked files.

## API Fill QA

Targeted API Fill checks are available at the repo root:

```bash
npm run test:backend:template-api
npm run coverage:backend:template-api
npm run test:frontend:template-api
npm run test:playwright:template-api
npm run test:qa:template-api
```

- `test:backend:template-api` runs the focused backend unit and integration suite for publish, public fill, service normalization, and Firestore bookkeeping.
- `coverage:backend:template-api` reports coverage only for the core API Fill backend modules.
- `test:frontend:template-api` runs the focused dialog and hook unit tests.
- `test:playwright:template-api` runs both the harnessed browser regression and the authenticated `/ui` owner flow.
- `test:qa:template-api` chains the focused backend, frontend, and Playwright checks together.

## Cleanup

Use the repo cleanup entrypoint to clear generated artifacts:

```bash
python3 clean.py --mcp --mcp-logs --mcp-screenshots
python3 clean.py --runs --tmp --test-results
python3 clean.py --field-detect-logs --mcp-bug-logs --frontend-tmp
python3 clean.py --outbound-leads
python3 clean.py --bug-reports --mcp-security-logs
python3 clean.py --coverage --pytest-cache --python-cache --frontend-dist --output --repo-logs --pipeline-improve
python3 clean.py --all --dry-run
```

Each directory also ships its own `cleanOutput.py` script (see `mcp/`, `runs/`, `test-results/`, `tmp/`, `backend/fieldDetecting/logs/`, `mcp/codexBugs/logs/`, and `frontend/`). Root-level cleanup also supports bug-report folders and local cache/build artifacts.

## Fullstack Read Audit

Scope: main pipeline only (`backend` + detector + `frontend`), with supporting tooling called out separately. Legacy OpenCV pipeline in `legacy/` is excluded from the runtime path.

### 1) Languages in this stack

- Python (backend API + detector services)
- TypeScript (frontend app + build config)
- JavaScript (Node scripts/tooling + MCP server)
- HTML (frontend entry)
- CSS (frontend styling)
- Bash/Shell (dev/deploy/runtime scripts)
- YAML (container/service config)
- JSON (app/tooling config and manifests)
- Markdown (project docs)

Also present (secondary tooling): PowerShell scripts (`.ps1`).

### 2) Backend API libraries (`backend/requirements.txt`)

- `fastapi==0.128.2`
- `uvicorn==0.30.6`
- `pdfplumber==0.11.9`
- `pymupdf==1.24.9` (`fitz`)
- `opencv-python-headless==4.10.0.84`
- `numpy==1.26.4`
- `pillow==12.0.0`
- `openai==2.11.0`
- `python-multipart==0.0.22`
- `httpx==0.28.1`
- `pypdf==6.6.2`
- `firebase-admin==7.1.0`
- `google-cloud-storage==3.9.0`
- `google-cloud-tasks==2.21.0`
- `protobuf==5.29.6`
- `PyJWT==2.10.1`

### 3) Detector-specific libraries

From `backend/requirements-detector.txt` and `Dockerfile.detector`:

- `commonforms==0.2.1`
- `torch==2.9.1+cpu`
- `torchvision==0.24.1+cpu`

### 4) Backend test libraries (`backend/requirements-dev.txt`)

- `pytest>=8.0,<9`
- `pytest-mock>=3.14,<4`
- `pytest-cov>=5,<7`

### 5) Frontend runtime libraries (`frontend/package.json`)

- `react@^19.2.0`
- `react-dom@^19.2.0`
- `pdfjs-dist@^4.5.136`
- `firebase@^10.11.0`
- `firebaseui@^6.1.0`
- `read-excel-file@^6.0.3`

### 6) Frontend build/test/tooling libraries

- `typescript@~5.9.3`
- `vite@^7.2.4`
- `@vitejs/plugin-react@^5.1.1`
- `vitest@^4.0.18`
- `@testing-library/react@^16.2.0`
- `@testing-library/user-event@^14.6.1`
- `jsdom@^26.1.0`
- `eslint@^9.39.1`
- `@eslint/js@^9.39.1`
- `typescript-eslint@^8.46.4`
- `eslint-plugin-react-hooks@^7.0.1`
- `eslint-plugin-react-refresh@^0.4.24`
- `@types/node@^24.10.1`
- `@types/react@^19.2.5`
- `@types/react-dom@^19.2.3`
- `globals@^16.5.0`
- `undici` override: `6.23.0`

### 7) Root workspace tooling (`package.json`)

- `concurrently@^8.2.2` (run frontend/backend together)
- `@playwright/test@^1.57.0` (E2E tooling)

### 8) MCP server libraries (`mcp/server/package.json`)

- `@modelcontextprotocol/sdk@^1.25.1`
- `axios@^1.6.7`
- `dotenv@^16.4.5`
- `form-data@^4.0.0`

### 9) Platform and service dependencies in the live pipeline

- FastAPI backend service on Cloud Run
- Dedicated detector service on Cloud Run
- Firebase Hosting (SPA + selected `/api` rewrites)
- Firebase Auth / Identity Platform
- Firestore (session/schema/request metadata)
- Google Cloud Storage (forms/templates/artifacts)
- Google Cloud Tasks (detector job queue)
- OpenAI API (rename + schema mapping)
- reCAPTCHA Enterprise (contact/signup risk checks)
- Gmail API (contact form email delivery)

### 10) Not on the main runtime path

- `docker-compose.yml` defines SQL Server (`mcr.microsoft.com/mssql/server:2022-latest`) for local/support scenarios.
- Backend docs explicitly state SQL/Postgres integrations are not part of the current main runtime path (moved to `legacy/`).

### Audit inputs reviewed

- `backend/requirements.txt`
- `backend/requirements-detector.txt`
- `backend/requirements-dev.txt`
- `frontend/package.json`
- `package.json`
- `mcp/server/package.json`
- `Dockerfile`
- `Dockerfile.detector`
- `docker-compose.yml`
- `backend/README.md`
- `backend/fieldDetecting/README.md`
- `backend/fieldDetecting/docs/commonforms.md`
- `backend/fieldDetecting/docs/rename-flow.md`
- `frontend/README.md`
- `frontend/docs/overview.md`
- `frontend/docs/api-routing.md`

## More docs

- `backend/README.md`
- `frontend/README.md`
- `backend/fieldDetecting/docs/README.md`
- `GIT_WORKFLOW.md`
