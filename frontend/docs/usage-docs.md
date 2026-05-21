# Usage Docs Pages

The frontend exposes public usage documentation under `/es/usage-docs/*` as the canonical docs URL
family. Legacy `/usage-docs/*` and `/docs/*` URLs are retained only for compatibility and redirect to
`/es/usage-docs/*` with HTTP 301 on Firebase hosting.
Canonical route style is non-trailing slash for non-root docs URLs (`/es/usage-docs/...`), and
slash variants should only perform a single redirect to the non-slash URL.

These routes are handled in `src/main.tsx` without React Router so they remain lightweight and
consistent with existing legal-page routing.

## Routes

- `/es/usage-docs` -> overview
- `/es/usage-docs/getting-started`
- `/es/usage-docs/detection`
- `/es/usage-docs/rename-mapping`
- `/es/usage-docs/editor-workflow`
- `/es/usage-docs/search-fill`
- `/es/usage-docs/fill-from-images`
- `/es/usage-docs/fill-by-link`
- `/es/usage-docs/signature-workflow`
- `/es/usage-docs/api-fill`
- `/es/usage-docs/create-group`
- `/es/usage-docs/save-download-profile`
- `/es/usage-docs/troubleshooting`
- `/usage-docs/*` permanently redirects to the matching `/es/usage-docs/*` path
- `/docs/*` permanently redirects to the matching `/es/usage-docs/*` path
- `/es/usage-docs/:slug/` redirects once to `/es/usage-docs/:slug`

Unknown slugs (for example `/es/usage-docs/typo`) are treated as not found:
- Firebase hosting returns a true 404 page (`frontend/public/404.html`) for unknown `/es/usage-docs/*` paths.
- Client-side fallback rendering (for local/dev rewrite behavior) uses `UsageDocsNotFoundPage` and applies `noindex,follow`.

## Files

- `src/components/pages/usageDocsContent.tsx`: route/page catalog + section content.
- `src/components/pages/UsageDocsPage.tsx`: docs page shell, sidebar, and section rendering.
- `src/components/pages/UsageDocsPage.css`: responsive layout and typography.
- `src/components/pages/UsageDocsNotFoundPage.tsx`: client-side docs 404 fallback page with noindex SEO metadata.
- `src/components/pages/UsageDocsNotFoundPage.css`: docs 404 fallback styling.

## Navigation model

- Public docs now use the shared public-site header/footer frame used by the blog and workflow routes.
- Docs keep a small local utility nav for `Usage Docs`, `Privacy Policy`, and `Terms of Service`.
- Sidebar includes:
  - `Pages`: jump between docs routes.
  - `On this page`: anchor links to section IDs in the active route.

## Billing and credits coverage

- The public docs now describe bucketed OpenAI credit pricing:
  - `totalCredits = baseCost * ceil(pageCount / bucketSize)`
  - Current defaults documented in UI/docs: `bucketSize=5`, base costs `Rename=1`, `Remap=1`, `Rename+Map=2`.
- The `Save / Download` docs page includes Stripe billing plan behavior from Profile:
  - `pro_monthly` and `pro_yearly` are recurring subscriptions with labels/pricing sourced from backend Stripe metadata
  - `refill_500` (Pro-only) is a one-time credit refill with label/pricing sourced from backend Stripe metadata
  - free accounts include 25 generated PDF downloads per month, premium accounts include unlimited generated PDF downloads, and the counter resets on the backend by UTC month.
  - Profile surfaces the total used/remaining quota, workspace-download vs group-ZIP PDF split counts, successful download batches, and the next UTC reset timestamp.
  - saving templates, API Fill outputs, respondent downloads, and signing artifacts use their own workflow limits and are not charged against the workspace generated PDF download quota.
  - checkout and payment transactions are processed securely via Stripe Checkout.
  - opening a Checkout Session is not the entitlement boundary; Pro access and trial usage are granted only after completed Stripe checkout/subscription fulfillment.
  - subscription linkage/status + cancellation schedule metadata from backend profile state.
  - failed subscription payments keep `past_due` Pro access active during Stripe Smart Retries, show a Profile payment-recovery banner, route payment-method updates through Stripe Customer Portal, then sync the updated payment method onto the recovering subscription before retrying the latest open invoice.
  - refill-credit retention across downgrades/upgrades.

## Responsive behavior

- Desktop/tablet: two-column layout with sticky sidebar.
- Small screens: sidebar moves above content and page links become an adaptive grid.
- Content containers enforce `min-width: 0` and use wrapping rules to prevent horizontal overflow.

## Entry points

- Desktop non-editor header includes one `Docs & Privacy & Terms` button that routes to `/es/usage-docs`.
- Mobile homepage CTA stack includes one `Docs & Privacy & Terms` button that routes to `/es/usage-docs`.
- Workspace `Schema` dropdown includes `Usage Docs`, which opens `/es/usage-docs/search-fill` in a new browser tab/window.
- Workspace `Rename or Remap` dropdown includes `Usage Docs`, which opens `/es/usage-docs/rename-mapping` in a new browser tab/window.
- Workspace `Download specific pages`, `Fill from information extracted from images and documents`, calculation setup, `Fill By Web Form Link + Sign`, `Send PDF for Signature by email`, and `API Fill` dialogs expose a `Usage Docs` button immediately left of the red close control, and each button opens its matching `/es/usage-docs/*` route in a new browser tab/window.
- Workspace Browser and Field Editor headers expose right-aligned `Usage Docs` buttons that open `/es/usage-docs/editor-workflow` in a new browser tab/window without disturbing the active editor state.

## Output guidance

- The Fill By Link docs explicitly recommend flat PDF outputs for external recipients, respondent receipts, and final records because the completed values are baked into page content instead of depending on a mobile or browser PDF viewer to preserve editable AcroForm styling.
- Editable PDF downloads remain documented as the right choice when a recipient needs to keep working with live fields after download.
- Selected-page downloads are documented as the right choice when an operator needs an ad hoc page subset without modifying the active workspace PDF.
- The Save / Download docs distinguish quota-charged signed-in workspace downloads from save, API Fill, respondent, and signing artifact materialization paths.
