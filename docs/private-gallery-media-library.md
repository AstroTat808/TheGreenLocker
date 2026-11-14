# Private Gallery Media Library

This is a **private staging-only** enhancement to The Green Locker assortment editor. It does **not** enable checkout, shipping, inventory sales, payment processing, or a public storefront.

## How to manage the gallery

Open **Admin → Assortment Studio** and expand any of the 18 existing concept slots: four botanical varieties (two initial, two optional), twelve vape flavors under one editable brand, and two crispy treat concepts.

Each slot can contain **up to eight** optimized WebP images. Use **Add photo** to upload a JPEG, PNG or WebP from your phone or computer. The browser strips source metadata and the server independently rejects WebP metadata, animation and malformed files.

To reorder the gallery, drag images on desktop or use the **↑ / ↓ / Cover** buttons on mobile. Choose **Save image order**. The first image becomes the shop cover, while the others are browsable with previous/next navigation. Give each image a descriptive accessibility label using **Save label**. Use **Remove** to delete one image. Removing the cover promotes the next image; removing all photos restores the original emerald-and-gold packaging artwork.

Changes remain behind the preview gate, account login, admin authorization and MFA, and are CSRF/revision protected. A stale edit is rejected with HTTP 409 rather than overwriting newer work. Edit events are audited.

## Migration and safety

Existing images from the previous single-image editor are automatically registered as the first gallery image. The original filenames remain unchanged. The legacy remove-image route still removes the cover for backward compatibility. The old Locker Files inventory/lot records, Wallet operations and the separate concept identity fields are unaffected.

Back up persistent SQLite and the `/data/concept-art` directory together. All images stay on private persistent storage with randomized keys, and the private image route checks that files remain attached to an active gallery record.

No commerce, prices, order forms, payments or shipment methods are introduced. This release does not advertise the requested $10 nationwide shipping rate for regulated goods.

## Actual product names

The previously agreed planned lineup has 2–4 botanical varieties, 1 vape brand with roughly 12 flavors, and 2 mushroom crispy treat flavors. Exact strain identities, vape brand and flavor names, and crispy treat flavors have **not yet been supplied**. The old demo Locker Files codenames (for example Ghost Key, Midnight Protocol, Blackout) must not be treated as actual confirmed products.

Once real names, ingredients and applicable factual labeling details are supplied, enter them in Assortment Studio; no code redeploy is needed. Ingredient classification, regulatory status, destination restrictions and product labeling still require separate validation.
