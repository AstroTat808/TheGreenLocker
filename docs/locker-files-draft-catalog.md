# The Locker Files — Draft Collection Specification

**Status:** Internal product-identity and format concepts for The Green Locker preview only. Not a cannabis menu, order form, dispensary listing, or statement that any described quantity is lawful to sell or purchase.

## Brand system

The visual direction is a premium private archive: deep forest-green surfaces, gold foil-like rules, sparse editorial typography, serialized "FILE GL-..." identifiers, and understated labels. The purpose of a codename is memorable presentation, **not concealment of a product's identity**. Actual product or cultivar identity, regulated label information, sourcing, potency, and testing data (if applicable) must remain accurately stored and displayed wherever legally required.

Twelve draft codenames for creative review:

| File | Proposed codename |
| --- | --- |
| GL-001 | Ghost Key |
| GL-002 | Midnight Protocol |
| GL-003 | Blackout |
| GL-004 | Phantom Reserve |
| GL-005 | Gold Cipher |
| GL-006 | Nightshift |
| GL-007 | Shadow Signal |
| GL-008 | Velvet Static |
| GL-009 | Dead Frequency |
| GL-010 | Secret Society |
| GL-011 | Eclipse |
| GL-012 | Vault Zero |

These names are *placeholders*: they are not verified strain names, ingredient declarations, commercial brands, lab certifications, or actual in-stock products.

## Three requested size references

| Code | UI label | Reference amount | Preview status |
| --- | --- | --- | --- |
| small | SMALL | 1 oz | Draft concept only |
| medium | MEDIUM | 1/4 lb (4 oz) | Draft concept; subject to jurisdiction-specific quantity limits |
| large | LARGE | 1 lb (16 oz) | **Internal planning only; not a retail offering** |

The three choices are **visual radio selections only** on botanicals concept cards. They do not persist into carts, change stock, calculate prices, reserve product, or create orders. The database permits only records with \`status='draft'\` and exact enumerated sizes. All existing stock figures and lot records remain unchanged; the 12 preview records are seeded with **zero inventory**.

Actual regulated retail quantity constraints depend on state law, license type, patient status, previous dispensary purchases, and other rules. A draft size field does not indicate purchase eligibility. The preview remains behind independent access and application authentication.

## Data model

- \`products.name\`: accurate internal product identity.
- \`products.codename\`: optional, unique, 3–56 character display nickname; never an alternative to real identity.
- \`product_size_variants\`: one row per (\`product_id\`, \`tier\`) with exact numeric \`weight_oz\` of 1, 4, or 16 and permanent \`status='draft'\`.
- An idempotent migration backfills all current \`Botanicals\` records and creates the three draft size rows for new botanical concepts.
- The administrator form can assign, revise, or clear a codename; normal product registration continues to require a valid category, SKU and identity name.

## Release QA

Run \`npm run test:private\` and \`npm run check\`; exercise desktop and mobile Chromium/WebKit tests. Verify that product cards show the exact size labels without any buying or availability call to action. No third-party compliance integrations are configured.

Changes should remain on a review pull request targeting \`staging-preview\` until approved. Do not merge into \`main\` or activate production Netlify, email-driven commerce, payment processing, or customer fulfillment.
