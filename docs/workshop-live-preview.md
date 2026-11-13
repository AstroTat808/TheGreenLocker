# The Green Locker: navigable GitHub-based Workshop preview

This is a **real, local development server**, not a static design mockup. It renders the repository's current homepage and official image assets, supports navigation to the private catalog and admin screens, and uses actual server-side authentication and inventory routes. It does not sell products or process transactions.

## Import or clone the project

1. In your Git-connected Workshop workspace (or Workshop Desktop's local project import), import or clone this repository:
   https://github.com/AstroTat808/TheGreenLocker
2. **Select the development branch** feat/security-inventory-staging, not main. That branch contains the unmerged authentication, MFA and inventory features.
3. Set the runtime to Node.js **24 or later**.
4. Keep the workspace and preview link private or restricted to your account. The launcher intentionally uses development fixture accounts, not production user data.
5. Execute the following command:

       npm run preview:workshop

6. Open port 4174 using the workspace's **private preview** or port-forwarding panel. If its preview proxy requires binding all interfaces, configure the following environment variables for this isolated development workspace only:

       WORKSHOP_PREVIEW_BIND=0.0.0.0
       WORKSHOP_ALLOW_CLOUD_PREVIEW=1
       PORT=4174

   Do **not** publish the port publicly or configure anonymous visitor access. The flags permit networking; they do not implement access controls by themselves. Workshop must enforce private preview access separately.

## Test the actual pages

- Homepage: / after logging in
- Email-verified test member: /login, then /catalog
- Administrator demo: /login, then /admin/mfa for first-use authenticator enrollment, then /admin
- Draft inventory: create categories, suppliers, draft products and lots; test private images, stock adjustments and CSV export
- The local development email outbox is stored in .workshop-preview/email-outbox.ndjson for testing new registration/reset flows. Only demo addresses should be used; no real customer information.
- The authenticated homepage includes the local repository asset assets/approved-logo.png. If you expect the newer uploaded gold-and-green round logo, confirm this exact artwork is also present in that GitHub asset before final approval.

All demo credentials are **generated randomly on first launch** and printed in the private workspace terminal. They are also saved under the untracked .workshop-preview/credentials.json file. Never put the generated credentials or MFA recovery codes in GitHub, screenshots, shared logs or public chat messages.

## Important boundaries

- The launcher explicitly rejects NODE_ENV=production and TGL_ENV=staging/production.
- Cloud binding requires an extra opt-in and **must only be used in a private workshop**. This is not a certified public deployment or a replacement for the separate HTTPS Caddy staging plan.
- The local preview persists data under .workshop-preview and seeds three **illustrative concept products** only once. Fixtures do not represent real goods for sale.
- Your actual production Netlify project is not touched, linked or deployed. The Netlify static build blocker remains in place.
- Do not connect live payments, order processors, real email sender secrets, external sales, checkout, shipping or customer data.
- The age dialog is not identity/age verification; the visual branding and development inventory do not authorize regulated retail.

## Troubleshooting

- If you see the unprotected static homepage, you launched a static file server. Stop it and run npm run preview:workshop instead.
- If the preview shows a blank page, verify Node 24+, port 4174 forwarding and the private proxy's origin/host header behavior.
- If the demo user cannot log in, read the current generated credentials in the private terminal (they are not fixed passwords).
- If the administrator gets redirected to /admin/mfa, that is expected. Enroll a TOTP authenticator; the system will then provide one-time recovery codes.
- If you want a genuinely public, password-protected persistent staging URL, use a separately provisioned and secured host with transactional email, HTTPS, external gateway login and durable backups as outlined in docs/security-staging-architecture.md.

## Verification

       npm run check:backend
       npm run test:workshop
       npm run test:private

The GitHub workflow runs the Workshop preview smoke test to check login, private pages, logo asset delivery, seeded records, and the mandatory administrator MFA gate.
