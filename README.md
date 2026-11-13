# The Green Locker

Premium forest-green, charcoal, and gold **pre-launch brand website** for The Green Locker.

## Private account development (PR #2 and draft PR #3)

A separate Node 24 server provides invited-user registration, **verified-email sign-in**, self-service password reset, **administrator authenticator MFA**, an internal concept catalog, private product images, suppliers, lot tracking, and CSV imports/exports. **This does not enable online sales or public deployment.** See [private preview setup and security boundary](docs/private-preview.md), plus [security architecture and staging runbook](docs/security-staging-architecture.md).

Use `npm run start:private` with `TGL_INVITE_CODE` configured for real server-enforced preview access. Running the original static `python3 -m http.server` design preview **bypasses authentication**; never treat that static mode as a private website. Netlify builds are intentionally blocked until authenticated hosting is implemented.

> **Status:** Visual marketing prototype only. Not a licensed dispensary, active storefront, or national shipping service. **Do not connect to production or publish as an active retail website** before legal and brand clearance.

## What is here

- Responsive, dependency-free static homepage (`index.html`, `styles.css`, `app.js`)
- Accessible mobile menu and cosmetic 21+ **preview acknowledgement** (not a legally sufficient age-verification system)
- Four **concept-only** collection cards, brand story, and coming-soon messaging
- Approved shield-crest WebP (`assets/shield-logo.webp`) displayed throughout the public prototype and authenticated preview
- Matching compact shield favicon (`assets/shield-favicon.png`) for browser tabs and app branding
- Four cinematic vault package selectors with explicit reference weights, keyboard support and reduced-motion support; visual-only, no ordering
- The root HTML remains a visual homepage; the optional private Node server has **draft-only** product and inventory tooling. No payments, orders, checkout, shipping, or commercial claims exist

## Important: logo source-of-truth

The current official logo is the **emerald and gold shield/vault-door crest** selected by the owner. `assets/shield-logo.webp` is an optimized, faithful raster rendition of the uploaded artwork; `assets/shield-favicon.png` is a small rendition of that same crest. This replaces the older circular locker mark and simplified vector recreation. The uploaded image is not an editable vector master; do not claim an exact SVG reconstruction.

The **Locker Files** package selector offers The Key (1/8 oz), The Signal (1/4 oz), The Cipher (1/2 oz), and The Vault (1 oz), all as visual preview concepts. Its gold rotating vault animation is decorative, follows `prefers-reduced-motion`, and performs no network requests, checkout, stock reservation or sales action. The Archive (4 oz) remains administrator-only.

## Local preview

Run an HTTP server from the repo root:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`. For visual-design reviews only, add `?preview=1` to skip the cosmetic acknowledgement. This switch must **never** be used for actual retail access control.

## Design tokens

| Token | Value |
|---|---|
| Ink | `#06130D` |
| Forest | `#092A1C` |
| Emerald | `#153F28` |
| Gold | `#D5AE67` |
| Light gold | `#F6DDA3` |
| Cream | `#F3F0E6` |

## Launch gates (not complete)

- Confirm domain ownership and DNS for TheGreenLocker.com
- Complete trademark clearance for The Green Locker / GreenLocker
- Identify licensed products, jurisdictions, fulfillment and shipping restrictions
- Obtain required permits and verify compliant advertising, age/identity checks, and checkout
- Optimize approved brand artwork for web delivery and finalize legal copy
- Review desktop/mobile and accessibility before connecting Netlify

## Deployment

**No Netlify site, live deployment, domain mapping, or secrets are configured.** `netlify.toml` deliberately blocks accidental static builds of the private application. When you choose to deploy later, connect GitHub to Netlify, set the publish directory to the repository root, and omit the build command. Ensure the launch gates above are met.

## Developer notes

The standalone homepage has no runtime framework; authenticated preview requires Node 24+, a private invitation secret, and a persistent local SQLite database. Browser test tooling is an optional development dependency. The site is deliberately isolated from production commerce and is suitable for GitHub pull request review.
