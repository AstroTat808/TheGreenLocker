# The Green Locker

Premium forest-green, charcoal, and gold **pre-launch brand website** for The Green Locker.

> **Status:** Visual marketing prototype only. Not a licensed dispensary, active storefront, or national shipping service. **Do not connect to production or publish as an active retail website** before legal and brand clearance.

## What is here

- Responsive, dependency-free static homepage (`index.html`, `styles.css`, `app.js`)
- Accessible mobile menu and cosmetic 21+ **preview acknowledgement** (not a legally sufficient age-verification system)
- Four **concept-only** collection cards, brand story, and coming-soon messaging
- Editable *simplified* vector logo (`assets/logo.svg`) used as a temporary site asset
- No product listing, payment processor, order intake, inventory, backend, account access, shipping, or commercial claims

## Important: logo source-of-truth

The **approved brand logo** is the circular ornate gold-and-green locker emblem selected by the owner. The current `assets/logo.svg` is a simplified **vector recreation**, *not* the exact approved artwork.

Before launch, replace the SVG on the website with a web-optimized transparent raster export of the approved original (from the separately delivered brand kit). Keep the original unmodified in source assets, and give the icon a legible accessible name.

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
- Finalize approved brand art and all legal copy
- Review desktop/mobile and accessibility before connecting Netlify

## Deployment

**No Netlify site, deployment, redirects, domains, or secrets are configured by this repository.** When you choose to deploy later, connect GitHub to Netlify, set the publish directory to the repository root, and omit the build command. Ensure the launch gates above are met.

## Developer notes

No framework, dependency install, or environment variables are required. The page is deliberately isolated from production commerce and is suitable for review through GitHub pull requests.
