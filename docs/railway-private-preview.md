# The Green Locker — Permanent Private Preview

This repository has a **dedicated staging-preview branch** for the separately hosted, private demonstration application. The production site, production Netlify account, and live-commerce functions are not connected.

## Preview hosting

- GitHub source: `AstroTat808/TheGreenLocker`
- Deploy branch: `staging-preview`
- Railway project: `the-green-locker-preview`
- Railway service: `greenlocker-preview-web`
- Railway environment: `staging`
- Node.js 24 and `Dockerfile.preview`; port 4174
- A persistent Railway volume mounted at `/data` stores demo accounts and draft inventory
- The HTTP access gate requires independent preview credentials; the application then requires its own member/admin login and administrator TOTP

**Never commit credentials.** Staging gate and demo account passwords live in the separate Railway service's environment variables. Generated account credentials and SQLite fixtures are in the private volume.

## Updating the preview after approval

1. Develop new features on `feat/security-inventory-staging` or another topic branch.
2. Run the backend, staging, and browser QA workflows.
3. Open a pull request **targeting `staging-preview`** to release the approved changes to this demo.
4. Review its exact diff, ensure that it does not remove the Basic Auth gate, `Dockerfile.preview`, or the no-sales prohibition, and **merge only after checks pass**.
5. Railway is connected to `staging-preview`. **Confirm auto-deployment is enabled** under Railway → `the-green-locker-preview` → `greenlocker-preview-web` → Settings → GitHub integration. Select trigger branch `staging-preview`, turn **Auto-deploy = Enabled** and **Wait for CI = Enabled** after accepting any GitHub App permissions. The GitHub Actions workflow `Dedicated staging preview QA` is configured to run on pushes to this branch.
6. After those two toggles and the GitHub ruleset below are active, Railway should rebuild on merged PRs. Verify each deployment reaches `SUCCESS` and healthcheck passes. A previous documentation push did not trigger an automatic deploy, so the auto-deploy switch must be checked before considering this automated.

### Mandatory GitHub ruleset (repository owner action)

GitHub repository admin settings are not writable through this integration. Configure a ruleset manually under `Settings → Rules → Rulesets`:

- Target branch: **staging-preview**.
- Require a pull request before merging.
- Require the `Dedicated staging preview QA / gated-preview` status check.
- Block direct pushes and force pushes; disallow deletions and bypasses.
- If working alone, do **not** require an additional reviewer's approval that cannot be provided by the PR author. Instead, your deliberate protected PR **merge** is the approval event.
- Confirm the ruleset is **active**, not in evaluation mode.

**Until both the GitHub ruleset and Railway auto-deploy settings are active, automatic approved releases are NOT fully configured.** Railway may deploy direct branch pushes once auto-deploy is enabled, so protect the branch before enabling it.

## Smoke checks

- The HTTPS hostname should serve `/healthz` with 200.
- An unauthenticated GET to `/`, `/catalog`, `/admin`, or `/media/*` must return 401 with a Basic Auth challenge.
- A valid gate credential should lead to the application login.
- A demo member can open `/` and `/catalog`, but not `/admin`.
- An admin login must require TOTP enrollment and verification before loading the dashboard.
- No checkout, payments, orders, shipping, or live sales must be available.
- Production Netlify must remain disconnected.

This is an isolated **demonstration preview**, not production security certification. Email verification for new users uses an internal development outbox, not a real customer mail service. No customer information or payment details belong in this environment.

## Workshop integration

Workshop is a separate workspace product. To use the same GitHub repository there, connect GitHub inside Workshop, import `AstroTat808/TheGreenLocker`, and select the development branch. Workshop OAuth and remote-preview permissions must be approved inside the user's Workshop account. The permanent hosted preview described above runs on Railway independently of Workshop.
