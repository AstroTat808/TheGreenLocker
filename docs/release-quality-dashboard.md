# Green Locker Release Quality — staging implementation

The admin-only **/admin/quality** and **/admin/quality.json** endpoints are accessible after invitation-based sign-in and administrator MFA. They never expose environment tokens, account data, backups, or inventory records.

## Official logo delivery (no artwork change)
- Keep `assets/shield-logo-transparent.svg` and the embedded official WebP exactly unchanged.
- `private/logo-delivery.mjs` compresses the original bytes with Brotli and serves the compressed stream only when `Accept-Encoding: br` is supported; `Vary: Accept-Encoding` prevents cache confusion.
- Public `/logo` responses use a public browser cache with ETag/304 revalidation; authenticated `/assets/shield-logo-transparent.svg` responses use a private browser cache. The original SVG is always returned for unsupported encodings.
- The HTML already preloads the transparent logo with high priority. Its geometry, transparency mask, and brand typography remain intact.
- The release suite checks a byte-for-byte match after Brotli decompression.

## Expanded visual regression coverage
Previous 19 reviewed screenshots remain enforced. Added coverage is required for:
- Desktop Chromium at 1440×900;
- Tablet Chromium at 768×1024;
- Landscape iPhone WebKit at 844×390.

For all three new viewports, protect homepage hero, public collection card, member credential card, administration navigation, and release-dashboard heading (15 additional signatures; 34 total). Authenticated card screenshots mask member references, while GitHub Actions retains private screenshots as expiring artifacts.

New references are captured with the dedicated `verifyOrCaptureNewVisual` helper. They never authorize release by themselves: the independent `scripts/check-release-contract.mjs` rejects all missing signatures until they are reviewed and explicitly committed. Once approved, the same screenshot tests automatically switch to enforce mode.

## Dashboard truthfulness
The dashboard displays local running-process status, exact Railway-provided commit SHA when present, reviewed screenshot count, critical source-size budgets, and lossless compression savings.
- Live GitHub CI checks: fetched for the exact deployed SHA with an optional server-side `TGL_QUALITY_GITHUB_TOKEN` (read-only repository access). If unavailable, checks are shown as **unverified**, not passed.
- Railway replica count: **not exposed by the application server**. Process health is independently visible, but provider replicas are deliberately marked unavailable until an authorized provider integration is added.
- All external requests use a fixed GitHub URL, a short timeout, a 45-second cache, and server-side credentials only.

## Deployment boundary
The implementation is confined to `staging-preview`. Do not change production, sales/checkout functionality, the private database schema, or the independent recovery service. Require static/backend/preview/Chromium/WebKit checks to pass on the exact head and exact post-merge SHA before advancing the staging web service.
