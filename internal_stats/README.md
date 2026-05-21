# Internal Stats

Local-only production stats dashboard for DullyPDF.

## Why this lives here

This tool is intentionally outside `backend/` and `frontend/` so it is not included in the normal Cloud Run backend image or Firebase Hosting frontend bundle.

## Run it

From the repo root:

```bash
npm run stats
```

That starts a standalone FastAPI server on `127.0.0.1:5174` and opens the local dashboard in your browser.

## Auth model

This tool does not use DullyPDF app sign-in. It reads the production Firestore project directly with your local Google credentials.

Preferred setup:

```bash
gcloud auth application-default login
```

`GOOGLE_APPLICATION_CREDENTIALS` also works when it points at credentials that can read the `dullypdf` project.

## Safety

- The collector pins Firestore to the `dullypdf` project.
- The process binds to `127.0.0.1` by default.
- The code is not wired into the shipped backend router or frontend route tree.

## Metrics

- Workspace PDF downloads are counted from `pdf_download_events`; only explicit download calls opt in, so save/signing materializations are excluded. Current-month usage and near-limit support indicators are read from `pdf_download_usage_counters`, while `rejected_limit` events show quota blocks.
- PDF download support fields include current-month total downloads, users with current-month usage, base users at or above 80% of the 25/month cap, Pro users with 100+ current-month downloads, group ZIP PDF counts, and quota rejection counts.
- Barcode, calculation-field, and appearance-adoption counts are derived from saved-form editor snapshots in production storage. If a snapshot cannot be loaded, the dashboard still renders and reports the unavailable snapshot count.
