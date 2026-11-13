/**
 * Member-facing presentation for the isolated development preview.
 * All interpolated account fields are HTML-escaped. No commerce functions.
 */
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

export function normalizeDisplayName(value) {
  return String(value ?? "").trim().replace(/\s+/gu, " ");
}

export function validDisplayName(value) {
  return value === "" || (
    [...value].length >= 2 &&
    [...value].length <= 48 &&
    /^[\p{L}\p{M}\p{N} .'-]+$/u.test(value) &&
    /[\p{L}\p{N}]/u.test(value)
  );
}

function friendlyName(user) {
  if (user.display_name) return user.display_name;
  const localPart = String(user.email ?? "").split("@")[0];
  const first = localPart.replace(/[^a-zA-Z0-9._-]/g, "")
    .split(/[._-]/)[0].slice(0, 24);
  return first ? first[0].toUpperCase() + first.slice(1) : "Member";
}

export function renderVaultPortal() {
  return '<div id="locker-entry-portal" class="locker-entry-portal" role="dialog" aria-modal="true" ' +
    'aria-label="Opening the Locker Files vault" aria-describedby="locker-entry-instructions" hidden>' +
    '<span class="locker-entry-sr-only" id="locker-entry-instructions">A short vault animation. Press Escape or Skip intro to continue.</span>' +
    '<div class="locker-entry-backdrop" aria-hidden="true"></div>' +
    '<div class="locker-entry-door locker-entry-door-left" aria-hidden="true"></div>' +
    '<div class="locker-entry-door locker-entry-door-right" aria-hidden="true"></div>' +
    '<div class="locker-entry-center" aria-hidden="true"><img src="/logo" alt="" width="92" height="92">' +
    '<span class="locker-entry-ring"></span><span class="locker-entry-orbit"></span>' +
    '<span class="locker-entry-caption">UNLOCKING THE ARCHIVE</span></div>' +
    '<div class="locker-entry-glow" aria-hidden="true"></div>' +
    '<div class="locker-entry-footer" aria-hidden="true"><span>THE GREEN LOCKER' +
    '<small>PRIVATE ARCHIVE</small></span><span class="locker-entry-progress"><span></span></span></div>' +
    '<button class="locker-entry-skip" type="button">Skip intro</button></div>';
}

export function renderVaultFeedback() {
  return '<section class="vault-feedback" aria-labelledby="vault-feedback-heading">' +
    '<div class="vault-feedback-head"><div><span class="eyebrow">VAULT ATMOSPHERE</span>' +
    '<h2 id="vault-feedback-heading">Set the mood</h2></div>' +
    '<p>Optional, off by default. Play effects when you tap <strong>Unlock the vault</strong> or <strong>Replay vault opening</strong>. Automatic entrances may be silent.</p></div>' +
    '<div class="vault-feedback-actions" data-vault-feedback>' +
    '<label class="vault-feedback-switch"><input type="checkbox" data-vault-sound autocomplete="off">' +
    '<span><strong>Mechanical sound</strong><small>Original clicks, low rumble and gold chime</small></span></label>' +
    '<label class="vault-feedback-switch"><input type="checkbox" data-vault-haptics autocomplete="off">' +
    '<span><strong>Gentle haptics</strong><small>Only where browser vibration is supported</small></span></label></div>' +
    '<p class="vault-feedback-hint" data-vault-feedback-hint role="status" aria-live="polite"></p>' +
    '</section>';
}

export function renderMemberPage({user, productCount, layout, csrfField, saved = false}) {
  const name = esc(friendlyName(user));
  const email = esc(user.email);
  const fullName = esc(user.display_name ?? "");
  const count = Number.isSafeInteger(productCount) && productCount >= 0 ? productCount : 0;
  const role = user.role === "admin" ? "Administrator" : "Verified member";
  const content =
    renderVaultPortal() +
    '<div class="member-dashboard">' +
      '<section class="member-hero" aria-labelledby="member-welcome">' +
        '<div class="member-hero-copy">' +
          '<span class="member-access"><span aria-hidden="true" class="member-access-light"></span>ACCESS GRANTED · MEMBERS ONLY</span>' +
          '<span class="eyebrow">THE GREEN LOCKER / YOUR PRIVATE ARCHIVE</span>' +
          '<h1 id="member-welcome">Aloha, <em>' + name + '.</em></h1>' +
          '<p>Welcome to your private corner of The Green Locker. Step through the vault, explore the Locker Files, or make the experience your own.</p>' +
          '<div class="member-actions">' +
            '<a id="member-enter-vault" class="member-primary" href="/catalog">Unlock the vault <span aria-hidden="true">✦</span></a>' +
            '<a class="member-secondary" href="/catalog">Browse without animation</a>' +
          '</div>' +
        '</div>' +
        '<div class="member-art" aria-hidden="true"><span class="member-art-orbit member-art-orbit-outer"></span>' +
          '<span class="member-art-orbit member-art-orbit-mid"></span><span class="member-art-orbit member-art-orbit-inner"></span>' +
          '<span class="member-art-core"><img src="/logo" alt="" width="178" height="178"></span>' +
          '<span class="member-art-label">THE LOCKER IS YOURS</span></div>' +
      '</section>' +
      '<section class="member-overview" aria-label="Your account at a glance">' +
        '<div class="member-stat"><span>ACCESS LEVEL</span><strong>' + esc(role) + '</strong><small>Private development access</small></div>' +
        '<div class="member-stat"><span>IN THE ARCHIVE</span><strong>' + count + ' files</strong><small>Concept records only</small></div>' +
        '<div class="member-stat"><span>YOUR ACCOUNT</span><strong>Secure</strong><small>Email-verified sign-in</small></div>' +
      '</section>' +
      '<section class="member-section" aria-labelledby="member-shortcuts-title">' +
        '<div class="member-section-head"><div><span class="eyebrow">EXPLORE YOUR SPACE</span><h2 id="member-shortcuts-title">Your destinations</h2></div></div>' +
        '<div class="member-shortcuts">' +
          '<a href="/catalog" class="member-shortcut"><span class="member-shortcut-icon" aria-hidden="true">✦</span>' +
            '<span><strong>The Locker Files</strong><small>Browse the member-only concept archive</small></span><b aria-hidden="true">↗</b></a>' +
          '<a href="/" class="member-shortcut"><span class="member-shortcut-icon" aria-hidden="true">◇</span>' +
            '<span><strong>Brand home</strong><small>Explore The Green Locker identity</small></span><b aria-hidden="true">↗</b></a>' +
          '<a href="#member-settings" class="member-shortcut"><span class="member-shortcut-icon" aria-hidden="true">⚙</span>' +
            '<span><strong>Your preferences</strong><small>Personalize your vault and atmosphere</small></span><b aria-hidden="true">↘</b></a>' +
        '</div>' +
      '</section>' +
      '<section id="member-settings" class="member-section member-settings" aria-labelledby="member-settings-title">' +
        '<div class="member-section-head"><div><span class="eyebrow">A VAULT THAT FEELS LIKE YOURS</span>' +
          '<h2 id="member-settings-title">Member preferences</h2></div></div>' +
        '<div class="member-settings-grid">' +
          '<section class="member-settings-card" aria-labelledby="member-identity-title">' +
            '<h3 id="member-identity-title">Your identity</h3>' +
            '<p>The display name is only used for your welcome greeting. Your verified email remains your sign-in.</p>' +
            '<form method="post" action="/member/profile">' + csrfField(user.csrf) +
              '<label for="member-display-name">Display name</label>' +
              '<input id="member-display-name" type="text" name="display_name" maxlength="48" autocomplete="nickname" ' +
                'placeholder="How should we greet you?" value="' + fullName + '">' +
              '<span class="member-account-email">Signed in as ' + email + '</span>' +
              '<button class="private-button" type="submit">Save display name</button>' +
            '</form>' +
            (saved ? '<p class="form-ok member-success" role="status">Your display name was updated.</p>' : '') +
          '</section>' +
          '<div class="member-settings-card">' + renderVaultFeedback() + '</div>' +
        '</div>' +
      '</section>' +
      '<p class="member-footnote">PRIVATE CONCEPT ENVIRONMENT · No prices, cart, purchases, reservations, shipping or fulfillment.</p>' +
    '</div><script src="/vault-entry.js" defer></script>';
  return layout("Your private vault",content,user,user.csrf);
}
