# Green Locker mobile visual and performance release gates

**Scope:** private staging preview only. Public sales and fulfillment remain disabled.

## Visual regression contracts
- `tests/visual.spec.mjs`: real Chromium and iPhone WebKit screenshots of the mobile brand homepage at 320, 375, and 430 CSS px.
- `tests/private-browser.spec.mjs`: member-card, botanical-gallery, and admin-navigation screenshots on iPhone WebKit.
- `tests/visual-fingerprint.mjs`: deterministic 12 x 8 sampled RGB signature of each screenshot; `tests/visual-baselines.json` holds approved browser/viewport-specific reference values.
- Full screenshot evidence is retained as restricted GitHub Actions artifacts; **do not commit screenshots containing private names, email addresses, member references, or account credentials**.
- Mask the dynamic member reference during screenshots. Compare captured dimensions plus mean RGB deviation (maximum 10 by default) and severely divergent channel count.
- Any missing baseline, unapproved visual change, oversized transfer, unavailable logo, emoji glyph, layout overflow, or failed accessibility/interaction test fails required CI.
- No CI automatic baseline updates: a human-reviewed PR must explicitly update the reference fingerprints, then all checks rerun from the final exact head SHA.
- `mode: record` is temporary for initial capture only. Never merge or deploy while baselines are in record mode; the release contract must assert `mode: enforce`.

## Performance contracts
- Critical source file byte limits are hard-tested in `tests/performance-budget.test.mjs` as part of `npm run check`.
- `tests/performance.spec.mjs` hard-tests local browser DOM readiness, load completion, total resource bytes, hero loading priority, layout shift, and no horizontal overflow.
- Existing browser and private-browser suites continue to verify navigation, membership-card flip behavior, protected product media and admin MFA.
- Safeguards run on pull requests and block merging/deployment of the affected preview branch.

## Production isolation
- Do not change the existing staging database or backup/recovery service.
- Deploy only the exact merged `staging-preview` revision after its required gates pass.
- Confirm Railway deployment status and one healthy serving replica after release; do not modify production.
