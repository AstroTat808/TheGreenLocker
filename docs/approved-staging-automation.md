# The Green Locker — approved staging release setup

This is an **unactivated deployment plan**. Workshop is for source editing and private live development preview; the permanent staging URL needs separate authenticated hosting. No production Netlify site or live sales are involved.

## What has been prepared

1. The GitHub Actions workflow .github/workflows/approved-staging-release.yml watches for pull requests **merged into feat/security-inventory-staging** (not every push).
2. It tests the exact merge SHA with static, backend, MFA, inventory, Workshop, Chromium and WebKit checks.
3. Deployment also requires that the destination branch be **protected** (GitHub context github.ref_protected), that repository variable TGL_STAGING_DEPLOY_ENABLED equal true, that an environment named greenlocker-staging approve deployment, and that the merge SHA remain the branch head.
4. After all checks pass, the workflow transfers the exact commit to a dedicated staging Docker host over SSH with a pinned host key, starts the Compose stack and verifies service health.
5. A missing host, secret, branch protection, or approval means **no deployment**.

## Required GitHub account setup

### 1. Protect the development branch

In GitHub repository Settings → Rules → Rulesets, create a ruleset for the exact branch feat/security-inventory-staging:

- Require pull requests and at least one independent approval before merging.
- Require status checks Static site QA, Private preview backend QA, Browser QA, and Protected member browser QA.
- Dismiss stale approvals; resolve conversations before merging.
- Block direct pushes, force pushes and deletion.
- Restrict bypass privileges; the owner should not bypass release checks for routine changes.

**Current finding:** GitHub reports this branch is not protected. The workflow will refuse deployment until that changes. The GitHub connector cannot write repository administration settings for this account.

### 2. Configure the staging environment

In GitHub repository Settings → Environments create greenlocker-staging, enable required reviewers, and allow deployment only from the protected development branch.

Add these secrets to the staging environment, not the public source repository:

- TGL_STAGING_SSH_HOST: dedicated staging server hostname, never a production address
- TGL_STAGING_SSH_USER: non-root, restricted Docker deploy account
- TGL_STAGING_SSH_KEY: private SSH key for staging deployment only
- TGL_STAGING_SSH_KNOWN_HOSTS: independently verified SSH host identity

The release has an **additional environment reviewer authorization**, separate from the PR approval.

### 3. Prepare permanent staging hosting

Provision a dedicated HTTPS host and DNS name such as staging.thegreenlocker.com, or configure a separately managed GitHub-connected provider. The hostname is an intended address, not a verified live site.

For the existing SSH/Docker deployment workflow, the host must contain /opt/thegreenlocker/staging/releases and a protected staging.env file under /opt/thegreenlocker/staging. Use a dedicated volume, backup/restore procedure, verified Resend sender, MFA key, unique invitation secret, Caddy password hash, HTTPS and firewall controls. Do not connect Netlify.

**Do not point this SSH deployment at Railway or another managed platform without implementing a provider-specific deployment workflow.** Railway supports a permanent HTTPS URL and GitHub branch deployment; using it requires an account connection and adaptation of the staging runtime and access controls.

### 4. Enable only after verification

Once the infrastructure exists and the independent security checks pass, add repository Actions variable TGL_STAGING_DEPLOY_ENABLED=true. Leave it absent or false before then. A successful approved PR merge into the protected branch will run the verification job and then require environment approval before transferring the release.

## Workshop account connection

Workshop Desktop and Workshop Cloud support GitHub-linked projects. In your Workshop account, authorize GitHub for AstroTat808/TheGreenLocker and select feat/security-inventory-staging. Run npm run preview:workshop with Node 24, then open the private preview on port 4174. Keep the preview account-only and never publish the demo launcher as a public service. Generated demo credentials live in the untracked .workshop-preview directory.

## Current status

- GitHub live-development launcher: implemented, with passing backend smoke tests.
- Approval-gated staging workflow: committed, disabled until activation prerequisites.
- GitHub branch protection: **not configured**.
- Workshop account: **not connected to this chat**.
- Permanent staging host, DNS, TLS and SSH secrets: **not provisioned**.
- Production Netlify: **unchanged**.
- Live checkout, orders, payments and shipping: **disabled**.
