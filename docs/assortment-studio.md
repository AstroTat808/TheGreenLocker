# The Green Locker — Assortment Studio

**Scope:** Private, authenticated, non-transactional staging concept editor. This is not a cannabis dispensary, shipping service, live online shop, or offer of inventory.

## Admin access

Go to **Admin → Assortment Studio** at `/admin/assortment`. Use the existing private preview access, administrator login, and authenticator MFA.

The editor has 18 stable, seeded draft concept slots; new database records are only created when missing, and existing edits are preserved at restart:

| Collection | Slots | Default presentation |
| --- | --- | --- |
| Botanical varieties | 4 | 2 marked initial + 2 optional expansion |
| Vape flavor concepts | 12 | One brand name shared by all twelve |
| Mushroom crispy treat concepts | 2 | 2 editable recipe/flavor designs |

The collection IDs remain stable, so previously edited names and artwork do not change unexpectedly after deployment. The archive of twelve historical Locker Files entries and all stock/lot records remain separate.

## What administrators can edit

Every concept slot contains a **display name** (2–90 chars), a **short description** (up to 420 chars), **internal notes** (up to 1,000 chars), a **Show in private preview** checkbox, and a custom artwork upload/replacement/removal control. Brand name is edited separately for the one vape collection. Concept changes appear on the authenticated `/shop` and `/catalog` pages without rebuilding the site.

The editor tracks a version number, UTC modification timestamp, editor identity and revision entries. Concurrent edits are rejected with HTTP 409 rather than silently overwritten. Save/visibility controls are not public commerce publishing. Every concept remains a draft.

### Uploaded artwork

You may choose JPEG, PNG or WebP. The browser decodes and draws your image onto a clean canvas (removing file-level EXIF, camera location, and other source metadata), scales the longest dimension to at most 1600px and sends only re-encoded WebP to the private service.

The server independently checks:

- Admin login and MFA, same-origin request policy, and exact CSRF token.
- Maximum 2 MB upload body; valid RIFF/WebP magic, chunk structure and bounded dimensions; rejection of metadata, animation and unexpected chunks.
- Only recognized `botanical-XX`, `vape-flavor-XX` and `treat-XX` slots.
- Optimistic version match; a stale artwork upload cannot replace a newer image.
- Random 128-bit file identifier, private file permissions, retained only in mounted persistent `/data/concept-art` storage.

Member image requests require login and the private preview gate. There are no third-party image processors or hosting endpoints. Upload success triggers a page refresh showing the new image.

The original artworks in `assets/collection-botanical.svg`, `assets/collection-vape.svg` and `assets/collection-treat.svg` are custom emerald, black and gold packaging **illustrations**. They are not factual packaging, legal label proofs, or the official logo. The site separately overlays the existing approved shield asset from `assets/shield-logo.webp`, which must not be redesigned or substituted.

## Test and recovery

Run the existing `npm run check` and `npm run test:private` plus private Chromium/WebKit suites. Verify member/anonymous users cannot access the editor, stale versions return 409, unsigned requests return 403, no cross-site uploads are accepted, labels and notes escape HTML, and uploaded image URLs return 404 after removal. On mobile, check 320, 375 and 430 px without horizontal scrolling.

Back up the persistent SQLite database **and** the `concept-art` directory together. Deleting the directory will leave blank custom images, which revert to original SVG art only after removing the stored reference.

The client is deliberately not a sales interface: there are no prices, product availability promises, order totals, address capture, checkout, transaction links, or nationwide shipping fees. Required legal product names, ingredients, labeling, testing, origin and jurisdiction-specific eligibility remain pending.

## After this release

Confirm the actual botanicals, vape brand/flavor labels, exact active ingredients and mushroom species before changing any concepts into factual regulatory product descriptions. Any legal commerce capability would need a separate compliance, licensing, jurisdiction and carrier review, not an unbounded national shipping switch.
