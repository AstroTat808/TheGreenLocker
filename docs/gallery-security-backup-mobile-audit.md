# The Green Locker — Gallery Security, Backups and Mobile Audit

## Scope and observation

Audited staging SHA bf08c9c5817ed251660e103a1b165346d8a29274 (before the new batch/reuse PR). Based on connected GitHub and Railway metrics. This PR requires new exact-commit browser checks before staging.

### Security (verified design)

- Private preview Basic gate + account session + admin role + authenticator MFA protect the assortment editor.
- WebP raster uploads: client-side metadata stripping; server-side 2 MB / 2400px bounds and RIFF structure checking; random file IDs and mode 0600 permissions.
- Slot version / conflict handling (409), per-action CSRF validation and scoped image ID checks.
- Reusing media copies an existing authorized private file to a separate opaque filename; independently deleting a placement cannot remove other uses.
- Private images verify a matching gallery database record before returning bytes; HTML content is escaped.
- Server response defaults include no-store/private caching, CSP, no-sniff, frame denial and noindex.
- No public product sales, purchases, checkout or nationwide shipping implementation.

**Residual risk:** Staging relies on a single Railway service and data volume. A secure preview is not a production-hardened shop. The image parser is defense in depth, not an absolute guarantee against malicious WebP decoders. No authenticated browser run using live staging credentials was available through the connected API; CI uses separately provisioned authenticated Chromium and iPhone WebKit fixture sessions.

### Storage and backups

- SQLite and gallery files are persisted under /data on the attached Railway volume, but **volume persistence does not establish offsite backup or restorability**.
- No independently verified, encrypted offsite backup or recorded disaster-recovery drill was found through the connector.
- Included operator-only gallery snapshot script: node scripts/gallery-backup.mjs /data/preview.sqlite /data /external-protected-backup/greenlocker-snapshot
- Uses Node 24 sqlite.backup, checks PRAGMA integrity_check, creates SHA-256 hashes of DB and media, verifies all gallery photo references, and removes incomplete snapshots. The destination must not live inside the source data directory.
- **Run only with gallery writes paused**, so the SQLite backup and artwork directory are consistent at one point in time.
- The script is NOT a scheduled offsite backup. Encryption and transfer to external backup storage must still be configured.
- **Full disaster recovery needs separate secure handling of /data/credentials.json and MFA/encryption secrets.** The gallery-only snapshot deliberately excludes those credentials; restoring it alone is insufficient to restore a fully functioning member app.

### Mobile and resource baseline

Railway last-24h staging: 291 HTTP requests (196 2xx, 11 3xx, 84 4xx, 0 5xx), one online replica, no current critical/warning alerts, current memory ~0.0635 GB, max 24h memory ~0.1296 GB, current disk ~0.0234 GB. The expected authentication gate contributes to the 4xx class, but not all 4xx were independently categorized. These resource measurements are not a verified LCP or physical-device performance benchmark.

Mobile CI checks 320/375/430px layouts and no horizontal overflow. The new bulk and media-library features require screenshot review on those widths before merge, including a modal library picker and gallery cards. Browser CI uses iPhone WebKit emulation, not physical iPhone hardware.

### Required follow-through

1. Confirm five exact-head CI gates are successful before merge and match the deployed Railway commit.
2. Configure encrypted offsite retention and secure credential backup; conduct an isolated end-to-end restore.
3. Monitor media growth, failed authorization, 5xx and browser layout regressions. Alert on recurring failures.
4. Test mobile real-device navigation and user-perceived metrics before any public release.

No real product names were invented; user still needs to supply the actual 2–4 botanical variety names, the single vape brand and 12 flavor names, and the two treat flavors.
