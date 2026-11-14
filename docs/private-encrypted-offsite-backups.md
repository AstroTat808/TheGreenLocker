# Green Locker private preview — encrypted offsite backup runbook

Scope: private **Railway staging preview only**, not the public Netlify brand prototype, not production commerce.

## Components and security boundary

- Source: Railway staging volume \`/data\` (San Francisco region), holding \`preview.sqlite\`, private \`concept-art/\`, \`credentials.json\` (preview account passwords, invitation code, MFA encryption seed) and optional \`email-outbox.ndjson\`.
- Destination: separate S3-compatible object bucket in Railway's **IAD region**. Geographic separation from the SFO data volume reduces single-volume and single-region risk, but **is not independent of Railway as a provider**. An AWS/Backblaze/other separately administered copy should be added for provider-wide recovery.
- Cryptography: 32-byte random hex root key stored solely in Railway runtime variable \`TGL_BACKUP_ENCRYPTION_KEY\`; per-archive random 16-byte HKDF salt and 12-byte AES-256-GCM nonce; entire tar.gz payload (including MFA seed) is authenticated and encrypted **before** upload. No plaintext upload or plaintext logs.
- Consistency: new POST/PUT/PATCH/DELETE requests receive a temporary 503 and Retry-After while in-flight writes drain. SQLite's online backup is captured first. Private gallery references are SHA-256 checked and every referenced file must exist.
- Completion evidence: after a PUT, the service downloads the same encrypted object, checks its ciphertext SHA-256, decrypts into a **new isolated temporary folder**, checks SQLite integrity, all gallery hashes, private account/MFA credentials, and confirms a user-table query. Only then is \`/data/backup-status.json\` updated.
- Frequency: immediate initial check on start, then every hour check for age; one **verified** archive per 24h and retry within an hour after a failed attempt. A process restart won't repeat a recent verified backup. Backups never run unless \`TGL_BACKUP_ENABLED=1\`.
- Archive names: \`daily/YYYY-MM-DD/<random-hex>.tglbk\`. The current code does not automatically delete archived backups; retention/immutable storage are outstanding provider settings.

## Railway staging environment

Required variables on \`greenlocker-preview-web\`:

\`\`\`text
TGL_BACKUP_ENABLED=1
TGL_BACKUP_ENCRYPTION_KEY=<64 hex characters, generated securely; do not commit>
TGL_BACKUP_S3_ENDPOINT=https://t3.storageapi.dev
TGL_BACKUP_S3_BUCKET=<bucket's unique S3 name>
TGL_BACKUP_S3_REGION=auto
TGL_BACKUP_S3_STYLE=virtual-host
TGL_BACKUP_S3_ACCESS_KEY_ID=\${{greenlocker-encrypted-backups.ACCESS_KEY_ID}}
TGL_BACKUP_S3_SECRET_ACCESS_KEY=\${{greenlocker-encrypted-backups.SECRET_ACCESS_KEY}}
\`\`\`

The bucket and storage variables must be configured in the isolated **staging** environment. If Railway changes the bucket name, region or endpoint, use the new values returned by its bucket credentials operation. Do not embed S3 credentials or the encryption key in GitHub, a screenshot or the public site.

**Key escrow** is essential: keep a separately protected copy of the root key, with restricted owner access, outside Railway. Without the key, a downloaded archive cannot be decrypted. Railway runtime variables, domain configuration and public-private gateway credentials are infrastructure configuration; document/export them securely outside the data archive. The demo login credentials in \`credentials.json\` are included inside the encrypted archive.

## Recovery (isolation required)

1. Stop writes to the affected preview service; preserve its volume as evidence. Do not run restore over \`/data\`.
2. Retrieve the last verified \`.tglbk\` archive from the offsite bucket to an isolated recovery machine.
3. Supply the 64-hex-character encryption key using \`TGL_BACKUP_ENCRYPTION_KEY\` in the **recovery machine's environment only**.
4. Run \`node scripts/offsite-backup.mjs restore /secure/path/snapshot.tglbk /isolated/new-restore-directory\`. The target must not exist. The command will fail closed on a bad tag, wrong key, damaged database, missing media or tampered credential file.
5. Inspect the recovered \`preview.sqlite\`, \`concept-art/\`, \`credentials.json\`, and \`email-outbox.ndjson\`. Rebuild a dedicated private staging volume and restore those verified files (with appropriate owner and mode), then connect a separate preview service without exposing it publicly.
6. Validate login, MFA, member browsing, image displays and mobile rendering in the restored private instance. Never point a restore exercise at Netlify production.

An automatic recovery rehearsal is performed with every successful scheduled upload, without replacing the live data. This confirms the data can be decrypted and reopened; restoring a new *running* Railway service, DNS and external secrets still requires an operator drill.

## Monitoring and failure response

The private application's logs emit \`Offsite backup verified\` with object key, image count and user count (no secrets), or \`Offsite backup failure\`. \`/data/backup-status.json\` retains the timestamp and ciphertext checksum of the most recent fully tested archive. A missing or stale marker means there is no current proven backup.

Audit the status and logs daily and alert if \`verifiedAt\` is older than 26 hours. Once a second provider is configured, additionally enforce retention, object lock / immutability and least-privilege storage credentials. Never assume a volume mount alone is a backup.
