# The Green Locker

Premium forest-green, charcoal, and gold **pre-launch brand website** for The Green Locker.

> **Status:** Visual marketing prototype only. Not a licensed dispensary, active storefront, or national shipping service. **Do not connect to production or publish as an active retail website** before legal and brand clearance.

## What is here

- Responsive, dependency-free static homepage (`index.html`, `styles.css`, `app.js`)
- Accessible mobile menu and cosmetic 21+ **preview acknowledgement** (not a legally sufficient age-verification system)
- Four **concept-only** collection cards, brand story, and coming-soon messaging
- Approved-logo PNG export (`assets/approved-logo.png`) displayed in the site
- Optional simplified editable illustration (`assets/logo.svg`) for future vector design work
- No product listing, payment processor, order intake, inventory, backend, account access, shipping, or commercial claims

## Important: logo source-of-truth

The **approved brand logo** is the circular ornate gold-and-green locker emblem selected by the owner. `assets/approved-logo.png` is the faithful raster export used on this site; it was extracted from the previously produced embedded-artwork SVG. The separate `assets/logo.svg` is an **editable simplified recreation**, not a pixel-perfect vector conversion.

Before launch, review the logo on both light and dark backgrounds and optimize image delivery. For high-resolution print masters, use the previously delivered standalone brand kit. Do not replace the primary emblem with the simplified SVG without owner approval.

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

**No Netlify site, deployment, redirects, domains, or secrets are configured by this repository.** When you choose to deploy later, connect GitHub to Netlify, set the publish directory to the repository root, and omit the build command. Ensure the launch gates above are met.

## Developer notes

No framework, dependency install, or environment variables are required. The page is deliberately isolated from production commerce and is suitable for review through GitHub pull requests.
