# The Green Locker

Premium forest-green, charcoal, and gold **pre-launch brand website** for The Green Locker.

> **Status:** Visual marketing prototype only. Not a licensed dispensary, active storefront, or national shipping service. **Do not connect to production or publish as an active retail website** before legal and brand clearance.

## What is here

- Responsive, dependency-free static homepage (`index.html`, `styles.css`, `app.js`)
- Accessible mobile menu and cosmetic 21+ **preview acknowledgement** (not a legally sufficient age-verification system)
- Four **concept-only** collection cards, brand story, and coming-soon messaging
- The owner-approved gold-and-emerald shield (`assets/shield-logo.webp`) is displayed consistently throughout the public site
- Matching shield favicon (`assets/shield-favicon.png`); no generated substitute vector mark
- No product listing, payment processor, order intake, inventory, backend, account access, shipping, or commercial claims

## Important: logo source-of-truth

The **approved brand logo** is the original emerald-and-gold shield from the owner-provided design. The image bytes in `assets/shield-logo.webp` and matching `assets/shield-favicon.png` are exactly the same Git blobs verified in the private staging branch. No unapproved redraw or simplified mark should replace these assets.

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
- Review desktop/mobile and accessibility before public launch

## Deployment

**Current public status (November 2026):** Netlify site `thegreenlocker` serves the non-transactional prelaunch brand prototype at https://thegreenlocker.com from the `main` branch. Its cosmetic 21+ acknowledgement is not a regulated retail age/ID check. The private, authenticated assortments and admin studio run separately on Railway's `staging-preview` branch and must not be bundled into the public Netlify site. A reviewed `_headers` file applies restrictive CSP, browser security headers, and noindex instructions on the next Netlify deployment after merge. No commerce, fulfillment, payments or order entry are implemented.

## Developer notes

No framework, dependency install, or environment variables are required. The page is deliberately isolated from production commerce and is suitable for review through GitHub pull requests.
