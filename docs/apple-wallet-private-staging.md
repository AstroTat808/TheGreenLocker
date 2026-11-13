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
