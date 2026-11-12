# Private Preview: Authentication, Catalog and Inventory

This branch adds a **locally hosted, private development application**. It is not a licensed storefront, and it has no live sales or checkout.

## Security boundary

The static root site **must not be deployed as a stand-alone public site**. The existing index.html is public repository source code; for protected access it must be delivered only through the Node server at private/server.mjs (or through a future equivalent serverless/edge enforcement layer). JavaScript modals and noindex tags are not access controls.

- All HTML pages and concept catalog require server-side authentication.
- Registration requires a unique 16+ character invitation code supplied through an environment variable. No open sign-ups.
- Passwords use per-account salts and scrypt hashing; login uses opaque, expiring, HttpOnly, SameSite=Strict session cookies backed by SQLite.
- Admin routes require a server-side admin role. Mutation forms require CSRF tokens and stock ledger entries are append-only.
- No sales prices, payment integrations, checkout, orders, delivery, shipping, or fulfillment endpoints exist.
- Existing visual 21+ acknowledgement is **not** regulatory age/identity verification. Invitation codes are also not age verification.
- This is a single-process development server with in-process rate limits; production hosting requires durable shared rate limiting, monitoring, identity verification, secure email confirmation, secret rotation, backup and storage architecture, and licensing/compliance review.

## Local start (Node 24+)

Use a unique invite code. Never commit secrets or the local database.

~~~sh
export TGL_INVITE_CODE="replace-with-a-long-random-secret"
npm run start:private
~~~

Visit http://127.0.0.1:4174/register, create an invited user and sign in.

To authorize that registered email as the first administrator:

~~~sh
node private/admin-cli.mjs registered@example.com
~~~

The next request to /admin uses the updated role.

Optional environment variables: TGL_DB_PATH (default data/private.sqlite), TGL_HOST (default 127.0.0.1), PORT (default 4174). Use HTTPS and NODE_ENV=production when served behind a vetted TLS reverse proxy. Sessions expire after eight hours. No database or credentials belong in git.

## Testing

~~~sh
npm run check
npm run test:private
npm run test:browser
~~~

Static browser QA targets the brand layout; private server tests confirm the authentication boundary and inventory controls separately.

## Netlify

**Do not connect Netlify yet.** A normal static Netlify publish of this repository would bypass the private server entirely. Before production, integrate a protected serverless/edge authentication gateway and a production-grade persistent database, and verify that every HTML/data endpoint is blocked when logged out. Retain the explicit prohibition on live cannabis sales until applicable licensing and compliance requirements are met.
