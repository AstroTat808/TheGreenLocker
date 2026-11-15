# Private membership platform — Phase 1

**Environment:** Isolated, invitation-only Green Locker staging preview. No public retailer, product orders, cart, checkout, shipping, age validation, or payment capability is introduced.

## Member onboarding
`/member` shows a five-step checklist based on persistent account state:
1. Verified email (existing verification timestamp)
2. Chosen display name (saved user profile)
3. Personalized member card (first successful card-preferences save)
4. Viewed curated draft collections (first authenticated `/shop` or `/catalog` request)
5. Opened account-security controls (first authenticated `/member/security` visit)

The `member_journey` table stores **first completion timestamps** and retains them across sign-ins. Existing members start with whatever verified profile data they already have; no false historical activity is inferred. Steps are not purchase, identity, or age eligibility checks.

Apple Wallet certificate readiness is separately labeled. A signed pass download is recorded only after a successful pass build; that does not establish installation in Apple Wallet. No unsigned or mock pass will be distributed.

## Account security
An authenticated member can visit `/member/security` to:
- View the count of their own unexpired sessions, without storing or disclosing device fingerprints
- Use the existing password-reset flow (revokes all sessions after reset)
- Submit a **same-origin, CSRF-protected, password-confirmed** request to invalidate *other* sessions, retaining the current session

Wrong passwords, invalid CSRF tokens, repeated attempts and unauthenticated requests must not revoke sessions. Authentication remains secured by existing signed-in session and TLS controls. Session cleanup does not modify other accounts.

## Admin membership operations
`/admin/members` and `/admin/members.json` require administrator role **and MFA**. They report aggregated account totals, verified email counts, distinct active account/session counts, first-completion counts, draft catalog/media totals and Wallet signing/updates readiness.

No member email list, member-code index, raw login sessions, MFA secrets, passwords, payment records or private inventory data are exposed by the aggregate view. Metrics are live counts from the staging SQLite DB, **not production retail KPIs**.

## Release verification
- Unit tests: migration idempotency, milestone persistence, safe HTML, aggregate counts and no Wallet-install claims.
- Integration: CSRF failure, password failure, successful revocation of another session only, member/admin role isolation and MFA gate.
- Chromium and WebKit: onboarding progress, card changes, responsive security screen and member-operations navigation.
- Preserve the original 34 approved visual baselines and all five GitHub ruleset-required checks. Do not merge if any gate fails or if a screenshot needs an unreviewed baseline update.
- Backup/restore verification remains necessary for the new `member_journey` table; the existing encrypted SQLite backup includes it automatically.

## Next release priorities
1. Individually scoped, expiring member invitations replacing the shared preview invite, with delivery/audit and capacity/rate limits.
2. Wallet developer certificate provisioning in sealed Railway environment variables and actual iPhone PassKit installation/update testing. Never place signing keys in source code.
3. Administrative invitation lifecycle and privacy-safe membership engagement reports.
4. Independent secondary encrypted backups, external alerts, recovery-key escrow and a full isolated restoration drill.

Public commerce remains disabled until product legality, licenses, labeling and destination restrictions are verified independently.
