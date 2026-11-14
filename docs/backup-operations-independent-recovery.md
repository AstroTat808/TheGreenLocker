# Green Locker — backup operations and independent recovery

Scope: **private Railway staging only**. Do not merge this into the public Netlify `main` branch or enable public retail.

## Live backup dashboard

After deploying a tested merge to `staging-preview`, sign in as an admin, complete MFA, and open `/admin/backups`. Members, unauthenticated visitors and requests without the cloud preview Basic gateway cannot access this route. The dashboard displays the latest successful decrypt-and-restore test, archive age, recovered users/images, last attempt, failure count, independent-copy status, alert delivery, and a bounded history. It does not display backup keys, encrypted MFA seeds, API tokens or account credentials.

A verified snapshot is **healthy** for 26 hours; it becomes **overdue** thereafter. When a second destination is configured but its readback has not passed, status is degraded. With the existing one-destination setup, the independent-copy field correctly says "Not connected".

The application attempts a backup every 24 hours (with hourly checks and retries after failures); every new archive is downloaded, authenticated, decrypted and restored to a temporary isolated directory. Failures are recorded in `/data/backup-operations.json`.

## Immediate failure email alerts

Requires a verified sender, intended operations recipient, and delivery-only Resend API key. Because the current connected Resend account has verified domains belonging to other brands and no Green Locker sender or alert recipient has been approved, these are **not automatically provisioned**.

```text
TGL_BACKUP_ALERT_ENABLED=1
TGL_BACKUP_ALERT_API_KEY=<restricted Resend sending API key; keep sealed>
TGL_BACKUP_ALERT_FROM=<verified and explicitly approved sender>
TGL_BACKUP_ALERT_TO=<approved operations email>
```

Once provisioned, backup or retention-audit failures cause an immediate Resend request with a 12-second timeout. Messages do not contain secrets, member details or archive bytes. Accepted alerts are deduplicated for 30 minutes. An outage of the email service is visible on the dashboard; do not claim delivery unless accepted by the transport. For a truly independent outage alarm, deploy a second external monitor that checks backup freshness, since an application outage can prevent in-process alerts.

## Separate cloud provider — required configuration

**Primary:** Existing Railway IAD encrypted bucket, separate from the SFO volume.  
**Secondary:** User-owned Backblaze B2, Cloudflare R2, or AWS S3 S3-compatible bucket, **outside the Railway account and ideally under a separate administrator**. No such account/credentials have yet been connected; external replication remains not configured.

```text
TGL_BACKUP_SECONDARY_S3_ENDPOINT=https://<external-provider-endpoint>/
TGL_BACKUP_SECONDARY_S3_BUCKET=<external-bucket-name>
TGL_BACKUP_SECONDARY_S3_REGION=<provider-region>
TGL_BACKUP_SECONDARY_S3_STYLE=virtual-host
TGL_BACKUP_SECONDARY_S3_ACCESS_KEY_ID=<external scoped key>
TGL_BACKUP_SECONDARY_S3_SECRET_ACCESS_KEY=<external scoped secret>
TGL_BACKUP_REQUIRE_SECONDARY=1
```

The same encrypted archive is uploaded to each destination. The independent copy must pass a separate downloaded SHA-256 comparison, AES-256-GCM authentication, SQLite integrity check, gallery-hash checks and MFA-credential recovery before the new daily marker advances. If a required external destination is absent, the backup fails closed and the dashboard reports degraded coverage; the existing Railway primary is not removed. Never substitute a second bucket in the same Railway account and call it independent.

Use narrowly scoped credentials, a separate administrator, private buckets, no public object access, and lifecycle/object-lock settings on the external provider where supported.

## Retention

On the dashboard, an administrator can choose **30–365 days** (default **90**) with an absolute minimum of **14 recent copies**, and preview or request enforcement.

Actual automatic deletion is blocked unless all of these independently verifiable gates are true:
1. The administrator explicitly confirms the retention operation.
2. The same encrypted archive has a verified receipt at the external provider.
3. The application can list that archive at both destinations.
4. `TGL_BACKUP_RETENTION_ALLOW_DELETE=1` is configured by the operator.
5. The recovery key has been independently escrowed, and `TGL_BACKUP_ESCROW_CONFIRMED=1` is set after verification.

Even then the automation may delete only eligible **Railway-primary** archives, never the external-provider copy. No deletion of the latest verified archive or 14 newest primary archives is allowed. Because independent provider and escrow are not yet verified, retain **dry-run** mode.

## Key escrow — independent of Railway

The current AES-256-GCM root key is held in Railway runtime configuration and is not readable through the connected OAuth tools. It must **not** be printed into a chat, README, issue, public GitHub repository, email, or backup dashboard.

Establish owner-controlled escrow through a password manager or HSM outside Railway with MFA, independent recovery access and an emergency break-glass procedure. Verify the exact existing key by decrypting an independently downloaded archive **from a trusted recovery machine**, not by rotating and discarding the key. If rotating keys, keep old keys available until all retained archives have either been re-encrypted and verified under the new key or expired under policy. Log the escrow verification date and custodian offline; then set `TGL_BACKUP_ESCROW_CONFIRMED=1`. Configuring that flag alone is not proof of escrow.

## Full Railway recovery-service drill

A separate `Dockerfile.recovery` and `scripts/dr-recovery-preview.mjs` are included. Create a separate Railway service with a **fresh 256 MB /data volume**, pin to the exact tested Git commit and configure the Dockerfile:

```text
TGL_DR_RECOVERY_MODE=1
TGL_DR_OBJECT_KEY=<previously verified archive object key>
TGL_DR_DATA_ROOT=/data
TGL_WORKSHOP_DIR=/data/recovered-preview
TGL_BACKUP_ENABLED=0
TGL_BACKUP_ENCRYPTION_KEY=<the archive's recovery key>
TGL_BACKUP_S3_* = <read-only credentials for the backup source>
TGL_PREVIEW_GATE_USER=<fresh private recovery gate username>
TGL_PREVIEW_GATE_PASSWORD=<fresh random >=24-character secret>
```

**Do not generate a public domain for the recovery service**. The drill downloads and restores the snapshot into its own volume, validates SQLite, MFA seed and gallery references, records a receipt and then launches the existing private application. It refuses to overwrite a nonempty recovery directory or replace a receipt for a different archive.

Proof of a complete drill requires: a successful Railway deployment at its exact SHA, a runtime `ISOLATED_GREEN_LOCKER_RECOVERY_VERIFIED` event, /healthz readiness, recovery volume distinct from the original, and the existing production-like member/admin app starting with authenticated routes. This is separate from the existing in-process temporary-directory restore, which does **not** constitute a new-service disaster-recovery drill.

### Important boundaries

The Green Locker site remains a private prelaunch concept application with no order intake, shipping, payments or regulated-product fulfillment. Even successful two-provider backup and isolated recovery cannot substitute for lawful licensing or production security certification.
