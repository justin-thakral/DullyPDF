# Frontend Docs

- `overview.md` - Product scope, end-to-end workflow, saved-form group behavior, public docs/SEO routes, and Fill By Link respondent flow.
- `running.md` - Local startup, env files, script entrypoints, and public route testing notes.
- `structure.md` - Current `src` layout and key modules.
- `app-hooks.md` - How `App.tsx` composes extracted hooks.
- `api-routing.md` - Same-origin `/api/*` calls vs direct backend calls.
- `api.md` - Implementation guide for the saved-template `API Fill` product surface, request contract, and rollout guardrails.
- `field-editing.md` - Overlay, Browser, Field Editor, and fill behavior.
- `acroform-field-properties.md` - PDF fillable-field keys, editable/flat export rules, and why AcroForm correctness matters to DullyPDF.
- `calculation-fields-implementation-plan.md` - Phased plan for numeric inputs, calculated text-field exports, formula builder behavior, AcroForm import/export, and test coverage.
- `styling.md` - Tokens, stylesheet modules, and typography rules.
- `usage-docs.md` - Public `/es/usage-docs/*` information architecture and page layout notes.
- `seo-operations.md` - Weekly SEO operations, query tuning, and authority growth workflow.
- `seo-page-plan.md` - Planned high-authority SEO pages based on the public form catalog audit.
- `calculation-fields-seo-page-plan.md` - Planned calculation-field SEO pages and rollout guardrails.
- `dullypdf-highlight-seo-page-plan.md` - Implemented high-value SEO pages for broader DullyPDF workflow surfaces.

Customer-facing pricing or limit changes should also update the homepage copy, `planLimits.mjs`, `publicRouteSeoData.mjs`, `intentPages.ts`, usage docs content, and root/frontend README surfaces in the same branch.
Public plan-route changes should stay aligned across `/free-features`, `/premium-features`, homepage quick-info links, route SEO, and build-time static route generation.
Customer-facing feature launches should keep public docs aligned across `/es/usage-docs/*`, intent pages, and the shared public route SEO source in `frontend/src/config/publicRouteSeoData.mjs`. `scripts/seo-route-data.mjs` is only a build-time bridge.
Generated PDF download quota copy should stay consistent across Profile, `/es/usage-docs/save-download-profile`, `/free-features`, `/premium-features`, and README surfaces: free includes 25 generated PDF downloads/month, premium includes unlimited generated PDF downloads, the counter resets by backend UTC month, and save/API/respondent/signing artifacts are governed by their own workflow limits.
