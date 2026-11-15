# Private Membership Phase 2 — Invitations, Apple Wallet and Interactive Vault

Status: reviewable private staging implementation. No sales, reservations, checkout or fulfillment.

## Invitation management and approval

The MFA-protected /admin/members/manage page supports 256-bit email-bound invitations expiring in 1, 3 or 7 days. A new invite revokes earlier unused links for that email; each invitation can be claimed once, revoked or allowed to expire. Only hashed tokens and minimal audit fields are persisted. The raw link is displayed exactly once to the administrator. Individual registration creates a pending account; email verification AND admin approval are required before sign-in.

Cloud workshop registration no longer accepts its former shared invitation code. Existing local CI/workshop fixtures retain shared codes strictly for isolated test compatibility. Admins can suspend verified member accounts, terminate their sessions, disable Wallet update preferences and delete device registrations and queued pushes, then reactivate verified accounts. An administrator cannot change the role/status of another admin through this interface.

The existing Railway workshop uses a local development mail outbox rather than a verified sender. The invitation URL can be copied and shared manually, but remote invitees cannot complete verification until a transactional sender is connected. An explicitly supplied mailSender callback can attempt invitation delivery. Never call a generated link a delivered email unless the transport accepted the message.

## Apple Wallet

The current system can generate signed Apple generic member passes only with a real Pass Type ID, Apple Team ID, matching signer private key, Pass Type signing certificate and WWDR certificate chain. This phase further checks certificate validity and key matching before advertising the Add to Apple Wallet action. No unsigned fallback pass is distributed. Existing signed-pass and opt-in PassKit update pathways are retained. Physical iPhone installation and live APNs updates cannot be verified without real credentials/device testing.

Suspension revokes sessions and future update registration; it does not remotely remove a generic pass already saved on the device. The display-only member reference grants no purchasing, identity, age-verification or access rights.

## Interactive vault

The new command deck provides overview, Wallet, private concept collections and account security panels in an emerald-and-gold design. Panels use accessible ARIA tabs, Arrow Left/Right and Home/End keyboard navigation, no autoplay and no storage of member information in browser state. Existing membership card flip, soundscape, reveal animations and reduced-motion support remain intact.

## Release criteria

Require unit tests for invitation expiry, email binding, atomic consumption, pending status, approval, revocation, suspension and audit; browser tests for desktop/iPhone navigation and layout; unchanged 34 visual baselines; and all five protected GitHub CI checks on exact feature and merged staging SHA. Do not deploy a failed or pending revision. Recovery service is separate.

## External activation tasks

1. Connect and validate a production-capable transactional email sender for invited member verification.
2. Provision Apple Pass Type credentials as sealed runtime variables, not repository secrets.
3. Test a signed pass and optional updates on a real compatible iPhone.
4. Verify independent encrypted backup/restore after new membership tables are added.
