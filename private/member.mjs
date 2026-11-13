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

export function friendlyName(user) {
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
  const option = (value,label,description,selected=false) =>
    '<label class="vault-profile-option"><input type="radio" name="vault-profile" value="' + value +
    '" data-vault-profile autocomplete="off"' + (selected?' checked':'') + '>' +
    '<span class="vault-profile-copy"><strong>' + label + '</strong><small>' + description + '</small></span>' +
    '<span class="vault-profile-indicator" aria-hidden="true"></span></label>';
  return '<section class="vault-feedback" aria-labelledby="vault-feedback-heading">' +
    '<div class="vault-feedback-head"><span class="eyebrow">VAULT ATMOSPHERE</span>' +
    '<h2 id="vault-feedback-heading">Choose your soundscape</h2>' +
    '<p>All effects are original, synthesized locally, and only play after your interaction. Silent is the default.</p></div>' +
    '<fieldset class="vault-profile-group" data-vault-profiles><legend>VAULT SOUND PROFILE</legend>' +
    '<div class="vault-profile-list">' +
    option("silent","Silent","No sound. All the cinematic visuals remain.",true) +
    option("classic","Classic","Subtle tumblers, mechanical locks and a warm chime.") +
    option("cinematic","Cinematic","Deep mechanism, layered shimmer and dramatic release.") +
    '</div></fieldset>' +
    '<button class="vault-audition-button" type="button" data-vault-audition>Preview selected sound</button>' +
    '<label class="vault-feedback-switch vault-haptic-option"><input type="checkbox" data-vault-haptics autocomplete="off">' +
    '<span><strong>Gentle haptics</strong><small>Only when your browser supports vibration</small></span></label>' +
    '<p class="vault-feedback-hint" data-vault-feedback-hint role="status" aria-live="polite"></p>' +
    '</section>';
}

export function renderMemberPage({user, productCount, layout, csrfField, memberCode, saved = false}) {
  const rawName = friendlyName(user);
  const name = esc(rawName);
  const terminalPunctuation = /[.!?]$/u.test(rawName) ? "" : ".";
  const email = esc(user.email);
  const fullName = esc(user.display_name ?? "");
  const count = Number.isSafeInteger(productCount) && productCount >= 0 ? productCount : 0;
  const role = user.role === "admin" ? "Administrator" : "Verified member";
  const code = esc(memberCode);
  const content =
    renderVaultPortal() +
    '<div class="member-dashboard">' +
      '<section class="member-hero" aria-labelledby="member-welcome">' +
        '<div class="member-hero-copy">' +
          '<span class="member-access"><span aria-hidden="true" class="member-access-light"></span>ACCESS GRANTED · MEMBERS ONLY</span>' +
          '<span class="eyebrow">THE GREEN LOCKER / YOUR PRIVATE ARCHIVE</span>' +
          '<h1 id="member-welcome">Aloha, <em>' + name + terminalPunctuation + '</em></h1>' +
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
        '<div class="member-section-head"><div><span class="eyebrow">FOUR WAYS INSIDE</span><h2 id="member-shortcuts-title">Open a compartment</h2></div></div>' +
        '<div class="member-compartments">' +
          '<a href="/catalog" class="member-compartment" data-vault-compartment>' +
            '<span class="compartment-panel compartment-panel-left" aria-hidden="true"></span>' +
            '<span class="compartment-panel compartment-panel-right" aria-hidden="true"></span>' +
            '<span class="compartment-content"><span class="compartment-index">CHAMBER 01 · THE ARCHIVE</span>' +
            '<span class="compartment-emblem" aria-hidden="true">✦</span><strong>The Locker Files</strong>' +
            '<small>Explore private concept records</small><span class="compartment-action">OPEN ARCHIVE ↗</span></span></a>' +
          '<a href="#member-card" class="member-compartment" data-vault-compartment>' +
            '<span class="compartment-panel compartment-panel-left" aria-hidden="true"></span>' +
            '<span class="compartment-panel compartment-panel-right" aria-hidden="true"></span>' +
            '<span class="compartment-content"><span class="compartment-index">CHAMBER 02 · YOUR CREDENTIAL</span>' +
            '<span class="compartment-emblem" aria-hidden="true">◇</span><strong>Member card</strong>' +
            '<small>Your personal digital credential</small><span class="compartment-action">VIEW CARD ↓</span></span></a>' +
          '<a href="#member-settings" class="member-compartment" data-vault-compartment>' +
            '<span class="compartment-panel compartment-panel-left" aria-hidden="true"></span>' +
            '<span class="compartment-panel compartment-panel-right" aria-hidden="true"></span>' +
            '<span class="compartment-content"><span class="compartment-index">CHAMBER 03 · THE CONTROL ROOM</span>' +
            '<span class="compartment-emblem" aria-hidden="true">⚙</span><strong>Vault settings</strong>' +
            '<small>Personalize your name and atmosphere</small><span class="compartment-action">ADJUST SETTINGS ↓</span></span></a>' +
          '<a href="/" class="member-compartment" data-vault-compartment>' +
            '<span class="compartment-panel compartment-panel-left" aria-hidden="true"></span>' +
            '<span class="compartment-panel compartment-panel-right" aria-hidden="true"></span>' +
            '<span class="compartment-content"><span class="compartment-index">CHAMBER 04 · THE WORLD</span>' +
            '<span class="compartment-emblem" aria-hidden="true">✧</span><strong>Brand home</strong>' +
            '<small>Discover The Green Locker identity</small><span class="compartment-action">EXPLORE ↗</span></span></a>' +
        '</div>' +
      '</section>' +
      '<section id="member-card" class="member-section member-identity-section" aria-labelledby="member-card-title" tabindex="-1">' +
        '<div class="member-section-head"><div><span class="eyebrow">UNIQUELY YOURS</span><h2 id="member-card-title">Your digital membership card</h2></div></div>' +
        '<div class="member-card-layout">' +
          '<div class="member-credential" role="group" aria-label="Private digital membership card">' +
            '<div class="member-credential-halo" aria-hidden="true"></div>' +
            '<div class="member-credential-top"><img src="/logo" alt="The Green Locker shield" width="72" height="72">' +
            '<span><strong>THE GREEN LOCKER</strong><small>PRIVATE MEMBER · DIGITAL CREDENTIAL</small></span></div>' +
            '<div class="member-credential-details"><span>MEMBER NAME</span><strong>' + name + '</strong>' +
            '<span>MEMBER REFERENCE</span><code data-member-code>' + code + '</code></div>' +
            '<div class="member-credential-foot">PRIVATE CONCEPT MEMBERSHIP · NOT A LOGIN CREDENTIAL</div>' +
          '</div>' +
          '<div class="member-card-aside"><span class="eyebrow">YOUR DISTINCTIVE REFERENCE</span>' +
            '<h3>A card with your name on it.</h3>' +
            '<p>Your membership card is securely associated with your signed-in account. Its reference remains consistent across visits and is not a password, access token, or proof of eligibility to purchase.</p>' +
            '<p>The downloadable SVG uses the official shield logo and stays crisp at any size.</p>' +
            '<a class="member-card-download" href="/member/card.svg" download="the-green-locker-member-card.svg">Download my card (SVG)</a>' +
          '</div>' +
        '</div>' +
      '</section>' +
      '<section id="member-settings" class="member-section member-settings" aria-labelledby="member-settings-title" tabindex="-1">' +
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
    '</div><script src="/vault-entry.js" defer></script><script src="/member-compartments.js" defer></script>';
  return layout("Your private vault",content,user,user.csrf);
}
