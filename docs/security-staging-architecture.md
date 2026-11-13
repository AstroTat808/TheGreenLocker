# The Green Locker — Security & Staging Architecture

**Status:** Development/staging candidate only. This document is not a production release approval. The Green Locker remains a private concept application without sales, checkout, payments, orders, shipping or fulfillment.

## Identity and administrator security

| Boundary | Implementation | Release limitation |
|---|---|---|
| Invitation-based signup | 16+ character secret; no open registration | Replace shared invites with individually scoped, expiring invitations before production |
| Email verification | SHA-256-hashed one-time tokens, 24-hour expiration; login blocked until verified | Verify branded sender domain and authenticate DNS for transactional mail |
| Passwords | Per-user salts and scrypt password hashes | Add breached-password checks and further password policy review |
| Password recovery | One-use email reset, 30-minute expiration, revokes all existing sessions | Add dedicated monitoring and durable rate limiting |
| Sessions | Random opaque token, SHA-256 hash in SQLite, HttpOnly/SameSite=Strict; Secure in production runtime | Central sessions and idle expiration needed for multi-instance deployments |
| Admin MFA | TOTP with 30-second steps, ±1 step drift tolerance, replay rejection; mandatory before any admin access | Prefer WebAuthn/passkeys for privileged production operators |
| MFA secret protection | AES-256-GCM encryption with a separate 32-byte key | KMS/HSM rotation and disaster recovery plan required |
| MFA recovery | Eight one-time, 96-bit recovery codes stored hashed and displayed once | Document identity-proofed break-glass recovery |
| CSRF | Origin checks and account-bound form tokens | Central request throttling for distributed systems |
| Security headers | CSP, no-cache, no-sniff, anti-framing, restrictive referrer | Penetration testing and reporting controls |
| Inventory audit | Immutable movement records and administrator attribution | External tamper-evident retention and alerts |
| Uploads | Authenticated image retrieval; JPG, PNG and WebP byte checks, maximum 2MB | Malware scanning, EXIF stripping and signed object storage needed for production |

The current adult preview acknowledgement is not regulatory age or identity verification. Email verification proves only mailbox possession. The private product catalog contains draft administrative data and is not an online dispensary.

All admin users must have a verified email and a second factor. When an existing member is promoted to admin, further access is blocked until authenticator enrollment; backup codes are shown exactly once. Password resets never bypass MFA.

### Transactional email

Local development can use the gitignored mail outbox. Staging and production reject local outbox mode and require a verified Resend sender and a dedicated credential. Only the connected Koa's mail domains were verified when this plan was prepared; no The Green Locker sender is presently confirmed.

### Threats and outstanding hardening

The single-process SQLite server includes in-memory throttling and local media storage. It is appropriate only for an isolated, single-instance staging environment. A real production architecture should migrate to managed PostgreSQL, a central rate-limit/session store, encrypted object storage with image processing, queue-backed transactional email, immutable audit exports, threat monitoring, WAF protection, and tested credential rotation/backups. These are launch blockers, not completed capabilities.

## Inventory structures

- Categories: managed draft collection categories.
- Suppliers: name, email, telephone and internal notes.
- Products: draft SKU, name, category and supplier assignment.
- Lots: batch code, product, supplier, received/expiry dates.
- Movements: signed quantity delta, reason, actor, timestamp and optional lot.
- Images: random private filename, product ownership, MIME and uploader.

Quantities are derived from the audited movement ledger rather than editing a stock total. New lot adjustments reject negative stock, and lot/product CSV imports are atomic.

CSV file templates (comma-separated):

    sku,name,category,supplier
    DEMO-001,Private Concept Item,Lifestyle,Example Internal Supplier

    sku,lot_code,supplier,received_on,expires_on,quantity
    DEMO-001,BATCH-001,Example Internal Supplier,2026-11-12,2027-11-12,10

Create a supplier and category before importing a product. Imports accept 500 data rows and up to 100KB of CSV. Exports escape formula-like cell prefixes.

## Isolated staging topology

    Dedicated staging-only DNS hostname (HTTPS)
                  |
       Caddy TLS gateway + Basic Auth
                  |
        Private isolated Docker network
                  |
           Node 24 application
             |         |
         SQLite DB   Product images
              persistent private volume
                  |
          Resend transactional mail

The Compose stack is staging-specific. The Node process runs as a non-root user, the code filesystem is read-only, capabilities are dropped, persistent data lives in a separate private volume, and port 4174 is not exposed publicly. Its Caddy gateway adds password protection independently of the application sign-in.

The preflight script blocks startup if the hostname resembles production, is not HTTPS, or lacks approved mail mode, encryption key, invitation secret, gateway password hash, or persistent storage configuration.

**Existing Netlify integration remains disconnected.** The repository's Netlify configuration intentionally rejects unauthenticated static publication. Publishing the repo root statically would bypass the Node authentication gate.

## Required activation tasks (not completed)

1. Provision a staging-only host and staging DNS. Do not change the production apex domain or connect the production Netlify team.
2. Verify The Green Locker's transactional email domain and Resend DNS, including SPF, DKIM and DMARC.
3. Copy staging.env.example to the gitignored staging.env, then populate unique staging secrets for mail, invite code, encryption key and gateway bcrypt password hash.
4. Generate a 32-byte MFA key and 32-byte invitation secret using a cryptographic RNG. The Node crypto randomBytes API can produce both. Single-quote bcrypt hashes inside the Compose env file to protect dollar signs from interpolation.
5. Validate the Compose configuration using the staging-only environment file, then start the stack only on the authorized staging host. Run the HTTPS, gateway authentication and account/MFA smoke tests before allowing any testers.
6. Verify encrypted backups, restore procedures, email deliverability, audit logs, no-sales constraints, image access control, and mobile browser QA.
7. Create the first user through invitation and email verification, then promote them to admin within the private container. Admin permissions remain blocked until MFA setup completes.

The code and Compose files are prepared, but **no staging server, DNS record, sender domain, production environment variable or public deployment has been provisioned**.

## Automated test commands

    npm run check
    npm run test:private
    npm run test:browser
    npm run test:private:browser
    npm run test:staging

Before external release, require an independent application and infrastructure security review, compliance/age-verification review, and licensed-sales and jurisdiction policy approval. Live sales remain disabled by design.
