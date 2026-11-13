# Apple Wallet member pass — private staging setup

This repository contains a **generic Apple Wallet membership pass issuer** for the existing
Green Locker *design-only* member card. The pass is a collectible digital
brand credential. It is **not** a government ID, age verification, proof of
cannabis purchase eligibility, payment instrument, ticket, access credential,
or authorization to obtain regulated goods.

## Current readiness

The signed pass endpoint is GET \`/member/wallet.pkpass\`. It is behind the
existing private preview gate, member session authentication and admin MFA.
Without all the variables below, the endpoint returns HTTP 503 and the
dashboard clearly displays **Apple Wallet setup pending**. The site does not
emit or offer unsigned .pkpass ZIPs.

No Apple Developer certificates or private keys belong in GitHub or
GitHub Actions artifacts.

## Apple Developer prerequisites

1. Use an active Apple Developer account associated with the organization
   that is authorized to distribute The Green Locker member passes.
2. Register an Apple Pass Type Identifier (for example
   \`pass.com.thegreenlocker.member\`) under Certificates, Identifiers & Profiles.
3. Create a Pass Type ID signing certificate for that exact identifier.
   Export the certificate **and matching private key** into PEM format in a
   secure environment; the private key must never be committed.
4. Obtain the Apple WWDR intermediate certificate (PEM) matching the issued
   Pass Type ID certificate's chain from Apple's certificate authority resources.
5. Verify the certificate Pass Type ID and Apple Team ID against the values
   to be configured. Incorrect identifiers will cause Apple Wallet to reject
   the pass even if OpenSSL reports signing success.

## Runtime configuration

Set these **only** on the intended secure Railway staging environment:

| Name | Content |
|---|---|
| \`TGL_WALLET_PASS_TYPE_ID\` | The registered Apple Pass Type ID, e.g. \`pass.com.thegreenlocker.member\` |
| \`TGL_WALLET_TEAM_ID\` | Your 10-character Apple Developer Team ID |
| \`TGL_WALLET_SIGNER_CERT_B64\` | Base64-encoded PEM Pass Type signing certificate |
| \`TGL_WALLET_PRIVATE_KEY_B64\` | Base64-encoded PEM private key matching signer certificate |
| \`TGL_WALLET_WWDR_CERT_B64\` | Base64-encoded PEM Apple WWDR intermediate certificate |

Prefer Railway **sealed variables** for all three sensitive materials.
These variables must never be copied to browser localStorage, source code,
stdout, public issue comments, or uploaded GitHub Actions artifacts.

The server uses the runtime OpenSSL executable and generates a detached
PKCS#7 signature of the pass manifest in an isolated, temporary directory
with private file permissions; the directory is deleted after issuance.

## Validation and member workflow

- Verify GET \`/member/wallet.pkpass\` is **303 to login** without a session,
  **503** when not configured, and **200** with
  \`Content-Type: application/vnd.apple.pkpass\` only after an authorized
  valid signing configuration is supplied.
- Confirm \`.pkpass\` installs in Apple Wallet on an actual compatible iPhone.
  Browser-emulated iPhone WebKit cannot install passes.
- Confirm certificate subject, chain, Team ID, and Pass Type ID match.
- Update a member's design at \`/member\`, then redownload/re-add the pass.
  There is no Wallet web-service push/update registration.
- Ensure member reference is stable across design changes and that two
  accounts cannot retrieve each other's pass.
- Check the pass contains no email, password, session cookie, barcode,
  checkout action, inventory record or other operational secrets.

## Exit criteria for wider release

Do not enable public issuance without signing certificate rotation
instructions, review of Apple Wallet artwork sizes, privacy notice, QA on
physical iPhone, and a product/legal review of applicable rules.


## Optional automatic Wallet pass updates

The Green Locker includes an Apple Wallet PassKit v1 update web service
and a durable, opt-in notification queue. It remains **OFF** by default.

### Additional staging configuration

The five signing variables above are still required. For updates, also set:

| Variable | Required value |
|---|---|
| `TGL_WALLET_SERVICE_URL` | Public HTTPS origin with a trailing slash, e.g. `https://greenlocker-preview-web-staging.up.railway.app/` |
| `TGL_WALLET_UPDATE_SECRET_B64` | Fresh, independent 32–128 cryptographically random bytes in base64 (not the Pass Type private key or session secret) |
| `TGL_WALLET_UPDATES_ENABLED` | `1` only after the full pass issuer, APNs transport, HTTPS callback and device tests pass |

Use `openssl rand -base64 48` locally to generate an independent update
authentication secret, then set it as a **sealed Railway variable**. Never
paste private keys, certificates, tokens, or production secrets into GitHub
issues, pull requests or customer-facing messages.

### What happens when the member opts in?

1. A member enables **Update my card automatically** in their account.
2. A newly downloaded signed pass contains the `webServiceURL` and a
   member-specific HMAC authentication token. The display-only member
   reference is never itself the authentication token.
3. Apple Wallet registers the installed pass and device's push token with
   `POST /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeID}/{serialNumber}`.
4. When the member changes their name or card design, the app creates a
   revision and durable, retryable push jobs for registered devices.
5. The worker sends a blank payload to APNs, prompting Apple Wallet to
   request changed serials and the newly signed version.
6. The member can disable updates at any time; the backend revokes the
   registered devices for that member and stops queuing notifications.

Callbacks are only exposed through the private preview gateway when the
complete update configuration is active. Every pass registration, pass fetch,
and unregistration requires an `ApplePass` HMAC token bound to the specific
member reference. The device's unpredictable library identifier scopes the
Apple-documented changed-serial lookup.

**Note:** If a pass was installed before enabling updates, it must be
reinstalled after activation to receive the new web-service metadata.
There is no guaranteed immediate delivery: iOS and APNs control scheduling.
Changes to an installed card are intended to update the same pass serial.

### Safety and QA requirements

- Keep the current staging Basic-auth gateway for all non-PassKit routes.
  The PassKit v1 callbacks are the *only* conditional gateway exception.
- The backend is not to be converted into a public cannabis storefront.
  Membership credentials do not prove age, identity or eligibility.
- Confirm certificate/Team ID/Pass Type ID alignment and verify an actual
  Apple-signed `.pkpass` on an iPhone before enabling updates.
- Test registration, changed serials, APNs delivery, signed pass retrieval,
  unregistration, opt-out and revision persistence in a *real Apple Wallet*
  installation. Browser automation verifies protocol handling only.
- Use stable persistent database volume and back it up. An unavailable
  APNs connection results in retry with backoff, not secret disclosure.
- Monitor push failures and certificate expiration. The service only
  sends push when a member is opted in; there are no recurring unsolicited
  promotional pushes.

### Design and screenshot QA

The authenticated iPhone WebKit suite captures screenshots at 320px,
375px and 430px and includes front/back visibility assertions. A previous
screenshot audit identified both faces being painted simultaneously by WebKit,
producing mirrored/overlapping text. The CSS fix explicitly switches hidden
faces at the midpoint of the 3D flip; reduced-motion bypasses transitions.
QA artifacts are attached to the PR's `Protected member browser QA` run.


## Wallet Operations dashboard and certificate alerts

**URL:** `/admin/wallet` — authenticated administrators only. Existing admin
MFA must be completed before the dashboard can be viewed. Ordinary members
receive HTTP 403. The page is server-rendered and read-only.

The dashboard displays:
- Active Wallet device and per-pass registration counts.
- Members explicitly opted in to Wallet updates, plus registered-member count.
- Queued, retrying, APNs-accepted and permanently failed update jobs.
- A masked, recent registration list and a redacted history of update jobs.
- X.509 expiration dates and severity for the Pass Type signing certificate
  and WWDR chain. The signing key's match is checked without revealing it.
- A warning if Apple Wallet signing credentials are absent, malformed or
  close to expiration. The monitoring page remains useful when Wallet
  issuance is disabled.

**APNs accepted is NOT confirmation of installation on a physical iPhone.**
This distinction is displayed explicitly. No private keys, push tokens,
full device identifiers, auth tokens or member email addresses are rendered.

### Alert thresholds

For each installed certificate, the dashboard reports:
- More than 30 days remaining: healthy.
- 30 days or fewer: warning.
- 7 days or fewer: critical.
- Expired: expired.
- Invalid or missing certificate: configuration warning.

When email alerts are explicitly enabled, milestone notifications are sent
once per certificate and expiry at 30, 14 and 7 days remaining, and on
expiration. The monitor records SHA-256 identifiers of alert events in
SQLite to prevent duplicate notices after restarts. It checks at startup
and at six-hour intervals while the staging service is running.

### Optional certificate-alert email configuration

Keep the following variables disabled/absent until a verified Resend
sender and destination mailbox are ready:

| Variable | Purpose |
|---|---|
| `TGL_WALLET_ALERTS_ENABLED` | Set to `1` to activate recurring email checks |
| `TGL_WALLET_ALERT_EMAIL` | Operations recipient mailbox |
| `TGL_MAIL_MODE` | Must be `resend` |
| `TGL_RESEND_API_KEY` | Existing private transactional mail credential |
| `TGL_EMAIL_FROM` | Verified transactional sender |

Use Railway sealed variables for secrets; no credentials should appear
in browser markup, GitHub Actions outputs or chat messages.

The certificate watcher cannot operate while the app is shut down; a
separate external scheduled health monitor can be added later for alerts
during outages. Do not interpret dashboard **zero registrations** as
evidence that iPhone passes were issued successfully: the Apple signer is
currently unconfigured in this private staging environment.

### Test and deployment gates

The automated suite checks certificate parsing, countdowns, mismatched
private keys, missing credentials, admin authorization/MFA,
no-secrets-rendered HTML, registration/retry metrics, email deduplication
and retry, and responsive screenshots at 320px, 375px, and 430px. Keep
`TGL_WALLET_ALERTS_ENABLED` unset until official Apple certificates and
Resend delivery are provisioned and a physical iPhone Wallet install
has been independently verified.
