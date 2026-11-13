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

## Five requested size references

| Code | UI label | Weight | Eighth-ounce units | Preview status |
| --- | --- | --- | --- | --- |
| xs | XS | 1/8 oz | 1 | Draft concept only |
| s | S | 1/4 oz | 2 | Draft concept only |
| m | M | 1/2 oz | 4 | Draft concept only |
| l | L | 1 oz | 8 | Draft concept only |
| xl | XL | 1/4 lb = 4 oz | 32 | Draft concept; subject to applicable quantity limits |

The five choices are **visual radio selections only** on botanicals concept cards. They do not persist into carts, change stock, calculate prices, reserve product, or create orders. The database permits only records with `status='draft'` and exact, non-floating-point eighth-ounce sizes. All existing stock figures and lot records remain unchanged; the 12 preview records are seeded with **zero inventory**.

The previous three-size draft scheme (Small=1 oz, Medium=4 oz, Large=16 oz) is retired. Migration preserves legacy 1 oz and 4 oz concepts under new L and XL labels, removes 16 oz, and introduces XS, S and M; it does not rewrite recorded product stock or actual lot traceability.

Actual regulated retail quantity constraints depend on state law, license type, patient status, previous dispensary purchases, and other rules. A draft size field does not indicate purchase eligibility. The preview remains behind independent access and application authentication.

## Data model

- \`products.name\`: accurate internal product identity.
- \`products.codename\`: optional, unique, 3–56 character display nickname; never an alternative to real identity.
- \`product_size_variants\`: one row per (\`product_id\`, \`tier\`) with exact integer `weight_eighth_oz` of 1, 2, 4, 8, or 32 and permanent \`status='draft'\`.
- An idempotent migration backfills all current \`Botanicals\` records and creates the five draft size rows for new botanical concepts.
- The administrator form can assign, revise, or clear a codename; normal product registration continues to require a valid category, SKU and identity name.

## Release QA

Run \`npm run test:private\` and \`npm run check\`; exercise desktop and mobile Chromium/WebKit tests. Verify that product cards show all five exact size labels without any buying or availability call to action. No third-party compliance integrations are configured.

Changes should remain on a review pull request targeting \`staging-preview\` until approved. Do not merge into \`main\` or activate production Netlify, email-driven commerce, payment processing, or customer fulfillment.
