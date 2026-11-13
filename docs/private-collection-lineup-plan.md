# The Green Locker — Three-Collection Private Catalog Plan

**Scope:** Authenticated private staging only. No sales, reservations, shipping, payments, or purchases are implemented or represented as available.

## Planned assortment

| Collection | Slots | Data needed |
| --- | --- | --- |
| Cannabis varieties | Two core placeholders; up to four total | Confirmed variety name, lawful product type, source, cultivar identity, regulatory jurisdiction, tested product label and verified disclosures |
| Vapes | One unconfirmed brand, twelve flavor placeholders | Brand, flavor names, formulation and cannabinoid/nicotine classification, manufacturer, verified ingredient statements, hardware and applicable product restrictions |
| Mushroom crispy treats | Two flavor placeholders | Exact mushroom species, active ingredient classification, food formulation, allergen information, labeling and lawful product status |

The design uses the slots **Variety 01–04**, **Flavor 01–12**, and **Mushroom crispy treat · Flavor 01–02**. These are intentionally unbranded and are not implied to be in stock.

### Legacy test data

The existing twelve "Locker Files" botanical draft products are **not the planned real assortment**. They are preserved unchanged in an explicitly labeled internal-development-records section on the `/catalog` route, below the three new collections. The curated `/shop` page excludes these legacy fixtures. This avoids altering existing test inventory, SKU identities, member records, or administrator workflows. The four existing visible package concepts remain The Key (1/8 oz), The Signal (1/4 oz), The Cipher (1/2 oz), and The Vault (1 oz). The Archive (1/4 lb) stays administrator-only. These are design concepts, not guarantees of lawful quantity limits.

## Shop preview

- \`/catalog\` remains the private archive with a cinematic entrance.
- \`/shop\` is a private, read-only presentation route for **only the three curated collections**, without legacy test-product records. It has no cart, checkout, credit-card entry, order submission, payment link, inventory allocation, delivery booking or address form.
- Both routes require the existing private preview gate, account login and associated security policies.
- Three anchored collection sections work without JavaScript.
- Nine mobile screenshots at 320px, 375px, and 430px are captured by the authenticated WebKit browser test.
- All new collection content is editorial planning copy, separate from the legacy SQLite product/inventory ledger.

## Shipping request: $10 anywhere in the USA

**Requested but NOT enabled and NOT advertised.** No generic US-wide shipping fee can be represented as available for the proposed categories without establishing lawful product classifications, licenses, shipping-carrier eligibility, and the origin and destination requirements. Marijuana and psilocybin are federally controlled, and vape shipments can have specific mailing and PACT Act restrictions. The mushroom species and vape active ingredients have not yet been provided.

For any **separately confirmed lawful and shippable merchandise** in the future, shipping rates should live in an explicit allowlisted shipping policy with per-item classification and destination checks, never an unconditional "anywhere in the USA" promise. The $10 figure can remain a proposed pricing scenario until then.

## Recommended development sequence

1. Confirm whether vapes contain cannabis, nicotine, neither, or another regulated compound, and the exact mushroom species and active ingredients.
2. Obtain finalized brand, flavor, cultivar and recipe names before populating placeholder text. Avoid invented ingredient claims or strain data.
3. Add a private administrator-managed assortment editor and media library so the concepts can be revised without deploying code. Keep identity separate from decorative codenames.
4. Add any mandatory factual product statements and media only after they are sourced and verified.
5. Perform a product-by-product legal/retail-channel review, including origin, shipping, carrier and destination restrictions, before building any commerce or fulfillment workflow.

**Release rules:** Target \`staging-preview\` only. Keep the production site, payment integrations, and email-initiated ordering disabled.
